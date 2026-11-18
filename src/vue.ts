/**
 * Vue for WordPlus Cloud's realtime SDK: one connection for the app (provideRealtime), how it is (useConnection), a room's
 * events, members and count (useRoom, usePresence), who is online (useOnline), names and pictures (useProfiles), who is typing
 * (useTyping), what the app's server sends the user (useUserEvent), calls ringing (useCalls), a call of your own (useCall), a
 * group call (useGroupCall), their pictures and sound (VideoTrack, AudioTrack), and a live stream (useStream, StreamVideo). What
 * these don't cover is on the connection itself (useRealtime). Nothing connects on the server: it all starts as a component
 * mounts, so a page Nuxt renders draws each room idle and joins it in the browser.
 *
 *     <!-- App.vue -->
 *     <script setup>
 *     import { provideRealtime } from '@wordplus/realtime/vue';
 *
 *     provideRealtime();
 *     </script>
 *
 *     <!-- Chat.vue -->
 *     <script setup>
 *     import { useRoom } from '@wordplus/realtime/vue';
 *
 *     const { error, emit } = useRoom( 'chat:7', {
 *         message: ( data, meta ) => draw( data.text, meta.from ),
 *     } );
 *     </script>
 *
 *     <template>
 *         <p v-if="error">You are not in this room.</p>
 *         <SendBox v-else @send="( text ) => emit( 'message', { text } )" />
 *     </template>
 */
import {
    computed, defineComponent, getCurrentInstance, h, inject, onMounted, onUnmounted, provide, ref, shallowRef, toValue, watch,
    type ComponentInternalInstance, type ComputedRef, type InjectionKey, type MaybeRefOrGetter, type PropType, type Ref, type ShallowRef, type WatchSource,
} from 'vue';
import type { CallType, Member, Realtime, RemoteTrack, Room, RoomEvents, Stream, UserProfile } from './browser.js';
import {
    callHolder, connectionKey, followCalls, followOnline, followTyping, groupHolder, hearUser, holdRoom, holdStream, idsKey, NO_CALL, NO_CALLS, NO_GROUP, NO_ONLINE, NO_ROOM, NO_STREAM, notJoined, openConnection, readProfiles, showStream, showTrack, tellNoConnection,
    type CallControls, type CallsStatus, type CallStatus, type ConnectionFailure, type GroupStatus, type OnlineStatus, type OwnControls, type NotInferred, type RealtimeOptions, type RoomHandlers, type RoomStatus, type StreamStatus,
} from './bindings.js';

export type { CallControls, CallsStatus, CallStatus, ConnectionFailure, GroupStatus, OnlineStatus, OwnControls, RealtimeOptions, RoomHandlers, RoomStatus, StreamStatus };

interface Connection {
    realtime: ShallowRef<Realtime | null>;
    connected: Ref<boolean>;
    error: ShallowRef<ConnectionFailure | null>;
}

// Under one global name, so a second copy of this module, as a bundler may make, still finds the app's connection.
const CONNECTION: InjectionKey<Connection> = Symbol.for('wordplus.realtime.vue-connection');
/** The connection a component provided, for itself: inject() reads only what is above it. */
const ownConnection = new WeakMap<ComponentInternalInstance, Connection>();

const notConnected = (): Connection => ({ realtime: shallowRef(null), connected: ref(false), error: shallowRef(null) });

function connectionOf(helper: string): Connection {
    const instance = getCurrentInstance();
    const found = (instance && ownConnection.get(instance)) || inject(CONNECTION, null);
    if (found) return found;
    onMounted(() => tellNoConnection(helper));
    return notConnected();
}

/**
 * Runs `start` once the component is mounted, and again each time `sources` change, each time calling what the last one
 * answered first. The last is called as the component goes. Never on the server, where onMounted() doesn't run.
 */
