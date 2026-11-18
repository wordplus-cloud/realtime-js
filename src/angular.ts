/**
 * Angular for WordPlus Cloud's realtime SDK: one connection for the app (provideRealtime), how it is (injectConnection), a
 * room's events, members and count (injectRoom, injectPresence), who is online (injectOnline), names and pictures
 * (injectProfiles), who is typing (injectTyping), what the app's server sends the user (injectUserEvent), calls ringing
 * (injectCalls), a call of your own (injectCall), a group call (injectGroupCall), their pictures and sound (injectTrack), and a
 * live stream (injectStream, injectStreamVideo). What these don't cover is on the connection itself (injectRealtime).
 *
 * Each is called where `inject()` may be, a field initializer or a constructor, and answers signals, which a template reads
 * as `chat.error()`. What changes goes in as a signal, an input or a function: `injectRoom( () => `order:${ this.id() }` )`.
 * Each lets go of what it holds as its component goes. Nothing connects on the server: a page Angular renders there draws
 * each room idle and joins it in the browser.
 *
 * They are plain functions on `@angular/core`'s signals, so the package needs no Angular compiler, and a component of yours
 * uses the ready-made screens as custom elements (`schemas: [ CUSTOM_ELEMENTS_SCHEMA ]`).
 *
 *     // app.config.ts
 *     import { provideRealtime } from '@wordplus/realtime/angular';
 *
 *     export const appConfig: ApplicationConfig = { providers: [ provideRealtime() ] };
 *
 *     // chat.ts
 *     import { injectRoom } from '@wordplus/realtime/angular';
 *
 *     @Component( {
 *         selector: 'app-chat',
 *         template: `
 *             @if ( chat.error() ) {
 *                 <p>You are not in this room.</p>
 *             } @else {
 *                 <app-send-box (send)="chat.emit( 'message', { text: $event } )" />
 *             }
 *         `,
 *     } )
 *     export class Chat {
 *         chat = injectRoom( 'chat:7', {
 *             message: ( data, meta ) => this.draw( data.text, meta.from ),
 *         } );
 *     }
 */
import {
    assertInInjectionContext, computed, DestroyRef, effect, inject, InjectionToken, Injector, makeEnvironmentProviders, PLATFORM_ID, provideEnvironmentInitializer, runInInjectionContext, signal, untracked,
    type ElementRef, type EnvironmentProviders, type Signal, type WritableSignal,
} from '@angular/core';
import { WatchSet } from '../vendor/realtime-client/watch.js';
import type { CallType, Member, Realtime, RemoteTrack, Room, RoomEvents, Stream, UserProfile } from './browser.js';
import {
    callHolder, connectionKey, followCalls, followOnline, followTyping, groupHolder, hearUser, holdRoom, holdStream, idsKey, NO_CALL, NO_CALLS, NO_GROUP, NO_ONLINE, NO_ROOM, NO_STREAM, notJoined, openConnection, readProfiles, showStream, showTrack,
    type CallControls, type CallsStatus, type CallStatus, type ConnectionFailure, type GroupStatus, type OnlineStatus, type OwnControls, type NotInferred, type RealtimeOptions, type RoomHandlers, type RoomStatus, type StreamStatus,
} from './bindings.js';

export type { CallControls, CallsStatus, CallStatus, ConnectionFailure, GroupStatus, OnlineStatus, OwnControls, RealtimeOptions, RoomHandlers, RoomStatus, StreamStatus };

/** A value, or what reads one as it changes: a signal, an input, a `computed()`, or a function of your own. */
export type MaybeSignal<T> = T | Signal<T> | (() => T);

interface Connection {
    realtime: WritableSignal<Realtime | null>;
    connected: WritableSignal<boolean>;
    error: WritableSignal<ConnectionFailure | null>;
}

// Kept under one global name, so a second copy of this module, as a bundler may make, still finds the app's connection.
const CONNECTION: InjectionToken<Connection> = ((globalThis as Record<symbol, unknown>)[Symbol.for('wordplus.realtime.angular-connection')] ??=
    new InjectionToken<Connection>('wordplus realtime connection')) as InjectionToken<Connection>;

