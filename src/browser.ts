/**
 * WordPlus Cloud's realtime SDK in the browser, for a site or app outside WordPress: rooms with presence, live counts
 * and history, who is online, what the app's server sends the user, calls and group calls, on the same connection
 * client, connecting straight to the realtime servers and moving to another without a drop. What the app's server signs
 * comes from its routes (`@wordplus/realtime/server`), and what goes through the cloud is sealed with keys only the app
 * hands out.
 *
 *     import { connect } from '@wordplus/realtime';
 *
 *     const rt = await connect();        // your routes at /api/realtime say which app
 *     const chat = rt.join<{ message: { text: string } }>( 'chat:34:42' );
 *     chat.on( 'message', ( msg, meta ) => draw( msg.text, meta.from ) );
 *     await chat.emitWithAck( 'message', { text: 'Hi' } );
 */
import {
    rooms as openRooms,
    RealtimeError,
    type ConnectionEvents,
    type EventMeta,
    type HistoryEvent,
    type Identity,
    type Member,
    type Online,
    type PublicGrant,
    type RealtimeErrorCode,
    type RealtimeErrorEvent,
    type Room,
    type RoomEmitter,
    type RoomEvents,
    type RoomOwnEvents,
    type Rooms,
    type RoomsOptions,
    type RoomState,
    type UserProfile,
} from '../vendor/realtime-client/index.js';
import type {
    Call, CallEvents, CallPath, CallQuality, Calls, CallsEvents, CallsOptions, CallState, CallType, CallUser, DeviceChoice, DeviceLists, DeviceOptions, GroupCall, GroupCallEvents, GroupCallState, Incoming, Invite, InviteState,
    LayerQuality, ModerationAct, Person, PictureLayer, PlaybackStats, RemoteMedia, RemoteTrack, RoomPermissions, Stream, StreamEvent, StreamEvents, StreamSnapshot, StreamState, StreamTile, StreamTrack,
    AskAnswer, AskDevice, CallAct, CallAsk, CallAskAnswer, ModerationOptions, RoomRules, Stalled,
} from '../vendor/realtime-client/sdk-calls/index.js';
import { roomName } from './room-name.js';

/** What join() takes beside a room's name. */
export interface JoinOptions {
    /** The other person of `{pair}` in the name: `rt.join( 'chat:{pair}', { with: 34 } )`. */
    with?: number | string;
}

/**
 * The call screen's settings: the page's language (two letters, the screens' own translations: de es fr it nl pl hr
 * he), the app's own translations by the English text, whether to offer Add Person (`add`: the app lists whom a
 * user may add, calls()'s `people`), and a prefix of the app's for the elements' names (`prefix`: `shop` makes
 * `<shop-call-button>` and `<shop-chat-room>`), one a page, for the first script loaded with it. Where the app serves the
 * call effects (`effects`, the folder dist/effects of @wordplus/realtime-ui) and AI Noise Removal (`noise`, dist/noise): the
 * device settings then offer them, and `noiseDefault: 'auto'` turns the noise removal on for people who never chose. Pictures for the background: `backgrounds` of the app's own, `builtInBackgrounds` of the
 * catalog it serves, and `ownBackgrounds` to let people add one of their own, kept by their browser.
 */
export interface ScreenSettings {
    lang?: string;
    strings?: Record<string, string>;
    add?: boolean;
    prefix?: string;
    effects?: string;
    noise?: string;
    /**
     * AI Noise Removal before a person chooses: `off` (the default) or `auto`, which turns it on where the device can run
     * it, with a notice that says so and offers Turn Off. It needs `noise`, the folder the removal is served from.
     */
    noiseDefault?: 'off' | 'auto';
    backgrounds?: ScreenBackground[];
    builtInBackgrounds?: ScreenBackground[];
    ownBackgrounds?: boolean;
}

/** A picture for the background in the device settings: about 1280x720, served with CORS from another origin. */
export interface ScreenBackground {
    id: string | number;
    url: string;
    thumb?: string;
    name: string;
}

