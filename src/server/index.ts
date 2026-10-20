/**
 * WordPlus Cloud's realtime SDK for an app's own server, outside WordPress: the rooms the app owns, declared once by
 * pattern with what they are; what the app's server sends them and its users; who is online; and the routes its
 * browsers ask.
 *
 *     import { createRealtime } from '@wordplus/realtime/server';
 *
 *     export const realtime = createRealtime( {
 *         site: process.env.WORDPLUS_SITE!, secret: process.env.WORDPLUS_SECRET!, localKey: process.env.WORDPLUS_LOCAL_KEY!,
 *         user: async ( request ) => ( await session( request ) )?.userId ?? null,
 *         profile: async ( user ) => ( { name: await nameOf( user ) } ),
 *     } );
 *     realtime.room( 'order:{id}', { history: 20 }, ( user, { id } ) => ownsOrder( user, id ) );
 *     realtime.room( 'chat:{a}:{b}', { presence: true, history: 500, emit: [ 'message', 'typing' ] }, ( user, { a, b } ) => [ a, b ].includes( String( user ) ) );
 *
 *     // app/api/realtime/[action]/route.ts
 *     export const POST = realtime.route;
 *
 *     await realtime.to( 'order:42' ).emit( 'updated', { status: 'paid' } );
 *     await realtime.toUser( 42 ).emit( 'notice', { text: 'Your order shipped' } );
 *
 * Everything runs on Web Crypto and fetch, so it works on Node 20 and later and on every edge runtime.
 */
import { hex, hmac, jwt, sha256Hex, text, unbase64url } from './crypto.js';
import { dayOf, GenerationStore, Keys, MAX_LABELS, RESERVED_KINDS, UserId, validLabel } from './keys.js';
import { Patterns, validPattern, validRoom } from './patterns.js';
import { CLAIM_ORDER, GRANT_AUDIENCE, GRANT_KEY_LABEL } from '../../vendor/realtime-client/streams/protocol.js';
import { FILES, FILES_VERSION } from './files/index.js';

export { Keys, validLabel, labelOf, dayOf, type GenerationStore, type UserId } from './keys.js';
export { Patterns, validRoom, validPattern } from './patterns.js';

export const SERVER = 'https://ws.wordplus.cloud';
export const API_SERVER = 'https://rest.wordplus.cloud';
export const PATH = '/websocket';

/** The app's routes: the browser's three, then the one WordPlus Cloud posts its webhooks to. */
export const ROUTE_NAMES = ['auth', 'calls', 'keys', 'webhook'] as const;
export type RouteName = (typeof ROUTE_NAMES)[number];

export const TOKEN_LABEL = 'wordplus-realtime channels v1';
export const PUBLISH_LABEL = 'wordplus-realtime publish v1';
export const WEBHOOK_LABEL = 'wordplus-realtime webhook v1';
export const CALLS_LABEL = 'wordplus-realtime calls v1';
export const CALL_KEY_LABEL = 'wordplus-realtime call key v1';

export const AUDIENCE = 'wordplus-realtime';
export const CALL_AUDIENCE = 'wordplus-realtime call';
export const LINE_AUDIENCE = 'wordplus-realtime line';
export const ROOM_AUDIENCE = 'wordplus-realtime room';
export const IDENTITY_AUDIENCE = 'wordplus-realtime identity';

export const TOKEN_TTL = 21_600;
export const MAX_TTL = 86_400;
export const CALL_TTL = 21_600;
export const MAX_ROOMS = 100;
/** The cloud keeps at most this many events a room, for at most this many days: 5 minutes, for a page that reconnects. */
export const MAX_HISTORY = 1000;
export const MAX_HISTORY_DAYS = 5 / (24 * 60);
/** What a host does to someone else in a group call from its call screen: the calls route's `moderate`. */
const MODERATION_ACTS = ['mute', 'speak', 'listen', 'remove'];
/** Events in one batch request, and a webhook's signature's window. */
export const BATCH = 100;
export const WEBHOOK_WINDOW_S = 300;

/** A user's entry in the directory: a name at least, and anything else the app's pages show of them. */
export interface Profile {
    name: string;
    avatar?: string;
    url?: string;
    [field: string]: unknown;
}

/** What a room is and allows, as its rule declares it once. */
export interface RoomOptions {
    /** Its members are listed, with their info; `join` and `leave` tell the others. */
    presence?: boolean;
    /** A live count of the people in it, at any size. */
    count?: boolean;
    /** Events kept: a number, or `{ last, days }`, within the cloud's 1,000 and 30 days. */
    history?: number | { last: number; days?: number };
    /** The events browsers may send to it: names, or '*' for any. None by default. */
    emit?: string[] | '*';
    /** Which of those the app's server gets too, by webhook. */
    webhook?: string[] | '*';
    /** Anyone may join, signed in or not, with a grant that names no user and may sit in a cached page. */
    public?: boolean;
    /** Seal its events, its members' info and its history with the room's key (true; false for a public room). */
    seal?: boolean;
}

/** A rule's answer for a user: false, true, or what they bring and may do. */
export type RoomAnswer = boolean | null | undefined | { info?: unknown; emit?: string[] | '*'; readOnly?: boolean };
export type RoomRule = (user: UserId | null, params: Record<string, string>, room: string) => RoomAnswer | Promise<RoomAnswer>;

export type CallAnswer = boolean | null | undefined | { info?: unknown; publish?: boolean; subscribe?: boolean; admin?: boolean; hidden?: boolean };
/** Which side of a call a calls() rule is asked for: `caller` places it, or rings someone into it, and `callee` answers. */
export interface CallSide {
    role: 'caller' | 'callee';
}
/** Who may call whom about a call the app owns: `withUser` is the other person, `side.role` whether `user` calls or answers. */
export type CallRule = (user: UserId, withUser: UserId, params: Record<string, string>, call: string, side: CallSide) => CallAnswer | Promise<CallAnswer>;
/** Who may take part in a group call the app owns. */
export type GroupCallRule = (user: UserId, params: Record<string, string>, name: string) => CallAnswer | Promise<CallAnswer>;

/** What calls() takes beside its rule: whom the call screen offers to add. */
export interface CallOptions {
    /** The user ids the call screen offers `user` to add to a call named `call` (each still asked of the rule). */
    people?: (user: UserId, call: string) => UserId[] | Promise<UserId[]>;
}

/** What groupCalls() takes beside its rule. */
export interface GroupCallOptions {
    /** Encrypt its rooms end to end, as a call's rooms always are. */
    encrypt?: boolean;
}

/** Someone's part in a live stream: its host, a guest on stage, or a viewer. */
export type StreamRole = 'host' | 'guest' | 'viewer';

/**
 * What streams()'s rule answers: false for no, a role, or the role with more: `info` (a name and an https picture; the
 * user's `profile` by default), `chat` (`write` or `read`), `mod` (moderates the chat; a host always does), `src` (what a
 * host or guest may send) and `quality` (a cap on the picture they send).
 */
export type StreamAnswer = false | null | undefined | StreamRole | {
    role: StreamRole;
    info?: { name?: string; avatar?: string | null } | null;
    chat?: 'write' | 'read';
    mod?: boolean;
    src?: Array<'camera' | 'microphone' | 'screen'>;
    quality?: '720p' | '1080p';
};

/** Who is what in a live stream the app owns. `user` is null for a visitor who isn't signed in: only a viewer may be one. */
export type StreamRule = (user: UserId | null, params: Record<string, string>, name: string) => StreamAnswer | Promise<StreamAnswer>;

type StreamSetting<T> = T | ((params: Record<string, string>) => T);

/** A stream's own settings, the same in every grant for it: each a value, or a function of the name's parts. */
export interface StreamSettings {
    /** Guests on stage (a hand raised, a host's invitation): yes by default. */
    stage?: StreamSetting<boolean>;
    /** Reactions: yes by default; `stream( name ).reactions( on )` changes it during the stream. */
    reactions?: StreamSetting<boolean>;
    /** Who sees who is here: its moderators (`mods`, the default) or everyone. */
    people?: StreamSetting<'all' | 'mods'>;
    /** The chat: open or closed while the stream isn't live, links from everyone, emptied as it goes live. */
    chat?: StreamSetting<{ offline?: 'open' | 'closed'; links?: boolean; fresh?: boolean }>;
}

/** Someone a user may add to a call, as the call screen lists them. */
export interface CallPerson {
    id: UserId;
    name: string;
    avatar: string;
}

export type KindAuthorizer = (rest: string, user: UserId | null, label: string) => boolean | Promise<boolean>;
export type KindNewest = (rest: string, label: string) => string | Promise<string>;

export interface RealtimeOptions {
    /** The app's key, from the WordPlus Cloud account (Apps): WORDPLUS_SITE. */
    site: string;
    /** The app's secret: WORDPLUS_SECRET. Never in a page. */
    secret: string;
    /** 64 hex characters of the app's own, which never leave its servers (openssl rand -hex 32): WORDPLUS_LOCAL_KEY. */
    localKey: string;
    /** Who a request's user is, for route(): their id, or null for nobody. */
    user?: (request: Request) => UserId | null | undefined | Promise<UserId | null | undefined>;
    /** A user's profile, for the directory and as their info in presence and calls; null for none. */
    profile?: (user: UserId) => Profile | null | undefined | Promise<Profile | null | undefined>;
    /** Whether a user may have any key: false for one the app cut off. Everyone by default. */
    hasKeys?: (user: UserId) => boolean | Promise<boolean>;
    /** A user who is never shown online, such as one who chose to hide it. Nobody by default. */
    hidden?: (user: UserId) => boolean | Promise<boolean>;
    /** Where the keys' generations are kept, for kick(), rotateRoom() and rotateUser(). */
    generations?: GenerationStore;
    /** Seal what goes through the realtime server (true). */
    seal?: boolean;
    /** Where the app serves the routes: `{base}/auth`, `{base}/calls`, `{base}/keys`, `{base}/webhook`. '/api/realtime' by default. */
    base?: string;
    /**
     * A route at an address of its own, in place of `{base}/{name}`: `{ calls: '/check-call', webhook: '/hooks/wordplus' }`.
     * config() names them to the page, and node() and route() answer each at its address alone.
     */
    routes?: Partial<Record<RouteName, string>>;
    /** Headers the browser sends with each route's request, such as a CSRF token. */
    headers?: Record<string, string>;
    /**
     * Serve the browser files from the routes (true): GET `{base}/files/{version}/{name}`, the connector's worker, the
     * room client, its encryption worker, the ready-made parts and the client as one ES module, each kept by browsers
     * and CDNs for a year, a new version a new folder. config() then names the worker and the room client there.
     * false when the app serves them itself (npx wordplus-realtime copy) and names them below.
     */
    files?: boolean;
    /**
     * The connector's SharedWorker, the mesh's room client and its encryption worker, where the app serves them itself
     * (npx wordplus-realtime copy): from the routes by default. The encryption worker is beside the room client unless named.
     */
    worker?: string;
    rooms?: string;
    roomsWorker?: string;
    server?: string;
    api?: string;
    /** A room token's life in seconds (6 hours, at most a day), and a call token's (6 hours at most). */
    tokenTtl?: number;
    callTokenTtl?: number;
    fetch?: typeof fetch;
}

