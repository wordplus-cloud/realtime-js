/**
 * React for WordPlus Cloud's realtime SDK: one connection for the app (RealtimeProvider), a room's events, members and
 * count (useRoom, usePresence), who is online (useOnline), what the app's server sends the user (useUserEvent), calls
 * ringing (useCalls), a live stream (useStream, or LiveStream drawn ready), the call screen's buttons (CallScreen, CallButton, GroupCallButton), and the conversation and the
 * people on a room (Chat, OnlineList, Typing, OnlineCount, with RealtimeUi on a page without calls). The ready-made parts
 * are @wordplus/realtime-ui's elements, loaded only when one of these asks for them; the hooks need none of it.
 *
 *     <RealtimeProvider options={ { app: 's1500000007' } }>
 *         <Order />
 *     </RealtimeProvider>
 *
 *     function Order() {
 *         useRoom( 'order:42', { updated: ( data ) => setStatus( data.status ) } );
 *     }
 */
'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { connect, type BrowserConfig, type Calls, type ConnectOptions, type EventMeta, type Incoming, type Member, type Realtime, type Room, type Stream, type StreamSnapshot } from './browser.js';

const RealtimeContext = createContext<Realtime | null>(null);
/** The page's prefix for the elements' names, from the options' `screen.prefix`: '' for their own. */
const PrefixContext = createContext('');

export interface RealtimeProviderProps {
    /** connect()'s options, or the server's config() for the signed-in user. A change connects again. */
    options: ConnectOptions | BrowserConfig;
    /** Called when the page couldn't connect, such as the keys route refusing. */
    onError?: (error: unknown) => void;
    children?: ReactNode;
}

/** Connects once for everything inside it, and closes when it goes. */
export function RealtimeProvider({ options, onError, children }: RealtimeProviderProps) {
    const [realtime, setRealtime] = useState<Realtime | null>(null);
    const key = connectionKey(options);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        let live = true;
        let made: Realtime | null = null;

        connect(options).then(
            (rt) => {
                if (!live) return rt.close();
                made = rt;
                setRealtime(rt);
            },
            (error) => onErrorRef.current?.(error),
        );

        return () => {
            live = false;
            made?.close();
            setRealtime(null);
        };
        // Connect again only when the options say something else.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return createElement(RealtimeContext.Provider, { value: realtime }, createElement(PrefixContext.Provider, { value: options.screen?.prefix ?? '' }, children));
}

/**
 * What the connection rests on: the options, with the user's identity as who they are and their profile, not its
 * token. config() signs that token anew on every request, so a server layout drawn again (router.refresh(), a server
 * action) handed the provider other options each time, and it connected again, ending the call on the screen and
 * losing what was sent meanwhile (Team Space, 2026-10-27). The connection renews its token itself as it runs out.
 */
function connectionKey(options: ConnectOptions | BrowserConfig): string {
    const token = options.keys?.identity?.token;
    if (!token) return JSON.stringify(options);
    const { identity, ...keys } = options.keys!;
    let claims: { sub?: unknown; pdh?: unknown; hid?: unknown } = {};
    try {
        claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
        return JSON.stringify(options); // not a token we read: as it is
    }
    return JSON.stringify({ ...options, keys: { ...keys, identity: { sub: claims.sub, pdh: claims.pdh, hid: claims.hid } } });
}

/** An element's name with the page's prefix: `chat-room`, or `shop-chat-room` for `screen: { prefix: 'shop' }`. */
function useTag(tag: string): string {
    const prefix = useContext(PrefixContext);
    return prefix ? prefix + '-' + tag : tag;
}

/** The app's connection, or null until it is up. */
export function useRealtime(): Realtime | null {
    return useContext(RealtimeContext);
}

/** How many components hold each room, so the last to leave leaves it and no other. */
const holders = new WeakMap<Realtime, Map<string, number>>();

function hold(rt: Realtime, name: string): Room {
    const counts = holders.get(rt) ?? new Map<string, number>();
    holders.set(rt, counts);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    return rt.room(name) ?? rt.join(name);
}