export type { Rooms, Room, RoomState, RoomEmitter, RoomEvents, RoomOwnEvents, ConnectionEvents, HistoryEvent, Member, EventMeta, Online, UserProfile, Identity, PublicGrant };
export type { Calls, CallsEvents, Call, CallEvents, CallPath, CallQuality, CallState, CallType, CallUser, Incoming, RemoteMedia, RemoteTrack };
export type { GroupCall, GroupCallEvents, GroupCallState, Invite, InviteState, ModerationAct, Person, RoomPermissions, DeviceChoice, DeviceLists, DeviceOptions };
export type { AskAnswer, AskDevice, CallAct, CallAsk, CallAskAnswer, ModerationOptions, RoomRules, Stalled };
export type { LayerQuality, PictureLayer, PlaybackStats, Stream, StreamEvent, StreamEvents, StreamSnapshot, StreamState, StreamTile, StreamTrack };
export type { RealtimeErrorCode, RealtimeErrorEvent };
export { RealtimeError };
export { Keyring, keyring, labelOf } from '../vendor/realtime-client/keys.js';

export const SERVER = 'https://ws.wordplus.cloud';
export const API_SERVER = 'https://rest.wordplus.cloud';
export const PATH = '/websocket';

export interface ConnectOptions {
    /** The app's key, from the WordPlus Cloud account (Apps). Public: every page carries it. Your keys route names it when left out. */
    app?: string;
    /** @deprecated The same as `app`. */
    site?: string;
    /** Where the app's server answers: `{endpoint}/auth`, `/calls` and `/keys`. '/api/realtime' by default. */
    endpoint?: string;
    /** A route at an address of its own, in place of `{endpoint}/{name}`, as the server's `routes` put it: `{ calls: '/check-call' }`. */
    routes?: { auth?: string; calls?: string; keys?: string };
    /** Headers each request to the app's routes carries, such as a CSRF token. */
    headers?: Record<string, string>;
    /**
     * The connector's SharedWorker: every tab of the browser shares one connection through it. From the routes by default
     * (`{endpoint}/files/realtime-worker.js`), or where the app serves it itself. null connects each tab by itself.
     */
    worker?: string | null;
    /**
     * A connection for each user, shared by their tabs (true): another user in the same browser, in another window, has
     * their own, as each counts apart in a room's live count. False shares one connection among all of the browser's tabs.
     */
    perUser?: boolean;
    /** The mesh's room client, for group calls and a call that moves to a room: from the routes by default. */
    rooms?: string;
    /** Its encryption worker, for a room encrypted end to end: beside the room client unless named. */
    roomsWorker?: string;
    /** The call screen (realtime-ui.min.js): beside the worker unless named. */
    ui?: string;
    /** The live stream elements (realtime-ui-streams.min.js), as the app serves them: beside the call screen unless named. */
    streamsUi?: string;
    /**
     * A signed-in user's keys and identity, from the server's config(): the page then needs no request before it
     * connects. Without them, connect() asks the keys route first.
     */
    keys?: { entries?: string[]; identity?: Identity };
    /** Grants for the app's public rooms, from the server's config(). */
    grants?: PublicGrant[];
    /** Hold the page's line, so its user's calls ring here (true). */
    ring?: boolean;
    /** The ready-made parts' settings on every page: `lang`, `strings`, `add`, and `prefix` for the elements' names. */
    screen?: ScreenSettings;
    server?: string;
    path?: string;
    api?: string;
}

/** The server's config() as it comes: everything connect() needs, the routes named in full. */
export interface BrowserConfig {
    site: string;
    server?: string;
    path?: string;
    api?: string;
    worker?: string | null;
    rooms?: string;
    roomsWorker?: string;
    ui?: string;
    streamsUi?: string;
    grants?: PublicGrant[];
    auth: { endpoint: string; headers?: Record<string, string> };
    calls?: { endpoint: string; headers?: Record<string, string> };
    keys?: { endpoint?: string; headers?: Record<string, string>; entries?: string[]; identity?: Identity };
    ring?: boolean;
    /** The call screen's: `add`, whether the app lists people a user may add to a call (calls()'s `people`). */
    screen?: ScreenSettings;
}

export type RealtimeSettings = RoomsOptions & CallsOptions & { screen?: ScreenSettings; ui?: string; streamsUi?: string };

