/**
 * Svelte 5 for WordPlus Cloud's realtime SDK: one connection for the app (provideRealtime), how it is (useConnection), a
 * room's events, members and count (useRoom, usePresence), who is online (useOnline), names and pictures (useProfiles), who is
 * typing (useTyping), what the app's server sends the user (useUserEvent), calls ringing (useCalls), a call of your own (useCall),
 * a group call (useGroupCall), their pictures and sound (`use:track`), and a live stream (useStream, `use:streamVideo`). What these
 * don't cover is on the connection itself (useRealtime). Nothing connects on the server: it all starts as a component mounts, so
 * a page SvelteKit renders draws each room idle and joins it in the browser.
 *
 * What they answer is read as a rune's state is, in the template and in `$derived`: `chat.error`, each time through the
 * object, as taking it apart keeps only the value it held then. What changes goes in as a getter:
 * `useRoom( () => `order:${ id }`, handlers )`.
 *
 *     <!-- App.svelte -->
 *     <script>
 *         import { provideRealtime } from '@wordplus/realtime/svelte';
 *
 *         provideRealtime();
 *     </script>
 *
 *     <!-- Chat.svelte -->
 *     <script>
 *         import { useRoom } from '@wordplus/realtime/svelte';
 *
 *         const chat = useRoom( 'chat:7', {
 *             message: ( data, meta ) => draw( data.text, meta.from ),
 *         } );
 *     </script>
 *
 *     {#if chat.error}
 *         <p>You are not in this room.</p>
 *     {:else}
 *         <SendBox onsend={ ( text ) => chat.emit( 'message', { text } ) } />
 *     {/if}
 */
import { getContext, onMount, setContext, untrack } from 'svelte';
import { derived, fromStore, get, toStore, writable, type Readable, type Writable } from 'svelte/store';
import type { CallType, Member, Realtime, RemoteTrack, Room, RoomEvents, Stream, UserProfile } from './browser.js';
import {
    callHolder, connectionKey, followCalls, followOnline, followTyping, groupHolder, hearUser, holdRoom, holdStream, idsKey, NO_CALL, NO_CALLS, NO_GROUP, NO_ONLINE, NO_ROOM, NO_STREAM, notJoined, openConnection, readProfiles, showStream, showTrack, tellNoConnection,
    type CallControls, type CallsStatus, type CallStatus, type ConnectionFailure, type GroupStatus, type OnlineStatus, type OwnControls, type NotInferred, type RealtimeOptions, type RoomHandlers, type RoomStatus, type StreamStatus,
} from './bindings.js';

export type { CallControls, CallsStatus, CallStatus, ConnectionFailure, GroupStatus, OnlineStatus, OwnControls, RealtimeOptions, RoomHandlers, RoomStatus, StreamStatus };

/** A value, or a getter for one that changes, such as what reads `$props()` or `$state`. */
export type MaybeGetter<T> = T | (() => T);

interface Connection {
    realtime: Writable<Realtime | null>;
    connected: Writable<boolean>;
    error: Writable<ConnectionFailure | null>;
}

const CONNECTION = Symbol.for('wordplus.realtime.svelte-connection');

const read = <T>(value: MaybeGetter<T>): T => (typeof value === 'function' ? (value as () => T)() : value);
const notConnected = (): Connection => ({ realtime: writable(null), connected: writable(false), error: writable(null) });

function connectionOf(helper: string): Connection {
    const found = getContext<Connection | undefined>(CONNECTION);
    if (found) return found;
    onMount(() => tellNoConnection(helper));
    return notConnected();
}

/**
 * Runs `start` once the component is mounted, and again each time what `stores` hold changes, each time calling what the last
 * one answered first. The last is called as the component goes. Never on the server, where onMount() doesn't run.
 */
function whileMounted<Values extends [unknown, ...unknown[]]>(stores: { [I in keyof Values]: Readable<Values[I]> }, start: (values: Values) => () => void): void {
    // A derived store whose function takes `set` answers its own cleanup. What `start` reads is not what this runs again for.
    const running = derived(stores as unknown as [Readable<unknown>, ...Array<Readable<unknown>>], (values, _set) => untrack(() => start(values as unknown as Values)));
    onMount(() => running.subscribe(() => {}));
}

/** `methods` with each field of `status` beside them, read as a rune's state is. `initial` says which fields there are. */
function reading<Status extends object, Methods extends object>(status: Readable<Status>, initial: Status, methods: Methods): Readonly<Status> & Methods {
    const now = fromStore(status);
    const answer = { ...methods };
    for (const key of Object.keys(initial) as Array<keyof Status>) {
        Object.defineProperty(answer, key, { enumerable: true, get: () => now.current[key] });
    }
    return answer as Readonly<Status> & Methods;
}