export interface Grant {
    token?: string;
    exp?: number;
    keys?: string[];
    denied: Record<string, string>;
}

/** A grant for the app's public rooms, naming their patterns and no user: the same for every visitor. */
export interface PublicGrant {
    token: string;
    exp: number;
    rooms: string[];
}

/**
 * What the calls route answers: a token, the call's signals key, the key its rooms encrypt their media with, the call's
 * pair and the user's proof of being in it, the proof a person rung in was rung, the people a user may add, or why not.
 */
export interface CallGrant {
    token?: string;
    exp?: number;
    key?: string;
    media_key?: string;
    pair?: [UserId, UserId];
    member?: string;
    ring?: string;
    people?: CallPerson[];
    /** For `may`: whether the user may call each person asked about, in the order asked. */
    may?: boolean[];
    /** For `moderate`: whether the host's act changed anything. */
    done?: boolean;
    denied?: string;
}

export interface Identity {
    token: string;
    exp: number;
}

export interface KeysAnswer {
    keys: string[];
    identity?: Identity;
}

/** What the browser's connect() takes: where to connect, the app, its routes, public grants, and a user's keys and identity. */
export interface BrowserConfig {
    server: string;
    path: string;
    site: string;
    api: string;
    worker?: string;
    rooms?: string;
    roomsWorker?: string;
    screen?: { add: boolean };
    grants?: PublicGrant[];
    auth: { endpoint: string; headers: Record<string, string> };
    calls: { endpoint: string; headers: Record<string, string> };
    keys: { endpoint: string; headers: Record<string, string>; entries: string[]; identity?: Identity };
}

export interface EmitOptions {
    /** Seal a sealed room's data with its key, and a user's with theirs (true). */
    seal?: boolean;
}

/** One event of a batch: to rooms, to users, or both. */
export interface EmitEvent extends EmitOptions {
    rooms?: string | string[];
    users?: UserId | UserId[];
    event: string;
    data?: unknown;
    /** The tab whose action made the event (the browser's `rt.tab`), which doesn't get it back. */
    except?: string;
}

/** An event the realtime server kept: its id, when, what, and who sent it (none for the app's server). */
export interface KeptEvent {
    id: string;
    at: number;
    event: string;
    data: unknown;
    from?: string;
}

/** What the realtime server told the app's server by webhook, opened. */
export type WebhookEvent =
    | { id: string; at: number; type: 'room.occupied' | 'room.vacated'; room: string }
    | { id: string; at: number; type: 'member.joined' | 'member.left'; room: string; user: string }
    | { id: string; at: number; type: 'user.online' | 'user.offline'; user: string }
    | { id: string; at: number; type: 'stream.live' | 'stream.ended'; stream: string; started_at: number | null; ended_at: number | null }
    // What people used, for an app that charges by it: a call between two people that ended, with the seconds talked
    // from the answer to its end (0 for one never answered), someone in a group call, and a signed-in person watching
    // or on a live stream, with how long once they leave. Users are as your rules got them.
    | { id: string; at: number; type: 'call.ended'; call: string; call_id: string; from: UserId; to: UserId; media: 'audio' | 'video';
        started_at: number; answered_at: number | null; ended_at: number; seconds: number; reason: string }
    | { id: string; at: number; type: 'group.joined'; call: string; user: UserId; media: 'audio' | 'video' | null; joined_at: number }
    | { id: string; at: number; type: 'group.left'; call: string; user: UserId; media: 'audio' | 'video' | null; joined_at: number | null; left_at: number; seconds: number | null }
    | { id: string; at: number; type: 'stream.joined'; stream: string; user: UserId; role: string; watch: string; joined_at: number }
    | { id: string; at: number; type: 'stream.left'; stream: string; user: UserId; role: string; watch: string; joined_at: number; left_at: number; seconds: number }
    | { id: string; at: number; type: 'emit'; room: string; event: string; data: unknown; from?: string; event_id: string }
    | { id: string; at: number; type: 'webhook.test' };

/** A room someone is in now: its count (members of a presence room, else connections) and its connections. */
export interface OccupiedRoom {
    name: string;
    count: number;
    connections: number;
}

/** A user as the realtime server knows them: online, or offline since `at`, and the connections vouched for them. */
export interface UserState {
    id: string;
    online: boolean;
    at?: number;
    connections: number;
}

/** The reply of a page to an ask, opened, and when it came. */
export interface AskReply {
    data: unknown;
    at: number;
}

/** What the app uses now: its connections to the rooms (those of an app against its plan), and the credits of its account, a credit a minute. */
export interface Usage {
    connections: { now: number; limit: number | null };
    credits: { plan: number; bought: number; borrowed: number; allowance: number; admit: boolean; buy_url?: string } | null;
}

/** One try of a webhook batch, the newest first: its HTTP status (0 for none), and whether it may be sent again. */
export interface WebhookDelivery {
    id: string;
    at: number;
    events: number;
    types: string[];
    attempt: number;
    status: number;
    error?: string;
    ms: number;
    next_at?: number;
    gave_up?: true;
    resent?: true;
    resendable: boolean;
}

/** What a webhook sent now did: taken (a 2xx), its status, and why not. */
export interface WebhookOutcome {
    delivered: boolean;
    status: number;
    error?: string;
}

/** A group call going on, by its name (`call:<id>` for a call that became one). */
export interface LiveCall {
    name: string;
    people: number;
    started_at: number;
}

/** Someone in a group call: what they send now, unmuted. */
export interface CallParticipant {
    user: string | null;
    joined_at: number;
    camera: boolean;
    microphone: boolean;
    screen: boolean;
}

/** A group call as it is now, by `call( name ).get()`: with nobody in it, `people` 0, `started_at` null and `list` empty. */
export interface CallNow {
    name: string;
    people: number;
    started_at: number | null;
    list: CallParticipant[];
}

/** A live stream as it is now. */
export interface StreamNow {
    name: string;
    state: 'idle' | 'live' | 'ended';
    started_at: number | null;
    ended_at: number | null;
    viewers: number;
    peak: number;
    slow: number;
    reactions: boolean;
    pinned: StreamMessage | null;
}

/** A message of the chat of a stream: who wrote it (`user` null for a visitor and the app, `role` `app` for those of the app). */
export interface StreamMessage {
    id: string;
    from: { user: string | null; name: string; avatar: string | null; role: string };
    text: string;
    at: number;
}

/** Someone signed in watching or on a stream, with the end of their timeout. */
export interface StreamPerson {
    user: string | null;
    name: string;
    avatar: string | null;
    role: string;
    timeout_until?: number;
}

export type WebhookHandler = (event: any) => unknown | Promise<unknown>;

/** The type of each of the cloud's own events, beside a page's (`emit`). */
export type WebhookType = Exclude<WebhookEvent['type'], 'emit'>;

/** A webhook event of one type, as on( type ) hands it: `call.ended` with its seconds, `member.joined` with its user. */
export type WebhookEventOf<T extends WebhookType> = WebhookEvent extends infer E
    ? E extends { type: infer K } ? (T extends K ? Omit<E, 'type'> & { type: T } : never) : never
    : never;

/** A page's event a room's rule sends to the webhook (its `webhook` option), as on( name ) hands it: its data as sent. */
export interface PageEvent {
    id: string;
    at: number;
    type: 'emit';
    room: string;
    /** Its name, as the page emitted it. */
    event: string;
    data: any;
    /** Who sent it, as your server vouched for them: none for a guest in a public room. */
    from?: string;
    /** The id the pages saw: keep a message by it, so one delivered twice is kept once. */
    event_id: string;
}

/** A refusal from the realtime server, or a request that didn't reach it: `code` says which. */
export class RealtimeError extends Error {
    constructor(
        readonly code: string,
        readonly status: number = 0,
    ) {
        super('The realtime server refused the request: ' + code);
        this.name = 'RealtimeError';
    }
}

/** What a route answers: its status and JSON body. */
/** A browser file the routes serve (file()): its status, headers and text, null for a HEAD or a 304. */
export interface FileAnswer {
    status: number;
    headers: Record<string, string>;
    body: string | null;
}

export interface RouteAnswer {
    status: number;
    body: unknown;
}

interface RoomEntry {
    options: Required<Pick<RoomOptions, 'presence' | 'count' | 'public' | 'seal'>> & {
        history: { last: number; days: number } | null;
        emit: string[] | '*';
        webhook: string[] | '*';
    };
    rule: RoomRule | null;
}

interface CallEntry {
    rule: CallRule;
    options: CallOptions;
}

interface GroupEntry {
    rule: GroupCallRule;
    options: GroupCallOptions;
}

export function createRealtime(options: RealtimeOptions): Realtime {
    return new Realtime(options);
}

export class Realtime {
    /** Who is online across the app. */
    readonly online: OnlineQueries;
    /** The last deliveries of the webhook, a batch not taken sent again, and a test event. */
    readonly webhooks: WebhookQueries;
    private readonly rules = new Patterns<RoomEntry>();
    private readonly callRules = new Patterns<CallEntry>();
    private readonly groupRules = new Patterns<GroupEntry>();
    private readonly streamRules = new Patterns<{ rule: StreamRule; settings: StreamSettings }>();
    private readonly kinds = new Map<string, [KindAuthorizer, KindNewest | null]>();
    private readonly handlers = new Map<string, WebhookHandler[]>();
    private tokenKey: Promise<Uint8Array> | null = null;
    private callsKey: Promise<Uint8Array> | null = null;
    private publishKey: Promise<Uint8Array> | null = null;
    private webhookKey: Promise<Uint8Array> | null = null;
    private streamKey: Promise<Uint8Array> | null = null;
    private publicGrant: Promise<PublicGrant | null> | null = null;
    private publicGrantExp = 0;
    private warnedUser = false;
    private localKeys: Keys | null = null;

    // The credentials are checked as they are first used, not here: a build that loads the app without them, such as
    // `next build` collecting its routes, runs, and the first request says what is missing.
    constructor(private readonly options: RealtimeOptions) {
        this.online = new OnlineQueries(this);
        this.webhooks = new WebhookQueries(this);
    }

    /** The keys of the local key, which seal and open what the app sends. */
    get keys(): Keys {
        return (this.localKeys ??= new Keys(this.options.localKey ?? '', this.options.generations ?? null));
    }

    private get site(): string {
        return this.credentials().site;
    }

    private get secret(): string {
        return this.credentials().secret;
    }

    private credentials(): { site: string; secret: string } {
        const { site, secret } = this.options;
        if (!site || !secret) throw new Error('wordplus-realtime: site and secret are required (WORDPLUS_SITE, WORDPLUS_SECRET)');
        return { site, secret };
    }

    /**
     * Rooms the app owns, by pattern (`order:{id}`), what they are (`options`), and who may join: `rule( user, params,
     * room )` answers false, true, or `{ info, emit, readOnly }` for that user. A public room may have no rule: anyone
     * joins. The rule with the most characters of its own decides.
     */
    room(pattern: string, rule?: RoomRule): this;
    room(pattern: string, options: RoomOptions, rule?: RoomRule): this;
    room(pattern: string, optionsOrRule?: RoomOptions | RoomRule, maybeRule?: RoomRule): this {
        const options = typeof optionsOrRule === 'function' || optionsOrRule === undefined ? {} : optionsOrRule;
        const rule = typeof optionsOrRule === 'function' ? optionsOrRule : (maybeRule ?? null);
        if (!options.public && typeof rule !== 'function') throw new Error('wordplus-realtime: room ' + JSON.stringify(pattern) + ' needs a rule, or `public: true`');
        if (options.presence && options.public) throw new Error('wordplus-realtime: a public room has no members to list; take `presence` off ' + JSON.stringify(pattern));

        this.rules.add(pattern, { options: normalized(options), rule });
        this.publicGrant = null;
        return this;
    }