/**
 * Connects the page: the app's rooms, its calls when asked for, and its keys. Given the server's config() with a
 * user's keys, it needs no request first; otherwise it asks the app's keys route for the user's keys and identity, and
 * for the app's key where `app` doesn't name it, then connects. A keys route that fails leaves the page connected without
 * them, as a page with no user is, and says why: `rt.on( 'error' )` hears `keys_failed`, even added after this returned.
 */
export async function connect(options: ConnectOptions | BrowserConfig = {}): Promise<Realtime> {
    const settings = settingsOf(options, false);
    let failure: RealtimeErrorEvent | null = null;

    if (!settings.keys?.entries?.length && !settings.keys?.identity && settings.keys?.endpoint) {
        const endpoint = settings.keys.endpoint;
        const answer = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...settings.keys.headers },
            body: JSON.stringify({ labels: [] }),
        }).then(
            (res) => {
                if (!res.ok) {
                    failure = { code: 'keys_failed', status: res.status };
                    return null;
                }
                return res.json().catch(() => {
                    failure = { code: 'keys_failed', status: res.status };
                    return null;
                });
            },
            () => {
                failure = { code: 'keys_failed' };
                return null;
            },
        );

        if (answer && Array.isArray(answer.keys)) {
            settings.keys = { ...settings.keys, entries: answer.keys, ...(answer.identity?.token ? { identity: answer.identity } : {}) };
        }
        if (!settings.site && typeof answer?.app === 'string') settings.site = answer.app;
        tellKeysFailed(failure, endpoint);
    }

    if (!settings.site) {
        if (failure) throw new RealtimeError('keys_failed');
        throw new Error('wordplus-realtime: connect() needs the app\'s key: pass `app`, or update the server package, whose keys route names it');
    }

    const realtime = new Realtime(settings);
    if (failure) realtime.heard(failure);
    return realtime;
}

/**
 * A keys route that did not answer, said in the console with what to check. A route the app guards with its own sign-in
 * may well turn away a visitor: `error` says so, and the console stays quiet.
 */
function tellKeysFailed(failure: RealtimeErrorEvent | null, endpoint: string): void {
    if (!failure || failure.status === 401 || failure.status === 403) return;
    const answered = failure.status ? `answered ${failure.status}` : 'did not answer';
    console.warn(`wordplus-realtime: your keys route (${endpoint}) ${answered}, so this page connects without its user's keys. Your server's realtime routes answer POST at {endpoint}/keys: \`endpoint\` in connect() says where.`);
}

/** Connects at once, with the settings as they are: the server's config() for a signed-in user, or a page with no user. */
export function connectNow(options: ConnectOptions | BrowserConfig): Realtime {
    return new Realtime(settingsOf(options));
}

/**
 * The client's settings, from connect()'s options or the server's config(). `app` is needed unless `named` is false, for
 * a caller that can learn it another way.
 */