/**
 * Connects once for the component and everything under it, and closes when it goes: call it in your root component, or
 * your root `+layout.svelte`. `options` are `connect()`'s, or the server's config() for the signed-in user, as a value or a
 * getter, and a change connects again. Left out, the routes at /api/realtime say which app and who the user is.
 */
export function provideRealtime(options: MaybeGetter<RealtimeOptions> = {}): void {
    const connection = notConnected();
    setContext(CONNECTION, connection);

    whileMounted<[string]>([toStore(() => connectionKey(read(options)))], () => openConnection(read(options), {
        realtime: connection.realtime.set,
        connected: connection.connected.set,
        error: connection.error.set,
    }));
}

/** The app's connection in `.current`, or null until it is up, for what the other helpers don't cover: `rt.calls()`'s `devices()`, `rt.stream()`. */
export function useRealtime(): { readonly current: Realtime | null } {
    return fromStore(connectionOf('useRealtime()').realtime);
}

/**
 * How the connection is, for a "Reconnecting…" of your own: `connected`, and `error`, why it could not connect or was
 * refused (`{ code }`: `wrong_origin`, `over_capacity`, `keys_failed` …), cleared once it connects. It comes back by itself.
 *
 *     const connection = useConnection();
 *     {#if ! connection.connected}<p>Reconnecting…</p>{/if}
 */
export function useConnection(): { readonly connected: boolean; readonly error: ConnectionFailure | null } {
    const { connected, error } = connectionOf('useConnection()');
    const isConnected = fromStore(connected);
    const failure = fromStore(error);

    return {
        get connected() {
            return isConnected.current;
        },
        get error() {
            return failure.current;
        },
    };
}

/** What useRoom() answers. Read each through it, `chat.error`, as taking it apart keeps only the value it held then. */
export interface RoomHelper<Events extends RoomEvents = RoomEvents, Info = unknown> {
    /** joining, joined, failed, left, or idle with no room. */
    readonly state: RoomStatus['state'];
    /** Why it failed: forbidden, expired, no_rule, kicked … */
    readonly error: Room['error'];
    /** A presence room's members, and how many are in a counting room. */
    readonly members: RoomStatus<Info>['members'];
    readonly count: number | null;
    /** The room, for volatile and history, or null until there is one. */
    readonly room: Room<Events, Info> | null;
    emit<K extends keyof Events & string>(event: K, data?: Events[K]): void;
    emitWithAck<K extends keyof Events & string>(event: K, data?: Events[K]): Promise<{ id: string; at: number }>;
}

/**
 * Joins a room while the component is on the page: `handlers` by event name, each given the event's data (opened, when
 * the app sealed it) and its meta `{ from, id, at, replayed? }`. Its members and count stay current. `name` is a value or a
 * getter, and a change moves to that room: `useRoom( () => `order:${ id }`, handlers )`. Null joins nothing. `Events` says
 * what its events carry and `Info` what its members bring, for your own checking and nothing else. `{pair}` in the name is
 * this user and `with`, in order, so both of them name the same room: `useRoom( 'chat:{pair}', handlers, { with: 34 } )`.
 * With `with` still empty, as the other person loads, it joins nothing yet.
 */
export function useRoom<Events extends RoomEvents = RoomEvents, Info = unknown>(
    name: MaybeGetter<string | null | undefined>,
    handlers: RoomHandlers<NotInferred<Events>, Info> = {},
    options: { with?: MaybeGetter<number | string | null | undefined> } = {},
): RoomHelper<Events, Info> {
    const { realtime } = connectionOf('useRoom()');
    const initial: RoomStatus<Info> & { room: Room<Events, Info> | null } = { ...NO_ROOM, room: null };
    const held = writable(initial);
    let joined: Room<Events, Info> | null = null;

    whileMounted<[Realtime | null, string | null | undefined, number | string | null | undefined]>(
        [realtime, toStore(() => read(name)), toStore(() => read(options.with))],
        ([rt, named, other]) => holdRoom<Events, Info>(rt, named, other, handlers, (status, room) => {
            joined = room;
            held.set({ ...status, room });
        }),
    );

    return reading(held, initial, {
        emit: (event: string, data?: unknown) => joined?.emit(event, data as never),
        emitWithAck: (event: string, data?: unknown) => joined?.emitWithAck(event, data as never) ?? notJoined(),
    }) as RoomHelper<Events, Info>;
}