    /**
     * Calls between two people the app owns, by pattern (`support:{a}:{b}`): `rule( user, withUser, params, call, side )`
     * answers false, true, or `{ info, publish, subscribe, admin, hidden }`. It is asked as the caller places the call
     * (`side.role` `caller`) and again as the callee answers (`callee`), so a rule may let someone answer calls they
     * may not place.
     *
     * A call becomes a group call when either of its people adds someone, which the rule decides as for any call: the
     * user calling the person about the call's name, then the person taking a call from them. A call's rooms are
     * encrypted end to end with a key only this server gives out, to the people in the call. `options.people` lists
     * whom the call screen offers to add.
     */
    calls(pattern: string, rule: CallRule, options: CallOptions = {}): this {
        if (typeof rule !== 'function') throw new Error('wordplus-realtime: calls ' + JSON.stringify(pattern) + ' needs a rule');
        this.callRules.add(pattern, { rule, options: { people: typeof options.people === 'function' ? options.people : undefined } });
        return this;
    }

    /** Group calls the app owns, by pattern (`meeting:{id}`): `rule( user, params, name )`; `options.encrypt` encrypts their rooms end to end. */
    groupCalls(pattern: string, rule: GroupCallRule, options: GroupCallOptions = {}): this {
        if (typeof rule !== 'function') throw new Error('wordplus-realtime: groupCalls ' + JSON.stringify(pattern) + ' needs a rule');
        this.groupRules.add(pattern, { rule, options: { encrypt: options.encrypt === true } });
        return this;
    }

    /**
     * Live streams the app owns, by pattern (`show:{id}`): `rule( user, params, name )` says who is what in each, and
     * `settings` are the stream's own. A page asks for one with `calls.stream( name )`, through the
     * calls route, which signs Easy Stream's grant for it. A stream's name is a room's without an underscore.
     */
    streams(pattern: string, rule: StreamRule, settings: StreamSettings = {}): this {
        if (typeof rule !== 'function') throw new Error('wordplus-realtime: streams ' + JSON.stringify(pattern) + ' needs a rule');
        this.streamRules.add(pattern, { rule, settings });
        return this;
    }

    /**
     * Keys of the app's own kind (`kind:{rest}`), and who may have them: what it seals itself with keys.seal(). A kind is
     * 1–16 of a-z and 0-9, starting with a letter, and not `d`, `u` or `ch`. `newest( rest, label )` names the newest key
     * of the same thing, for a kind with generations.
     */
    kind(kind: string, mayHave: KindAuthorizer, newest?: KindNewest): this {
        if (/^[a-z][a-z0-9]{0,15}$/.test(kind) && !RESERVED_KINDS.includes(kind) && typeof mayHave === 'function') {
            this.kinds.set(kind, [mayHave, typeof newest === 'function' ? newest : null]);
        }
        return this;
    }

    /**
     * A webhook from the realtime server, opened: `room.occupied`, `room.vacated`, `member.joined`, `member.left`,
     * `user.online`, `user.offline`, `stream.live`, `stream.ended` (a live stream going live and ending, its name in
     * `stream`), what people used (`call.ended`, `group.joined`, `group.left`, `stream.joined`, `stream.left`), or the
     * name of a browser's event a room's rule sends here (`webhook`), or `*` for all of them. Each handler gets its event
     * typed by its name: `on( 'call.ended', ( e ) => e.seconds )`, and a page's `on( 'message', ( e ) => e.data.text )`.
     */
    on<T extends WebhookType>(type: T, handler: (event: WebhookEventOf<T>) => unknown | Promise<unknown>): this;
    on(type: '*', handler: (event: WebhookEvent) => unknown | Promise<unknown>): this;
    on(type: string, handler: (event: PageEvent) => unknown | Promise<unknown>): this;
    on(type: string, handler: WebhookHandler): this {
        const list = this.handlers.get(type) ?? [];
        list.push(handler);
        this.handlers.set(type, list);
        return this;
    }

    /** An emit to rooms: `realtime.to( 'order:42' ).except( tab ).emit( 'updated', data )`. */
    to(rooms: string | string[]): Emitter {
        return new Emitter(this).to(rooms);
    }

    /** An emit to users, every connection they have open: `realtime.toUser( 42 ).emit( 'notice', data )`. */
    toUser(users: UserId | UserId[]): Emitter {
        return new Emitter(this).toUser(users);
    }

    /** A room as the realtime server holds it: its members, count, history, and kicking a user out. */
    in(room: string): RoomQueries {
        return new RoomQueries(this, room);
    }