const read = <T>(value: MaybeSignal<T>): T => (typeof value === 'function' ? (value as () => T)() : value);
const notConnected = (): Connection => ({ realtime: signal(null), connected: signal(false), error: signal(null) });

/** On a server Angular renders, where nothing connects or joins: PLATFORM_ID is `server` there. */
const onServer = (): boolean => inject(PLATFORM_ID, { optional: true }) === 'server';

let told = false;

/** A function used with no provideRealtime() above it, said once in the console, as it would otherwise stay idle for good. */
function tellNoConnection(helper: string): void {
    if (told) return;
    told = true;
    console.warn(`wordplus-realtime: ${helper} found no connection, so it does nothing. Add provideRealtime() to your application's providers, in app.config.ts.`);
}

function connectionOf(helper: string): Connection {
    const found = inject(CONNECTION, { optional: true });
    if (found) return found;
    if (!onServer()) tellNoConnection(helper);
    return notConnected();
}

/**
 * Runs `start` with what `sources` read, and again each time one of them reads something else, each time calling what the
 * last one answered first. The last is called as the component, or the injector, goes. Never on the server.
 */
function whileOnPage<Values extends unknown[]>(sources: { [I in keyof Values]: () => Values[I] }, start: (values: Values) => () => void): void {
    if (onServer()) return;
    // Each a computed of its own, so the effect runs again only for a value that changed, not for every signal a getter read:
    // a getter that names the same room again leaves nothing and joins nothing.
    const values = (sources as Array<() => unknown>).map((source) => computed(source));

    effect((onCleanup) => {
        const now = values.map((value) => value()) as Values;
        onCleanup(untracked(() => start(now)));
    });
}

/** A signal for each field of a status, read only, so what a function answers can be taken apart. */
function signalsOf<Status extends object>(status: Signal<Status>): { [K in keyof Status]: Signal<Status[K]> } {
    return Object.fromEntries(Object.keys(untracked(status)).map((key) => [key, computed(() => status()[key as keyof Status])])) as { [K in keyof Status]: Signal<Status[K]> };
}

/**
 * Connects once for the application, or for the routes whose providers have it, and closes as their injector goes: put it
 * in your application's providers. `options` are `connect()`'s, or the server's config() for the signed-in user, as a value
 * or a function, which runs where `inject()` works and may read signals: `provideRealtime( () => inject( Session ).realtime() )`.
 * A change connects again. Left out, the routes at /api/realtime say which app and who the user is.
 */
export function provideRealtime(options: MaybeSignal<RealtimeOptions> = {}): EnvironmentProviders {
    return makeEnvironmentProviders([
        { provide: CONNECTION, useFactory: () => opened(options) },
        // As the application starts, not when something first asks for it, as the other bindings' provider does.
        provideEnvironmentInitializer(() => {
            inject(CONNECTION);
        }),
    ]);
}

function opened(options: MaybeSignal<RealtimeOptions>): Connection {
    const connection = notConnected();
    const injector = inject(Injector);
    const current = () => runInInjectionContext(injector, () => read(options));

    whileOnPage<[string]>([() => connectionKey(current())], () => openConnection(current(), {
        realtime: (rt) => connection.realtime.set(rt),
        connected: (up) => connection.connected.set(up),
        error: (error) => connection.error.set(error),
    }));

    return connection;
}

/** The app's connection, or null until it is up, for what the other functions don't cover: `rt.calls()`'s `devices()`, `rt.callScreen()`. */
export function injectRealtime(): Signal<Realtime | null> {
    assertInInjectionContext(injectRealtime);
    return connectionOf('injectRealtime()').realtime.asReadonly();
}

/**
 * How the connection is, for a "Reconnecting…" of your own: `connected`, and `error`, why it could not connect or was
 * refused (`{ code }`: `wrong_origin`, `over_capacity`, `keys_failed` …), cleared once it connects. It comes back by itself.
 *
 *     connection = injectConnection();
 *     @if ( ! connection.connected() ) { <p>Reconnecting…</p> }
 */