/** Who is in a presence room now, in `.current`: each member's id and info, as the others see them. */
export function usePresence<Info = unknown>(name: MaybeGetter<string | null | undefined>, options: { with?: MaybeGetter<number | string | null | undefined> } = {}): { readonly current: Array<Member<Info>> } {
    const room = useRoom<RoomEvents, Info>(name, {}, options);

    return {
        get current() {
            return room.members;
        },
    };
}

/**
 * The online status of users, by id, kept current, and how many are online across the app, with `count`. `ids` is a value or a
 * getter.
 *
 *     const status = useOnline( [ 34 ] );
 *     {#if status.online[ 34 ]}<p>Ann is online</p>{/if}
 */
export function useOnline(ids: MaybeGetter<Array<number | string>>, options: { count?: boolean } = {}): Readonly<OnlineStatus> {
    const { realtime } = connectionOf('useOnline()');
    const status = writable(NO_ONLINE);

    whileMounted<[Realtime | null, string]>([realtime, toStore(() => idsKey(read(ids)))], ([rt, key]) => followOnline(rt, key, !!options.count, status.set));

    return reading(status, NO_ONLINE, {});
}

/** Names and pictures from the app's directory (`rt.users()`), in `.current`, for the ids given, as they arrive. */
export function useProfiles(ids: MaybeGetter<Array<number | string>>): { readonly current: Record<string, UserProfile> } {
    const { realtime } = connectionOf('useProfiles()');
    const profiles = writable<Record<string, UserProfile>>({});

    whileMounted<[Realtime | null, string]>([realtime, toStore(() => idsKey(read(ids)))], ([rt, key]) => readProfiles(rt, key, (found) => {
        profiles.update((known) => ({ ...known, ...found }));
    }));

    return fromStore(profiles);
}

/**
 * Who is typing in a room now, in `.current`: the senders of its `event` (`{ on: true }` while typing, `{ on: false }` when they
 * stop, sent volatile), each gone `ttl` ms after their last word unless they say more. The page's own user is left out. It takes
 * what useRoom() answered, or a room or a getter for one: `useTyping( chat )`.
 */
export function useTyping(from: Pick<RoomHelper<any, any>, 'room'> | MaybeGetter<Room<any, any> | null>, event: MaybeGetter<string> = 'typing', ttl = 4000): { readonly current: string[] } {
    const { realtime } = connectionOf('useTyping()');
    const writers = writable<string[]>([]);
    const roomOf = () => (from && typeof from === 'object' && 'room' in from ? from.room : read(from as MaybeGetter<Room<any, any> | null>));

    // By its name: a room's own status tells of each who comes and goes, the same room each time, and that restarts nothing here.
    whileMounted<[Realtime | null, string | null, string]>(
        [realtime, toStore(() => roomOf()?.name ?? null), toStore(() => read(event))],
        ([rt, named, heard]) => followTyping(rt, named ? roomOf() : null, heard, ttl, writers.set),
    );

    return fromStore(writers);
}

/** What the app's server sends this user (`toUser( id ).emit( event, data )`), while the component is on the page. */
export function useUserEvent(event: MaybeGetter<string>, handler: (data: any, meta: { at?: number }) => void): void {
    const { realtime } = connectionOf('useUserEvent()');

    whileMounted<[Realtime | null, string]>([realtime, toStore(() => read(event))], ([rt, name]) => hearUser(rt, name, handler));
}

/**
 * The page's calls once loaded, and the calls ringing for its user now. `error` is the code calls() was refused with, such as
 * `no_webrtc`, where `calls` stays null.
 */
export function useCalls(): Readonly<CallsStatus> {
    const { realtime } = connectionOf('useCalls()');
    const status = writable(NO_CALLS);

    whileMounted<[Realtime | null]>([realtime], ([rt]) => followCalls(rt, status.set));

    return reading(status, NO_CALLS, {});
}

/**
 * A call between two people on a screen of your own, while the component is on the page: it holds one call, placed with
 * `start()` or answered with `answer()`, and it ends when the component goes. The ready-made call screen needs none of it.
 *
 *     const calls = useCalls();
 *     const current = useCall();
 *
 *     {#if ! current.call && calls.incoming[ 0 ]}
 *         <button onclick={ () => current.answer( calls.incoming[ 0 ] ) }>Answer</button>
 *     {:else if ! current.call}
 *         <!-- callToken(): a request to a route of yours that answers realtime.callToken( user, 34 ) if your app says yes. -->
 *         <button onclick={ async () => current.start( await callToken( 34 ) ) }>Call</button>
 *     {:else}
 *         <video use:track={ current.remote?.camera } muted autoplay playsinline></video>
 *         <audio use:track={ current.remote?.microphone } autoplay></audio>
 *         <video use:track={ current.camera } muted autoplay playsinline></video>
 *         <button onclick={ current.end }>Hang up</button>
 *     {/if}
 */