    /** The rooms someone is in now, by name: those starting with `prefix`, a page at a time (`cursor` from `next`, `limit` up to 1,000). */
    async listRooms(page: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<{ count: number; rooms: OccupiedRoom[]; next?: string }> {
        const answer = await this.request('GET', '/wordplus/realtime/rooms' + queryOf(page));
        return { count: answer.count, rooms: answer.rooms ?? [], ...(answer.next ? { next: String(answer.next) } : {}) };
    }

    /** A user as the realtime server knows them: their state, taking them out of everything at once, asking their pages. */
    user(id: UserId): UserQueries {
        return new UserQueries(this, String(id));
    }

    /** What the app uses now: its connections, and the credits of its account as WordPlus Cloud last said. */
    async usage(): Promise<Usage> {
        const answer = await this.request('GET', '/wordplus/realtime/usage');
        return { connections: answer.connections, credits: answer.credits ?? null };
    }

    /** The group calls of the app going on now, from the media server. */
    async listCalls(): Promise<LiveCall[]> {
        return (await this.request('GET', '/wordplus/realtime/calls')).calls ?? [];
    }

    /** A group call as the media server holds it: its people, muting, removing someone, ending it. */
    call(name: string): CallQueries {
        return new CallQueries(this, name);
    }

    /** The live streams of the app that are live now. */
    async listStreams(): Promise<Array<{ name: string; started_at: number | null; viewers: number }>> {
        return (await this.request('GET', '/wordplus/realtime/streams')).streams ?? [];
    }

    /** A live stream: its state, who is in it, its chat, and what its moderators do. */
    stream(name: string): StreamQueries {
        return new StreamQueries(this, name);
    }

    /** Several events at once, each as an emit takes them; 100 to a request. The kept events' ids, by room, for each. */
    async batch(events: EmitEvent[]): Promise<Array<Record<string, string>>> {
        const out: Array<Record<string, string>> = [];
        for (const event of events) out.push(await this.emitEvent(event));
        return out;
    }

    /** What the auth route answers for the rooms asked: one token for those allowed, their keys, and why each other was refused. */
    async authorize(rooms: unknown, user: UserId | null): Promise<Grant> {
        const denied: Record<string, string> = {};
        const allowed: Array<{ room: string; options: RoomEntry['options']; emit: string[] | '*'; readOnly: boolean; info: unknown; given: boolean }> = [];

        const asked = Array.isArray(rooms) ? [...new Set(rooms.filter((r) => typeof r === 'string' || typeof r === 'number').map(String))] : [];

        for (const [i, room] of asked.entries()) {
            if (i >= MAX_ROOMS) {
                denied[room] = 'too_many';
                continue;
            }
            if (!validRoom(room)) {
                denied[room] = 'bad_room';
                continue;
            }

            const found = this.rules.match(room);
            if (!found) {
                denied[room] = 'no_rule';
                continue;
            }

            const answer = await this.answerFor(found.value, found.params, room, user);
            if (answer === null || (found.value.options.presence && !known(user))) {
                denied[room] = 'forbidden';
                continue;
            }

            allowed.push({
                room,
                options: found.value.options,
                emit: answer.emit ?? found.value.options.emit,
                readOnly: answer.readOnly === true,
                info: answer.info,
                given: 'info' in answer,
            });
        }

        if (allowed.length === 0) return { denied };

        const now = nowS();
        const exp = now + clamp(this.options.tokenTtl ?? TOKEN_TTL, 60, MAX_TTL);
        const claims: Record<string, unknown> = { iss: this.site, aud: AUDIENCE, iat: now, exp, r: {} };
        if (known(user)) claims.sub = String(user);

        const infos: Record<string, unknown> = {};
        let plainInfo: unknown = undefined;
        const keys: string[] = [];

        for (const a of allowed) {
            (claims.r as Record<string, unknown>)[a.room] = short({ ...a.options, emit: a.emit }, a.readOnly);
            const sealed = this.sealing() && a.options.seal;
            if (sealed) keys.push(await this.keys.entry(await this.keys.roomLabel(a.room)));

            if (!a.options.presence) continue;
            const info = a.given ? a.info : await this.defaultInfo(user);
            if (sealed) {
                const label = await this.keys.roomLabel(a.room);
                infos[a.room] = (await this.keys.sealJson(info ?? null, label)) ?? info ?? null;
            } else {
                plainInfo = info ?? null;
            }
        }
        if (Object.keys(infos).length > 0) claims.infos = infos;
        if (plainInfo !== undefined) claims.info = plainInfo;

        const grant: Grant = { token: await jwt(claims, await this.tokenKeyOf()), exp, denied };
        if (keys.length > 0) grant.keys = keys;
        return grant;
    }

    /**
     * The grant for the app's public rooms, which every page may carry: their patterns, no user, signed for 6 hours and
     * made again an hour before it runs out. Null when the app has none.
     */
    async publicGrants(): Promise<PublicGrant[]> {
        if (this.publicGrant && this.publicGrantExp - nowS() < 3600) this.publicGrant = null;
        this.publicGrant ??= (async () => {
            const open = this.rules.entries().filter(([, entry]) => entry.options.public && entry.rule === null);
            if (open.length === 0) return null;
            const now = nowS();
            const exp = now + TOKEN_TTL;
            this.publicGrantExp = exp;
            const r = Object.fromEntries(open.map(([pattern, entry]) => [pattern, short(entry.options, false)]));
            return { token: await jwt({ iss: this.site, aud: AUDIENCE, iat: now, exp, r }, await this.tokenKeyOf()), exp, rooms: open.map(([pattern]) => pattern) };
        })();
        const grant = await this.publicGrant;
        return grant ? [grant] : [];
    }

    /**
     * What the calls route answers: the page's line (`{ line: true }`), its side of a call (`call`, `id`, `role`, `to`
     * or `from`, `type`, and `group`, `pair` and `member` or `ring` for a ring into the group call it became), a place
     * in a group call (`room`, `type`), the people a user may add to a call (`people`: its name), or whether the user may
     * call each of some people (`may`: up to 100 `{ call, to }`, each asked of its rule as the caller), or a host's act
     * in a group call (`moderate`: its name, `act` and `user`). A token, when it runs out, the call's key for its signals, the key its rooms encrypt their media with, the call's pair and the
     * user's proof of being in it, the proof a person rung in was rung, the people, `may` (true or false for each, in the
     * order asked), `done` for a host's act, or `denied`: `no_user`,
     * `bad_request`, `forbidden`.
     *
     * Who is in a call is in proofs made with the local key, which WordPlus Cloud never sees: the realtime server
     * carries them from page to page and can't make one, and this server keeps nothing.
     *
     * A user of a call is a number for an id of digits, else the id of text the app gives (a UUID, `auth0|5f7c…`): up
     * to 64 characters, none a space. Anything else is `no_user`.
     */
    async authorizeCall(request: unknown, user: UserId | null): Promise<CallGrant> {
        const r = (request && typeof request === 'object' ? request : {}) as Record<string, unknown>;

        // A live stream's grant (streams()), which a visitor who isn't signed in may get too, as a viewer.
        if (r.stream !== undefined) return this.authorizeStream(r.stream, user);

        const me = callUser(user);

        if (me === null) {
            if (known(user) && !this.warnedUser) {
                this.warnedUser = true;
                console.warn('wordplus-realtime: a user of a call is an id of up to 64 characters with no space; ' + JSON.stringify(user) + ' is not one');
            }
            return { denied: 'no_user' };
        }

        if (r.line) return this.signCalls({ aud: LINE_AUDIENCE, sub: me });

        if (r.people !== undefined) return validRoom(r.people) ? { people: await this.callPeople(r.people, me) } : { denied: 'bad_request' };

        if (r.may !== undefined) return this.mayCall(r.may, me);

        if (r.moderate !== undefined) return this.moderateCall(r.moderate, r.act, r.user, me);

        const type = r.type === 'audio' ? 'audio' : 'video';

        if (r.room !== undefined) {
            if (!validRoom(r.room)) return { denied: 'bad_request' };
            const found = this.groupRules.match(r.room);
            const answer = found ? await callAnswer(await found.value.rule(me, found.params, r.room), () => this.defaultCallInfo(me)) : null;
            if (answer === null) return { denied: 'forbidden' };

            const signed = await this.signCalls({
                aud: ROOM_AUDIENCE,
                room: r.room,
                sub: me,
                type,
                info: await this.sealedCallInfo(answer.info),
                publish: answer.publish === undefined || !!answer.publish,
                subscribe: answer.subscribe === undefined || !!answer.subscribe,
                admin: !!answer.admin,
                hidden: !!answer.hidden,
            });

            // Encrypted end to end when its rule says so: everyone the rule lets in gets the room's key.
            if (signed.token && found!.value.options.encrypt) signed.media_key = await this.keys.media('room|' + r.room);
            return signed;
        }

        const { call, id, role, group } = r;
        if (!validRoom(call) || !validAttempt(id) || (role !== 'caller' && role !== 'callee')) return { denied: 'bad_request' };
        if (group !== undefined && group !== null && (!validAttempt(group) || group === id)) return { denied: 'bad_request' };

        const other = callUser((role === 'caller' ? r.to : r.from) as UserId | null);
        if (other === null || other === me) return { denied: 'bad_request' };

        const answer = await this.askCaller(me, call, other, role);
        if (answer === null) return { denied: 'forbidden' };

        // The call's two people, whose key its rooms encrypt with: this request's, for the call itself; for a ring into
        // the group call it became, the pair its proofs name, with the ringer's proof of being in it or the proof the
        // person was rung.
        const ringing = typeof group === 'string';
        const first = ringing ? group : id;
        let pair: [UserId, UserId];
        if (!ringing) {
            pair = role === 'caller' ? [me, other] : [other, me];
        } else {
            const named = pairOf(r.pair);
            if (named === null) return { denied: 'bad_request' };
            pair = named;
            const proof = role === 'caller' ? r.member : r.ring;
            if (typeof proof !== 'string' || !sameString(proof, await this.callProof(role === 'caller' ? 'member' : 'rung', call, first, pair, me))) return { denied: 'forbidden' };
        }

        const claims: Record<string, unknown> = { aud: CALL_AUDIENCE, call, id, sub: me, role, type, info: await this.sealedCallInfo(answer.info) };
        if (role === 'caller') claims.to = other;
        if (ringing) claims.group = group;

        const signed = await this.signCalls(claims);
        if (signed.token) {
            signed.key = await this.callKey(id, role === 'caller' ? me : other, role === 'caller' ? other : me);
            signed.media_key = await this.keys.media('call|' + call + '|' + first + '|' + idPart(pair[0]) + '|' + idPart(pair[1]));
            signed.pair = pair;
            signed.member = await this.callProof('member', call, first, pair, me);
            if (ringing && role === 'caller') signed.ring = await this.callProof('rung', call, first, pair, other);
        }

        return signed;
    }

    /** The key a call's two browsers seal their negotiation with: made from the local key, which WordPlus Cloud doesn't know. */
    async callKey(id: string, caller: UserId, callee: UserId): Promise<string> {
        return hex(await hmac(this.options.localKey, CALL_KEY_LABEL + '|' + id + '|' + idPart(caller) + '|' + idPart(callee)));
    }

    /**
     * What the keys route answers, `{ labels }`: the keys asked for that this user may have, each with the newest of
     * the same thing beside it. With no labels: the keys the user starts with, and their identity.
     */
    async keysAnswer(labels: unknown, user: UserId | null): Promise<KeysAnswer> {
        if (!Array.isArray(labels) || labels.length === 0) {
            const keys = await this.userEntries(user);
            const identity = keys.length === 0 ? null : await this.identity(user);
            return identity ? { keys, identity } : { keys };
        }

        const keys = new Set<string>();
        for (const label of [...new Set(labels.filter((l): l is string => typeof l === 'string'))].slice(0, MAX_LABELS)) {
            if (!(await this.mayHave(label, user))) continue;
            keys.add(await this.keys.entry(label));
            const newest = await this.newest(label);
            if (newest !== '' && (await this.mayHave(newest, user))) keys.add(await this.keys.entry(newest));
        }

        return { keys: [...keys] };
    }

    /** Whether this user may have the key a label names, as WordPress's may_have() decides. */
    async mayHave(label: string, user: UserId | null): Promise<boolean> {
        if (!validLabel(label) || !(await this.userHasKeys(user))) return false;

        const at = label.indexOf(':');
        const kind = label.slice(0, at);
        const rest = label.slice(at + 1);

        if (kind === 'd') return known(user) && /^\d{1,9}$/.test(rest) && Number(rest) <= dayOf() + 1;

        if (kind === 'u') return known(user) && rest === (await this.keys.userLabel(user)).slice(2);

        if (kind === 'ch') {
            const match = /^(.+):(\d{1,9})$/.exec(rest);
            if (!match || !validRoom(match[1])) return false;
            const found = this.rules.match(match[1]);
            if (!found || !found.value.options.seal) return false;
            const generation = Number(match[2]);
            return generation >= 1 && generation <= (await this.keys.roomGeneration(match[1])) && (await this.mayJoin(match[1], user));
        }

        const own = this.kinds.get(kind);
        return own !== undefined && (await own[0](rest, user, label)) === true;
    }

    /** Whether a user may join a room, as the auth route decides it. */
    async mayJoin(room: string, user: UserId | null): Promise<boolean> {
        if (!validRoom(room)) return false;
        const found = this.rules.match(room);
        if (!found) return false;
        if (found.value.options.presence && !known(user)) return false;
        return (await this.answerFor(found.value, found.params, room, user)) !== null;
    }

    /**
     * Who a user is for the realtime server, and their entry in the app's directory, signed as a room token is: their
     * online status, what the app's server sends them, and the directory. Null for nobody, a user without a profile, or
     * one cut off from the keys.
     */
    async identity(user: UserId | null): Promise<Identity | null> {
        if (!known(user) || !(await this.userHasKeys(user))) return null;

        const plain = await this.profileOf(user);
        if (!plain) return null;

        const { pd, pdh } = await this.keys.profile(user, plain);
        const now = nowS();
        const exp = now + clamp(this.options.tokenTtl ?? TOKEN_TTL, 60, MAX_TTL);
        const hid = this.options.hidden ? (await this.options.hidden(user)) === true : false;

        return { token: await jwt({ iss: this.site, aud: IDENTITY_AUDIENCE, iat: now, exp, sub: String(user), pd, pdh, ...(hid ? { hid: true } : {}) }, await this.tokenKeyOf()), exp };
    }

    /** Moves a room's key on, when someone lost access to it; needs `generations`. */
    rotateRoom(room: string): Promise<void> {
        return this.keys.rotateRoom(room);
    }

    /** Moves a user's own key on, when their access is revoked; needs `generations`. */
    rotateUser(user: UserId): Promise<void> {
        return this.keys.rotateUser(user);
    }

    /**
     * The browser's settings for a user, for connect(): where to connect, the app, its routes, its public rooms' grant,
     * and a signed-in user's keys and identity, so their page needs no request before it connects. Render it into the
     * page, or answer it from a route of the app's own.
     */
    async config(user: UserId | null = null): Promise<BrowserConfig> {
        const headers = { ...(this.options.headers ?? {}) };
        const entries = await this.userEntries(user);
        const identity = entries.length > 0 ? await this.identity(user) : null;
        const grants = await this.publicGrants();

        return {
            server: (this.options.server ?? SERVER).replace(/\/+$/, ''),
            path: PATH,
            site: this.site,
            api: (this.options.api ?? API_SERVER).replace(/\/+$/, ''),
            ...(this.options.worker ? { worker: this.options.worker } : this.options.files === false ? {} : { worker: this.fileAt('realtime-worker.js') }),
            ...(this.options.rooms ? { rooms: this.options.rooms } : this.options.files === false ? {} : { rooms: this.fileAt('realtime-rooms.min.js') }),
            ...(this.options.roomsWorker ? { roomsWorker: this.options.roomsWorker } : {}),
            // The call screen asks whom a user may add once a call is up, when some calls rule lists people.
            ...(this.callRules.entries().some(([, entry]) => entry.options.people) ? { screen: { add: true } } : {}),
            ...(grants.length > 0 ? { grants } : {}),
            auth: { endpoint: this.address('auth'), headers },
            calls: { endpoint: this.address('calls'), headers },
            keys: { endpoint: this.address('keys'), headers, entries, ...(identity ? { identity } : {}) },
        };
    }

    /**
     * What a page's `<head>` takes, as HTML: `window.wordplusRealtimeConfig`, the settings for the user, and an import map
     * naming `@wordplus/realtime` the client the routes serve, so a page's own module imports it with no bundler:
     * `import { connect } from '@wordplus/realtime'`. `importmap: false` leaves the map out, for a page whose bundler
     * resolves the package, or that has an import map of its own.
     */
    async head(user: UserId | null = null, options: { importmap?: boolean } = {}): Promise<string> {
        // JSON that a <script> cannot be closed or commented out by.
        const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
        const map = options.importmap !== false && this.options.files !== false ? '<script type="importmap">' + json({ imports: { '@wordplus/realtime': this.fileAt('realtime.js') } }) + '</script>\n' : '';
        return map + '<script>window.wordplusRealtimeConfig = ' + json(await this.config(user)) + ';</script>';
    }

    /**
     * Where the routes serve a browser file, in the folder of this version: `realtime.js`, `realtime-worker.js`,
     * `realtime-rooms.min.js`, `realtime-rooms-e2ee.worker.js`, `realtime-ui.min.js` or `realtime-ui-streams.min.js`.
     * For a page with no bundler: `<script type="module">import { connect } from '${ realtime.fileAt( 'realtime.js' ) }'`.
     */
    fileAt(name: string): string {
        return this.filesBase() + '/' + FILES_VERSION + '/' + name;
    }

    private filesBase(): string {
        return (this.options.base ?? '/api/realtime').replace(/\/+$/, '') + '/files';
    }

    private isFileRequest(method: string, pathname: string): boolean {
        return (method === 'GET' || method === 'HEAD') && this.options.files !== false && trimSlashes(pathname).startsWith(trimSlashes(this.filesBase()) + '/');
    }

    /**
     * A browser file, for a GET or HEAD under `{base}/files/`: null for any other request. In the folder of this
     * version it is kept for a year. With no version, as a page names it by hand, it is checked again each time. In
     * another version's folder, as a page of the release before or after asks while servers are updated, it is the
     * file of this one, kept by nobody.
     */
    async file(method: string, pathname: string, ifNoneMatch?: string | null): Promise<FileAnswer | null> {
        if (!this.isFileRequest(method, pathname)) return null;
        const base = trimSlashes(this.filesBase());
        const parts = trimSlashes(pathname).slice(base.length + 1).split('/');
        const name = parts.pop() ?? '';
        const folder = parts.length === 1 ? parts[0] : parts.length === 0 ? null : undefined;
        const load = Object.prototype.hasOwnProperty.call(FILES, name) ? FILES[name] : undefined;
        if (folder === undefined || !load) return { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: 'Not found' };

        const etag = '"' + FILES_VERSION + '"';
        const headers: Record<string, string> = {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': folder === FILES_VERSION ? 'public, max-age=31536000, immutable' : folder === null ? 'no-cache' : 'no-store',
            ETag: etag,
            'X-Content-Type-Options': 'nosniff',
        };
        if (folder === null && ifNoneMatch === etag) return { status: 304, headers, body: null };

        return { status: 200, headers, body: method === 'HEAD' ? null : (await load()).default };
    }

    /** Where a route is: its own address from `routes`, else `{base}/{name}`. */
    address(name: RouteName): string {
        const own = this.options.routes?.[name];
        if (own) return own;
        return (this.options.base ?? '/api/realtime').replace(/\/+$/, '') + '/' + name;
    }

    /**
     * The route a request's path asks for: the one at that address, else, while no route has an address of its own, the
     * path's last part, as the routes were always told apart. Null for a path that is none of them.
     */
    routeOf(pathname: string): string | null {
        const path = trimSlashes(pathname);
        for (const name of ROUTE_NAMES) if (trimSlashes(pathOf(this.address(name))) === path) return name;
        if (Object.values(this.options.routes ?? {}).some(Boolean)) return null;
        return path.split('/').pop() ?? '';
    }

    /** One of the JSON routes, `auth`, `calls` or `keys`, for a request's JSON body and its user. */
    async handle(action: string, body: unknown, user: UserId | null): Promise<RouteAnswer> {
        const params = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

        if (action === 'auth') {
            if (!Array.isArray(params.rooms)) return { status: 400, body: { code: 'bad_request', message: 'rooms must be a list of room names.' } };
            return { status: 200, body: await this.authorize(params.rooms, user) };
        }

        if (action === 'calls') return { status: 200, body: await this.authorizeCall(params, user) };

        if (action === 'keys') return { status: 200, body: await this.keysAnswer(params.labels, user) };

        return { status: 404, body: { code: 'not_found' } };
    }

    /**
     * A webhook from the realtime server, as its request came (`raw` the body as sent, `path` with its query): checked,
     * its events opened and handed to the handlers on() set. Answers 204 once every handler is done, 401 for a request
     * the realtime server didn't sign, 500 when a handler threw (the realtime server sends the batch again later).
     */
    async webhook(raw: string, headers: { get(name: string): string | null | undefined }, path: string): Promise<RouteAnswer> {
        const site = headers.get('x-wordplus-site'), timestamp = headers.get('x-wordplus-timestamp'), signature = headers.get('x-wordplus-signature');
        if (site !== this.site || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return { status: 401, body: { code: 'missing_signature' } };
        if (Math.abs(nowS() - Number(timestamp)) > WEBHOOK_WINDOW_S) return { status: 401, body: { code: 'stale_signature' } };
        const expected = hex(await hmac(await this.webhookKeyOf(), timestamp + '\nPOST\n' + path + '\n' + (await sha256Hex(raw))));
        if (!sameString(expected, signature)) return { status: 401, body: { code: 'bad_signature' } };

        let events: unknown;
        try {
            events = (JSON.parse(raw) as { events?: unknown }).events;
        } catch {
            return { status: 400, body: { code: 'bad_request' } };
        }
        if (!Array.isArray(events)) return { status: 400, body: { code: 'bad_request' } };

        try {
            for (const e of events as Array<Record<string, any>>) {
                const event = e.type === 'emit' ? { ...e, data: await this.opened(e.data) } : e;
                const handlers = this.handlers.get(e.type === 'emit' ? String(e.event) : String(e.type)) ?? [];
                for (const handler of handlers) await handler(event);
                for (const handler of this.handlers.get('*') ?? []) await handler(event);
            }
        } catch (error) {
            console.error('wordplus-realtime: a webhook handler failed', error);
            return { status: 500, body: { code: 'handler_failed' } };
        }

        return { status: 204, body: null };
    }

    /**
     * The routes as a fetch handler: POST `{base}/auth`, `{base}/calls`, `{base}/keys` and `{base}/webhook`, the action
     * from the path's last part, or each at its address from `routes` (routeOf()). Next.js
     * (`app/api/realtime/[action]/route.ts`: `export const POST = realtime.route`), Hono, Remix, SvelteKit, Bun, Deno and
     * workers take it as it is. The user comes from the `user` option.
     */
    readonly route = async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const file = await this.file(request.method, url.pathname, request.headers.get('if-none-match'));
        if (file) return new Response(file.body, { status: file.status, headers: file.headers });
        const action = this.routeOf(url.pathname);
        const answer: RouteAnswer =
            action === null
                ? { status: 404, body: { code: 'not_found' } }
                : action === 'webhook' && request.method === 'POST'
                ? await this.webhook(await request.text(), request.headers, url.pathname + url.search)
                : await this.answerRequest(request.method, request.headers.get('content-type'), action, () => request.json(), () =>
                      this.options.user ? this.options.user(request) : null,
                  );

        if (answer.status === 204) return new Response(null, { status: 204 });
        return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    };

    /**
     * The routes for Node's own servers, Express and Connect among them: `app.use( '/api/realtime', realtime.node( ( req ) =>
     * req.user?.id ) )`. With `routes`, add it once for the whole app, `app.use( realtime.node( … ) )`: it answers each
     * route at its address and hands every other request on. A body already parsed (express.json()) is taken as it is;
     * the webhook's is checked as it was sent, so mount this before express.json(), or keep the raw body as `req.rawBody`.
     */
    node(user: (req: NodeRequest) => UserId | null | undefined | Promise<UserId | null | undefined>) {
        return async (req: NodeRequest, res: NodeResponse, next?: (error?: unknown) => void): Promise<void> => {
            const path = (req.originalUrl ?? req.url ?? '').split('#')[0];
            // Only a file's request waits here: a route's body is read from the request as it comes.
            const file = this.isFileRequest(req.method ?? 'GET', path.split('?')[0]) ? await this.file(req.method ?? 'GET', path.split('?')[0], headerOf(req, 'if-none-match')) : null;
            if (file) {
                res.statusCode = file.status;
                for (const [name, value] of Object.entries(file.headers)) res.setHeader(name, value);
                res.end(file.body ?? '');
                return;
            }
            const action = this.routeOf(path.split('?')[0]);
            if (action === null && next) {
                next();
                return;
            }
            const answer: RouteAnswer =
                action === null
                    ? { status: 404, body: { code: 'not_found' } }
                    : action === 'webhook' && req.method === 'POST'
                    ? await this.webhook(await rawOf(req), { get: (name) => headerOf(req, name) }, path)
                    : await this.answerRequest(req.method ?? 'GET', headerOf(req, 'content-type'), action, () => bodyOf(req), () => user(req));

            res.statusCode = answer.status;
            res.setHeader('Cache-Control', 'no-store');
            if (answer.status === 204) {
                res.end('');
                return;
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(answer.body));
        };
    }

    /** @internal What an emit sends: each sealed room's own copy, the others together, each user's own copy; the kept ids by room. */
    async emitEvent(event: EmitEvent): Promise<Record<string, string>> {
        if (typeof event.event !== 'string' || event.event === '') throw new RealtimeError('bad_request');
        const rooms = [...new Set((Array.isArray(event.rooms) ? event.rooms : event.rooms === undefined ? [] : [event.rooms]).map(String))];
        const users = [...new Set((Array.isArray(event.users) ? event.users : event.users === undefined ? [] : [event.users]).map(String))];
        const data = packBinary(event.data === undefined ? null : event.data);
        const except = event.except ? { except: String(event.except) } : {};
        const sealing = event.seal !== false && this.sealing();

        const out: Record<string, unknown>[] = [];
        const plain: string[] = [];
        const plainHistory: Record<string, [number, number]> = {};

        for (const room of rooms) {
            if (!validRoom(room)) throw new RealtimeError('bad_room');
            const entry = this.rules.match(room)?.value;
            const history = entry?.options.history ? { [room]: [entry.options.history.last, entry.options.history.days] as [number, number] } : null;
            if (sealing && entry?.options.seal) {
                out.push({ rooms: [room], event: event.event, data: await this.keys.sealJson(data, await this.keys.roomLabel(room)), ...(history ? { history } : {}), ...except });
            } else {
                plain.push(room);
                if (history) Object.assign(plainHistory, history);
            }
        }
        if (plain.length > 0) out.push({ rooms: plain, event: event.event, data, ...(Object.keys(plainHistory).length > 0 ? { history: plainHistory } : {}), ...except });

        const plainUsers: string[] = [];
        for (const user of users) {
            const label = sealing ? await this.keys.userLabel(user) : '';
            if (label !== '') out.push({ users: [user], event: event.event, data: await this.keys.sealJson(data, label), ...except });
            else plainUsers.push(user);
        }
        if (plainUsers.length > 0) out.push({ users: plainUsers, event: event.event, data, ...except });

        const ids: Record<string, string> = {};
        if (out.length === 1) {
            Object.assign(ids, ((await this.signed('POST', '/wordplus/realtime/emit', out[0])) as { ids?: Record<string, string> }).ids ?? {});
            return ids;
        }
        for (let i = 0; i < out.length; i += BATCH) {
            const answer = (await this.signed('POST', '/wordplus/realtime/emit/batch', { events: out.slice(i, i + BATCH) })) as { ids?: Array<Record<string, string>> };
            for (const kept of Array.isArray(answer.ids) ? answer.ids : []) Object.assign(ids, kept);
        }
        return ids;
    }

    /** @internal A request to the realtime server, signed as the app. */
    async request(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
        return this.signed(method, path, body);
    }

    /** @internal Data for the pages of a user: sealed with their key when the app seals and has keys, its binary parts carried in it. */
    async sealedFor(user: string, data: unknown, seal = true): Promise<unknown> {
        const packed = packBinary(data === undefined ? null : data);
        const label = seal && this.sealing() ? await this.keys.userLabel(user) : '';
        return label !== '' ? await this.keys.sealJson(packed, label) : packed;
    }

    /** @internal An event's data as the app's server sees it: opened when it sealed it, its binary parts as bytes. */
    async opened(data: unknown): Promise<unknown> {
        if (typeof data !== 'string') return unpackBinary(data);
        const plain = await this.keys.open(data);
        if (plain === null) return data;
        try {
            return unpackBinary(JSON.parse(plain));
        } catch {
            return data;
        }
    }

    private async answerRequest(
        method: string,
        contentType: string | null | undefined,
        action: string,
        body: () => Promise<unknown>,
        user: () => UserId | null | undefined | Promise<UserId | null | undefined>,
    ): Promise<RouteAnswer> {
        if (method !== 'POST') return { status: 405, body: { code: 'method_not_allowed' } };
        // JSON only: a page on another site can't send that without asking first, which it is never allowed.
        if (!(contentType ?? '').toLowerCase().includes('application/json')) return { status: 415, body: { code: 'bad_request', message: 'Send JSON.' } };

        let parsed: unknown;
        try {
            parsed = await body();
        } catch {
            return { status: 400, body: { code: 'bad_request', message: 'The body is not JSON.' } };
        }

        const who = (await user()) ?? null;

        return this.handle(action, parsed, known(who) ? who : null);
    }

    private async answerFor(entry: RoomEntry, params: Record<string, string>, room: string, user: UserId | null): Promise<{ info?: unknown; emit?: string[] | '*'; readOnly?: boolean } | null> {
        if (entry.rule === null) return entry.options.public ? {} : null;
        const answer = await entry.rule(user, params, room);
        if (answer === false || answer === null || answer === undefined) return null;
        if (typeof answer !== 'object') return {};
        const out: { info?: unknown; emit?: string[] | '*'; readOnly?: boolean } = {};
        if ('info' in answer) out.info = answer.info;
        if (answer.emit === '*' || Array.isArray(answer.emit)) out.emit = answer.emit;
        if (answer.readOnly) out.readOnly = true;
        return out;
    }

    private async askCaller(user: UserId, name: string, withUser: UserId, role: CallSide['role']): Promise<{ info?: unknown; publish?: boolean; subscribe?: boolean; admin?: boolean; hidden?: boolean } | null> {
        const found = this.callRules.match(name);
        if (!found) return null;
        return callAnswer(await found.value.rule(user, withUser, found.params, name, { role }), () => this.defaultCallInfo(user));
    }

    /** A proof only this server makes about a call: `member`, a user is in it; `rung`, someone in it rang a user in. */
    private callProof(kind: 'member' | 'rung', call: string, first: string, pair: [UserId, UserId], user: UserId): Promise<string> {
        return this.keys.proof(kind + '|' + call + '|' + first + '|' + idPart(pair[0]) + '|' + idPart(pair[1]) + '|' + idPart(user));
    }

    /**
     * What a host does to someone else in the group call `name`, from its call screen: the call's rule asked again for
     * the user, who must be its host (`admin`), then the act through WordPlus Cloud: `mute` their microphone, `speak`
     * or `listen` (permit()'s `publish`), `remove`. `{ done }`, whether it changed anything.
     */
    private async moderateCall(name: unknown, act: unknown, target: unknown, me: UserId): Promise<CallGrant> {
        const user = callUser(target as UserId | null);
        if (!validRoom(name) || !MODERATION_ACTS.includes(act as string) || user === null || user === me) return { denied: 'bad_request' };
        const found = this.groupRules.match(name);
        const answer = found ? await found.value.rule(me, found.params, name) : null;
        if (!answer || typeof answer !== 'object' || !answer.admin) return { denied: 'forbidden' };

        const call = this.call(name);
        try {
            if (act === 'mute') return { done: await call.mute(user, 'microphone') };
            if (act === 'remove') return { done: await call.remove(user) };
            return { done: await call.permit(user, { publish: act === 'speak' }) };
        } catch {
            return { denied: 'server' };
        }
    }

    /**
     * Whether a user may call each person asked about (`[ { call, to } ]`), in the order asked: the rule of each call,
     * asked as for its caller, as placing it asks. A list of people asks it before offering its call buttons. At most 100.
     */
    private async mayCall(asks: unknown, me: UserId): Promise<CallGrant> {
        if (!Array.isArray(asks) || asks.length > 100) return { denied: 'bad_request' };
        const may = await Promise.all(asks.map(async (ask) => {
            const { call, to } = (ask && typeof ask === 'object' ? ask : {}) as Record<string, unknown>;
            const other = callUser(to as UserId | null);
            if (!validRoom(call) || other === null || other === me) return false;
            // The rule alone, with no info to make for a call no one places yet.
            const found = this.callRules.match(call);
            const answer = found ? await found.value.rule(me, other, found.params, call, { role: 'caller' }) : null;
            return answer !== false && answer !== null && answer !== undefined;
        }));
        return { may };
    }

    /** Whom a user may add to a call named `call`: those its rule's `people` lists whom they may call about it. At most 100. */
    private async callPeople(call: string, me: UserId): Promise<CallPerson[]> {
        const people = this.callRules.match(call)?.value.options.people;
        if (!people) return [];

        const listed = new Map<UserId, CallPerson>();
        for (const id of await people(me, call)) {
            const user = callUser(id);
            if (user === null || user === me || listed.has(user) || (await this.askCaller(me, call, user, 'caller')) === null) continue;
            const profile = await this.profileOf(user);
            if (profile) listed.set(user, { id: user, name: profile.name, avatar: typeof profile.avatar === 'string' ? profile.avatar : '' });
            if (listed.size >= 100) break;
        }
        return [...listed.values()];
    }

    private async profileOf(user: UserId): Promise<Profile | null> {
        const profile = this.options.profile ? await this.options.profile(user) : null;
        return profile && typeof profile.name === 'string' && profile.name !== '' ? profile : null;
    }

    /** A member's info by default: their name and picture. */
    private async defaultInfo(user: UserId | null): Promise<unknown> {
        if (!known(user)) return null;
        const profile = await this.profileOf(user);
        if (!profile) return null;
        return profile.avatar ? { name: profile.name, avatar: profile.avatar } : { name: profile.name };
    }

    /** What the others' screens show of a user in a call by default: their name and picture. */
    private async defaultCallInfo(user: UserId): Promise<unknown> {
        return this.defaultInfo(user);
    }

    private async userHasKeys(user: UserId | null): Promise<boolean> {
        if (!known(user)) return true;
        return this.options.hasKeys ? (await this.options.hasKeys(user)) !== false : true;
    }

    private async userEntries(user: UserId | null): Promise<string[]> {
        if (!known(user) || !(await this.userHasKeys(user))) return [];
        return this.keys.userEntries(user);
    }

    private async newest(label: string): Promise<string> {
        const at = label.indexOf(':');
        const kind = label.slice(0, at);
        const rest = label.slice(at + 1);
        let newest = '';

        if (kind === 'ch') {
            const match = /^(.+):\d{1,9}$/.exec(rest);
            if (match) newest = await this.keys.roomLabel(match[1]);
        } else {
            const own = this.kinds.get(kind);
            if (own?.[1]) newest = String(await own[1](rest, label));
        }

        return validLabel(newest) && newest !== label && newest.startsWith(kind + ':') ? newest : '';
    }

    private sealing(): boolean {
        return this.options.seal !== false;
    }

    /**
     * Easy Stream's grant for a live stream, as its rule answers for this user: their role, name and picture, chat and
     * what they may send, with the stream's settings. Denied `bad_request` for a name that isn't a stream's, `forbidden`
     * where the rule says no, `no_user` where it gives a visitor more than a viewer's place.
     */
    private async authorizeStream(name: unknown, user: UserId | null): Promise<CallGrant> {
        if (typeof name !== 'string' || !STREAM_NAME.test(name)) return { denied: 'bad_request' };
        const found = this.streamRules.match(name);
        if (!found) return { denied: 'forbidden' };

        const signedIn = known(user);
        const raw = await found.value.rule(signedIn ? user : null, found.params, name);
        const answer = typeof raw === 'string' ? { role: raw } : raw;
        if (!answer || !STREAM_ROLES.includes(answer.role)) return { denied: 'forbidden' };

        const sub = signedIn ? String(user) : undefined;
        if (sub === undefined ? answer.role !== 'viewer' : !STREAM_USER.test(sub)) return { denied: 'no_user' };

        const info = ((answer as { info?: unknown }).info ?? (await this.defaultInfo(user))) as { name?: unknown; avatar?: unknown } | null;
        const named = typeof info?.name === 'string' && info.name !== '' ? info.name.slice(0, 64) : undefined;
        const avatar = typeof info?.avatar === 'string' && info.avatar.length <= 512 && info.avatar.startsWith('https://') ? info.avatar : undefined;

        const settings = found.value.settings;
        const setting = <T>(value: StreamSetting<T> | undefined): T | undefined => (typeof value === 'function' ? (value as (p: Record<string, string>) => T)(found.params) : value);
        const chat = setting(settings.chat) ?? {};
        const now = nowS();
        const exp = now + STREAM_TTL;

        const claims: Record<string, unknown> = {
            iss: this.site, aud: GRANT_AUDIENCE, str: name, role: answer.role, sub, name: named, avatar,
            chat: (answer as { chat?: string }).chat, mod: (answer as { mod?: boolean }).mod, src: (answer as { src?: string[] }).src,
            q: (answer as { quality?: string }).quality,
            stage: setting(settings.stage), offline: chat.offline, links: chat.links, fresh: chat.fresh,
            people: setting(settings.people), reactions: setting(settings.reactions), iat: now, exp,
        };
        return { token: await streamGrant(claims, await this.streamKeyOf()), exp };
    }

    private streamKeyOf(): Promise<Uint8Array> {
        return (this.streamKey ??= hmac(this.secret, GRANT_KEY_LABEL));
    }

    private async signCalls(claims: Record<string, unknown>): Promise<CallGrant> {
        const now = nowS();
        const exp = now + clamp(this.options.callTokenTtl ?? CALL_TTL, 60, CALL_TTL);
        return { token: await jwt({ iss: this.site, iat: now, exp, ...claims }, await this.callsKeyOf()), exp };
    }

    /** A call's or a group call's info, sealed with the day's key: everyone the app knows opens it. */
    private async sealedCallInfo(info: unknown): Promise<unknown> {
        if (info === null || info === undefined || !this.sealing()) return info ?? null;
        return (await this.keys.sealJson(info, this.keys.dayLabel())) ?? info;
    }

    /**
     * A request to the realtime server, signed as the app: an HMAC-SHA256 over
     * "{timestamp}\n{METHOD}\n{path with query}\n{sha256 of the body}", with the publish key derived from its secret.
     */
    private async signed(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
        const url = new URL(path.replace(/^\//, ''), (this.options.api ?? API_SERVER).replace(/\/?$/, '/'));
        const json = body === undefined ? '' : JSON.stringify(body);
        const timestamp = String(nowS());
        const signature = hex(await hmac(await this.publishKeyOf(), timestamp + '\n' + method + '\n' + url.pathname + url.search + '\n' + (await sha256Hex(json))));

        let res: Response;
        try {
            res = await (this.options.fetch ?? fetch)(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-WordPlus-Site': this.site,
                    'X-WordPlus-Timestamp': timestamp,
                    'X-WordPlus-Signature': signature,
                },
                ...(body === undefined ? {} : { body: json }),
            });
        } catch {
            throw new RealtimeError('unreachable');
        }

        const answer = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (res.status !== 200 || !answer?.ok) throw new RealtimeError(answer?.error ? String(answer.error) : 'http_' + res.status, res.status);

        return answer;
    }

    private tokenKeyOf(): Promise<Uint8Array> {
        return (this.tokenKey ??= hmac(this.secret, TOKEN_LABEL));
    }

    private callsKeyOf(): Promise<Uint8Array> {
        return (this.callsKey ??= hmac(this.secret, CALLS_LABEL));
    }

    private publishKeyOf(): Promise<Uint8Array> {
        return (this.publishKey ??= hmac(this.secret, PUBLISH_LABEL));
    }

    private webhookKeyOf(): Promise<Uint8Array> {
        return (this.webhookKey ??= hmac(this.secret, WEBHOOK_LABEL));
    }
}

/** Where an emit goes: rooms and users, and a tab that doesn't get it back. `emit()` sends it. */
export class Emitter {
    private readonly rooms = new Set<string>();
    private readonly users = new Set<string>();
    private skip: string | undefined;