export function settingsOf(options: ConnectOptions | BrowserConfig, named = true): RealtimeSettings {
    // A server's config() names its auth route. An `auth` without one is someone else's, such as Laravel Echo's own
    // `auth: { headers }`, which connect()'s options pass along.
    if (typeof (options as Partial<BrowserConfig>).auth?.endpoint === 'string') {
        const config = options as BrowserConfig;
        const base = config.auth.endpoint.replace(/\/auth\/?$/, '');
        const headers = config.auth.headers ?? {};

        return {
            site: config.site,
            server: config.server ?? SERVER,
            path: config.path ?? PATH,
            worker: config.worker ?? null,
            api: config.api ?? API_SERVER,
            ...(config.rooms ? { rooms: config.rooms } : {}),
            ...(config.roomsWorker ? { roomsWorker: config.roomsWorker } : {}),
            ...(config.ui ? { ui: config.ui } : {}),
            ...(config.streamsUi ? { streamsUi: config.streamsUi } : {}),
            ...(config.grants ? { grants: config.grants } : {}),
            auth: { endpoint: config.auth.endpoint, headers },
            calls: config.calls ?? { endpoint: base + '/calls', headers },
            keys: { endpoint: base + '/keys', headers, entries: [], ...config.keys },
            ...(config.ring === false ? { ring: false } : {}),
            ...(config.screen ? { screen: config.screen } : {}),
        };
    }

    const plain = options as ConnectOptions;
    const app = plain.app ?? plain.site ?? '';
    if (!app && named) throw new Error('wordplus-realtime: connectNow() needs the app\'s key (`app`)');

    const base = (plain.endpoint ?? '/api/realtime').replace(/\/+$/, '');
    const headers = plain.headers ?? {};

    // The browser files from the routes unless named: unversioned here, so checked again each time (a server's config()
    // names their version folder, kept a year). `worker: null` connects each tab by itself.
    return {
        site: app,
        server: plain.server ?? SERVER,
        path: plain.path ?? PATH,
        worker: plain.worker === undefined ? base + '/files/realtime-worker.js' : plain.worker,
        api: plain.api ?? API_SERVER,
        rooms: plain.rooms ?? base + '/files/realtime-rooms.min.js',
        ...(plain.roomsWorker ? { roomsWorker: plain.roomsWorker } : {}),
        ...(plain.ui ? { ui: plain.ui } : {}),
        ...(plain.streamsUi ? { streamsUi: plain.streamsUi } : {}),
        ...(plain.grants ? { grants: plain.grants } : {}),
        auth: { endpoint: plain.routes?.auth || base + '/auth', headers },
        calls: { endpoint: plain.routes?.calls || base + '/calls', headers },
        keys: {
            endpoint: plain.routes?.keys || base + '/keys',
            headers,
            entries: plain.keys?.entries ?? [],
            ...(plain.keys?.identity ? { identity: plain.keys.identity } : {}),
        },
        ...(plain.ring === false ? { ring: false } : {}),
        ...(plain.perUser === false ? { perUser: false } : {}),
        ...(plain.screen ? { screen: plain.screen } : {}),
    };
}

/**
 * A connected page: its rooms (join(), users(), online), what the app's server sends its user (on()), its calls
 * (calls()), and the call screen (callScreen()). One per page is the rule: every tab of a user rides one connection,
 * and a call rings once.
 */
/**
 * What a refused connection means, said once in the console: a page that WordPlus Cloud turns away draws its ready-made
 * parts empty, and nothing else says why (an SDK review, 2026-10-14). `rt.on( 'error' )` still hears each of them.
 */
const REFUSALS: Record<string, () => string> = {
    wrong_origin: () => `this page address (${globalThis.location?.origin ?? 'unknown'}) is not one of the addresses of your app. Add it on your app page in WordPlus Cloud (Apps)`,
    not_licensed: () => 'WordPlus Cloud does not know this app key, or the app has no secret yet. Check WORDPLUS_SITE',
    bad_request: () => 'the app key is not one WordPlus Cloud takes. Check WORDPLUS_SITE',
    not_included: () => 'the plan of this app does not include realtime',
    over_capacity: () => 'the app is at the most connections its plan takes',
};
const told = new Set<string>();

function tellRefusal(error: { code?: string } | undefined): void {
    const code = error?.code;
    if (!code || !REFUSALS[code] || told.has(code)) return;
    told.add(code);
    console.warn(`wordplus-realtime: WordPlus Cloud refused this page (${code}): ${REFUSALS[code]()}.`);
}

/**
 * A join that can only be a mistake in the code, said once a room in the console: a user a rule turned away is the rule's
 * business and says nothing, and `no_rule` looks like one until someone reads `room.error`.
 */
const JOIN_MISTAKES: Record<string, string> = {
    no_rule: "no rule on your server matches its name. Declare one: realtime.room( 'pattern:{id}', rule )",
    bad_room: 'a room\'s name is 1 to 200 of letters, digits and _ - = @ , . ; :',
};

function tellJoinMistake(room: string, error: { code?: string } | undefined): void {
    const code = error?.code;
    if (!code || !JOIN_MISTAKES[code] || told.has(code + ':' + room)) return;
    told.add(code + ':' + room);
    console.warn(`wordplus-realtime: room ${room} could not be joined (${code}): ${JOIN_MISTAKES[code]}.`);
}

export class Realtime {
    readonly rooms: Rooms;
    private callsOfPage: Promise<Calls> | null = null;
    /** What failed before anything could listen: `connect()`'s keys request, handed to the first `error` listener. */
    private early: RealtimeErrorEvent[] = [];
    private readonly listened = new WeakSet<object>();