function release(rt: Realtime, name: string): void {
    const counts = holders.get(rt);
    const left = (counts?.get(name) ?? 1) - 1;
    if (left > 0) {
        counts!.set(name, left);
        return;
    }
    counts?.delete(name);
    rt.leave(name);
}

export interface RoomHook {
    /** joining, joined, failed, left; idle with no room. */
    state: Room['state'] | 'idle';
    /** Why it failed: forbidden, expired, no_rule, kicked … */
    error: string | null;
    /** A presence room's members, and how many are in a counting room. */
    members: Member[];
    count: number | null;
    /** The room, for emit, emitWithAck, volatile and history; null until joined. */
    room: Room | null;
    emit(event: string, data?: unknown): void;
    emitWithAck(event: string, data?: unknown): Promise<{ id: string; at: number }>;
}

/**
 * Joins a room while the component is on the page: `handlers` by event name, each given the event's data (opened, when
 * the app sealed it) and its meta `{ from, id, at, replayed? }`. Its members and count stay current. Null `name` joins
 * nothing.
 */
export function useRoom(name: string | null | undefined, handlers: Record<string, (data: any, meta: EventMeta) => void> = {}): RoomHook {
    const rt = useRealtime();
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;
    const events = Object.keys(handlers).sort().join('|');
    const [status, setStatus] = useState<{ state: RoomHook['state']; error: string | null; members: Member[]; count: number | null }>({ state: 'idle', error: null, members: [], count: null });
    const [room, setRoom] = useState<Room | null>(null);

    useEffect(() => {
        if (!rt || !name) {
            setStatus({ state: 'idle', error: null, members: [], count: null });
            setRoom(null);
            return;
        }

        const joined = hold(rt, name);
        setRoom(joined);
        const update = () =>
            setStatus({ state: joined.state, error: joined.error, members: [...joined.members].map(([id, info]) => ({ id, info })), count: joined.count });
        update();

        const listeners: Array<[string, (...args: any[]) => void]> = [
            ...['joined', 'join', 'leave', 'count', 'error', 'kicked'].map((event): [string, () => void] => [event, update]),
            ...events
                .split('|')
                .filter((event) => event !== '')
                .map((event): [string, (...args: any[]) => void] => [event, (data: unknown, meta: EventMeta) => handlersRef.current[event]?.(data, meta)]),
        ];
        for (const [event, fn] of listeners) joined.on(event, fn);

        return () => {
            for (const [event, fn] of listeners) joined.off(event, fn);
            setRoom(null);
            release(rt, name);
        };
    }, [rt, name, events]);

    return {
        ...status,
        room,
        emit: (event, data) => room?.emit(event, data),
        emitWithAck: (event, data) => (room ? room.emitWithAck(event, data) : Promise.reject(Object.assign(new Error('not_joined'), { code: 'not_joined' }))),
    };
}

/** Who is in a presence room now: each member's id and info, as the others see them. */
export function usePresence(name: string | null | undefined): Member[] {
    return useRoom(name).members;
}

/** The online status of users, by id, kept current; and how many are online across the app, with `count`. */
export function useOnline(ids: Array<number | string>, options: { count?: boolean } = {}): { online: Record<string, boolean>; lastSeen: Record<string, number>; count: number | null } {
    const rt = useRealtime();
    const key = [...new Set(ids.map(String))].sort().join('|');
    const [state, setState] = useState<{ online: Record<string, boolean>; lastSeen: Record<string, number>; count: number | null }>({ online: {}, lastSeen: {}, count: null });

    useEffect(() => {
        if (!rt) return;
        const watched = key === '' ? [] : key.split('|');
        const update = () => {
            const online: Record<string, boolean> = {};
            const lastSeen: Record<string, number> = {};
            for (const id of watched) {
                online[id] = rt.online.has(id);
                const at = rt.online.lastSeen(id);
                if (at !== null) lastSeen[id] = at;
            }
            setState({ online, lastSeen, count: rt.online.count });
        };
        rt.online.watch(watched).on('change', update);
        if (options.count) rt.online.on('count', update);
        update();

        return () => {
            rt.online.off('change', update);
            if (options.count) rt.online.off('count', update);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rt, key, options.count]);

    return state;
}

/** What the app's server sends this user (`toUser( id ).emit( event, data )`), while the component is on the page. */
export function useUserEvent(event: string, handler: (data: any, meta: { at?: number }) => void): void {
    const rt = useRealtime();
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (!rt) return;
        const listener = (data: unknown, meta: { at?: number }) => handlerRef.current(data, meta);
        rt.on(event, listener);
        return () => {
            rt.off(event, listener);
        };
    }, [rt, event]);
}

