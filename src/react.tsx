/**
 * React for WordPlus Cloud's realtime SDK: one connection for the app (RealtimeProvider), how it is (useConnection), a
 * room's events, members and count (useRoom, usePresence), who is online (useOnline), names and pictures (useProfiles), who
 * is typing (useTyping), what the app's server sends the user (useUserEvent), calls ringing (useCalls), a call of your own
 * (useCall), a group call (useGroupCall), their pictures and sound (VideoTrack, AudioTrack), a live stream (useStream and
 * StreamVideo, or LiveStream drawn ready), the call screen's buttons (CallScreen, CallButton, GroupCallButton), and the
 * conversation and the people on a room (Chat, OnlineList, Typing, OnlineCount, with RealtimeUi on a page without calls).
 * The ready-made parts are @wordplus/realtime-ui's elements, loaded only when one of these asks for them; the hooks need
 * none of it. @wordplus/realtime-ui/react has the same names, drawn in the app's own React tree.
 *
 *     <RealtimeProvider>
 *         <Order />
 *     </RealtimeProvider>
 *
 *     function Order() {
 *         useRoom( 'order:42', { updated: ( data ) => setStatus( data.status ) } );
 *     }
 */
'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type AudioHTMLAttributes, type Context, type CSSProperties, type ReactNode, type VideoHTMLAttributes } from 'react';
import {
    connect, type BrowserConfig, type Call, type Calls, type CallState, type CallType, type CallUser, type ConnectOptions, type DeviceOptions, type EventMeta, type GroupCall, type GroupCallState, type Incoming, type Member, type Person, type Realtime,
    type RealtimeErrorEvent, type RemoteMedia, type RemoteTrack, type Room, type RoomEvents, type Stream, type StreamSnapshot, type UserProfile,
} from './browser.js';
import { idsKey, type NotInferred } from './bindings.js';
import { connect as connectApp } from './native.js';
import { namesOther, roomName } from './room-name.js';

/**
 * Whether this is React Native, which has no page: the provider connects as an app does there (`./native`, no worker,
 * calls refused with `no_webrtc`), and the ready-made parts, the web's elements, draw nothing.
 */
function inReactNative(): boolean {
    return typeof navigator !== 'undefined' && (navigator as { product?: string }).product === 'ReactNative';
}

/** An element of the ready-made parts, or nothing in React Native, which has no custom elements to draw it. */
function drawn(tag: string, props: Record<string, unknown>, children?: ReactNode) {
    return inReactNative() ? null : createElement(tag, props, children);
}

// The page's connection, under one global name: @wordplus/realtime-ui/react reads the same context, so its screens need
// no `rt` either, and neither package imports the other.
const REALTIME_CONTEXT = Symbol.for('wordplus.realtime.react-context');
const shared = globalThis as unknown as Record<symbol, Context<Realtime | null> | undefined>;
const RealtimeContext = (shared[REALTIME_CONTEXT] ??= createContext<Realtime | null>(null));
/** The page's prefix for the elements' names, from the options' `screen.prefix`: '' for their own. */
const PrefixContext = createContext('');
/** Why the provider couldn't connect, or why the connection was refused since, for useConnection(). */
const FailureContext = createContext<RealtimeErrorEvent | Error | null>(null);

export interface RealtimeProviderProps {
    /**
     * connect()'s options, or the server's config() for the signed-in user. A change connects again. Left out, the routes
     * at /api/realtime say which app and who the user is.
     */
    options?: ConnectOptions | BrowserConfig;
    /** Called when the page couldn't connect, or the connection is refused later: `{ code }`, such as `keys_failed` or `over_capacity`. */
    onError?: (error: RealtimeErrorEvent | Error) => void;
    children?: ReactNode;
}

const NO_OPTIONS: ConnectOptions = {};

/** Connects once for everything inside it, and closes when it goes. */
export function RealtimeProvider({ options = NO_OPTIONS, onError, children }: RealtimeProviderProps) {
    const [realtime, setRealtime] = useState<Realtime | null>(null);
    const [failure, setFailure] = useState<RealtimeErrorEvent | Error | null>(null);
    const key = connectionKey(options);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        let live = true;
        let made: Realtime | null = null;

        setFailure(null);
        (inReactNative() ? connectApp : connect)(options).then(
            (rt) => {
                if (!live) return rt.close();
                made = rt;
                rt.on('error', (error: RealtimeErrorEvent) => {
                    // An event the page can't open is that event's, and the connection is fine.
                    if (error.code !== 'unopened') setFailure(error);
                    onErrorRef.current?.(error);
                });
                rt.on('connected', () => setFailure(null));
                setRealtime(rt);
            },
            (error) => {
                if (!live) return;
                setFailure(error);
                onErrorRef.current?.(error);
            },
        );

        return () => {
            live = false;
            made?.close();
            setRealtime(null);
        };
        // Connect again only when the options say something else.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return createElement(
        RealtimeContext.Provider,
        { value: realtime },
        createElement(FailureContext.Provider, { value: failure }, createElement(PrefixContext.Provider, { value: options.screen?.prefix ?? '' }, children)),
    );
}

