/**
 * Laravel Echo on WordPlus Cloud: the page code a Laravel app already writes, `Echo.private( 'orders.1042' ).listen(
 * '.updated', … )`, Livewire's `#[On( 'echo-private:orders.{id},.updated' )]` and `useEcho()` of @laravel/echo-react,
 * on the rooms of @wordplus/realtime, sealed as they are (an SDK review, native install item 1, 2026-10-15).
 *
 *     import Echo from 'laravel-echo';
 *     import { WordplusConnector } from '@wordplus/realtime/echo';
 *
 *     window.Echo = new Echo( { broadcaster: WordplusConnector, ...window.wordplusRealtimeConfig } );
 *
 * The settings are the page's, as @wordplusRealtime writes them, and the connector connects with them, or takes a page's
 * connection as it is: `realtime: rt`. Each channel is the room of its name, as the `wordplus` broadcaster names them:
 *
 *   - `channel( name )`, `private( name )` and `join( name )` join the room `name`, a public, private or presence channel
 *     of routes/channels.php, which decides who joins as it does for the broadcaster.
 *   - `listen( 'OrderUpdated' )` hears `App\Events\OrderUpdated` (the namespace option, App.Events by default), and
 *     `listen( '.updated' )` the event as named, as Echo has them. `notification()` hears a broadcast notification.
 *   - `whisper( 'typing', data )` sends `typing` to the others, dropped rather than queued, and `listenForWhisper(
 *     'typing' )` hears it: the room's `emit` option lists it.
 *   - `here()`, `joining()` and `leaving()` give each member as routes/channels.php answered for them.
 *   - `socketId()` is the tab, which Echo's request interceptors send as X-Socket-ID, so `toOthers()` skips it.
 */
import { connectNow, type BrowserConfig, type ConnectOptions, type Realtime } from './browser.js';

type Callback = (...args: any[]) => void;
type Room = ReturnType<Realtime['join']>;

/** What Echo calls the status of its connection. */
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'failed';

/** The options Echo hands the connector: the page's settings among Echo's own, or a connection made already. */
export interface WordplusEchoOptions extends Partial<ConnectOptions> {
    realtime?: Realtime;
    namespace?: string | false;
    [key: string]: unknown;
}

const NOTIFICATION = '.Illuminate\\Notifications\\Events\\BroadcastNotificationCreated';

/** An event name as Echo writes it, as the server names it: `.updated` as it is, `OrderUpdated` in the namespace. */
function eventName(event: string, namespace: string | false | undefined): string {
    if (event.startsWith('.') || event.startsWith('\\')) return event.slice(1);
    return (namespace ? namespace + '.' + event : event).replace(/\./g, '\\');
}

/** A channel of Echo: a room, its events and whispers. */
export class WordplusChannel {
    protected readonly room: Room;
    private readonly heard = new Map<string, Array<[Callback, Callback]>>();

    constructor(rt: Realtime, readonly name: string, protected readonly options: WordplusEchoOptions) {
        this.room = rt.join(name);
    }

    /** Hears an event: `( data ) => …`, `OrderUpdated` in the namespace, or `.updated` as it is. */
    listen(event: string, callback: Callback): this {
        const name = eventName(event, this.options.namespace);
        const heard: Callback = (data) => callback(data);
        this.heard.set(name, [...(this.heard.get(name) ?? []), [callback, heard]]);
        this.room.on(name, heard);
        return this;
    }

    /** Stops hearing an event: one callback, or all of them. */
    stopListening(event: string, callback?: Callback): this {
        const name = eventName(event, this.options.namespace);
        for (const [given, heard] of this.heard.get(name) ?? []) {
            if (!callback || given === callback) this.room.off(name, heard);
        }
        this.heard.set(name, (this.heard.get(name) ?? []).filter(([given]) => callback && given !== callback));
        return this;
    }

    /** Hears what the others whisper: the event as named. */
    listenForWhisper(event: string, callback: Callback): this {
        return this.listen('.' + event, callback);
    }

    stopListeningForWhisper(event: string, callback?: Callback): this {
        return this.stopListening('.' + event, callback);
    }

    /** Hears the user's broadcast notifications, on their channel (`App.Models.User.{id}`). */
    notification(callback: Callback): this {
        return this.listen(NOTIFICATION, callback);
    }

    stopListeningForNotification(callback: Callback): this {
        return this.stopListening(NOTIFICATION, callback);
    }

    /** Sends an event to the others in the room, dropped rather than queued while off line: its name in `emit`. */
    whisper(event: string, data: unknown): this {
        this.room.volatile.emit(event, data);
        return this;
    }