/** The page's calls once loaded, and the calls ringing for its user now. */
export function useCalls(): { calls: Calls | null; incoming: Incoming[] } {
    const rt = useRealtime();
    const [calls, setCalls] = useState<Calls | null>(null);
    const [incoming, setIncoming] = useState<Incoming[]>([]);

    useEffect(() => {
        if (!rt) return;
        let live = true;
        let made: Calls | null = null;
        const update = () => made && setIncoming([...made.incoming()]);
        // Its own listener only: the call screen listens to the same calls.
        const ringing = (call: Incoming) => {
            update();
            call.on('over', update);
        };

        void rt.calls().then((c) => {
            if (!live) return;
            made = c;
            setCalls(c);
            c.on('incoming', ringing);
            update();
        });

        return () => {
            live = false;
            made?.off('incoming', ringing);
        };
    }, [rt]);

    return { calls, incoming };
}

const noSnapshot = (): StreamSnapshot | null => null;
const noSubscribe = (): (() => void) => () => {};

/**
 * A live stream while the component is on the page (`calls.stream()`: the app's `streams()` rule makes this user its
 * host, a guest or a viewer), and its state as it changes, which a screen of one's own draws: the stream's phase, who
 * watches, the chat, the stage. `error` is the refusal's code. Null `name` joins nothing; the stream is left when the
 * component goes.
 *
 *     const { stream, state } = useStream( 'show:mugs' );
 *     <video ref={ ( video ) => video && stream?.watch( video ) } muted autoPlay playsInline />
 */
export function useStream(name: string | null | undefined): { stream: Stream | null; state: StreamSnapshot | null; error: string | null } {
    const rt = useRealtime();
    const [stream, setStream] = useState<Stream | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!rt || !name) return;
        let gone = false;
        let joined: Stream | null = null;
        setError(null);
        void rt.calls()
            .then((calls) => calls.stream(name))
            .then((s) => {
                if (gone) return s.leave();
                joined = s;
                setStream(s);
            }, (e: { code?: string }) => {
                if (!gone) setError(e?.code ?? 'server');
            });
        return () => {
            gone = true;
            joined?.leave();
            setStream(null);
        };
    }, [rt, name]);

    const state = useSyncExternalStore(stream?.subscribe ?? noSubscribe, stream?.snapshot ?? noSnapshot, noSnapshot);
    return { stream, state, error };
}