function whileMounted<Values extends unknown[]>(sources: { [I in keyof Values]: WatchSource<Values[I]> }, start: (values: Values) => () => void): void {
    // Each as a getter: with a shallow ref among them, watch() runs again for any change, the same values or not, which would
    // leave a room and join it again.
    const getters = (sources as Array<WatchSource<unknown>>).map((source) => () => toValue(source as MaybeRefOrGetter<unknown>));

    onMounted(() => {
        watch(getters as never, (values: Values, _before: unknown, onCleanup: (stop: () => void) => void) => {
            onCleanup(start(values));
        }, { immediate: true });
    });
}

/** A ref for each field of a status, read only, so what a composable answers can be taken apart. */
function refsOf<Status extends object>(status: ShallowRef<Status>): { [K in keyof Status]: ComputedRef<Status[K]> } {
    return Object.fromEntries(Object.keys(status.value).map((key) => [key, computed(() => status.value[key as keyof Status])])) as { [K in keyof Status]: ComputedRef<Status[K]> };
}

/**
 * Connects once for the component and everything under it, and closes when it goes: call it in your root component.
 * `options` are `connect()`'s, or the server's config() for the signed-in user, as a value, a ref or a getter, and a change
 * connects again. Left out, the routes at /api/realtime say which app and who the user is.
 */
export function provideRealtime(options: MaybeRefOrGetter<RealtimeOptions> = {}): void {
    const connection = notConnected();
    const instance = getCurrentInstance();
    if (instance) ownConnection.set(instance, connection);
    provide(CONNECTION, connection);

    whileMounted<[string]>([() => connectionKey(toValue(options))], () => openConnection(toValue(options), {
        realtime: (rt) => {
            connection.realtime.value = rt;
        },
        connected: (up) => {
            connection.connected.value = up;
        },
        error: (error) => {
            connection.error.value = error;
        },
    }));
}

/** The app's connection, or null until it is up, for what the other helpers don't cover: `rt.calls()`'s `devices()`, `rt.stream()`. */
export function useRealtime(): Readonly<ShallowRef<Realtime | null>> {
    return connectionOf('useRealtime()').realtime;
}

/**
 * How the connection is, for a "Reconnecting…" of your own: `connected`, and `error`, why it could not connect or was
 * refused (`{ code }`: `wrong_origin`, `over_capacity`, `keys_failed` …), cleared once it connects. It comes back by itself.
 *
 *     const { connected, error } = useConnection();
 */
export function useConnection(): { connected: Readonly<Ref<boolean>>; error: Readonly<ShallowRef<ConnectionFailure | null>> } {
    const { connected, error } = connectionOf('useConnection()');
    return { connected, error };
}

/** What useRoom() answers: refs, so it can be taken apart, and the template reads each without `.value`. */
export interface RoomComposable<Events extends RoomEvents = RoomEvents, Info = unknown> {
    /** joining, joined, failed, left, or idle with no room. */
    state: Readonly<Ref<RoomStatus['state']>>;
    /** Why it failed: forbidden, expired, no_rule, kicked … */
    error: Readonly<Ref<Room['error']>>;
    /** A presence room's members, and how many are in a counting room. */
    members: Readonly<Ref<RoomStatus<Info>['members']>>;
    count: Readonly<Ref<number | null>>;
    /** The room, for volatile and history, or null until there is one. */
    room: Readonly<Ref<Room<Events, Info> | null>>;
    emit<K extends keyof Events & string>(event: K, data?: Events[K]): void;
    emitWithAck<K extends keyof Events & string>(event: K, data?: Events[K]): Promise<{ id: string; at: number }>;
}

/**
 * Joins a room while the component is on the page: `handlers` by event name, each given the event's data (opened, when
 * the app sealed it) and its meta `{ from, id, at, replayed? }`. Its members and count stay current. `name` is a value, a
 * ref or a getter, and a change moves to that room: `useRoom( () => `order:${ props.id }`, handlers )`. Null joins nothing.
 * `Events` says what its events carry and `Info` what its members bring, for your own checking and nothing else. `{pair}` in
 * the name is this user and `with`, in order, so both of them name the same room: `useRoom( 'chat:{pair}', handlers, { with:
 * 34 } )`. With `with` still empty, as the other person loads, it joins nothing yet.
 */