    constructor(private readonly realtime: Realtime) {}

    to(rooms: string | string[]): this {
        for (const room of Array.isArray(rooms) ? rooms : [rooms]) this.rooms.add(String(room));
        return this;
    }

    toUser(users: UserId | UserId[]): this {
        for (const user of Array.isArray(users) ? users : [users]) if (known(user)) this.users.add(String(user));
        return this;
    }

    /** The tab whose action made the event (the browser's `rt.tab`, sent as X-Realtime-Tab), which doesn't get it back. */
    except(tab: string | null | undefined): this {
        if (tab) this.skip = String(tab);
        return this;
    }

    /**
     * Sends the event: a sealed room's data sealed with its key, a user's with theirs, kept where a room's rule keeps
     * history. The kept events' ids, by room. Throws RealtimeError with the server's reason.
     */
    emit(event: string, data?: unknown, options: EmitOptions = {}): Promise<Record<string, string>> {
        return this.realtime.emitEvent({ rooms: [...this.rooms], users: [...this.users], event, data, ...(this.skip ? { except: this.skip } : {}), ...options });
    }
}

/** A room as the realtime server holds it. */
export class RoomQueries {
    constructor(
        private readonly realtime: Realtime,
        readonly room: string,
    ) {}

    /** How many are in it: a presence room's members, else its connections. */
    async count(): Promise<number> {
        return (await this.realtime.request('GET', '/wordplus/realtime/rooms/' + encodeURIComponent(this.room))).count;
    }