/**
 * What the connection rests on: the options, with the user's identity as who they are and their profile, not its
 * token. config() signs that token anew on every request, so a server layout drawn again (router.refresh(), a server
 * action) handed the provider other options each time, and it connected again, ending the call on the screen and
 * losing what was sent meanwhile (Team Space, 2026-10-27). The connection renews its token itself as it runs out. Of
 * `pdh`, its first 56 digits: the last 8 are the day, which moves on with no change to who they are.
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
    const pdh = typeof claims.pdh === 'string' ? claims.pdh.slice(0, 56) : claims.pdh;
    return JSON.stringify({ ...options, keys: { ...keys, identity: { sub: claims.sub, pdh, hid: claims.hid } } });
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

/**
 * How the connection is, for a "Reconnecting…" of your own: `connected`, and `error`, why it could not connect or was
 * refused (`{ code }`: `wrong_origin`, `over_capacity`, `keys_failed` …), cleared once it connects. It comes back by itself.
 *
 *     const { connected, error } = useConnection();
 */
export function useConnection(): { connected: boolean; error: RealtimeErrorEvent | Error | null } {
    const rt = useRealtime();
    const error = useContext(FailureContext);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (!rt) {
            setConnected(false);
            return;
        }
        const up = () => setConnected(true);
        const down = () => setConnected(false);
        setConnected(rt.connected);
        rt.on('connected', up);
        rt.on('disconnected', down);
        return () => {
            rt.off('connected', up);
            rt.off('disconnected', down);
        };
    }, [rt]);

    return { connected, error };
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

export interface RoomHook<Events extends RoomEvents = RoomEvents, Info = unknown> {
    /** joining, joined, failed, left; idle with no room. */
    state: Room['state'] | 'idle';
    /** Why it failed: forbidden, expired, no_rule, kicked … */
    error: Room['error'];
    /** A presence room's members, and how many are in a counting room. */
    members: Array<Member<Info>>;
    count: number | null;
    /** The room, for emit, emitWithAck, volatile and history; null until joined. */
    room: Room<Events, Info> | null;
    emit<K extends keyof Events & string>(event: K, data?: Events[K]): void;
    emitWithAck<K extends keyof Events & string>(event: K, data?: Events[K]): Promise<{ id: string; at: number }>;
}

/**
 * Joins a room while the component is on the page: `handlers` by event name, each given the event's data (opened, when
 * the app sealed it) and its meta `{ from, id, at, replayed? }`. Its members and count stay current. Null `name` joins
 * nothing. `Events` says what its events carry and `Info` what its members bring, for your own checking and nothing else:
 * `useRoom<{ message: { text: string } }>( 'chat:34:42', { message: ( msg ) => add( msg.text ) } )`. `{pair}` in the name
 * is this user and `with`, in order, so both of them name the same room: `useRoom( 'chat:{pair}', handlers, { with: 34 } )`.
 * With `with` still empty, as the other person loads, it joins nothing yet.
 */