export function useRoom<Events extends RoomEvents = RoomEvents, Info = unknown>(
    name: MaybeRefOrGetter<string | null | undefined>,
    handlers: RoomHandlers<NotInferred<Events>, Info> = {},
    options: { with?: MaybeRefOrGetter<number | string | null | undefined> } = {},
): RoomComposable<Events, Info> {
    const { realtime } = connectionOf('useRoom()');
    const status = shallowRef<RoomStatus<Info> & { room: Room<Events, Info> | null }>({ ...NO_ROOM, room: null });

    whileMounted<[Realtime | null, string | null | undefined, number | string | null | undefined]>(
        [realtime, () => toValue(name), () => toValue(options.with)],
        ([rt, named, other]) => holdRoom<Events, Info>(rt, named, other, handlers, (now, room) => {
            status.value = { ...now, room };
        }),
    );

    return {
        ...refsOf(status),
        emit: (event, data) => status.value.room?.emit(event, data),
        emitWithAck: (event, data) => status.value.room?.emitWithAck(event, data) ?? notJoined(),
    };
}

/** Who is in a presence room now: each member's id and info, as the others see them. */
export function usePresence<Info = unknown>(name: MaybeRefOrGetter<string | null | undefined>, options: { with?: MaybeRefOrGetter<number | string | null | undefined> } = {}): Readonly<Ref<Array<Member<Info>>>> {
    return useRoom<RoomEvents, Info>(name, {}, options).members;
}

/**
 * The online status of users, by id, kept current, and how many are online across the app, with `count`. `ids` is a value, a
 * ref or a getter.
 *
 *     const { online } = useOnline( [ 34 ] );
 */
export function useOnline(ids: MaybeRefOrGetter<Array<number | string>>, options: { count?: boolean } = {}): { online: Readonly<Ref<OnlineStatus['online']>>; lastSeen: Readonly<Ref<OnlineStatus['lastSeen']>>; count: Readonly<Ref<number | null>> } {
    const { realtime } = connectionOf('useOnline()');
    const status = shallowRef(NO_ONLINE);

    whileMounted<[Realtime | null, string]>([realtime, () => idsKey(toValue(ids))], ([rt, key]) => followOnline(rt, key, !!options.count, (now) => {
        status.value = now;
    }));

    return refsOf(status);
}

/** Names and pictures from the app's directory (`rt.users()`), for the ids given, as they arrive. */
export function useProfiles(ids: MaybeRefOrGetter<Array<number | string>>): Readonly<Ref<Record<string, UserProfile>>> {
    const { realtime } = connectionOf('useProfiles()');
    const profiles = shallowRef<Record<string, UserProfile>>({});

    whileMounted<[Realtime | null, string]>([realtime, () => idsKey(toValue(ids))], ([rt, key]) => readProfiles(rt, key, (found) => {
        profiles.value = { ...profiles.value, ...found };
    }));

    return profiles;
}

/**
 * Who is typing in a room now: the senders of its `event` (`{ on: true }` while typing, `{ on: false }` when they stop, sent
 * volatile), each gone `ttl` ms after their last word unless they say more. The page's own user is left out. It takes what
 * useRoom() answered, or its `room`: `useTyping( useRoom( 'chat:7' ) )`.
 */
export function useTyping(from: Pick<RoomComposable<any, any>, 'room'> | MaybeRefOrGetter<Room<any, any> | null>, event: MaybeRefOrGetter<string> = 'typing', ttl = 4000): Readonly<Ref<string[]>> {
    const { realtime } = connectionOf('useTyping()');
    const writers = shallowRef<string[]>([]);
    const roomOf = () => toValue(from && typeof from === 'object' && 'room' in from ? from.room : (from as MaybeRefOrGetter<Room<any, any> | null>));

    whileMounted<[Realtime | null, Room<any, any> | null, string]>([realtime, roomOf, () => toValue(event)], ([rt, room, name]) => followTyping(rt, room, name, ttl, (now) => {
        writers.value = now;
    }));

    return writers;
}