    /** A presence room's members, their info opened: the first 1,000, the count, and `next` to page on. */
    async members(): Promise<{ count: number; list: Array<{ id: string; info: unknown }>; next?: string }> {
        const answer = await this.realtime.request('GET', '/wordplus/realtime/rooms/' + encodeURIComponent(this.room) + '?members=1');
        const members = answer.members ?? { count: 0, list: [] };
        return { ...members, list: await Promise.all((members.list ?? []).map(async (m: any) => ({ id: String(m.id), info: await this.realtime.opened(m.info) }))) };
    }

    /** A page of the room's history, opened, oldest first: the newest `limit` (50), or those before or after an event's id. */
    async history(ask: { before?: string; after?: string; limit?: number; days?: number } = {}): Promise<{ events: KeptEvent[]; more: boolean }> {
        const query = new URLSearchParams(Object.entries(ask).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
        const answer = await this.realtime.request('GET', '/wordplus/realtime/rooms/' + encodeURIComponent(this.room) + '/history' + (query.size ? '?' + query : ''));
        return {
            events: await Promise.all((answer.events ?? []).map(async (e: any) => ({ id: e.id, at: e.at, event: e.event, data: await this.realtime.opened(e.data), ...(e.from !== undefined ? { from: String(e.from) } : {}) }))),
            more: !!answer.more,
        };
    }

    /** Erases the room's history: one event by its id, or all of it. How many were erased. */
    async forget(id?: string): Promise<number> {
        return (await this.realtime.request('DELETE', '/wordplus/realtime/rooms/' + encodeURIComponent(this.room) + '/history' + (id ? '?id=' + encodeURIComponent(id) : ''))).deleted;
    }

    /** Takes a user out of the room at once, refuses their tokens signed before, and moves the room's key on when keys have generations. */
    async kick(user: UserId): Promise<void> {
        await this.realtime.request('POST', '/wordplus/realtime/rooms/' + encodeURIComponent(this.room) + '/kick', { user: String(user) });
        await this.realtime.rotateRoom(this.room).catch(() => {});
    }
}

/** Who is online across the app, from the realtime server. */
export class OnlineQueries {
    constructor(private readonly realtime: Realtime) {}

