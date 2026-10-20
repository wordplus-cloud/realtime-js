/**
 * WordPlus Cloud's realtime SDK in the browser, for a site or app outside WordPress: rooms with presence, live counts
 * and history, who is online, what the app's server sends the user, calls and group calls, on the same connection
 * client, connecting straight to the realtime servers and moving to another without a drop. What the app's server signs
 * comes from its routes (`@wordplus/realtime/server`), and what goes through the cloud is sealed with keys only the app
 * hands out.
 *
 *     import { connect } from '@wordplus/realtime';
 *
 *     const rt = await connect( { app: 's1500000007' } );        // the routes at /api/realtime by default
 *     const chat = rt.join( 'chat:34:42' );
 *     chat.on( 'message', ( msg, meta ) => draw( msg, meta.from ) );
 *     await chat.emitWithAck( 'message', { text: 'Hi' } );
 */
import {
    rooms as openRooms,
    RealtimeError,
    type EventMeta,
    type Identity,
    type Member,
    type Online,
    type PublicGrant,
    type Room,
    type RoomEmitter,
    type Rooms,
    type RoomsOptions,
    type RoomState,
    type UserProfile,
} from '../vendor/realtime-client/index.js';
import type { Call, Calls, CallsOptions, GroupCall, Incoming, LayerQuality, PictureLayer, PlaybackStats, Stream, StreamEvent, StreamSnapshot, StreamState, StreamTile, StreamTrack } from '../vendor/realtime-client/sdk-calls/index.js';

/**
 * The call screen's settings: the page's language (two letters, the screens' own translations: de es fr it nl pl hr
 * he), the app's own translations by the English text, whether to offer Add Person (`add`: the app lists whom a
 * user may add, calls()'s `people`), and a prefix of the app's for the elements' names (`prefix`: `shop` makes
 * `<shop-call-button>` and `<shop-chat-room>`), one a page, for the first script loaded with it.
 */
export interface ScreenSettings {
    lang?: string;
    strings?: Record<string, string>;
    add?: boolean;
    prefix?: string;
}

export type { Rooms, Room, RoomState, RoomEmitter, Member, EventMeta, Online, UserProfile, Identity, PublicGrant, Calls, Call, Incoming, GroupCall };
export type { LayerQuality, PictureLayer, PlaybackStats, Stream, StreamEvent, StreamSnapshot, StreamState, StreamTile, StreamTrack };
export { RealtimeError };
export { Keyring, keyring, labelOf } from '../vendor/realtime-client/keys.js';

export const SERVER = 'https://ws.wordplus.cloud';
export const API_SERVER = 'https://rest.wordplus.cloud';
export const PATH = '/websocket';

export interface ConnectOptions {
    /** The app's key, from the WordPlus Cloud account (Apps). Public: every page carries it. (`site` names it too.) */
    app?: string;
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
 * user's keys, it needs no request first; given only `app` (and `endpoint`), it asks the app's keys route for the
 * user's keys and identity, then connects.
 */
export async function connect(options: ConnectOptions | BrowserConfig): Promise<Realtime> {
    const settings = settingsOf(options);

    if (!settings.keys?.entries?.length && !settings.keys?.identity && settings.keys?.endpoint) {
        const answer = await fetch(settings.keys.endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...settings.keys.headers },
            body: JSON.stringify({ labels: [] }),
        })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null);

        if (answer && Array.isArray(answer.keys)) {
            settings.keys = { ...settings.keys, entries: answer.keys, ...(answer.identity?.token ? { identity: answer.identity } : {}) };
        }
    }

    return new Realtime(settings);
}

/** Connects at once, with the settings as they are: the server's config() for a signed-in user, or a page with no user. */
export function connectNow(options: ConnectOptions | BrowserConfig): Realtime {
    return new Realtime(settingsOf(options));
}

/** The client's settings, from connect()'s options or the server's config(). */
export function settingsOf(options: ConnectOptions | BrowserConfig): RealtimeSettings {
    if ('auth' in options && options.auth) {
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
    const app = plain.app ?? plain.site;
    if (!app) throw new Error('wordplus-realtime: connect() needs the app\'s key (`app`)');

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

export class Realtime {
    readonly rooms: Rooms;
    private callsOfPage: Promise<Calls> | null = null;

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

    /** A room: its events, `emit`, `emitWithAck`, `volatile`, `members`, `count`, `history()`, and its own `joined`, `join`, `leave`, `count`, `error`. */
    join(name: string): Room {
        return this.rooms.join(name);
    }

    room(name: string): Room | undefined {
        return this.rooms.room(name);
    }

    leave(name: string): void {
        this.rooms.leave(name);
    }

    /** Users from the app's directory, opened: their names and pictures, for ids a room or a call named. */
    users(ids: Array<number | string>): Promise<Record<string, UserProfile>> {
        return this.rooms.users(ids);
    }

    /**
     * What the app's server sends this user (`toUser( id ).emit( event, data )`), and the connection's own:
     * `connected`, `disconnected`, `moved`, `error` ({ code }: the handshake refused, such as `over_capacity`), and
     * `signed_out`: your server disconnected the user, and the page asks your routes again.
     */
    on(event: string, fn: (...args: any[]) => void): this {
        this.rooms.on(event, fn);
        return this;
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
     * The page's calls: start() a call, group() a group call, and `incoming` for one ringing here. Loaded the first time
     * it's asked for, so a page that places no call doesn't carry the call engine.
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
     * The call screen, Better Messages' call screens (@wordplus/realtime-ui): `<call-button to="34" call="support:34:42"
     * name="Ann">`, `<room-button room="…">`, the call window and the ring, in the page's language, with Add Person
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