export function useRoom<Events extends RoomEvents = RoomEvents, Info = unknown>(
    name: string | null | undefined,
    handlers: { [K in keyof NotInferred<Events>]?: (data: NotInferred<Events>[K], meta: EventMeta) => void } = {},
    options: { with?: number | string | null } = {},
): RoomHook<Events, Info> {
    const rt = useRealtime();
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;
    const events = Object.keys(handlers).sort().join('|');
    const other = options.with;
    const [status, setStatus] = useState<{ state: RoomHook['state']; error: Room['error']; members: Array<Member<Info>>; count: number | null }>({ state: 'idle', error: null, members: [], count: null });
    const [room, setRoom] = useState<Room<Events, Info> | null>(null);

    useEffect(() => {
        if (!rt || !name || (namesOther(name) && (other === undefined || other === null))) {
            setStatus({ state: 'idle', error: null, members: [], count: null });
            setRoom(null);
            return;
        }

        let named: string;
        try {
            named = roomName(name, rt.user, other);
        } catch (error) {
            // `{pair}` on a page with nobody signed in.
            setStatus({ state: 'failed', error: (error as { code?: string }).code ?? 'bad_room', members: [], count: null });
            setRoom(null);
            return;
        }

        const joined = hold(rt, named) as unknown as Room<RoomEvents, Info>;
        setRoom(joined as unknown as Room<Events, Info>);
        const update = () =>
            setStatus({ state: joined.state, error: joined.error, members: [...joined.members].map(([id, info]) => ({ id, info })), count: joined.count });
        update();

        const listeners: Array<[string, (...args: any[]) => void]> = [
            ...['joined', 'join', 'leave', 'count', 'error', 'kicked'].map((event): [string, () => void] => [event, update]),
            ...events
                .split('|')
                .filter((event) => event !== '')
                .map((event): [string, (...args: any[]) => void] => [event, (data: any, meta: EventMeta) => handlersRef.current[event]?.(data, meta)]),
        ];
        for (const [event, fn] of listeners) joined.on(event, fn);

        return () => {
            for (const [event, fn] of listeners) joined.off(event, fn);
            setRoom(null);
            release(rt, named);
        };
    }, [rt, name, other, events]);

    return {
        ...status,
        room,
        emit: (event, data) => room?.emit(event, data),
        emitWithAck: (event, data) => (room ? room.emitWithAck(event, data) : Promise.reject(Object.assign(new Error('not_joined'), { code: 'not_joined' }))),
    };
}

/** Who is in a presence room now: each member's id and info, as the others see them. */
export function usePresence<Info = unknown>(name: string | null | undefined, options: { with?: number | string | null } = {}): Array<Member<Info>> {
    return useRoom<RoomEvents, Info>(name, {}, options).members;
}