/** What the app's server sends this user (`toUser( id ).emit( event, data )`), while the component is on the page. */
export function useUserEvent(event: MaybeRefOrGetter<string>, handler: (data: any, meta: { at?: number }) => void): void {
    const { realtime } = connectionOf('useUserEvent()');

    whileMounted<[Realtime | null, string]>([realtime, () => toValue(event)], ([rt, name]) => hearUser(rt, name, handler));
}

/**
 * The page's calls once loaded, and the calls ringing for its user now. `error` is the code calls() was refused with, such as
 * `no_webrtc`, where `calls` stays null.
 */
export function useCalls(): { calls: Readonly<Ref<CallsStatus['calls']>>; incoming: Readonly<Ref<CallsStatus['incoming']>>; error: Readonly<Ref<string | null>> } {
    const { realtime } = connectionOf('useCalls()');
    const status = shallowRef(NO_CALLS);

    whileMounted<[Realtime | null]>([realtime], ([rt]) => followCalls(rt, (now) => {
        status.value = now;
    }));

    return refsOf(status);
}

/** What useCall() answers: a ref for each of its fields, with what changes the call. */
export type CallComposable = { [K in keyof CallStatus]: Readonly<Ref<CallStatus[K]>> } & CallControls;

/**
 * A call between two people on a screen of your own, while the component is on the page: it holds one call, placed with
 * `start()` or answered with `answer()`, and it ends when the component goes. The ready-made call screen needs none of it.
 *
 *     const { incoming } = useCalls();
 *     const { call, remote, camera, start, answer, end } = useCall();
 *
 *     <button v-if="! call && incoming[ 0 ]" @click="answer( incoming[ 0 ] )">Answer</button>
 *     <!-- callToken(): a request to a route of yours that answers realtime.callToken( user, 34 ) if your app says yes. -->
 *     <button v-else-if="! call" @click="async () => start( await callToken( 34 ) )">Call</button>
 *     <template v-else>
 *         <VideoTrack :track="remote?.camera" />
 *         <AudioTrack :track="remote?.microphone" />
 *         <VideoTrack :track="camera" />
 *         <button @click="end">Hang up</button>
 *     </template>
 */
export function useCall(): CallComposable {
    const { realtime } = connectionOf('useCall()');
    const status = shallowRef(NO_CALL);
    const { stop, ...controls } = callHolder(() => realtime.value, (now) => {
        status.value = now;
    });
    onUnmounted(stop);

    return { ...refsOf(status), ...controls };
}

/** What useGroupCall() answers: a ref for each of its fields, with what changes what this page sends. */
export type GroupCallComposable = { [K in keyof GroupStatus]: Readonly<Ref<GroupStatus[K]>> } & OwnControls;

/**
 * A group call while the component is on the page (`rt.groupCall()`), and who is in it as they change: `people`, the others,
 * `self`, this page's user, and what this page sends, with `setCamera()`, `setMicrophone()` and `setScreenShare()`. `error` is
 * the refusal's code. `name` is a value, a ref or a getter, null joins nothing, and the call is left when the component goes.
 *
 *     const { people, camera, setCamera } = useGroupCall( 'meeting:daily' );
 *
 *     <button @click="setCamera( ! camera )">Camera</button>
 *     <VideoTrack v-for="person in people" :key="person.identity" :track="person.camera" />
 */
