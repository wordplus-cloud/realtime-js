/**
 * What the Vue, Svelte and Angular helpers share, with no framework in it: a connection that closes when it goes, a room held
 * while a component is on the page, who is online, names and pictures, who is typing, what the app's server sends the
 * user, calls ringing, a call of one's own, a group call and a live stream. Each helper turns these into what its framework
 * reads. They answer what `src/react.tsx` answers.
 */
import {
    connect, type BrowserConfig, type Call, type Calls, type CallState, type CallType, type CallUser, type ConnectOptions, type DeviceOptions, type EventMeta, type GroupCall, type GroupCallState, type Incoming, type Member, type Person,
    type Realtime, type RealtimeErrorEvent, type RemoteMedia, type RemoteTrack, type Room, type RoomEvents, type RoomOwnEvents, type Stream, type StreamSnapshot, type UserProfile,
} from './browser.js';
import { namesOther, roomName } from './room-name.js';

export type RealtimeOptions = ConnectOptions | BrowserConfig;
export type ConnectionFailure = RealtimeErrorEvent | Error;

/**
 * What the connection rests on, as react.tsx has it: the options, with the user's identity as who they are and their
 * profile, not its token, which the server signs anew on every request. Of `pdh`, its first 56 digits: the last 8 are the
 * day, which moves on with no change to who they are.
 */