/** Starts the call screen on the page: the call window and the ring. Renders nothing. */
export function CallScreen({ strings }: { strings?: Record<string, string> }) {
    const rt = useRealtime();

    useEffect(() => {
        if (rt) void rt.callScreen(strings ? { strings } : {});
        // The screen keeps the strings it started with.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rt]);

    return null;
}

/**
 * A call button: calls `to`, a user id of digits or of text (`user_2abc`, `auth0|5f7c`), about `call`, the call window
 * showing `name` and `avatar`. `{pair}` in `call` is the page user and `to`, in order (`support:{pair}`). Needs
 * <CallScreen /> on the page.
 */
export function CallButton({ to, call, type = 'video', name, avatar, children }: { to: number | string; call: string; type?: 'audio' | 'video'; name?: string; avatar?: string; children?: ReactNode }) {
    return createElement(useTag('call-button'), { to: String(to), call, type, name, avatar }, children);
}

/** A button that joins the group call `name`. Needs <CallScreen /> on the page. */
export function GroupCallButton({ name, type = 'video', title, children }: { name: string; type?: 'audio' | 'video'; title?: string; children?: ReactNode }) {
    return createElement(useTag('room-button'), { room: name, type, title }, children);
}

/**
 * A place in the page for a call: the calls `call` names (`match:34:42`, a pattern as your rules write them,
 * `match:{a}:{b}`, or every call when left out) show here in place of the window in the corner. A call moves in when it
 * starts, or once the spot is on the page, and goes on in the window when the spot leaves. `children` show while no
 * call is here, and with none the spot is hidden until one comes. Its `data-call` holds the call's name while one is
 * here. With `join` (`video` or `audio`), the group call `call` names is joined as the spot comes onto the page, as its
 * GroupCallButton would: once, so someone who leaves it isn't brought back while the spot stays. It joins with the
 * camera and the microphone off, unless `joinWith` names them (`microphone`, `camera`, or `microphone camera`). Needs
 * <CallScreen /> on the page.
 */
export function CallSpot({ call, join, joinWith, className, style, children }: {
    call?: string;
    join?: 'audio' | 'video';
    joinWith?: 'microphone' | 'camera' | 'microphone camera' | 'camera microphone';
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
}) {
    return createElement(useTag('call-spot'), { call, join, 'join-with': joinWith, className, style }, children);
}

/**
 * A live stream in Easy Stream's player, its chat beside it, and the studio for its host, who goes live there: the
 * `<live-stream>` element, whose script rt.streamScreen() loads on the page's first one. `view` puts one part here
 * instead (`player`, `chat`, `details`, `studio`): the parts of one stream share its join, wherever they are.
 * `studio-page` is the studio as a page of its own, for the host alone, in the height its `className` or `style` gives it.
 *
 *     <LiveStream name="show:mugs" title="New mugs" />
 *     <LiveStream name="show:mugs" view="studio-page" url="/shows/mugs" backUrl="/studio" className="block h-[80vh]" />
 */
export function LiveStream({ name, view, title, cover, url, loginUrl, studioUrl, backUrl, chat, height, sticky, strings, className, style }: {
    name: string;
    view?: 'all' | 'player' | 'chat' | 'details' | 'studio' | 'studio-page';
    title?: string;
    cover?: string;
    /** The page to share, the page's own by default; on the studio page, where viewers watch. */
    url?: string;
    /** Where a visitor signs in to chat. */
    loginUrl?: string;
    /** Where its host goes live, when that is a page of its own. */
    studioUrl?: string;
    /** The studio page's way back, such as the host's list of streams. */
    backUrl?: string;
    /** False for a stream without chat. */
    chat?: boolean;
    /** The chat's height in pixels, for `view="chat"`. */
    height?: number;
    /** The player kept at the top of a phone's screen while live, as the page scrolls past it. */
    sticky?: boolean;
    strings?: Record<string, string>;
    className?: string;
    style?: CSSProperties;
}) {
    const rt = useRealtime();

    useEffect(() => {
        if (rt) void rt.streamScreen(strings ? { strings } : {});
        // The screens keep the strings they started with.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rt]);

    return createElement(useTag('live-stream'), {
        name, view, title, cover, url, 'login-url': loginUrl, 'studio-url': studioUrl, 'back-url': backUrl,
        chat: chat === false ? 'off' : undefined,
        height: height ? String(height) : undefined,
        sticky: sticky ? '' : undefined,
        className, style,
    });
}

/** Loads the elements below without the call screen, for a page with no calls. Renders nothing. */
export function RealtimeUi({ strings }: { strings?: Record<string, string> }) {
    const rt = useRealtime();

    useEffect(() => {
        if (rt) void rt.ui(strings ? { strings } : {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rt]);

    return null;
}

/** A message your server kept from its webhook: the room event's id (the webhook's `event_id`), who, what, when. */
export interface StoredMessage {
    id: string;
    from: string | number;
    text: string;
    at: number;
    /** By reaction key, who picked it. */
    reactions?: Record<string, Array<string | number>>;
}

/** A page of the messages your server kept, oldest first, and whether there are older ones. */
export interface ChatPage {
    messages: StoredMessage[];
    more: boolean;
}

/** Your server's messages: the newest page for `null`, else the page before the message given. */
export type ChatLoader = (before: { id: string; at: number } | null) => Promise<ChatPage>;

/** A message of this user the room took: its event id (the webhook's `event_id`), its room, what and when. */
export interface SentMessage {
    id: string;
    room: string;
    text: string;
    at: number;
}

/**
 * Better Messages' conversation on `room`: typing, reactions, read ticks and the composer, on the room's `message`,
 * `typing`, `reaction` and `read` events. The conversation is your server's, saved from its webhook: `messages` names
 * your route for it (asked with the page's cookies, `?before=<id>` for an older page), or `load` asks it your own way.
 * The room's history, 5 minutes long, fills in only what your server hasn't saved yet. It fills the height it is given.
 * `onSent` hears each message the room took, for your server to keep it and tell the other person where no webhook
 * reaches it. In a chat between two, `to` is the other person, on top with their calls (`name` and `avatar` theirs,
 * where the page has them), and `call` the call that shows in the chat while it is on: `true` for the call named as the
 * room, or its name. `startCall` calls them as the chat opens, once. Needs <CallScreen /> or <RealtimeUi /> on the
 * page, <CallScreen /> for the calls.
 */
export function Chat({ room, placeholder, reactions, maxLength, messages, load, onSent, to, name, avatar, call, startCall }: { room: string; placeholder?: string; reactions?: string[]; maxLength?: number; messages?: string; load?: ChatLoader; onSent?: (message: SentMessage) => void; to?: number | string; name?: string; avatar?: string; call?: boolean | string; startCall?: 'video' | 'audio' }) {
    const element = useRef<(HTMLElement & { load?: ChatLoader }) | null>(null);
    // The page's onSent as it gives it now: an inline function is another one at every render.
    const sent = useRef(onSent);
    sent.current = onSent;
    // A property, not an attribute: set on the element itself, whether or not the elements script has defined it yet.
    const ref = useCallback((node: (HTMLElement & { load?: ChatLoader }) | null) => {
        element.current = node;
        if (node) node.load = load;
    }, [load]);
    // The element says so with its `sent` event.
    useEffect(() => {
        const node = element.current;
        if (!node) return;
        const heard = (event: Event) => sent.current?.((event as CustomEvent<SentMessage>).detail);
        node.addEventListener('sent', heard);
        return () => node.removeEventListener('sent', heard);
    }, []);
    return createElement(useTag('chat-room'), {
        ref, room, messages, placeholder, reactions: reactions?.join(' '), 'max-length': maxLength ? String(maxLength) : undefined,
        to: to === undefined ? undefined : String(to), name, avatar, call: call === true ? 'true' : call || undefined, 'start-call': startCall,
    });
}

/**
 * Who is in the presence room `room`, with a call button for each of the others when `call` names the call
 * (`support:{pair}`: `{pair}` the two ids in order, `{me}`, `{id}`). Needs <CallScreen /> or <RealtimeUi /> on the page.
 */
export function OnlineList({ room, title, call, type }: { room: string; title?: string; call?: string; type?: 'audio' | 'video' | 'audio video' }) {
    return createElement(useTag('online-list'), { room, title, call, type });
}

/** Who is typing in `room`, by name, from its `typing` events (or `event`). */
export function Typing({ room, event }: { room: string; event?: string }) {
    return createElement(useTag('typing-line'), { room, event });
}

/** How many are in `room`, nothing at none. */
export function OnlineCount({ room }: { room: string }) {
    return createElement(useTag('online-count'), { room });
}