export function injectConnection(): { connected: Signal<boolean>; error: Signal<ConnectionFailure | null> } {
    assertInInjectionContext(injectConnection);
    const { connected, error } = connectionOf('injectConnection()');
    return { connected: connected.asReadonly(), error: error.asReadonly() };
}

/** What injectRoom() answers: a signal for each of the room's fields, and what sends to it. */
export interface RoomRef<Events extends RoomEvents = RoomEvents, Info = unknown> {
    /** joining, joined, failed, left, or idle with no room. */
    state: Signal<RoomStatus['state']>;
    /** Why it failed: forbidden, expired, no_rule, kicked … */
    error: Signal<Room['error']>;
    /** A presence room's members, and how many are in a counting room. */
    members: Signal<RoomStatus<Info>['members']>;
    count: Signal<number | null>;
    /** The room, for volatile and history, or null until there is one. */
    room: Signal<Room<Events, Info> | null>;
    emit<K extends keyof Events & string>(event: K, data?: Events[K]): void;
    emitWithAck<K extends keyof Events & string>(event: K, data?: Events[K]): Promise<{ id: string; at: number }>;
}

/**
 * Joins a room while the component is on the page: `handlers` by event name, each given the event's data (opened, when
 * the app sealed it) and its meta `{ from, id, at, replayed? }`. Its members and count stay current. `name` is a value, a
 * signal or a function, and a change moves to that room: `injectRoom( () => `order:${ this.id() }`, handlers )`. Null joins
 * nothing. `Events` says what its events carry and `Info` what its members bring, for your own checking and nothing else.
 * `{pair}` in the name is this user and `with`, in order, so both of them name the same room: `injectRoom( 'chat:{pair}',
 * handlers, { with: this.other } )`. With `with` still empty, as the other person loads, it joins nothing yet.
 */
export function injectRoom<Events extends RoomEvents = RoomEvents, Info = unknown>(
    name: MaybeSignal<string | null | undefined>,
    handlers: RoomHandlers<NotInferred<Events>, Info> = {},
    options: { with?: MaybeSignal<number | string | null | undefined> } = {},
): RoomRef<Events, Info> {
    assertInInjectionContext(injectRoom);
    const { realtime } = connectionOf('injectRoom()');
    const status = signal<RoomStatus<Info> & { room: Room<Events, Info> | null }>({ ...NO_ROOM, room: null });

    whileOnPage<[Realtime | null, string | null | undefined, number | string | null | undefined]>(
        [realtime, () => read(name), () => read(options.with)],
        ([rt, named, other]) => holdRoom<Events, Info>(rt, named, other, handlers, (now, room) => status.set({ ...now, room })),
    );

    return {
        ...signalsOf(status.asReadonly()),
        emit: (event, data) => untracked(status).room?.emit(event, data),
        emitWithAck: (event, data) => untracked(status).room?.emitWithAck(event, data) ?? notJoined(),
    };
}

/** Who is in a presence room now: each member's id and info, as the others see them. */
export function injectPresence<Info = unknown>(name: MaybeSignal<string | null | undefined>, options: { with?: MaybeSignal<number | string | null | undefined> } = {}): Signal<Array<Member<Info>>> {
    assertInInjectionContext(injectPresence);
    return injectRoom<RoomEvents, Info>(name, {}, options).members;
}

/**
 * What each connection's injectOnline() calls watch, counted by its own WatchSet: an id is unwatched once none of them holds
 * it any more, five seconds later, so a list drawn again or a route come back to doesn't unwatch and watch the same people.
 */
const watching = new WeakMap<Realtime, WatchSet<string>>();

