import { describe, expect, it, vi } from 'vitest';
import Echo from 'laravel-echo';
import { WordplusConnector } from '../src/echo.js';

// Laravel Echo itself, on the connector: what a Laravel page, Livewire and @laravel/echo-react call, on rooms. The
// connection is a stand-in holding the rooms; the rooms on WordPlus Cloud run in test/e2e.

type Fn = (...args: any[]) => void;

/**
 * A room as @wordplus/realtime has one: its listeners, what it sent, its members. `fire` is any event as its listeners
 * hear it, `deliver` an event of the app's, which its `onAny` listeners hear too, as the room's own (`joined`, `join`,
 * `leave`, `count`, `error`, `kicked`) never reach them.
 */
function fakeRoom(name: string) {
    const listeners = new Map<string, Fn[]>();
    let any: Fn[] = [];
    const room = {
        name,
        state: 'joining',
        members: new Map<string, unknown>(),
        sent: [] as Array<[string, unknown]>,
        on(event: string, fn: Fn) { listeners.set(event, [...(listeners.get(event) ?? []), fn]); return room; },
        off(event: string, fn: Fn) { listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== fn)); return room; },
        onAny(fn: Fn) { any.push(fn); return room; },
        offAny(fn?: Fn) { any = fn ? any.filter((f) => f !== fn) : []; return room; },
        volatile: { emit: (event: string, data: unknown) => room.sent.push([event, data]) },
        fire(event: string, ...args: unknown[]) { for (const fn of listeners.get(event) ?? []) fn(...args); },
        deliver(event: string, data: unknown, meta: unknown = {}) {
            for (const fn of [...any]) fn(event, data, meta);
            room.fire(event, data, meta);
        },
        count(event: string) { return (listeners.get(event) ?? []).length; },
        countAny() { return any.length; },
    };
    return room;
}

function fakeRealtime() {
    const rooms = new Map<string, ReturnType<typeof fakeRoom>>();
    const listeners = new Map<string, Fn[]>();
    const rt = {
        tab: 'tab-7',
        connected: true,
        left: [] as string[],
        closed: false,
        join: (name: string) => rooms.get(name) ?? (rooms.set(name, fakeRoom(name)), rooms.get(name)!),
        leave: (name: string) => { rt.left.push(name); rooms.delete(name); },
        on(event: string, fn: Fn) { listeners.set(event, [...(listeners.get(event) ?? []), fn]); return rt; },
        off(event: string, fn: Fn) { listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== fn)); return rt; },
        fire(event: string, ...args: unknown[]) { for (const fn of listeners.get(event) ?? []) fn(...args); },
        close() { rt.closed = true; },
        rooms,
    };
    return rt;
}