    constructor(readonly settings: RealtimeSettings) {
        // A connection for each user of the browser, shared by their tabs, unless the app said otherwise.
        this.rooms = openRooms({ perUser: true, ...settings });
        this.rooms.on('error', tellRefusal);
    }

    /** This tab's name on the shared connection: what the app's server's emit takes as `except` (send it as X-Realtime-Tab). */
    get tab(): string {
        return this.rooms.tab;
    }

    get connected(): boolean {
        return this.rooms.connected;
    }

    /** The user the app vouched for on this page, or null. */
    get user(): string | null {
        return this.rooms.user;
    }

    /** Who is online across the app: `watch( ids )`, `has( id )`, `on( 'change' | 'count' )`, `list()`. */
    get online(): Online {
        return this.rooms.online;
    }

    /**
     * A room: its events, `emit`, `emitWithAck`, `volatile`, `members`, `count`, `history()`, and its own `joined`, `join`,
     * `leave`, `count`, `error`. `Events` says what its events carry and `Info` what its members bring, for your own
     * checking and nothing else: `rt.join<{ message: { text: string } }>( 'chat:34:42' )`. `{pair}` in the name is this
     * user and `with`, in order, so both of them name the same room: `rt.join( 'chat:{pair}', { with: 34 } )`.
     */
    join<Events extends RoomEvents = RoomEvents, Info = unknown>(name: string, options: JoinOptions = {}): Room<Events, Info> {
        const named = roomName(name, this.user, options.with);
        const room = this.rooms.join<Events, Info>(named);
        if (!this.listened.has(room)) {
            this.listened.add(room);
            (room as unknown as Room).on('error', (error: { code?: string }) => tellJoinMistake(named, error));
        }
        return room;
    }

    room<Events extends RoomEvents = RoomEvents, Info = unknown>(name: string, options: JoinOptions = {}): Room<Events, Info> | undefined {
        return this.rooms.room<Events, Info>(roomName(name, this.user, options.with));
    }

    leave(name: string, options: JoinOptions = {}): void {
        this.rooms.leave(roomName(name, this.user, options.with));
    }

    /** Users from the app's directory, opened: their names and pictures, for ids a room or a call named. */
    users(ids: Array<number | string>): Promise<Record<string, UserProfile>> {
        return this.rooms.users(ids);
    }

    /**
     * What the app's server sends this user (`toUser( id ).emit( event, data )`), and the connection's own:
     * `connected`, `disconnected`, `moved`, `error` ({ code }: the handshake refused, such as `over_capacity`, or the keys
     * route failed, `keys_failed`), and `signed_out`: your server disconnected the user, and the page asks your routes
     * again.
     */
    on<K extends keyof ConnectionEvents>(event: K, fn: (...args: ConnectionEvents[K]) => void): this;
    on<T = any>(event: string, fn: (data: T, meta: { at?: number }) => void): this;
    on(event: string, fn: (...args: any[]) => void): this {
        this.rooms.on(event, fn);
        if (event === 'error' && this.early.length > 0) {
            const early = this.early;
            this.early = [];
            queueMicrotask(() => early.forEach((error) => fn(error)));
        }
        return this;
    }

    /** @internal What failed before anything could listen. */
    heard(error: RealtimeErrorEvent): void {
        this.early.push(error);
    }

    off(event?: string, fn?: (...args: any[]) => void): this {
        this.rooms.off(event, fn);
        return this;
    }

    /**
     * Answers what your server asks the pages of this user (`user( id ).ask( event, data )`): `fn( data, { at } )` returns the
     * reply, or a promise of it, sealed with the key of the user. One answer an event, `null` takes it away.
     */
    answer(event: string, fn: ((data: any, meta: { at: number }) => unknown) | null): this {
        this.rooms.answer(event, fn);
        return this;
    }

    /**
     * The page's calls, with `incoming` for one ringing here and `devices()`. Loaded the first time it's asked for, so a
     * page that places no call doesn't carry the call engine. Asking for them holds the page's line: its user's calls ring here.
     */
    calls(): Promise<Calls> {
        this.callsOfPage ??= import('../vendor/realtime-client/sdk-calls/index.js').then(({ calls }) => {
            const made = calls(this.rooms, this.settings);
            share(this, made);
            return made;
        });
        return this.callsOfPage;
    }