function watchersOf(rt: Realtime): WatchSet<string> {
    let set = watching.get(rt);
    if (!set) {
        set = new WatchSet<string>({
            send: ({ add, remove }) => {
                if (add.length > 0) rt.online.watch(add);
                if (remove.length > 0) rt.online.unwatch(remove);
            },
            // The connection watches each id by itself and has no "everyone" to ask for past a cap.
            limit: Number.POSITIVE_INFINITY,
        });
        watching.set(rt, set);
    }
    return set;
}

/** Follows who of the ids is online, as the other bindings do, and lets go of them when the answer is called. */
function holdOnline(rt: Realtime | null, key: string, counting: boolean, tell: (status: OnlineStatus) => void): () => void {
    if (!rt) return followOnline(rt, key, counting, tell);
    const owner = {};
    const set = watchersOf(rt);
    set.watch(owner, JSON.parse(key) as string[]);
    // Watched now, not at the end of the set's batch, as the other bindings watch.
    set.flush();
    const stop = followOnline(rt, key, counting, tell);

    return () => {
        stop();
        set.drop(owner);
    };
}

/**
 * The online status of users, by id, kept current, and how many are online across the app, with `count`. `ids` is a value, a
 * signal or a function. It lets go of the ids as the component goes: one no other injectOnline() of the page holds is
 * unwatched five seconds later.
 *
 *     status = injectOnline( [ 34 ] );
 *     @if ( status.online()[ 34 ] ) { <p>Ann is online</p> }
 */
export function injectOnline(ids: MaybeSignal<Array<number | string>>, options: { count?: boolean } = {}): { online: Signal<OnlineStatus['online']>; lastSeen: Signal<OnlineStatus['lastSeen']>; count: Signal<number | null> } {
    assertInInjectionContext(injectOnline);
    const { realtime } = connectionOf('injectOnline()');
    const status = signal(NO_ONLINE);

    whileOnPage<[Realtime | null, string]>([realtime, () => idsKey(read(ids))], ([rt, key]) => holdOnline(rt, key, !!options.count, (now) => status.set(now)));

    return signalsOf(status.asReadonly());
}

/** Names and pictures from the app's directory (`rt.users()`), for the ids given, as they arrive. */
export function injectProfiles(ids: MaybeSignal<Array<number | string>>): Signal<Record<string, UserProfile>> {
    assertInInjectionContext(injectProfiles);
    const { realtime } = connectionOf('injectProfiles()');
    const profiles = signal<Record<string, UserProfile>>({});

    whileOnPage<[Realtime | null, string]>([realtime, () => idsKey(read(ids))], ([rt, key]) => readProfiles(rt, key, (found) => profiles.update((known) => ({ ...known, ...found }))));

    return profiles.asReadonly();
}

/**
 * Who is typing in a room now: the senders of its `event` (`{ on: true }` while typing, `{ on: false }` when they stop, sent
 * volatile), each gone `ttl` ms after their last word unless they say more. The page's own user is left out. It takes what
 * injectRoom() answered, or a room, a signal or a function of one: `typing = injectTyping( this.chat )`.
 */
export function injectTyping(from: Pick<RoomRef<any, any>, 'room'> | MaybeSignal<Room<any, any> | null | undefined>, event: MaybeSignal<string> = 'typing', ttl = 4000): Signal<string[]> {
    assertInInjectionContext(injectTyping);
    const { realtime } = connectionOf('injectTyping()');
    const writers = signal<string[]>([]);
    const roomOf = () => (from && typeof from === 'object' && 'room' in from ? from.room() : read(from as MaybeSignal<Room<any, any> | null | undefined>)) ?? null;

    // By the room itself: its status tells of each who comes and goes, the same room each time, and that restarts nothing here.
    whileOnPage<[Realtime | null, Room<any, any> | null, string]>([realtime, roomOf, () => read(event)], ([rt, room, heard]) => followTyping(rt, room, heard, ttl, (now) => writers.set(now)));

    return writers.asReadonly();
}

