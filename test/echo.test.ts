import { describe, expect, it, vi } from 'vitest';
import Echo from 'laravel-echo';
import { WordplusConnector } from '../src/echo.js';

// Laravel Echo itself, on the connector: what a Laravel page, Livewire and @laravel/echo-react call, on rooms. The
// connection is a stand-in holding the rooms; the rooms on WordPlus Cloud run in test/e2e.

type Fn = (...args: any[]) => void;

/** A room as @wordplus/realtime has one: its listeners, what it sent, its members. */
function fakeRoom(name: string) {
    const listeners = new Map<string, Fn[]>();
    const room = {
        name,
        state: 'joining',
        members: new Map<string, unknown>(),
        sent: [] as Array<[string, unknown]>,
        on(event: string, fn: Fn) { listeners.set(event, [...(listeners.get(event) ?? []), fn]); return room; },
        off(event: string, fn: Fn) { listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== fn)); return room; },
        volatile: { emit: (event: string, data: unknown) => room.sent.push([event, data]) },
        fire(event: string, ...args: unknown[]) { for (const fn of listeners.get(event) ?? []) fn(...args); },
        count(event: string) { return (listeners.get(event) ?? []).length; },
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
});