export function useCall(): Readonly<CallStatus> & CallControls {
    const { realtime } = connectionOf('useCall()');
    const status = writable(NO_CALL);
    const { stop, ...controls } = callHolder(() => get(realtime), status.set);
    onMount(() => stop);

    return reading(status, NO_CALL, controls);
}

/**
 * A group call while the component is on the page (`rt.groupCall()`), and who is in it as they change: `people`, the others,
 * `self`, this page's user, and what this page sends, with `setCamera()`, `setMicrophone()` and `setScreenShare()`. `error` is
 * the refusal's code. `name` is a value or a getter, null joins nothing, and the call is left when the component goes.
 *
 *     const meeting = useGroupCall( 'meeting:daily' );
 *
 *     <button onclick={ () => meeting.setCamera( ! meeting.camera ) }>Camera</button>
 *     {#each meeting.people as person (person.identity)}
 *         <video use:track={ person.camera } muted autoplay playsinline></video>
 *     {/each}
 */
export function useGroupCall(name: MaybeGetter<string | null | undefined>, getToken: (() => string | Promise<string>) | { type?: MaybeGetter<CallType | null | undefined> } = {}): Readonly<GroupStatus> & OwnControls {
    const { realtime } = connectionOf('useGroupCall()');
    const status = writable(NO_GROUP);
    const { hold, ...controls } = groupHolder(status.set);

    whileMounted<[Realtime | null, string | null | undefined, CallType | null | undefined]>(
        [realtime, toStore(() => read(name)), toStore(() => (typeof getToken === 'function' ? null : read(getToken.type)))],
        ([rt, named, type]) => hold(rt, named, type, typeof getToken === 'function' ? getToken : undefined),
    );

    return reading(status, NO_GROUP, controls);
}

/**
 * A live stream on a screen of your own, while the component is on the page (`rt.stream()`): `stream`, for what changes it,
 * `state`, everything its screen draws as it changes, and `error`, the refusal's code. `name` is a value or a getter, null joins
 * nothing, and the stream is left when the component goes. The ready-made player, `<live-stream>`, needs none of it.
 *
 *     // streamToken(): a request to a route of yours, asked again as each token runs out.
 *     const show = useStream( 'show:mugs', () => streamToken( 'show:mugs' ) );
 *
 *     <video use:streamVideo={ show.stream } muted autoplay playsinline></video>
 *     <p>{ show.state?.viewers } watching</p>
 *     {#if show.state?.audioBlocked}
 *         <button onclick={ () => show.stream.startAudio() }>Turn sound on</button>
 *     {/if}
 */
export function useStream(name: MaybeGetter<string | null | undefined>, getToken?: () => string | Promise<string>): Readonly<StreamStatus> {
    const { realtime } = connectionOf('useStream()');
    const status = writable(NO_STREAM);

    whileMounted<[Realtime | null, string | null | undefined]>([realtime, toStore(() => read(name))], ([rt, named]) => holdStream(rt, named, status.set, getToken));

    return reading(status, NO_STREAM, {});
}

/**
 * Shows a live stream on a `<video>`, its main picture as it changes and its sound, from what useStream() answered. With no
 * stream it stays empty. Give it the attribute `muted`, as the stream's sound plays apart from it, which also tells the compiler
 * a video with no captions is meant.
 *
 *     <video use:streamVideo={ show.stream } muted autoplay playsinline></video>
 */
export function streamVideo(element: HTMLVideoElement, given: Stream | null | undefined): { update(next: Stream | null | undefined): void; destroy(): void } {
    let stop = showStream(element, given);

    return {
        update(next) {
            stop();
            stop = showStream(element, next);
        },
        destroy() {
            stop();
        },
    };
}

type AnyTrack = RemoteTrack | MediaStreamTrack | null | undefined;

/**
 * Shows a track on a `<video>` or an `<audio>`, from the other side of a call (`current.remote?.camera`), someone in a group
 * call (`person.camera`) or this page (`current.camera`), attached as it changes and let go as it leaves. This page's own is
 * muted. With no track it stays empty. Give a `<video>` the attribute `muted`, as a call's sound comes on its own `<audio>`,
 * which also tells the compiler a video with no captions is meant.
 *
 *     <video use:track={ current.remote?.camera } muted autoplay playsinline></video>
 *     <audio use:track={ current.remote?.microphone } autoplay></audio>
 */
export function track(element: HTMLMediaElement, given: AnyTrack): { update(next: AnyTrack): void; destroy(): void } {
    let stop = showTrack(element, given);

    return {
        update(next) {
            stop();
            stop = showTrack(element, next);
        },
        destroy() {
            stop();
        },
    };
}