/** What the app's server sends this user (`toUser( id ).emit( event, data )`), while the component is on the page. */
export function injectUserEvent(event: MaybeSignal<string>, handler: (data: any, meta: { at?: number }) => void): void {
    assertInInjectionContext(injectUserEvent);
    const { realtime } = connectionOf('injectUserEvent()');

    whileOnPage<[Realtime | null, string]>([realtime, () => read(event)], ([rt, name]) => hearUser(rt, name, handler));
}

/**
 * The page's calls once loaded, and the calls ringing for its user now. `error` is the code calls() was refused with, such as
 * `no_webrtc`, where `calls` stays null.
 */
export function injectCalls(): { calls: Signal<CallsStatus['calls']>; incoming: Signal<CallsStatus['incoming']>; error: Signal<string | null> } {
    assertInInjectionContext(injectCalls);
    const { realtime } = connectionOf('injectCalls()');
    const status = signal(NO_CALLS);

    whileOnPage<[Realtime | null]>([realtime], ([rt]) => followCalls(rt, (now) => status.set(now)));

    return signalsOf(status.asReadonly());
}

/** What injectCall() answers: a signal for each of its fields, with what changes the call. */
export type CallRef = { [K in keyof CallStatus]: Signal<CallStatus[K]> } & CallControls;

/**
 * A call between two people on a screen of your own, while the component is on the page: it holds one call, placed with
 * `start()` or answered with `answer()`, and it ends when the component goes. The ready-made call screen needs none of it.
 *
 *     calls = injectCalls();
 *     current = injectCall();
 *
 *     @if ( ! current.call() && calls.incoming()[ 0 ]; as ring ) {
 *         <button (click)="current.answer( ring )">Answer</button>
 *     } @else if ( ! current.call() ) {
 *         <!-- callToken(): a request to a route of yours that answers realtime.callToken( user, 34 ) if your app says yes. -->
 *         <button (click)="call( 34 )">Call</button>
 *     } @else {
 *         <!-- [track]: a directive of your own over injectTrack(), five lines, as the docs show. -->
 *         <video [track]="current.remote()?.camera" autoplay playsinline muted></video>
 *         <audio [track]="current.remote()?.microphone" autoplay></audio>
 *         <button (click)="current.end()">Hang up</button>
 *     }
 */
export function injectCall(): CallRef {
    assertInInjectionContext(injectCall);
    const { realtime } = connectionOf('injectCall()');
    const status = signal(NO_CALL);
    const { stop, ...controls } = callHolder(() => untracked(realtime), (now) => status.set(now));
    inject(DestroyRef).onDestroy(stop);

    return { ...signalsOf(status.asReadonly()), ...controls };
}

/** What injectGroupCall() answers: a signal for each of its fields, with what changes what this page sends. */
export type GroupCallRef = { [K in keyof GroupStatus]: Signal<GroupStatus[K]> } & OwnControls;

/**
 * A group call while the component is on the page (`rt.groupCall()`), and who is in it as they change: `people`, the others,
 * `self`, this page's user, and what this page sends, with `setCamera()`, `setMicrophone()` and `setScreenShare()`. `error` is
 * the refusal's code. `getToken` gets the token from your own route: `injectGroupCall( 'meeting:7', () => meetingToken( 7 ) )`.
 * `name` is a value, a signal or a function, null joins nothing, and the call is left when the component goes.
 *
 *     meeting = injectGroupCall( 'meeting:daily', () => meetingToken( 'daily' ) );
 *
 *     <button (click)="meeting.setCamera( ! meeting.camera() )">Camera</button>
 *     @for ( person of meeting.people(); track person.identity ) {
 *         <video [track]="person.camera" autoplay playsinline muted></video>
 *     }
 */
export function injectGroupCall(name: MaybeSignal<string | null | undefined>, getToken: (() => string | Promise<string>) | { type?: MaybeSignal<CallType | null | undefined> } = {}): GroupCallRef {
    assertInInjectionContext(injectGroupCall);
    const { realtime } = connectionOf('injectGroupCall()');
    const status = signal(NO_GROUP);
    const { hold, ...controls } = groupHolder((now) => status.set(now));

    whileOnPage<[Realtime | null, string | null | undefined, CallType | null | undefined]>(
        [realtime, () => read(name), () => (typeof getToken === 'function' ? null : read(getToken.type))],
        ([rt, named, type]) => hold(rt, named, type, typeof getToken === 'function' ? getToken : undefined),
    );

    return { ...signalsOf(status.asReadonly()), ...controls };
}