    /** Each user's status: online, or offline since when they were last seen. */
    async states(users: UserId[]): Promise<Array<{ id: string; online: boolean; at?: number }>> {
        if (users.length === 0) return [];
        return (await this.realtime.request('GET', '/wordplus/realtime/online?ids=' + users.map((u) => encodeURIComponent(String(u))).join(','))).online;
    }

    async has(user: UserId): Promise<boolean> {
        return (await this.states([user]))[0]?.online ?? false;
    }

    async count(): Promise<number> {
        return (await this.realtime.request('GET', '/wordplus/realtime/online?limit=1')).count;
    }

    /** A page of who is online: their ids, and the cursor of the next page ('0' after the last). */
    async list(page: { cursor?: string; limit?: number } = {}): Promise<{ ids: string[]; next: string }> {
        const answer = await this.realtime.request('GET', '/wordplus/realtime/online?cursor=' + encodeURIComponent(page.cursor ?? '0') + '&limit=' + (page.limit ?? 1000));
        return { ids: answer.ids ?? [], next: String(answer.next ?? '0') };
    }
}

/** A query string of the values given: `?a=1&b=x`, or nothing. */
function queryOf(values: Record<string, string | number | boolean | undefined>): string {
    const query = new URLSearchParams(Object.entries(values).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return query.size ? '?' + query : '';
}

/** A user as the realtime server knows them. */
export class UserQueries {
    private readonly path: string;

    constructor(
        private readonly realtime: Realtime,
        readonly id: string,
    ) {
        this.path = '/wordplus/realtime/users/' + encodeURIComponent(id);
    }

    /** Online, or offline since `at`, and how many connections vouched for them are open. */
    async get(): Promise<UserState> {
        return (await this.realtime.request('GET', this.path)).user;
    }

    /**
     * Takes the user out of everything at once: every room, their identity, their lines, group calls and live streams
     * (a host stays). Their pages then ask your routes again, and the tokens signed before are refused, so your rules
     * decide whether they come back: a user you signed out or blocked does not.
     */
    async disconnect(): Promise<void> {
        await this.realtime.request('POST', this.path + '/disconnect');
    }

    /**
     * Asks the pages of the user and waits for their replies: the first by default, every reply within `timeout` (ms, 1,000 to
     * 60,000, 10,000 by default) with `all`. A page answers with `rt.answer( event, handler )` in the browser. `data` is
     * sealed with the key of the user unless `seal` is false, and the replies are opened. No page answering is `[]`.
     */
    async ask(event: string, data?: unknown, options: { timeout?: number; all?: boolean; seal?: boolean } = {}): Promise<AskReply[]> {
        const body = { event, data: await this.realtime.sealedFor(this.id, data, options.seal !== false), ...(options.timeout ? { timeout: options.timeout } : {}), ...(options.all ? { all: true } : {}) };
        const answer = await this.realtime.request('POST', this.path + '/ask', body);
        return Promise.all((answer.replies ?? []).map(async (r: any) => ({ data: await this.realtime.opened(r.data), at: r.at })));
    }
}

/** The webhook of the app as the realtime server sends it. */
export class WebhookQueries {
    constructor(private readonly realtime: Realtime) {}

    /** The last 100 tries of the last three days, the newest first. */
    async deliveries(): Promise<WebhookDelivery[]> {
        return (await this.realtime.request('GET', '/wordplus/realtime/webhooks')).deliveries ?? [];
    }

    /** A batch your server did not take, sent again now (`resendable` in its delivery). Throws `not_found` once it is gone. */
    async resend(id: string): Promise<WebhookOutcome> {
        const answer = await this.realtime.request('POST', '/wordplus/realtime/webhooks/' + encodeURIComponent(id) + '/resend');
        return { delivered: answer.delivered, status: answer.status, ...(answer.error ? { error: answer.error } : {}) };
    }

    /** One `webhook.test` event sent now, to see your webhook take it. Throws `no_webhook` for an app without one. */
    async test(): Promise<WebhookOutcome> {
        const answer = await this.realtime.request('POST', '/wordplus/realtime/webhooks/test');
        return { delivered: answer.delivered, status: answer.status, ...(answer.error ? { error: answer.error } : {}) };
    }
}

/** A group call as the media server holds it. */
export class CallQueries {
    private readonly path: string;

    constructor(
        private readonly realtime: Realtime,
        readonly name: string,
    ) {
        this.path = '/wordplus/realtime/calls/' + encodeURIComponent(name);
    }

    /** Its people and what each sends now. With nobody in it, `people` is 0, `started_at` null and `list` empty. */
    async get(): Promise<CallNow> {
        return (await this.realtime.request('GET', this.path)).call;
    }

    /** Turns the microphone, camera or screen of someone off. They may turn it on again. Whether it was on. */
    async mute(user: UserId, track: 'microphone' | 'camera' | 'screen'): Promise<boolean> {
        return (await this.realtime.request('POST', this.path + '/mute', { user: String(user), track })).muted;
    }

    /** Takes someone out now. Their tokens signed before do not take them back in. Whether they were in it. */
    async remove(user: UserId): Promise<boolean> {
        return (await this.realtime.request('POST', this.path + '/remove', { user: String(user) })).removed;
    }

    /**
     * Changes what someone may do while it runs: `publish` to make a listener a speaker or a speaker a listener again,
     * which stops what they send, `subscribe` to stop or start getting the others. At once for them when they are in it,
     * and their page hears `permissions`. Their tokens signed before follow it too. Your rule decides every join after,
     * so keep it there as well. Whether they were in it.
     */
    async permit(user: UserId, can: { publish?: boolean; subscribe?: boolean }): Promise<boolean> {
        return (await this.realtime.request('POST', this.path + '/permit', { user: String(user), ...can })).changed;
    }

    /** Ends it for everyone. Tokens signed before do not open it again. */
    async end(): Promise<void> {
        await this.realtime.request('POST', this.path + '/end');
    }
}

/** A live stream, and what its moderators do, from the server of the app. */
export class StreamQueries {
    private readonly path: string;

    constructor(
        private readonly realtime: Realtime,
        readonly name: string,
    ) {
        this.path = '/wordplus/realtime/streams/' + encodeURIComponent(name);
    }

    /** Its state, how many watch now, its peak, slow mode, reactions and the pinned message. */
    async get(): Promise<StreamNow> {
        return (await this.realtime.request('GET', this.path)).stream;
    }

    /** The signed-in people watching or on it, and how many watch in all, visitors included. */
    async people(): Promise<{ watching: number; people: StreamPerson[] }> {
        const answer = await this.realtime.request('GET', this.path + '/people');
        return { watching: answer.watching, people: answer.people ?? [] };
    }

    /** The last messages of the chat, oldest first: 50, or `limit` up to 200. */
    async chat(page: { limit?: number } = {}): Promise<StreamMessage[]> {
        return (await this.realtime.request('GET', this.path + '/chat' + queryOf(page))).messages ?? [];
    }

    /** A message from your app in the chat, shown as a host message: its name and an https picture of your own. */
    async say(text: string, from: { name: string; avatar?: string }): Promise<StreamMessage> {
        return (await this.realtime.request('POST', this.path + '/chat', { text, name: from.name, ...(from.avatar ? { avatar: from.avatar } : {}) })).message;
    }

    /** Deletes a message for everyone. Whether it was there. */
    async deleteMessage(id: string): Promise<boolean> {
        return (await this.realtime.request('DELETE', this.path + '/chat/' + encodeURIComponent(id))).deleted;
    }

    /** Empties the chat for everyone, the pinned message too. */
    async clearChat(): Promise<void> {
        await this.realtime.request('DELETE', this.path + '/chat');
    }

    /** Pins a message over the chat, or none (`null`). Throws `not_found` for a message no longer there. */
    async pin(id: string | null): Promise<void> {
        await this.realtime.request('POST', this.path + '/pin', { id });
    }

    /** Slow mode: one message every `seconds` (up to 300) for everyone but its hosts and moderators, 0 turns it off. */
    async slow(seconds: number): Promise<void> {
        await this.realtime.request('POST', this.path + '/slow', { seconds });
    }

    /** Someone may not write until the end of `seconds` (60 to 86,400), and goes on watching. When it ends. */
    async timeout(user: UserId, seconds: number): Promise<number> {
        return (await this.realtime.request('POST', this.path + '/timeout', { user: String(user), seconds })).until;
    }

    /** Lifts a timeout. Whether there was one. */
    async untimeout(user: UserId): Promise<boolean> {
        return (await this.realtime.request('POST', this.path + '/untimeout', { user: String(user) })).lifted;
    }

    /** Out of the stream now, free to come back. Throws `host` for a host. */
    async kick(user: UserId): Promise<void> {
        await this.realtime.request('POST', this.path + '/kick', { user: String(user) });
    }

    /** Out of the stream until it is lifted. Throws `host` for a host. */
    async ban(user: UserId): Promise<void> {
        await this.realtime.request('POST', this.path + '/ban', { user: String(user) });
    }

    /** Lifts a ban. Whether there was one. */
    async unban(user: UserId): Promise<boolean> {
        return (await this.realtime.request('POST', this.path + '/unban', { user: String(user) })).lifted;
    }

    /** Everyone banned, the latest first. */
    async bans(): Promise<Array<{ user: string | null; name: string; avatar: string | null; at: number | null }>> {
        return (await this.realtime.request('GET', this.path + '/bans')).bans ?? [];
    }

    /** Turns reactions on or off for everyone watching. */
    async reactions(on: boolean): Promise<void> {
        await this.realtime.request('POST', this.path + '/reactions', { on });
    }

    /** Ends it, as End does for its host. */
    async end(): Promise<{ name: string; state: string; started_at: number | null; ended_at: number | null }> {
        return (await this.realtime.request('POST', this.path + '/end')).stream;
    }
}

/** The parts of Node's request and response the node() routes use. */
export interface NodeRequest {
    method?: string;
    url?: string;
    originalUrl?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    rawBody?: unknown;
    on?(event: 'data' | 'end' | 'error', listener: (chunk?: unknown) => void): unknown;
}

export interface NodeResponse {
    statusCode: number;
    setHeader(name: string, value: string): unknown;
    end(body: string): unknown;
}

const nowS = () => Math.floor(Date.now() / 1000);

/** A path without the slashes it ends with. */
const trimSlashes = (path: string) => path.replace(/\/+$/, '');

/** An address's path: itself, or a full address's path part. */
function pathOf(address: string): string {
    if (!/^https?:\/\//i.test(address)) return address.split(/[?#]/)[0];
    try {
        return new URL(address).pathname;
    } catch {
        return address;
    }
}

/** A live stream's name: a room's (patterns.ts) without an underscore, as the cloud takes it in a grant's `str`. */
const STREAM_NAME = /^[A-Za-z0-9\-=@,.;:]{1,128}$/;
const STREAM_USER = /^[\w.@-]{1,64}$/;
const STREAM_ROLES = ['host', 'guest', 'viewer'];
/** A stream's grant lives ten minutes, as Easy Stream's do; the page asks for another as one runs out. */
const STREAM_TTL = 600;

/**
 * Easy Stream's grant: an HS256 JWT keyed with HMAC(secret, "easy-stream grant v1"), its claims in the protocol's order
 * (CLAIM_ORDER) and none left undefined, so every language signs the same claims to the same token
 * (spec/stream-grants.json, Easy Stream's own vectors).
 */
export async function streamGrant(claims: Record<string, unknown>, key: Uint8Array): Promise<string> {
    const ordered: Record<string, unknown> = {};
    for (const name of CLAIM_ORDER) if (claims[name] !== undefined) ordered[name] = claims[name];
    return jwt(ordered, key);
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));

/** A user the app knows: any id but null, undefined, '' and 0. */
const known = (user: UserId | null | undefined): user is UserId => user !== null && user !== undefined && user !== '' && user !== 0;

/**
 * A user as the realtime server's calls take them (its inc/calls/p2p/users.ts): a number for an id of digits, else the id of
 * text the app gives, up to 64 characters with no space or control character. 0 is nobody.
 */
function callUser(user: unknown): UserId | null {
    if (typeof user === 'number') return Number.isSafeInteger(user) && user !== 0 ? user : null;
    if (typeof user !== 'string' || !/^[^\s\u0000-\u001f\u007f]{1,64}$/.test(user)) return null;
    if (/^-?[1-9][0-9]*$/.test(user) && Number.isSafeInteger(Number(user))) return Number(user);
    return user === '0' ? null : user;
}

/**
 * A user in what this server joins with `|` to make a key or a proof: a number as its digits, as always, and an id of
 * text with its `%` and `|` escaped, so no two pairs of people make the same string. The PHP and Python packages do the same.
 */
const idPart = (user: UserId): string => (typeof user === 'number' ? String(user) : user.replace(/%/g, '%25').replace(/\|/g, '%7C'));

/** A calls rule's answer, with the user's info by default; null for no. */
async function callAnswer(answer: CallAnswer, defaultInfo: () => Promise<unknown>): Promise<{ info?: unknown; publish?: boolean; subscribe?: boolean; admin?: boolean; hidden?: boolean } | null> {
    if (answer === false || answer === null || answer === undefined) return null;
    const out = typeof answer === 'object' ? { ...answer } : {};
    if (!('info' in out)) out.info = await defaultInfo();
    return out;
}

/** A room's options as its rule gave them, with their defaults and the cloud's limits. */
function normalized(options: RoomOptions): RoomEntry['options'] {
    let history: { last: number; days: number } | null = null;
    if (typeof options.history === 'number' && options.history > 0) history = { last: Math.min(Math.floor(options.history), MAX_HISTORY), days: MAX_HISTORY_DAYS };
    else if (options.history && typeof options.history === 'object' && options.history.last > 0) {
        history = { last: Math.min(Math.floor(options.history.last), MAX_HISTORY), days: Math.min(options.history.days ?? MAX_HISTORY_DAYS, MAX_HISTORY_DAYS) };
    }
    const names = (list: unknown): string[] | '*' => (list === '*' ? '*' : Array.isArray(list) ? list.map(String) : []);
    return {
        presence: !!options.presence,
        count: !!options.count || !!options.presence,
        public: !!options.public,
        seal: options.seal ?? !options.public,
        history,
        emit: names(options.emit),
        webhook: names(options.webhook),
    };
}

/** A room's options as a token carries them: `p`, `c`, `h`, `e`, `w`, `ro`, only those set. */
function short(options: RoomEntry['options'], readOnly: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (options.presence) out.p = 1;
    if (options.count && !options.presence) out.c = 1;
    if (options.history) out.h = [options.history.last, options.history.days];
    if (options.emit === '*' || options.emit.length > 0) out.e = options.emit;
    if (options.webhook === '*' || options.webhook.length > 0) out.w = options.webhook;
    if (readOnly) out.ro = 1;
    return out;
}

/** Binary parts of an event as `{ $b: base64 }`, as the browser's client carries them in JSON. */
function packBinary(value: unknown, depth = 0): unknown {
    if (value instanceof ArrayBuffer) return { $b: toBase64(new Uint8Array(value)) };
    if (ArrayBuffer.isView(value)) return { $b: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    if (depth > 16 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => packBinary(item, depth + 1));
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, packBinary(item, depth + 1)]));
}

function unpackBinary(value: unknown, depth = 0): unknown {
    if (depth > 16 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => unpackBinary(item, depth + 1));
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0][0] === '$b' && typeof entries[0][1] === 'string') return unbase64url(entries[0][1].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')) ?? value;
    return Object.fromEntries(entries.map(([key, item]) => [key, unpackBinary(item, depth + 1)]));
}