/** The online status of users, by id, kept current; and how many are online across the app, with `count`. */
export function useOnline(ids: Array<number | string>, options: { count?: boolean } = {}): { online: Record<string, boolean>; lastSeen: Record<string, number>; count: number | null } {
    const rt = useRealtime();
    const key = idsKey(ids);
    const [state, setState] = useState<{ online: Record<string, boolean>; lastSeen: Record<string, number>; count: number | null }>({ online: {}, lastSeen: {}, count: null });

    useEffect(() => {
        if (!rt) return;
        const watched: string[] = JSON.parse(key);
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

/** Names and pictures from the app's directory (`rt.users()`), for the ids given, as they arrive. */
export function useProfiles(ids: Array<number | string>): Record<string, UserProfile> {
    const rt = useRealtime();
    const key = idsKey(ids);
    const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

    useEffect(() => {
        const wanted: string[] = JSON.parse(key);
        if (!rt || wanted.length === 0) return;
        let live = true;
        rt.users(wanted).then((found) => live && setProfiles((known) => ({ ...known, ...found })), () => {});
        return () => {
            live = false;
        };
    }, [rt, key]);

    return profiles;
}

/**
 * Who is typing in a room now: the senders of its `event` (`{ on: true }` while typing, `{ on: false }` when they stop,
 * sent volatile), each gone `ttl` ms after their last word unless they say more. The page's own user is left out. It takes
 * what useRoom() answered, or the room itself: `useTyping( useRoom( 'chat:7' ) )`.
 */
export function useTyping(from: Room<any, any> | RoomHook<any, any> | null, event = 'typing', ttl = 4000): string[] {
    const rt = useRealtime();
    const [writers, setWriters] = useState<string[]>([]);
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const room = from && 'room' in from ? from.room : from;

    useEffect(() => {
        if (!room) return;
        const all = timers.current;
        const drop = (id: string) => {
            clearTimeout(all.get(id));
            all.delete(id);
            setWriters((list) => list.filter((writer) => writer !== id));
        };
        const heard = (data: unknown, meta: EventMeta = {}) => {
            const id = meta.from;
            if (!id || id === rt?.user) return;
            if (!(data as { on?: boolean } | null)?.on) return drop(id);
            clearTimeout(all.get(id));
            all.set(id, setTimeout(() => drop(id), ttl));
            setWriters((list) => (list.includes(id) ? list : [...list, id]));
        };
        // A message from someone ends their typing.
        const spoke = (_data: unknown, meta: EventMeta = {}) => {
            if (meta.from) drop(meta.from);
        };
        room.on(event, heard);
        room.on('message', spoke);
        return () => {
            room.off(event, heard);
            room.off('message', spoke);
            for (const timer of all.values()) clearTimeout(timer);
            all.clear();
            setWriters([]);
        };
    }, [rt, room, event, ttl]);

    return writers;
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

/**
 * The page's calls once loaded, and the calls ringing for its user now. `error` is the code calls() was refused with,
 * such as `no_webrtc` in React Native, where `calls` stays null.
 */
export function useCalls(): { calls: Calls | null; incoming: Incoming[]; error: string | null } {
    const rt = useRealtime();
    const [calls, setCalls] = useState<Calls | null>(null);
    const [incoming, setIncoming] = useState<Incoming[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!rt) return;
        let live = true;
        let made: Calls | null = null;
        // By its state too: a ring this page answers or turns down says it is over just before the calls let it go.
        const update = () => made && setIncoming(made.incoming().filter((call) => call.state === 'ringing'));
        // Its own listener only: the call screen listens to the same calls.
        const ringing = (call: Incoming) => {
            update();
            call.on('over', update);
        };

        setError(null);
        void rt.calls().then((c) => {
            if (!live) return;
            made = c;
            setCalls(c);
            c.on('incoming', ringing);
            // What rang before they loaded ends as what rings after does.
            for (const call of c.incoming()) call.on('over', update);
            update();
        }, (e: { code?: string }) => {
            if (live) setError(e?.code ?? 'server');
        });

        return () => {
            live = false;
            made?.off('incoming', ringing);
        };
    }, [rt]);

    return { calls, incoming, error };
}

/** What this page sends in a call, kept current as it changes, which a page draws with <VideoTrack track={ camera } />. */
export interface OwnMedia {
    camera: MediaStreamTrack | null;
    microphone: MediaStreamTrack | null;
    screen: MediaStreamTrack | null;
    /** Rejects with its `code`: `device_denied`, `device_missing`, `device_busy`, `no_devices`, and `not_allowed` for a listener. */
    setCamera(on: boolean, options?: DeviceOptions): Promise<void>;
    setMicrophone(on: boolean, options?: DeviceOptions): Promise<void>;
    setScreenShare(on: boolean): Promise<boolean>;
}

/** What `call` sends, read again after each change: its tracks are its own, and say nothing when they change. */
function useOwnMedia(call: Call | GroupCall | null): OwnMedia {
    const [, redraw] = useState(0);
    const callRef = useRef(call);
    callRef.current = call;
    const changed = () => redraw((n) => n + 1);
    const refused = () => Promise.reject(Object.assign(new Error('not_connected'), { code: 'not_connected' }));

    return {
        camera: call?.camera ?? null,
        microphone: call?.microphone ?? null,
        screen: call?.screen ?? null,
        setCamera: useCallback((on, options) => (callRef.current ? callRef.current.setCamera(on, options).finally(changed) : refused()), []),
        setMicrophone: useCallback((on, options) => (callRef.current ? callRef.current.setMicrophone(on, options).finally(changed) : refused()), []),
        setScreenShare: useCallback((on) => (callRef.current ? callRef.current.setScreenShare(on).finally(changed) : refused()), []),
    };
}

/** What useCall() answers. */
export interface CallHook extends OwnMedia {
    /** The call on this component, for what the rest doesn't cover (`add()`, `devices()`, `startAudio()`), or null. */
    call: Call | null;
    /** `idle` with no call, then ringing, connecting, connected, reconnecting. */
    state: CallState | 'idle';
    /** What the other side sends, for <VideoTrack track={ remote.camera } />; null with no call. */
    remote: RemoteMedia | null;
    /** Who the other side is: their user id, and what your rule or `profile` said of them. */
    peer: { user: CallUser; info: any } | null;
    /** Why the last call ended, or null until one did: `hangup`, `rejected`, `busy`, `no_answer`, `group` and the others. */
    endReason: string | null;
    /** The group call it became when someone was added: draw it as useGroupCall()'s, with `endReason` `group`. */
    group: GroupCall | null;
    /** The refusal's code, for a call that could not start or a device that could not open. */
    error: string | null;
    /** Calls `to` about `name`, ringing their every open tab, and opens the devices `type` asks for (`devices: false` opens none). */
    start(token: string, options?: { devices?: boolean }): Promise<void>;
    /** @deprecated A token from your own server: `start( token )`. */
    start(name: string, options: { to: CallUser; type?: CallType; devices?: boolean }): Promise<void>;
    /** Answers a call `useCalls()` says is ringing, and opens the devices its type asks for (`devices: false` opens none). */
    answer(incoming: Incoming, options?: { devices?: boolean }): Promise<void>;
    /** Hangs up, or calls it off while it still rings. */
    end(): void;
}

/**
 * A call between two people on a screen of your own, while the component is on the page: it holds one call, placed with
 * `start()` or answered with `answer()`, and it ends when the component goes. The ready-made call screen needs none of it.
 *
 *     const { incoming } = useCalls();
 *     const { call, state, remote, camera, start, answer, end, setCamera } = useCall();
 *
 *     if ( ! call && incoming[ 0 ] ) return <button onClick={ () => answer( incoming[ 0 ] ) }>Answer</button>;
 *     // callToken(): a request to a route of yours that answers realtime.callToken( user, 34 ) if your app says yes.
 *     if ( ! call ) return <button onClick={ async () => start( await callToken( 34 ) ) }>Call</button>;
 *     return <>
 *         <VideoTrack track={ remote?.camera } />
 *         <AudioTrack track={ remote?.microphone } />
 *         <VideoTrack track={ camera } />
 *         <button onClick={ end }>Hang up</button>
 *     </>;
 */
export function useCall(): CallHook {
    const rt = useRealtime();
    const [call, setCall] = useState<Call | null>(null);
    const [state, setState] = useState<CallState | 'idle'>('idle');
    const [remote, setRemote] = useState<RemoteMedia | null>(null);
    const [endReason, setEndReason] = useState<string | null>(null);
    const [group, setGroup] = useState<GroupCall | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [, drawAgain] = useState(0);
    const own = useOwnMedia(call);
    const held = useRef<Call | null>(null);

    // The call as it changes, from the moment it is here until it ends. A component that goes takes its call with it.
    const hold = useCallback((made: Call, type: CallType, devices: boolean) => {
        held.current?.end();
        held.current = made;
        setCall(made);
        setState(made.state);
        setRemote(made.remote);
        setEndReason(null);
        setGroup(null);
        setError(null);
        made.on('state', setState);
        made.on('remote', (media) => setRemote({ ...media }));
        made.on('group', setGroup);
        made.on('ended', (reason) => {
            if (held.current === made) held.current = null;
            setCall(null);
            setState('idle');
            setRemote(null);
            setEndReason(reason);
        });
        if (!devices) return;
        const opened = () => drawAgain((n) => n + 1);
        const tell = (e: { code?: string }) => setError(e?.code ?? 'server');
        // Each its own: a camera refused leaves the microphone on.
        void made.setMicrophone(true).then(opened, tell);
        if (type === 'video') void made.setCamera(true).then(opened, tell);
    }, []);

    useEffect(() => () => {
        held.current?.end();
        held.current = null;
    }, []);

    const start = useCallback<CallHook['start']>(async (token: string, { to, type = 'video', devices = true }: { to?: CallUser; type?: CallType; devices?: boolean } = {}) => {
        if (!rt) {
            setError('not_connected');
            return;
        }
        setError(null);
        try {
            if (to === undefined) {
                const made = await rt.startCall(token);
                hold(made, made.type, devices);
            } else {
                hold(await rt.call(token, { to, type }), type, devices);
            }
        } catch (e) {
            setError((e as { code?: string }).code ?? 'server');
        }
    }, [rt, hold]);

    const answer = useCallback<CallHook['answer']>(async (incoming, { devices = true } = {}) => {
        setError(null);
        try {
            const answered = await incoming.accept();
            // A ring into a group call is that group call: there is no call between two to hold.
            if ('peer' in answered) hold(answered, incoming.type, devices);
            else setGroup(answered);
        } catch (e) {
            setError((e as { code?: string }).code ?? 'server');
        }
    }, [hold]);

    const end = useCallback(() => held.current?.end(), []);

    return { ...own, call, state, remote, peer: call?.peer ?? null, endReason, group, error, start, answer, end };
}

/**
 * A track's picture, from the other side of a call (`remote.camera`), someone in a group call (`person.camera`) or this
 * page (`camera`), attached as it changes and let go as it leaves. This page's own is muted. With no track it stays empty.
 * Anything else a `<video>` takes goes on it, such as `className`.
 */
export function VideoTrack({ track, ...props }: { track: RemoteTrack | MediaStreamTrack | null | undefined } & VideoHTMLAttributes<HTMLVideoElement>) {
    const ref = useTrackOn<HTMLVideoElement>(track);
    return drawn('video', { ref, autoPlay: true, playsInline: true, muted: !!track && !('attach' in track), ...props });
}

/** A track's sound, which plays as it comes. A blocked one is `autoplay_blocked`, on the call: `call.startAudio()` from a click. */
export function AudioTrack({ track, ...props }: { track: RemoteTrack | MediaStreamTrack | null | undefined } & AudioHTMLAttributes<HTMLAudioElement>) {
    const ref = useTrackOn<HTMLAudioElement>(track);
    return drawn('audio', { ref, autoPlay: true, ...props });
}

function useTrackOn<Element extends HTMLMediaElement>(track: RemoteTrack | MediaStreamTrack | null | undefined) {
    const element = useRef<Element | null>(null);

    useEffect(() => {
        const node = element.current;
        if (!node || !track) return;
        if ('attach' in track) {
            track.attach(node);
            return () => {
                track.detach(node);
            };
        }
        node.srcObject = new MediaStream([track]);
        return () => {
            node.srcObject = null;
        };
    }, [track]);

    return element;
}

/**
 * A group call while the component is on the page (`rt.groupCall()`), and who is in it as they change, which a screen of
 * one's own draws: `people`, the others, `self`, this page's user, and what this page sends, with `setCamera()`,
 * `setMicrophone()` and `setScreenShare()`. `error` is the refusal's code. Null `name` joins nothing; the call is left when
 * the component goes. `getToken` gets the token from your own route, when the component needs one.
 *
 *     const { people, camera, setCamera, error } = useGroupCall( 'meeting:7', () => groupCallToken( 'meeting:7' ) );
 *     <button onClick={ () => setCamera( ! camera ) }>Camera</button>
 *     { people.map( ( person ) => <VideoTrack key={ person.identity } track={ person.camera } /> ) }
 */
export function useGroupCall(name: string | null | undefined, getToken: (() => string | Promise<string>) | { type?: 'audio' | 'video' } = {}): OwnMedia & { group: GroupCall | null; state: GroupCallState | 'idle'; people: Person[]; self: Person | null; error: string | null } {
    const rt = useRealtime();
    const [group, setGroup] = useState<GroupCall | null>(null);
    const [state, setState] = useState<GroupCallState | 'idle'>('idle');
    const [people, setPeople] = useState<Person[]>([]);
    const [error, setError] = useState<string | null>(null);
    const own = useOwnMedia(group);
    // The latest function, which a render makes anew: the call stays the same while its name does.
    const tokenOf = useRef(getToken);
    tokenOf.current = getToken;
    const type = typeof getToken === 'function' ? undefined : getToken.type;

    useEffect(() => {
        if (!rt || !name) return;
        let gone = false;
        let joined: GroupCall | null = null;
        setError(null);
        const asked = tokenOf.current;
        const joining = typeof asked === 'function' ? Promise.resolve(asked()).then((token) => rt.joinGroupCall(token)) : rt.groupCall(name, type ? { type } : {});
        void joining.then((call) => {
            if (gone) return call.leave();
            joined = call;
            const refresh = () => setPeople(call.people());
            call.on('state', setState);
            call.on('person', refresh);
            // A person who dropped keeps their tile, reconnecting, for a while before person_left.
            call.on('person_away', refresh);
            call.on('person_left', refresh);
            call.on('speakers', refresh);
            setGroup(call);
            setState(call.state);
            refresh();
        }, (e: { code?: string }) => {
            if (!gone) setError(e?.code ?? 'server');
        });
        return () => {
            gone = true;
            joined?.leave();
            setGroup(null);
            setState('idle');
            setPeople([]);
        };
    }, [rt, name, type]);

    return { ...own, group, state, people, self: group?.self ?? null, error };
}

const noSnapshot = (): StreamSnapshot | null => null;
const noSubscribe = (): (() => void) => () => {};

/**
 * A live stream while the component is on the page (`rt.stream()`: the app's `streams()` rule makes this user its
 * host, a guest or a viewer), and its state as it changes, which a screen of one's own draws: the stream's phase, who
 * watches, the chat, the stage. `error` is the refusal's code. Null `name` joins nothing; the stream is left when the
 * component goes.
 *
 *     const { stream, state } = useStream( 'show:mugs', () => streamToken( 'show:mugs' ) );
 *     <video ref={ ( video ) => video && stream?.watch( video ) } muted autoPlay playsInline />
 *
 * `getToken` gets a token from your own route, asked again as each runs out, which your route may refuse.
 */
export function useStream(name: string | null | undefined, getToken?: () => string | Promise<string>): { stream: Stream | null; state: StreamSnapshot | null; error: string | null } {
    const rt = useRealtime();
    const [stream, setStream] = useState<Stream | null>(null);
    const [error, setError] = useState<string | null>(null);
    // The latest function, which a render makes anew: the stream stays the same while its name does.
    const tokenOf = useRef(getToken);
    tokenOf.current = getToken;

    useEffect(() => {
        if (!rt || !name) return;
        let gone = false;
        let joined: Stream | null = null;
        setError(null);
        void (tokenOf.current ? rt.joinStream(() => tokenOf.current!()) : rt.stream(name))
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

/**
 * A live stream's main picture, as it changes, and its sound, from what useStream() answered. With no stream it stays empty.
 * The sound plays apart from it, so it stays muted. Anything else a `<video>` takes goes on it, such as `className`.
 *
 *     const { stream } = useStream( 'show:mugs' );
 *     return <StreamVideo stream={ stream } />;
 */
export function StreamVideo({ stream, ...props }: { stream: Stream | null | undefined } & VideoHTMLAttributes<HTMLVideoElement>) {
    const element = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        if (!element.current || !stream) return;
        element.current.muted = true;
        return stream.watch(element.current);
    }, [stream]);

    return drawn('video', { ref: element, autoPlay: true, playsInline: true, muted: true, ...props });
}

/**
 * Starts the call screen on the page: the call window and the ring, in `lang` (the page's by default), with `strings` over
 * its words by the English text, Add Person with `add`, and the backgrounds and AI Noise Removal in its device settings
 * with `effects` and `noise` (and `noiseDefault`), where the app serves them. Renders nothing.
 */
export function CallScreen({ strings, lang, add, effects, noise, noiseDefault }: { strings?: Record<string, string>; lang?: string; add?: boolean; effects?: string; noise?: string; noiseDefault?: 'off' | 'auto' }) {
    const rt = useRealtime();

    useEffect(() => {
        if (rt) void rt.callScreen({ ...(strings ? { strings } : {}), ...(lang ? { lang } : {}), ...(add !== undefined ? { add } : {}), ...(effects ? { effects } : {}), ...(noise ? { noise } : {}), ...(noiseDefault ? { noiseDefault } : {}) });
        // The screen keeps the settings it started with.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rt]);

    return null;
}

/**
 * A call button: calls `to`, a user id of digits or of text (`user_2abc`, `auth0|5f7c`), with a token from your own route,
 * `tokenUrl`, which gets `?to=34&type=video` and answers `{ token }`, the call window showing `name` and `avatar`. `call` in its
 * place names a call a `calls()` rule owns, `{pair}` there the page user and `to`, in order. Needs <CallScreen /> on the page.
 */
export function CallButton({ to, tokenUrl, call, type = 'video', name, avatar, children }: { to: number | string; tokenUrl?: string; call?: string; type?: 'audio' | 'video'; name?: string; avatar?: string; children?: ReactNode }) {
    return drawn(useTag('call-button'), { to: String(to), 'token-url': tokenUrl, call, type, name, avatar }, children);
}

/** A button that joins the group call `call`. `name` and `room` are the same in their old words. Needs <CallScreen /> on the page. */
export function GroupCallButton({ call, tokenUrl, name, room, type = 'video', title, children }: { call?: string; /** Your own route, which gets `?call=meeting:7&type=video` and answers `{ token }`. */ tokenUrl?: string; /** @deprecated `call`. */ name?: string; /** @deprecated `call`. */ room?: string; type?: 'audio' | 'video'; title?: string; children?: ReactNode }) {
    return drawn(useTag('group-call-button'), { call: call ?? name ?? room, 'token-url': tokenUrl, type, title }, children);
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
export function CallSpot({ call, tokenUrl, join, joinWith, className, style, children }: {
    /** With `join`, your own route, which gets `?call=meeting:7&type=video` and answers `{ token }`. */
    tokenUrl?: string;
    call?: string;
    join?: 'audio' | 'video';
    joinWith?: 'microphone' | 'camera' | 'microphone camera' | 'camera microphone';
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
}) {
    return drawn(useTag('call-spot'), { call, 'token-url': tokenUrl, join, 'join-with': joinWith, className, style }, children);
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
export function LiveStream({ name, tokenUrl, view, title, cover, url, loginUrl, studioUrl, backUrl, chat, height, sticky, strings, className, style }: {
    /** Your own route, which gets `?stream=live:12` and answers `{ token }`, asked again as each runs out. */
    tokenUrl?: string;
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

    return drawn(useTag('live-stream'), {
        name, 'token-url': tokenUrl, view, title, cover, url, 'login-url': loginUrl, 'studio-url': studioUrl, 'back-url': backUrl,
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
    /** Its files, as the webhook brought them. */
    files?: ChatFile[];
    /** By reaction key, who picked it. */
    reactions?: Record<string, Array<string | number>>;
}

/** A file in a message, as your server answered its upload (Chat's `upload`): where it opens, and what it is. */
export interface ChatFile {
    id: string;
    url: string;
    name: string;
    type: string;
    size: number;
    width?: number;
    height?: number;
    thumb?: string;
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
    /** Its files, where it has any. */
    files?: ChatFile[];
}

/**
 * Better Messages' conversation on `room`: typing, reactions, read ticks and the composer, on the room's `message`,
 * `typing`, `reaction` and `read` events. The conversation is your server's, saved from its webhook: `messages` names
 * your route for it (asked with the page's cookies, `?before=<id>` for an older page), or `load` asks it your own way.
 * The room's history, 5 minutes long, fills in only what your server hasn't saved yet. It fills the height it is given.
 * `onSent` hears each message the room took, for your server to keep it and tell the other person where no webhook
 * reaches it. In a chat between two, `to` is the other person, on top with their calls (`name` and `avatar` theirs,
 * where the page has them), and `call` the call that shows in the chat while it is on: `true` for the call named as the
 * room, or its name. `startCall` calls them as the chat opens, once. `upload` takes files, to your route for them
 * (`POST`, a form of the `file` and the `room`, answered with the file as your server keeps it), with `accept`,
 * `maxFileSize` in bytes, `maxFiles`, and `fileHosts`, the hosts beside your site's own its files are kept on. Needs
 * <CallScreen /> or <RealtimeUi /> on the page, <CallScreen /> for the calls.
 */
export function Chat({ room, placeholder, reactions, maxLength, messages, load, onSent, upload, accept, maxFileSize, maxFiles, fileHosts, to, name, avatar, call, tokenUrl, startCall }: {
    /** A call button that asks your own route, as CallButton's `tokenUrl` does: it also gets the call's `name`, for your token. */
    tokenUrl?: string;
    room: string; placeholder?: string; reactions?: string[]; maxLength?: number; messages?: string; load?: ChatLoader; onSent?: (message: SentMessage) => void;
    upload?: string; accept?: string; maxFileSize?: number; maxFiles?: number; fileHosts?: string[];
    to?: number | string; name?: string; avatar?: string; call?: boolean | string; startCall?: 'video' | 'audio';
}) {
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
    return drawn(useTag('chat-room'), {
        ref, room, messages, placeholder, reactions: reactions?.join(' '), 'max-length': maxLength ? String(maxLength) : undefined,
        upload, accept, 'max-file-size': maxFileSize ? String(maxFileSize) : undefined, 'max-files': maxFiles ? String(maxFiles) : undefined,
        'file-hosts': fileHosts?.join(' ') || undefined,
        to: to === undefined ? undefined : String(to), name, avatar, call: call === true ? 'true' : call || undefined, 'token-url': tokenUrl, 'start-call': startCall,
    });
}

/**
 * Who is in the presence room `room`, with a call button for each of the others when `call` names the call
 * (`support:{pair}`: `{pair}` the two ids in order, `{me}`, `{id}`). Needs <CallScreen /> or <RealtimeUi /> on the page.
 */
export function OnlineList({ room, title, tokenUrl, call, type }: { room: string; title?: string; /** Your own route, which gets `?to=34&type=video` and answers `{ token }`. */ tokenUrl?: string; call?: string; type?: 'audio' | 'video' | 'audio video' }) {
    return drawn(useTag('online-list'), { room, title, 'token-url': tokenUrl, call, type });
}

/** Who is typing in `room`, by name, from its `typing` events (or `event`). */
export function Typing({ room, event }: { room: string; event?: string }) {
    return drawn(useTag('typing-line'), { room, event });
}

/** How many are in `room`, nothing at none. */
export function OnlineCount({ room }: { room: string }) {
    return drawn(useTag('online-count'), { room });
}