export function useGroupCall(name: MaybeRefOrGetter<string | null | undefined>, getToken: (() => string | Promise<string>) | { type?: MaybeRefOrGetter<CallType | null | undefined> } = {}): GroupCallComposable {
    const { realtime } = connectionOf('useGroupCall()');
    const status = shallowRef(NO_GROUP);
    const { hold, ...controls } = groupHolder((now) => {
        status.value = now;
    });

    whileMounted<[Realtime | null, string | null | undefined, CallType | null | undefined]>(
        [realtime, () => toValue(name), () => (typeof getToken === 'function' ? null : toValue(getToken.type))],
        ([rt, named, type]) => hold(rt, named, type, typeof getToken === 'function' ? getToken : undefined),
    );

    return { ...refsOf(status), ...controls };
}

/** What useStream() answers: a ref for each of its fields. */
export type StreamComposable = { [K in keyof StreamStatus]: Readonly<Ref<StreamStatus[K]>> };

/**
 * A live stream on a screen of your own, while the component is on the page (`rt.stream()`): `stream`, for what changes it,
 * `state`, everything its screen draws as it changes, and `error`, the refusal's code. `name` is a value, a ref or a getter, null
 * joins nothing, and the stream is left when the component goes. The ready-made player, `<live-stream>`, needs none of it.
 *
 *     // streamToken(): a request to a route of yours, asked again as each token runs out.
 *     const { stream, state } = useStream( 'show:mugs', () => streamToken( 'show:mugs' ) );
 *
 *     <StreamVideo :stream="stream" />
 *     <p>{{ state?.viewers }} watching</p>
 *     <button v-if="state?.audioBlocked" @click="stream.startAudio()">Turn sound on</button>
 */
export function useStream(name: MaybeRefOrGetter<string | null | undefined>, getToken?: () => string | Promise<string>): StreamComposable {
    const { realtime } = connectionOf('useStream()');
    const status = shallowRef(NO_STREAM);

    whileMounted<[Realtime | null, string | null | undefined]>([realtime, () => toValue(name)], ([rt, named]) => holdStream(rt, named, (now) => {
        status.value = now;
    }, getToken));

    return refsOf(status);
}

/**
 * A live stream's main picture, as it changes, and its sound, from what useStream() answered. With no stream it stays empty.
 * Anything else a `<video>` takes goes on it, such as `class`.
 */
export const StreamVideo = defineComponent({
    name: 'StreamVideo',
    props: { stream: { type: Object as PropType<Stream | null>, default: null } },
    setup(props) {
        const element = shallowRef<HTMLVideoElement | null>(null);

        whileMounted<[HTMLVideoElement | null, Stream | null]>([element, () => props.stream], ([node, stream]) => showStream(node, stream));

        return () => h('video', { ref: element, autoplay: true, playsinline: true, muted: true });
    },
});

/** A `<video>` or an `<audio>` that shows a track, attached as it changes and let go as it leaves. */
function trackComponent(name: string, tag: 'video' | 'audio', attributes: Record<string, unknown>) {
    return defineComponent({
        name,
        props: { track: { type: Object as PropType<RemoteTrack | MediaStreamTrack | null>, default: null } },
        setup(props) {
            const element = shallowRef<HTMLMediaElement | null>(null);

            whileMounted<[HTMLMediaElement | null, RemoteTrack | MediaStreamTrack | null]>([element, () => props.track], ([node, track]) => showTrack(node, track));

            return () => h(tag, { ref: element, ...attributes });
        },
    });
}

/**
 * A track's picture, from the other side of a call (`remote.camera`), someone in a group call (`person.camera`) or this page
 * (`camera`), attached as it changes and let go as it leaves. This page's own is muted. With no track it stays empty. Anything
 * else a `<video>` takes goes on it, such as `class`.
 */
export const VideoTrack = trackComponent('VideoTrack', 'video', { autoplay: true, playsinline: true });

/** A track's sound, which plays as it comes. A blocked one is `autoplay_blocked`, on the call: `call.startAudio()` from a click. */
export const AudioTrack = trackComponent('AudioTrack', 'audio', { autoplay: true });