    /** Called once the room is joined, and each time it is joined again. */
    subscribed(callback: Callback): this {
        if (this.room.state === 'joined') queueMicrotask(() => callback());
        this.room.on('joined', () => callback());
        return this;
    }

    /** Called when the room refuses: `{ code }`, such as `forbidden`, or `kicked` when the server takes the user out. */
    error(callback: Callback): this {
        this.room.on('error', (e: unknown) => callback(e));
        this.room.on('kicked', (e: unknown) => callback(e));
        return this;
    }
}

/** A presence channel of Echo: a presence room, who is in it as routes/channels.php answered for each. */
export class WordplusPresenceChannel extends WordplusChannel {
    private readonly known = new Map<string, unknown>();

    constructor(rt: Realtime, name: string, options: WordplusEchoOptions) {
        super(rt, name, options);
        // Who each member is, kept for leaving(), which the room tells by id alone.
        this.room.on('joined', (members: Array<{ id: string; info: unknown }>) => {
            this.known.clear();
            for (const m of members) this.known.set(m.id, m.info);
        });
        this.room.on('join', ({ id, info }: { id: string; info: unknown }) => this.known.set(id, info));
        this.room.on('leave', ({ id }: { id: string }) => queueMicrotask(() => this.known.delete(id)));
    }

    /** The members, once joined and each time it is joined again: an array, each as routes/channels.php answered. */
    here(callback: Callback): this {
        if (this.room.state === 'joined') queueMicrotask(() => callback([...this.room.members.values()]));
        this.room.on('joined', (members: Array<{ info: unknown }>) => callback(members.map((m) => m.info)));
        return this;
    }

    /** Someone who joined, as routes/channels.php answered for them. */
    joining(callback: Callback): this {
        this.room.on('join', ({ info }: { info: unknown }) => callback(info));
        return this;
    }

    /** Someone who left, as they were when they joined. */
    leaving(callback: Callback): this {
        this.room.on('leave', ({ id }: { id: string }) => callback(this.known.get(id) ?? { id }));
        return this;
    }
}

/**
 * Echo's connector for WordPlus Cloud: `new Echo( { broadcaster: WordplusConnector, ...window.wordplusRealtimeConfig } )`,
 * or `configureEcho()` of @laravel/echo-react with the same.
 */
export class WordplusConnector {
    readonly options: WordplusEchoOptions;
    /** The channels in use, by Echo's names: `name`, `private-name`, `presence-name`. */
    channels: Record<string, WordplusChannel> = {};
    rt!: Realtime;

    constructor(options: WordplusEchoOptions) {
        this.options = { namespace: 'App.Events', ...options };
        this.connect();
    }

    connect(): void {
        this.rt = this.options.realtime ?? connectNow(this.options as unknown as ConnectOptions | BrowserConfig);
    }

    listen(name: string, event: string, callback: Callback): WordplusChannel {
        return this.channel(name).listen(event, callback);
    }

    channel(name: string): WordplusChannel {
        return (this.channels[name] ??= new WordplusChannel(this.rt, name, this.options));
    }

    privateChannel(name: string): WordplusChannel {
        return (this.channels['private-' + name] ??= new WordplusChannel(this.rt, name, this.options));
    }

    presenceChannel(name: string): WordplusPresenceChannel {
        return (this.channels['presence-' + name] ??= new WordplusPresenceChannel(this.rt, name, this.options)) as WordplusPresenceChannel;
    }

    /** Leaves the channel of the name, its private and presence ones too. */
    leave(name: string): void {
        for (const key of [name, 'private-' + name, 'presence-' + name]) this.leaveChannel(key);
    }

    leaveChannel(key: string): void {
        const channel = this.channels[key];
        if (!channel) return;
        delete this.channels[key];
        // The room stays while another of Echo's channels of the same name is in use.
        if (!Object.values(this.channels).some((other) => other.name === channel.name)) this.rt.leave(channel.name);
    }

    /** The tab, sent as X-Socket-ID by Echo's interceptors, so a broadcast `toOthers()` skips it. */
    socketId(): string | undefined {
        return this.rt.tab;
    }

    connectionStatus(): ConnectionStatus {
        return this.rt.connected ? 'connected' : 'connecting';
    }

    onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
        const connected = () => callback('connected');
        const lost = () => callback('reconnecting');
        const failed = () => callback('failed');
        this.rt.on('connected', connected).on('disconnected', lost).on('error', failed);
        return () => {
            this.rt.off('connected', connected).off('disconnected', lost).off('error', failed);
        };
    }

    disconnect(): void {
        this.rt.close();
    }
}