    /**
     * Calls `to`, a user id, about `name`, which your `calls()` rule owns: rings their every open tab. `{pair}` in the name
     * is the two ids in order, so either side names the same call: `rt.call( 'support:{pair}', { to: 34 } )`. Rejects with
     * its `code`.
     */
    async call(name: string, options: { to: CallUser; type?: CallType }): Promise<Call> {
        return (await this.calls()).start(name, options);
    }

    /**
     * Starts a call with a token from your own server (`realtime.callToken( user, to )` there), and rings the person it
     * names in every tab and app they have open. A token rings once, so get a new one for each call. Rejects with its
     * `code`.
     */
    async startCall(token: string): Promise<Call> {
        return (await this.calls()).startCall(token);
    }

    /**
     * Hears each call ringing for this user, and from now on their calls ring on this page. Each one has `accept()` and
     * `decline()`, and needs no token: the caller's proves your server said yes. Resolves to a function that stops listening.
     */
    async onIncomingCall(listener: (incoming: Incoming) => void): Promise<() => void> {
        const calls = await this.calls();
        calls.on('incoming', listener);
        return () => calls.off('incoming', listener);
    }

    /**
     * Joins a group call with a token from your own server (`realtime.groupCallToken( user, name, options )` there), which
     * says what this user may do in it. Someone taken out of the call needs a new token to come back. Rejects with its `code`.
     */
    async joinGroupCall(token: string): Promise<GroupCall> {
        return (await this.calls()).joinGroupCall(token);
    }

    /**
     * Joins a live stream as your own server says (`realtime.streamToken( user, name, options )` there). A token lasts ten
     * minutes, so give a function that gets one from your route: it is asked again as each runs out, and your route may then
     * say no. `video: false` for a page that shows only the chat or the details. Rejects with its `code`.
     */
    async joinStream(token: string | (() => string | Promise<string>), options: { video?: boolean } = {}): Promise<Stream> {
        return (await this.calls()).joinStream(token, options);
    }

    /** Joins the group call `name`, which your `groupCalls()` rule owns. Rejects with its `code`. */
    async groupCall(name: string, options: { type?: CallType } = {}): Promise<GroupCall> {
        return (await this.calls()).group(name, options);
    }

    /**
     * Joins the live stream `name`, as your `streams()` rule makes this user its host, a guest or a viewer. `video: false`
     * for a page that shows only the chat or the details: the picture comes once something wants it. Rejects with its `code`.
     */
    async stream(name: string, options: { video?: boolean } = {}): Promise<Stream> {
        return (await this.calls()).stream(name, options);
    }

    /**
     * The call screen, Better Messages' call screens (@wordplus/realtime-ui): `<call-button to="34" call="support:{pair}"
     * name="Ann">`, `<group-call-button call="…">`, the call window and the ring, in the page's language, with Add Person
     * when the app lists people (`add`, from the server's config() by default). Its script (realtime-ui.min.js, from
     * `npx wordplus-realtime copy`) loads the first time a page asks, from beside the worker unless `ui` names it.
     * False where there are no calls.
     */
    async callScreen(settings: ScreenSettings = {}): Promise<boolean> {
        if (typeof document === 'undefined') return false;
        await this.calls();
        return this.ui(settings);
    }

    /**
     * Better Messages' screens on the page without its calls (@wordplus/realtime-ui, the same script as the call
     * screen's): `<online-list room="shop" call="support:{pair}">` (who is in a presence room, with a call button for
     * each where the page has calls), `<typing-line room="chat:34:42">` and `<online-count room="shop">`, in
     * the page's language. True once the script is on the page.
     */
    async ui(settings: ScreenSettings = {}): Promise<boolean> {
        if (typeof document === 'undefined') return false;
        share(this, null);
        const given = { ...this.settings.screen, ...settings };
        const screen = await loadScreen('wordplusRealtimeUi', this.settings.ui ?? besideWorker(this.settings.worker ?? this.settings.rooms ?? null), given.prefix);
        if (!screen) return false;
        screen.start(given);
        return true;
    }