function toBase64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/** An attempt at a call, as a page names it. */
const validAttempt = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);

/** A call's two people as a page names them: two different users, or null. */
function pairOf(pair: unknown): [UserId, UserId] | null {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const [a, b] = pair.map(callUser);
    return a !== null && b !== null && a !== b ? [a, b] : null;
}

/** Two strings compared in the same time whatever their difference, for a proof against the one this server makes. */
function sameString(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function headerOf(req: NodeRequest, name: string): string | undefined {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}

function bodyOf(req: NodeRequest): Promise<unknown> {
    if (req.body !== undefined) return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    return rawOf(req).then((raw) => JSON.parse(raw || 'null'));
}

/** A request's body as it was sent: `rawBody` when a parser kept it, the stream when nothing read it, else the parsed body again. */
function rawOf(req: NodeRequest): Promise<string> {
    if (typeof req.rawBody === 'string') return Promise.resolve(req.rawBody);
    if (req.rawBody instanceof Uint8Array) return Promise.resolve(text(req.rawBody));
    if (req.body !== undefined) return Promise.resolve(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    return new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        req.on?.('data', (chunk) => {
            const piece = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : (chunk as Uint8Array);
            chunks.push(piece);
            size += piece.length;
            if (size > 2_000_000) reject(new Error('too_large'));
        });
        req.on?.('end', () => {
            const all = new Uint8Array(size);
            let at = 0;
            for (const piece of chunks) {
                all.set(piece, at);
                at += piece.length;
            }
            resolve(text(all));
        });
        req.on?.('error', reject);
    });
}