/** What injectStream() answers: a signal for each of its fields. */
export type StreamRef = { [K in keyof StreamStatus]: Signal<StreamStatus[K]> };

/**
 * A live stream on a screen of your own, while the component is on the page (`rt.stream()`): `stream`, for what changes it,
 * `state`, everything its screen draws as it changes, and `error`, the refusal's code. `getToken` gets a token from your own
 * route, and is asked again as each runs out. `name` is a value, a signal or a function, null joins nothing, and the stream is
 * left when the component goes. The ready-made player, `<live-stream>`, needs none of it.
 *
 *     show = injectStream( 'live:12', () => streamToken( 12 ) );
 *     video = viewChild<ElementRef<HTMLVideoElement>>( 'video' );
 *
 *     constructor() {
 *         injectStreamVideo( this.video, this.show.stream );
 *     }
 *
 *     <video #video autoplay playsinline muted></video>
 *     <p>{{ show.state()?.viewers }} watching</p>
 */
export function injectStream(name: MaybeSignal<string | null | undefined>, getToken?: () => string | Promise<string>): StreamRef {
    assertInInjectionContext(injectStream);
    const { realtime } = connectionOf('injectStream()');
    const status = signal(NO_STREAM);

    whileOnPage<[Realtime | null, string | null | undefined]>([realtime, () => read(name)], ([rt, named]) => holdStream(rt, named, (now) => status.set(now), getToken));

    return signalsOf(status.asReadonly());
}

/** An element as a template gives it: itself, or the ElementRef of `viewChild()` or `inject( ElementRef )`. */
export type ElementOrRef<E extends Element> = E | ElementRef<E> | null | undefined;

const elementOf = <E extends Element>(given: ElementOrRef<E>): E | null =>
    (given && typeof given === 'object' && 'nativeElement' in given ? given.nativeElement : given) ?? null;

/**
 * Shows a track on a `<video>` or an `<audio>` while the component is on the page: from the other side of a call
 * (`current.remote()?.camera`), someone in a group call (`person.camera`) or this page (`current.camera()`), attached as it
 * changes and let go as it leaves. This page's own is muted. With no track, or no element yet, it stays empty. `element` is
 * what `viewChild()` gives, or `inject( ElementRef )` in a directive of your own. Give a `<video>` `muted`, as a call's sound
 * comes on its own `<audio>`.
 *
 *     remote = viewChild<ElementRef<HTMLVideoElement>>( 'remote' );
 *
 *     constructor() {
 *         injectTrack( this.remote, () => this.current.remote()?.camera );
 *     }
 */
export function injectTrack(element: MaybeSignal<ElementOrRef<HTMLMediaElement>>, track: MaybeSignal<RemoteTrack | MediaStreamTrack | null | undefined>): void {
    assertInInjectionContext(injectTrack);

    whileOnPage<[HTMLMediaElement | null, RemoteTrack | MediaStreamTrack | null | undefined]>([() => elementOf(read(element)), () => read(track)], ([node, given]) => showTrack(node, given));
}

/**
 * Shows a live stream on a `<video>` while the component is on the page, its main picture as it changes and its sound, from
 * what injectStream() answered. With no stream, or no element yet, it stays empty. The sound plays apart, so the `<video>`
 * stays muted.
 */
export function injectStreamVideo(element: MaybeSignal<ElementOrRef<HTMLVideoElement>>, stream: MaybeSignal<Stream | null | undefined>): void {
    assertInInjectionContext(injectStreamVideo);

    whileOnPage<[HTMLVideoElement | null, Stream | null | undefined]>([() => elementOf(read(element)), () => read(stream)], ([node, given]) => showStream(node, given));
}