    /**
     * The live streams' screens, Easy Stream's player, chat and studio (@wordplus/realtime-ui):
     * `<live-stream name="show:42">` (the stream in one piece, its studio for its host), or its parts each where the
     * page puts it (`view="player"`, `chat`, `details`, `studio`), on the page's calls, in its language. Their script
     * (realtime-ui-streams.min.js, from `npx wordplus-realtime copy`) loads the first time a page asks, from beside the
     * call screen's unless `streamsUi` names it. False where there are no calls.
     */
    async streamScreen(settings: ScreenSettings = {}): Promise<boolean> {
        if (typeof document === 'undefined') return false;
        await this.calls();
        const ui = this.settings.ui ?? besideWorker(this.settings.worker ?? this.settings.rooms ?? null);
        const given = { ...this.settings.screen, ...settings };
        const screen = await loadScreen('wordplusRealtimeStreams', this.settings.streamsUi ?? new URL('realtime-ui-streams.min.js', ui).href, given.prefix);
        return screen ? screen.start(given) : false;
    }

    close(): void {
        void this.callsOfPage?.then((calls) => calls.stopRinging());
        this.rooms.close();
        if (shared?.realtime === this) shared = null;
    }
}

/** A screens script, as `window.wordplusRealtimeUi` (the call screen's) or `window.wordplusRealtimeStreams` (the streams'). */
interface ScreenScript {
    start(settings?: ScreenSettings): boolean;
}

const screenScripts = new Map<string, Promise<ScreenScript | null>>();

/** The call screen's script beside the worker (or the room client): the routes serve them together, in one version folder. */
function besideWorker(worker: string | null): string {
    return new URL('realtime-ui.min.js', new URL(worker ?? '/realtime-worker.js', location.href)).href;
}

let toldFileFailed = false;

/**
 * A browser file of the SDK that did not load, said once in the console with what to check: the browser alone says
 * only "Failed to load resource", and the online list, the chat or the call screen stay empty (an SDK review, 2026-10-15).
 */
function tellFileFailed(src: string): void {
    if (toldFileFailed) return;
    toldFileFailed = true;
    const say = (status: string) =>
        console.warn(
            `wordplus-realtime: ${src} did not load${status}. Your realtime routes serve the browser files on GET, under their base: ` +
                'in Next.js, app/api/realtime/[...path]/route.ts exports GET as well as POST, and other servers mount the routes for GET too. ' +
                'An app that serves the files itself names them with worker and rooms, and files: false.',
        );
    fetch(src, { method: 'HEAD' }).then((res) => say(` (${res.status})`), () => say(''));
}

/** @internal Loads a screens script once, found by the global it sets: null when it can't be. */
export function loadScreen(global: string, src: string, prefix?: string): Promise<ScreenScript | null> {
    const loaded = () => ((globalThis as Record<string, any>)[global] as ScreenScript | undefined) ?? null;
    if (loaded()) return Promise.resolve(loaded());

    let loading = screenScripts.get(global);
    if (!loading) {
        loading = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            // The elements' names: the script reads its prefix from its own tag as it runs, before it defines them.
            if (prefix) script.dataset.prefix = prefix;
            script.onload = () => resolve(loaded());
            script.onerror = () => {
                screenScripts.delete(global);
                tellFileFailed(src);
                resolve(null);
            };
            document.head.appendChild(script);
        });
        screenScripts.set(global, loading);
    }
    return loading;
}

let shared: { realtime: Realtime; calls: Calls | null } | null = null;

/**
 * The page's rooms and calls as the screens find them (`window.wordplusRealtimeCalls.page()`), as on a WordPress page:
 * the rooms from the screens' first load, the calls once loaded.
 */
function share(realtime: Realtime, calls: Calls | null): void {
    if (shared?.realtime === realtime && !calls) return;
    shared = { realtime, calls: calls ?? (shared?.realtime === realtime ? shared.calls : null) };
    const scope = globalThis as Record<string, any>;
    if (scope.wordplusRealtimeCalls && !scope.wordplusRealtimeCalls.npm) return;

    scope.wordplusRealtimeCalls = {
        npm: true,
        page: () => (shared ? { rt: shared.realtime.rooms, calls: shared.calls } : null),
    };
}