export function connectionKey(options: RealtimeOptions): string {
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

export interface ConnectionListener {
    /** The connection once it is up, null again when it goes. */
    realtime(realtime: Realtime | null): void;
    connected(connected: boolean): void;
    /** Why it could not connect or was refused (`{ code }`), null again once it connects. */
    error(error: ConnectionFailure | null): void;
}

/** Connects, telling `listener` how it goes, until the answer is called, which closes it. */
export function openConnection(options: RealtimeOptions, listener: ConnectionListener): () => void {
    let live = true;
    let made: Realtime | null = null;

    listener.error(null);
    connect(options).then(
        (rt) => {
            if (!live) return rt.close();
            made = rt;
            rt.on('error', (error: RealtimeErrorEvent) => {
                // An event the page can't open is that event's, and the connection is fine.
                if (error.code !== 'unopened') listener.error(error);
            });
            rt.on('connected', () => {
                listener.connected(true);
                listener.error(null);
            });
            rt.on('disconnected', () => listener.connected(false));
            listener.realtime(rt);
            listener.connected(rt.connected);
        },
        (error) => {
            if (live) listener.error(error);
        },
    );

    return () => {
        live = false;
        made?.close();
        listener.realtime(null);
        listener.connected(false);
    };
}

/** How a room is, for a screen to draw. */
export interface RoomStatus<Info = unknown> {
    /** joining, joined, failed, left, or idle with no room. */
    state: Room['state'] | 'idle';
    /** Why it failed: forbidden, expired, no_rule, kicked … */
    error: Room['error'];
    /** A presence room's members. */
    members: Array<Member<Info>>;
    /** How many are in a counting room. */
    count: number | null;
}

/**
 * `T` as it is, from which TypeScript infers nothing (TypeScript 5.4's `NoInfer`, written out for older compilers). A room's
 * handlers take it: what its events carry comes from `useRoom<Events>()` alone, never from a handler that types its own
 * data, which would leave the room's other handlers `unknown` and its `emit()` to the names handled.
 */
export type NotInferred<T> = [T][T extends unknown ? 0 : never];

/** A room's handlers by event name, each given the event's data and its meta, and the room's own such as `kicked`. */
export type RoomHandlers<Events extends RoomEvents = RoomEvents, Info = unknown> =
    { [K in keyof Events]?: (data: Events[K], meta: EventMeta) => void } &
    { [K in keyof RoomOwnEvents<Info>]?: (...args: RoomOwnEvents<Info>[K]) => void };

export const NO_ROOM: RoomStatus<never> = { state: 'idle', error: null, members: [], count: null };

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

/**
 * Joins the room `name` until the answer is called, telling `tell` how it is as that changes: with no connection or no
 * name yet, or `{pair}` with `other` still empty, it joins nothing.
 */
export function holdRoom<Events extends RoomEvents = RoomEvents, Info = unknown>(
    rt: Realtime | null,
    name: string | null | undefined,
    other: number | string | null | undefined,
    handlers: RoomHandlers<Events, Info>,
    tell: (status: RoomStatus<Info>, room: Room<Events, Info> | null) => void,
): () => void {
    if (!rt || !name || (namesOther(name) && (other === undefined || other === null))) {
        tell(NO_ROOM, null);
        return () => {};
    }

    let named: string;
    try {
        named = roomName(name, rt.user, other);
    } catch (error) {
        // `{pair}` on a page with nobody signed in.
        tell({ ...NO_ROOM, state: 'failed', error: (error as { code?: string }).code ?? 'bad_room' }, null);
        return () => {};
    }

    const room = hold(rt, named) as unknown as Room<RoomEvents, Info>;
    const update = () =>
        tell({ state: room.state, error: room.error, members: [...room.members].map(([id, info]) => ({ id, info })), count: room.count }, room as unknown as Room<Events, Info>);
    update();

    const own = handlers as Record<string, ((...args: any[]) => void) | undefined>;
    const listeners: Array<[string, (...args: any[]) => void]> = [
        ...['joined', 'join', 'leave', 'count', 'error', 'kicked'].map((event): [string, () => void] => [event, update]),
        ...Object.keys(own).map((event): [string, (...args: any[]) => void] => [event, (...args) => own[event]?.(...args)]),
    ];
    for (const [event, fn] of listeners) room.on(event as never, fn);

    return () => {
        for (const [event, fn] of listeners) room.off(event, fn);
        release(rt, named);
    };
}

/** Hears what the app's server sends this user, until the answer is called. */
export function hearUser(rt: Realtime | null, event: string, handler: (data: any, meta: { at?: number }) => void): () => void {
    if (!rt) return () => {};
    const listener = (data: unknown, meta: { at?: number }) => handler(data, meta);
    rt.on(event, listener);
    return () => {
        rt.off(event, listener);
    };
}

const nothing = (): void => {};
const codeOf = (error: unknown): string => (error as { code?: string } | null)?.code ?? 'server';

/**
 * One spelling for a list of ids, in any order and with any repeated, so a new array of the same people changes nothing.
 * It holds them as JSON, as an id may hold any separator: Auth0's are `auth0|5f7c…`.
 */
export function idsKey(ids: Array<number | string>): string {
    return JSON.stringify([...new Set(ids.map(String))].sort());
}

export interface OnlineStatus {
    /** Who of them is online, by id. */
    online: Record<string, boolean>;
    /** When each who is away was last seen, ms, by id. */
    lastSeen: Record<string, number>;
    /** How many are online across the app, when asked for. */
    count: number | null;
}

export const NO_ONLINE: OnlineStatus = { online: {}, lastSeen: {}, count: null };

/** Follows the online status of the users `idsKey()` named, until the answer is called. */
export function followOnline(rt: Realtime | null, key: string, counting: boolean, tell: (status: OnlineStatus) => void): () => void {
    if (!rt) {
        tell(NO_ONLINE);
        return nothing;
    }
    const watched = JSON.parse(key) as string[];
    const update = () => {
        const online: Record<string, boolean> = {};
        const lastSeen: Record<string, number> = {};
        for (const id of watched) {
            online[id] = rt.online.has(id);
            const at = rt.online.lastSeen(id);
            if (at !== null) lastSeen[id] = at;
        }
        tell({ online, lastSeen, count: rt.online.count });
    };
    rt.online.watch(watched).on('change', update);
    if (counting) rt.online.on('count', update);
    update();

    return () => {
        rt.online.off('change', update);
        if (counting) rt.online.off('count', update);
    };
}

/** Reads the names and pictures of the users `idsKey()` named from the app's directory: `tell` hears them, unless the answer was called by then. */
export function readProfiles(rt: Realtime | null, key: string, tell: (found: Record<string, UserProfile>) => void): () => void {
    const ids = JSON.parse(key) as string[];
    if (!rt || ids.length === 0) return nothing;
    let live = true;
    rt.users(ids).then((found) => {
        if (live) tell(found);
    }, nothing);
    return () => {
        live = false;
    };
}

/**
 * Who is typing in a room: the senders of its `event` (`{ on: true }` while typing, `{ on: false }` when they stop), each gone
 * `ttl` ms after their last word unless they say more, and the page's own user left out. A message from someone ends their
 * typing. It follows until the answer is called.
 */
export function followTyping(rt: Realtime | null, room: Room<any, any> | null, event: string, ttl: number, tell: (writers: string[]) => void): () => void {
    if (!room) {
        tell([]);
        return nothing;
    }
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let writers: string[] = [];
    const change = (list: string[]) => {
        writers = list;
        tell(list);
    };
    const drop = (id: string) => {
        clearTimeout(timers.get(id));
        timers.delete(id);
        if (writers.includes(id)) change(writers.filter((writer) => writer !== id));
    };
    const heard = (data: unknown, meta: EventMeta = {}) => {
        const id = meta.from;
        if (!id || id === rt?.user) return;
        if (!(data as { on?: boolean } | null)?.on) return drop(id);
        clearTimeout(timers.get(id));
        timers.set(id, setTimeout(() => drop(id), ttl));
        if (!writers.includes(id)) change([...writers, id]);
    };
    const spoke = (_data: unknown, meta: EventMeta = {}) => {
        if (meta.from) drop(meta.from);
    };
    room.on(event, heard);
    room.on('message', spoke);
    change([]);

    return () => {
        room.off(event, heard);
        room.off('message', spoke);
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
        change([]);
    };
}

export interface CallsStatus {
    /** The page's calls once loaded. */
    calls: Calls | null;
    /** The calls ringing for its user now. */
    incoming: Incoming[];
    /** The code calls() was refused with. */
    error: string | null;
}

export const NO_CALLS: CallsStatus = { calls: null, incoming: [], error: null };

/** Loads the page's calls, which holds its line so its user's calls ring here, and follows what rings, until the answer is called. */
export function followCalls(rt: Realtime | null, tell: (status: CallsStatus) => void): () => void {
    tell(NO_CALLS);
    if (!rt) return nothing;
    let live = true;
    let made: Calls | null = null;
    const update = () => {
        // By its state too: a ring this page answers or turns down says it is over just before the calls let it go.
        if (live && made) tell({ calls: made, incoming: made.incoming().filter((call) => call.state === 'ringing'), error: null });
    };
    // Its own listener only: the call screen listens to the same calls.
    const ringing = (call: Incoming) => {
        call.on('over', update);
        update();
    };

    rt.calls().then((calls) => {
        if (!live) return;
        made = calls;
        calls.on('incoming', ringing);
        // What rang before they loaded ends as what rings after does.
        for (const call of calls.incoming()) call.on('over', update);
        update();
    }, (error) => {
        if (live) tell({ ...NO_CALLS, error: codeOf(error) });
    });

    return () => {
        live = false;
        made?.off('incoming', ringing);
    };
}

/** What this page sends in a call, kept current as it changes. */
export interface OwnMedia {
    camera: MediaStreamTrack | null;
    microphone: MediaStreamTrack | null;
    screen: MediaStreamTrack | null;
}

/** What this page may change of it. */
export interface OwnControls {
    /** Rejects with its `code`: `device_denied`, `device_missing`, `device_busy`, `no_devices`, and `not_allowed` for a listener. */
    setCamera(on: boolean, options?: DeviceOptions): Promise<void>;
    setMicrophone(on: boolean, options?: DeviceOptions): Promise<void>;
    setScreenShare(on: boolean): Promise<boolean>;
}

const tracksOf = (call: Call | GroupCall | null): OwnMedia => ({ camera: call?.camera ?? null, microphone: call?.microphone ?? null, screen: call?.screen ?? null });

/** A call's tracks are its own and say nothing when they change, so `changed` reads them again after each. */
function ownControls(current: () => Call | GroupCall | null, changed: () => void): OwnControls {
    const refused = () => Promise.reject(Object.assign(new Error('not_connected'), { code: 'not_connected' }));

    return {
        setCamera: (on, options) => current()?.setCamera(on, options).finally(changed) ?? refused(),
        setMicrophone: (on, options) => current()?.setMicrophone(on, options).finally(changed) ?? refused(),
        setScreenShare: (on) => current()?.setScreenShare(on).finally(changed) ?? refused(),
    };
}

export interface CallStatus extends OwnMedia {
    /** The call on this component, for what the rest doesn't cover (`add()`, `devices()`, `startAudio()`), or null. */
    call: Call | null;
    /** `idle` with no call, then ringing, connecting, connected, reconnecting. */
    state: CallState | 'idle';
    /** What the other side sends, or null with no call. */
    remote: RemoteMedia | null;
    /** Who the other side is: their user id, and what your rule or `profile` said of them. */
    peer: { user: CallUser; info: any } | null;
    /** Why the last call ended, or null until one did: `hangup`, `rejected`, `busy`, `no_answer`, `group` and the others. */
    endReason: string | null;
    /** The group call it became when someone was added, with `endReason` `group`. */
    group: GroupCall | null;
    /** The refusal's code, for a call that could not start or a device that could not open. */
    error: string | null;
}

export const NO_CALL: CallStatus = { call: null, state: 'idle', remote: null, peer: null, endReason: null, group: null, error: null, camera: null, microphone: null, screen: null };

export interface CallControls extends OwnControls {
    /** Calls `to` about `name`, ringing their every open tab, and opens the devices `type` asks for (`devices: false` opens none). */
    start(token: string, options?: { devices?: boolean }): Promise<void>;
    /** @deprecated A token from your own server: `start( token )`. */
    start(name: string, options: { to: CallUser; type?: CallType; devices?: boolean }): Promise<void>;
    /** Answers a call that is ringing, and opens the devices its type asks for (`devices: false` opens none). */
    answer(incoming: Incoming, options?: { devices?: boolean }): Promise<void>;
    /** Hangs up, or calls it off while it still rings. */
    end(): void;
}

/** Holds one call for a component, told how it is as it changes: `stop()` ends it, as the component goes. */
export function callHolder(realtime: () => Realtime | null, tell: (status: CallStatus) => void): CallControls & { stop(): void } {
    let held: Call | null = null;
    let stopped = false;
    let status = NO_CALL;
    const change = (next: Partial<CallStatus> = {}) => {
        status = { ...status, ...next, ...tracksOf(held) };
        tell(status);
    };

    const hold = (made: Call, type: CallType, devices: boolean) => {
        // Placed as the component went: nobody is left to show it.
        if (stopped) return made.end();
        held?.end();
        held = made;
        change({ call: made, state: made.state, remote: made.remote, peer: made.peer, endReason: null, group: null, error: null });
        // A call this let go of says nothing more here, so it can't undo the next one.
        made.on('state', (state) => {
            if (held === made) change({ state });
        });
        made.on('remote', (media) => {
            if (held === made) change({ remote: { ...media } });
        });
        made.on('group', (group) => {
            if (held === made) change({ group });
        });
        made.on('ended', (reason) => {
            if (held !== made) return;
            held = null;
            change({ call: null, state: 'idle', remote: null, peer: null, endReason: reason });
        });
        if (!devices) return;
        const opened = () => change();
        const refused = (error: unknown) => change({ error: codeOf(error) });
        // Each its own: a camera refused leaves the microphone on.
        void made.setMicrophone(true).then(opened, refused);
        if (type === 'video') void made.setCamera(true).then(opened, refused);
    };

    return {
        ...ownControls(() => held, change),
        start: async (token: string, { to, type = 'video', devices = true }: { to?: CallUser; type?: CallType; devices?: boolean } = {}) => {
            const rt = realtime();
            if (!rt) return change({ error: 'not_connected' });
            change({ error: null });
            try {
                if (to === undefined) {
                    const made = await rt.startCall(token);
                    hold(made, made.type, devices);
                } else {
                    hold(await rt.call(token, { to, type }), type, devices);
                }
            } catch (error) {
                change({ error: codeOf(error) });
            }
        },
        answer: async (incoming, { devices = true } = {}) => {
            change({ error: null });
            try {
                const answered = await incoming.accept();
                // A ring into a group call is that group call: there is no call between two to hold.
                if ('peer' in answered) hold(answered, incoming.type, devices);
                else change({ group: answered });
            } catch (error) {
                change({ error: codeOf(error) });
            }
        },
        end: () => held?.end(),
        stop: () => {
            stopped = true;
            held?.end();
            held = null;
        },
    };
}

export interface GroupStatus extends OwnMedia {
    /** The group call, for what the rest doesn't cover (`moderate()`, `startRecording()`, `devices()`), or null. */
    group: GroupCall | null;
    /** `idle` with no call, then connecting, waiting, connected, reconnecting, ended. */
    state: GroupCallState | 'idle';
    /** The others in it, as they change. */
    people: Person[];
    /** This page's own user, as the others see them. */
    self: Person | null;
    /** The refusal's code. */
    error: string | null;
}

export const NO_GROUP: GroupStatus = { group: null, state: 'idle', people: [], self: null, error: null, camera: null, microphone: null, screen: null };

/** A group call for a component, told how it is as it changes: `hold()` joins one until what it answered is called. */
export function groupHolder(tell: (status: GroupStatus) => void): OwnControls & { hold(rt: Realtime | null, name: string | null | undefined, type?: CallType | null, getToken?: () => string | Promise<string>): () => void } {
    let current: GroupCall | null = null;
    let status = NO_GROUP;
    const change = (next: Partial<GroupStatus> = {}) => {
        status = { ...status, ...next, ...tracksOf(current), people: current?.people() ?? [], self: current?.self ?? null };
        tell(status);
    };
    const reset = () => {
        current = null;
        status = NO_GROUP;
        tell(NO_GROUP);
    };

    return {
        ...ownControls(() => current, change),
        hold: (rt, name, type, getToken) => {
            if (!rt || !name) {
                reset();
                return nothing;
            }
            let gone = false;
            change({ error: null });
            (getToken ? Promise.resolve(getToken()).then((token) => rt.joinGroupCall(token)) : rt.groupCall(name, type ? { type } : {})).then((call) => {
                if (gone) return call.leave();
                current = call;
                const refresh = () => {
                    if (current === call) change();
                };
                call.on('state', (state) => {
                    if (current === call) change({ state });
                });
                call.on('person', refresh);
                // A person who dropped keeps their tile, reconnecting, for a while before person_left.
                call.on('person_away', refresh);
                call.on('person_left', refresh);
                call.on('speakers', refresh);
                change({ group: call, state: call.state });
            }, (error) => {
                if (!gone) change({ error: codeOf(error) });
            });

            return () => {
                gone = true;
                current?.leave();
                reset();
            };
        },
    };
}

export interface StreamStatus {
    /** The stream once joined, for what changes it (`chat.send()`, `goLive()`), or null until then. */
    stream: Stream | null;
    /** Everything its screen draws, as it changes (`media`, `viewers`, `chat`, `tiles`), or null until joined. */
    state: StreamSnapshot | null;
    /** The code it was refused with. */
    error: string | null;
}

export const NO_STREAM: StreamStatus = { stream: null, state: null, error: null };

/** Joins the live stream `name` until what it answered is called, telling how it is as it changes. With no name, nothing. */
export function holdStream(rt: Realtime | null, name: string | null | undefined, tell: (status: StreamStatus) => void, getToken?: () => string | Promise<string>): () => void {
    tell(NO_STREAM);
    if (!rt || !name) return nothing;

    let gone = false;
    let joined: Stream | null = null;
    let stopHearing = nothing;
    (getToken ? rt.joinStream(getToken) : rt.stream(name)).then((stream) => {
        if (gone) return stream.leave();
        joined = stream;
        const refresh = () => tell({ stream, state: stream.snapshot(), error: null });
        stopHearing = stream.subscribe(refresh);
        refresh();
    }, (error) => {
        if (!gone) tell({ ...NO_STREAM, error: codeOf(error) });
    });

    return () => {
        gone = true;
        stopHearing();
        joined?.leave();
        tell(NO_STREAM);
    };
}

/** Shows a live stream on a `<video>`, its main picture as it changes and its sound, until the answer is called. The sound plays apart, so the `<video>` stays muted. */
export function showStream(element: HTMLVideoElement | null, stream: Stream | null | undefined): () => void {
    if (!element || !stream) return nothing;
    element.muted = true;
    return stream.watch(element);
}

/**
 * Shows a track on a `<video>` or an `<audio>` until the answer is called: one from the other side of a call or someone in a
 * group call, or this page's own, which is muted, as nobody needs to hear themselves.
 */
export function showTrack(element: HTMLMediaElement | null, track: RemoteTrack | MediaStreamTrack | null | undefined): () => void {
    if (!element || !track) return nothing;
    if ('attach' in track) {
        track.attach(element);
        return () => {
            track.detach(element);
        };
    }
    const muted = element.muted;
    element.muted = true;
    element.srcObject = new MediaStream([track]);
    return () => {
        element.srcObject = null;
        element.muted = muted;
    };
}

/** What emitWithAck() answers with no room to send to. */
export function notJoined(): Promise<never> {
    return Promise.reject(Object.assign(new Error('not_joined'), { code: 'not_joined' }));
}

/** A helper used with no provideRealtime() above it, said once in the console, as it would otherwise stay idle for good. */
let told = false;

export function tellNoConnection(helper: string): void {
    if (told) return;
    told = true;
    console.warn(`wordplus-realtime: ${helper} found no connection, so it does nothing. Call provideRealtime() once, in your root component.`);
}