const echoOn = (rt: ReturnType<typeof fakeRealtime>) => new Echo({ broadcaster: WordplusConnector as any, realtime: rt } as any);
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Laravel Echo on the connector', () => {
    it('hears a private channel\'s events by the names Echo writes, and stops when asked', () => {
        const rt = fakeRealtime();
        const echo = echoOn(rt);
        const updated = vi.fn();
        const named = vi.fn();

        echo.private('orders.1042').listen('.updated', updated).listen('OrderUpdated', named);
        const room = rt.rooms.get('orders.1042')!;
        room.fire('updated', { status: 'shipped' }, { from: null });
        room.fire('App\\Events\\OrderUpdated', { id: 1042 });
        expect(updated).toHaveBeenCalledWith({ status: 'shipped' });
        expect(named).toHaveBeenCalledWith({ id: 1042 });

        echo.private('orders.1042').stopListening('.updated');
        room.fire('updated', { status: 'delivered' });
        expect(updated).toHaveBeenCalledTimes(1);
        expect(room.count('App\\Events\\OrderUpdated')).toBe(1);
    });

    it('hears every event of a channel with listenToAll, named as listen() takes them, and stops with stopListeningToAll', () => {
        // As Echo's Pusher channel does: the namespace taken off an event of it, a dot before any other, the
        // connection's own events left out, and one callback, or all of them, stopped.
        const rt = fakeRealtime();
        const echo = echoOn(rt);
        const all = vi.fn();
        const other = vi.fn();
        const present = vi.fn();

        const orders = echo.private('orders.1042') as any;
        orders.listenToAll(all).listenToAll(other);
        (echo.join('orders.1042') as any).listenToAll(present);   // the same room, under Echo's presence name
        const room = rt.rooms.get('orders.1042')!;
        room.deliver('App\\Events\\OrderUpdated', { id: 1042 }, { from: null });
        room.deliver('App\\Events\\Orders\\Shipped', { id: 1042 });
        room.deliver('updated', { status: 'shipped' }, { from: '34', at: 1 });
        room.deliver('typing', { on: true });
        room.deliver('Illuminate\\Notifications\\Events\\BroadcastNotificationCreated', { type: 'shipped' });
        room.fire('joined', []);
        room.fire('count', 3);
        expect(all.mock.calls).toEqual([
            ['OrderUpdated', { id: 1042 }],
            ['Orders\\Shipped', { id: 1042 }],
            ['.updated', { status: 'shipped' }],
            ['.typing', { on: true }],
            ['.Illuminate\\Notifications\\Events\\BroadcastNotificationCreated', { type: 'shipped' }],
        ]);

        // A name it gives is one listen() hears.
        const updated = vi.fn();
        orders.listen(all.mock.calls[2][0], updated);
        room.deliver('updated', { status: 'delivered' });
        expect(updated).toHaveBeenCalledWith({ status: 'delivered' });

        orders.stopListeningToAll(all);
        room.deliver('updated', { status: 'returned' });
        expect(all).toHaveBeenCalledTimes(6);
        expect(other).toHaveBeenCalledTimes(7);

        // All of this channel's, and the presence channel of the same room keeps its own.
        orders.stopListeningToAll();
        room.deliver('updated', { status: 'lost' });
        expect(other).toHaveBeenCalledTimes(7);
        expect(present).toHaveBeenCalledTimes(8);
        expect(room.countAny()).toBe(1);
    });

    it('gives every event with a dot before it when there is no namespace, and a namespace of its own taken off', () => {
        const rt = fakeRealtime();
        const none = vi.fn();
        (new Echo({ broadcaster: WordplusConnector as any, realtime: rt, namespace: false } as any).private('a') as any).listenToAll(none);
        rt.rooms.get('a')!.deliver('App\\Events\\OrderUpdated', 1);
        expect(none).toHaveBeenCalledWith('.App\\Events\\OrderUpdated', 1);

        const rt2 = fakeRealtime();
        const own = vi.fn();
        (new Echo({ broadcaster: WordplusConnector as any, realtime: rt2, namespace: 'Domain.Orders' } as any).private('a') as any).listenToAll(own);
        rt2.rooms.get('a')!.deliver('Domain\\Orders\\Shipped', 1);
        rt2.rooms.get('a')!.deliver('App\\Events\\OrderUpdated', 2);
        expect(own.mock.calls).toEqual([['Shipped', 1], ['.App\\Events\\OrderUpdated', 2]]);
    });

    it('whispers to the others, hears their whispers, and hears the user\'s notifications', () => {
        const rt = fakeRealtime();
        const echo = echoOn(rt);
        const typing = vi.fn();
        const notified = vi.fn();

        const chat = echo.private('chat.34.42');
        chat.listenForWhisper('typing', typing);
        (chat as any).whisper('typing', { on: true });
        expect(rt.rooms.get('chat.34.42')!.sent).toEqual([['typing', { on: true }]]);
        rt.rooms.get('chat.34.42')!.fire('typing', { on: true });
        expect(typing).toHaveBeenCalledWith({ on: true });

        echo.private('App.Models.User.42').notification(notified);
        rt.rooms.get('App.Models.User.42')!.fire('Illuminate\\Notifications\\Events\\BroadcastNotificationCreated', { type: 'shipped' });
        expect(notified).toHaveBeenCalledWith({ type: 'shipped' });
    });

    it('says who is here, who joins and who leaves a presence channel, as routes/channels.php answered for each', async () => {
        const rt = fakeRealtime();
        const echo = echoOn(rt);
        const here = vi.fn();
        const joining = vi.fn();
        const leaving = vi.fn();

        echo.join('shop').here(here).joining(joining).leaving(leaving);
        const room = rt.rooms.get('shop')!;
        room.fire('joined', [{ id: '34', info: { id: 34, name: 'Ann' } }, { id: '42', info: { id: 42, name: 'Ben' } }]);
        expect(here).toHaveBeenCalledWith([{ id: 34, name: 'Ann' }, { id: 42, name: 'Ben' }]);
        room.fire('join', { id: '43', info: { id: 43, name: 'Cara' } });
        expect(joining).toHaveBeenCalledWith({ id: 43, name: 'Cara' });
        room.fire('leave', { id: '42' });
        expect(leaving).toHaveBeenCalledWith({ id: 42, name: 'Ben' });
        await tick();

        // A channel joined already says who is here at once.
        room.state = 'joined';
        room.members.set('34', { id: 34, name: 'Ann' });
        const late = vi.fn();
        echo.join('shop').here(late);
        await tick();
        expect(late).toHaveBeenCalledWith([{ id: 34, name: 'Ann' }]);
    });

    it('says when a channel is joined or refused, leaves its room, and gives Echo the tab as its socket id', async () => {
        const rt = fakeRealtime();
        const echo = echoOn(rt);
        const subscribed = vi.fn();
        const refused = vi.fn();

        echo.channel('news').subscribed(subscribed).error(refused);
        rt.rooms.get('news')!.fire('joined', []);
        rt.rooms.get('news')!.fire('error', { code: 'forbidden' });
        expect(subscribed).toHaveBeenCalledTimes(1);
        expect(refused).toHaveBeenCalledWith({ code: 'forbidden' });

        expect(echo.socketId()).toBe('tab-7');
        expect(echo.connectionStatus()).toBe('connected');

        echo.private('orders.1');
        echo.join('orders.1');
        echo.leave('orders.1');
        expect(rt.left).toEqual(['orders.1']);   // once, for its private and presence channels together

        const states: string[] = [];
        const stop = (echo.connector as WordplusConnector).onConnectionChange((s) => states.push(s));
        rt.fire('disconnected');
        rt.fire('connected');
        stop();
        rt.fire('disconnected');
        expect(states).toEqual(['reconnecting', 'connected']);

        echo.disconnect();
        expect(rt.closed).toBe(true);
    });

    it('connects with the page settings when given no connection', () => {
        const echo = new Echo({
            broadcaster: WordplusConnector as any,
            site: 's1500000007',
            auth: { endpoint: '/wordplus/realtime/auth', headers: { 'X-CSRF-TOKEN': 't' } },
            calls: { endpoint: '/wordplus/realtime/calls', headers: {} },
            keys: { endpoint: '/wordplus/realtime/keys', headers: {}, entries: [] },
            worker: null,
        } as any);
        const rt = (echo.connector as WordplusConnector).rt;
        expect(rt.settings.auth.endpoint).toBe('/wordplus/realtime/auth');
        expect(rt.settings.site).toBe('s1500000007');
        echo.disconnect();
    });

    it('signs its requests with Echo\'s own auth headers, bearerToken and csrfToken, with connect()\'s options', () => {
        // Echo's `auth: { headers }` was taken for a server's config() and read its missing endpoint: a TypeError.
        const echo = new Echo({
            broadcaster: WordplusConnector as any,
            app: 's1500000007',
            endpoint: '/api/realtime',
            auth: { headers: { 'X-Team': '4' } },
            bearerToken: 'session-token',
            csrfToken: 'csrf-1',
            headers: { 'X-Team': '5' },
            worker: null,
        } as any);
        const rt = (echo.connector as WordplusConnector).rt;
        expect(rt.settings.auth.endpoint).toBe('/api/realtime/auth');
        expect(rt.settings.auth.headers).toEqual({ 'X-Team': '5', Authorization: 'Bearer session-token', 'X-CSRF-TOKEN': 'csrf-1' });
        expect(rt.settings.keys.headers).toEqual(rt.settings.auth.headers);
        echo.disconnect();
    });
});
