import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileScript, parse as parseVue } from 'vue/compiler-sfc';
import { aCall, aConnection, aGroup, anIncoming, aRoom } from './framework-fakes.js';

// What the Vue and Svelte helpers share, with neither framework. test/vue.test.ts and test/svelte.test.ts have what each
// makes of it, and test/e2e/frameworks.mjs runs them all in new apps of each, in Chromium.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let connecting: Array<(rt: unknown) => void> = [];
let refusing: Array<(error: unknown) => void> = [];

vi.mock('../src/browser.js', () => ({
    connect: vi.fn(() => new Promise((resolve, reject) => {
        connecting.push(resolve);
        refusing.push(reject);
    })),
}));

const { callHolder, connectionKey, followCalls, followOnline, followTyping, groupHolder, hearUser, holdRoom, holdStream, idsKey, NO_CALL, NO_GROUP, NO_ROOM, NO_STREAM, openConnection, readProfiles, showStream, showTrack } = await import('../src/bindings.js');

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('openConnection', () => {
    const listener = () => ({ realtime: vi.fn(), connected: vi.fn(), error: vi.fn() });
    const opened = async () => {
        connecting = [];
        refusing = [];
        const tell = listener();
        const stop = openConnection({}, tell);
        return { tell, stop, up: async (rt: ReturnType<typeof aConnection>) => {
            connecting[0](rt);
            await settle();
        } };
    };

    it('hands over the connection once it is up, and closes it when told', async () => {
        const { tell, stop, up } = await opened();
        const rt = aConnection();
        await up(rt);

        expect(tell.realtime).toHaveBeenLastCalledWith(rt);
        stop();
        expect(rt.close).toHaveBeenCalled();
        expect(tell.realtime).toHaveBeenLastCalledWith(null);
        expect(tell.connected).toHaveBeenLastCalledWith(false);
    });

    it('closes a connection that comes up after it was told to stop, and hands over nothing', async () => {
        const { tell, stop, up } = await opened();
        stop();
        const rt = aConnection();
        await up(rt);

        expect(rt.close).toHaveBeenCalled();
        expect(tell.realtime).not.toHaveBeenCalledWith(rt);
    });

    it('says how the connection is as it changes, and why it was refused until it connects', async () => {
        const { tell, up } = await opened();
        const rt = aConnection();
        await up(rt);

        rt.fire('connected');
        expect(tell.connected).toHaveBeenLastCalledWith(true);
        rt.fire('disconnected');
        expect(tell.connected).toHaveBeenLastCalledWith(false);

        rt.fire('error', { code: 'wrong_origin' });
        expect(tell.error).toHaveBeenLastCalledWith({ code: 'wrong_origin' });
        rt.fire('connected');
        expect(tell.error).toHaveBeenLastCalledWith(null);
    });

    it('leaves out an event the page could not open, as the connection is fine', async () => {
        const { tell, up } = await opened();
        const rt = aConnection();
        await up(rt);
        tell.error.mockClear();

        rt.fire('error', { code: 'unopened', event: 'message' });

        expect(tell.error).not.toHaveBeenCalled();
    });

    it('says why it could not connect at all', async () => {
        const { tell } = await opened();
        refusing[0](Object.assign(new Error('keys_failed'), { code: 'keys_failed' }));
        await settle();

        expect((tell.error.mock.lastCall?.[0] as { code: string }).code).toBe('keys_failed');
        expect(tell.realtime).not.toHaveBeenCalled();
    });
});

describe('connectionKey', () => {
    const signed = (sub: string, pdh: string, iat: number) => ({
        site: 's1',
        auth: { endpoint: '/api/realtime/auth' },
        keys: { entries: ['entry'], identity: { token: 'h.' + btoa(JSON.stringify({ sub, pdh, iat })) + '.s', exp: iat } },
    }) as never;

    it('stays the same when the server signs the same user again, and across a new day', () => {
        const profile = 'a'.repeat(56);
        expect(connectionKey(signed('8', profile + '00004fab', 1))).toBe(connectionKey(signed('8', profile + '00004fac', 2)));
    });

    it('changes for another user, another profile and other options', () => {
        expect(connectionKey(signed('8', 'one', 1))).not.toBe(connectionKey(signed('9', 'one', 1)));
        expect(connectionKey(signed('8', 'one', 1))).not.toBe(connectionKey(signed('8', 'two', 1)));
        expect(connectionKey({ app: 'one' })).not.toBe(connectionKey({ app: 'two' }));
    });
});

describe('holdRoom', () => {
    const hold = (rt: ReturnType<typeof aConnection> | null, name: string | null, other?: number | null, handlers = {}) => {
        const tell = vi.fn();
        const stop = holdRoom(rt as never, name, other, handlers, tell);
        return { tell, stop, status: () => tell.mock.lastCall?.[0] as typeof NO_ROOM, room: () => tell.mock.lastCall?.[1] };
    };

    it('joins nothing with no connection, no name, or {pair} with its other person still empty', () => {
        const rt = aConnection();

        for (const held of [hold(null, 'chat:7'), hold(rt, null), hold(rt, 'chat:{pair}'), hold(rt, 'chat:{pair}', null)]) {
            expect(held.status()).toBe(NO_ROOM);
            expect(held.room()).toBeNull();
            held.stop();
        }
        expect(rt.join).not.toHaveBeenCalled();
        expect(rt.leave).not.toHaveBeenCalled();
    });

    it('fills {pair} as both sides do, the smaller id first', () => {
        const rt = aConnection({}, '42');
        hold(rt, 'chat:{pair}', 34);

        expect(rt.join).toHaveBeenCalledWith('chat:34:42');
    });

    it('fails with no_identity on {pair} with nobody signed in', () => {
        const held = hold(aConnection({}, null), 'chat:{pair}', 34);

        expect(held.status().state).toBe('failed');
        expect(held.status().error).toBe('no_identity');
        expect(held.room()).toBeNull();
    });

    it('says how the room is, as it changes, and hands the room over', () => {
        const rt = aConnection();
        const held = hold(rt, 'chat:7');
        const room = rt.rooms.get('chat:7')!;

        expect(held.status().state).toBe('joining');
        expect(held.room()).toBe(room);

        room.state = 'joined';
        room.members.set('34', { name: 'Ann' });
        room.count = 1;
        room.fire('joined', [{ id: '34', info: { name: 'Ann' } }]);

        expect(held.status()).toEqual({ state: 'joined', error: null, members: [{ id: '34', info: { name: 'Ann' } }], count: 1 });
    });

    it('says why it failed, for a rule that says no and for a kick alike', () => {
        const rt = aConnection();
        const held = hold(rt, 'chat:7');
        const room = rt.rooms.get('chat:7')!;

        room.state = 'failed';
        room.error = 'forbidden';
        room.fire('error', { code: 'forbidden' });
        expect(held.status()).toMatchObject({ state: 'failed', error: 'forbidden' });

        room.error = 'kicked';
        room.fire('kicked', { code: 'kicked' });
        expect(held.status()).toMatchObject({ state: 'failed', error: 'kicked' });
    });

    it('hands each event to its handler with its meta, and the room\'s own such as kicked', () => {
        const rt = aConnection();
        const handlers = { message: vi.fn(), kicked: vi.fn() };
        hold(rt, 'chat:7', undefined, handlers);
        const room = rt.rooms.get('chat:7')!;

        room.fire('message', { text: 'Hi' }, { from: '34' });
        room.fire('kicked', { code: 'kicked' });

        expect(handlers.message).toHaveBeenCalledWith({ text: 'Hi' }, { from: '34' });
        expect(handlers.kicked).toHaveBeenCalledWith({ code: 'kicked' });
    });

    it('stops listening and leaves when told', () => {
        const rt = aConnection();
        const handlers = { message: vi.fn() };
        const held = hold(rt, 'chat:7', undefined, handlers);
        const room = rt.rooms.get('chat:7')!;

        held.stop();
        room.fire('message', {}, {});

        expect(handlers.message).not.toHaveBeenCalled();
        expect(rt.leave).toHaveBeenCalledWith('chat:7');
    });

    it('leaves a room only when the last to hold it goes', () => {
        const rt = aConnection();
        const first = hold(rt, 'chat:7');
        const second = hold(rt, 'chat:7');

        expect(rt.join).toHaveBeenCalledTimes(1);
        first.stop();
        expect(rt.leave).not.toHaveBeenCalled();
        second.stop();
        expect(rt.leave).toHaveBeenCalledWith('chat:7');
    });
});

describe('hearUser', () => {
    it('hears what the server sends the user until told, with nothing to do with no connection', () => {
        const rt = aConnection();
        const handler = vi.fn();
        const stop = hearUser(rt as never, 'notice', handler);

        rt.fire('notice', { text: 'Hi' }, { at: 1 });
        expect(handler).toHaveBeenCalledWith({ text: 'Hi' }, { at: 1 });

        stop();
        rt.fire('notice', { text: 'Again' }, { at: 2 });
        expect(handler).toHaveBeenCalledTimes(1);

        expect(() => hearUser(null, 'notice', handler)()).not.toThrow();
    });
});

describe('idsKey', () => {
    it('is one spelling for the same people, in any order and with any repeated', () => {
        expect(idsKey([42, '34', 42])).toBe(idsKey(['34', 42]));
        expect(idsKey([34])).not.toBe(idsKey([42]));
    });

    it('keeps an id that holds a separator whole, as Auth0 ids do', () => {
        expect(JSON.parse(idsKey(['auth0|5f7c', 'github|12']))).toEqual(['auth0|5f7c', 'github|12']);
    });
});

describe('followOnline', () => {
    it('says who of them is online and when each who is away was last seen, as that changes, and stops when told', () => {
        const rt = aConnection();
        rt.online.known.add('34');
        rt.online.seen.set('42', 1000);
        const tell = vi.fn();
        const stop = followOnline(rt as never, idsKey([34, 42]), false, tell);

        expect(rt.online.watch).toHaveBeenCalledWith(['34', '42']);
        expect(tell).toHaveBeenLastCalledWith({ online: { 34: true, 42: false }, lastSeen: { 42: 1000 }, count: null });

        rt.online.known.add('42');
        rt.online.seen.delete('42');
        rt.online.fire('change', { id: '42', online: true });
        expect(tell).toHaveBeenLastCalledWith({ online: { 34: true, 42: true }, lastSeen: {}, count: null });

        stop();
        tell.mockClear();
        rt.online.fire('change', { id: '42', online: false });
        expect(tell).not.toHaveBeenCalled();
    });

    it('follows how many are online only when asked to', () => {
        const rt = aConnection();
        const tell = vi.fn();
        followOnline(rt as never, idsKey([]), false, tell);
        rt.online.count = 9;
        tell.mockClear();
        rt.online.fire('count', 9);
        expect(tell).not.toHaveBeenCalled();

        followOnline(rt as never, idsKey([]), true, tell);
        rt.online.count = 10;
        rt.online.fire('count', 10);
        expect(tell).toHaveBeenLastCalledWith({ online: {}, lastSeen: {}, count: 10 });
    });
});

describe('readProfiles', () => {
    it('hands over what the directory says, asking for nobody and with no connection nothing', async () => {
        const rt = aConnection();
        const tell = vi.fn();

        readProfiles(rt as never, idsKey([34]), tell);
        await settle();
        expect(tell).toHaveBeenCalledWith({ 34: { user_id: '34', name: 'User 34' } });

        tell.mockClear();
        rt.users.mockClear();
        readProfiles(rt as never, idsKey([]), tell);
        readProfiles(null, idsKey([34]), tell);
        await settle();
        expect(rt.users).not.toHaveBeenCalled();
        expect(tell).not.toHaveBeenCalled();
    });

    it('drops an answer that comes after it was told to stop', async () => {
        const rt = aConnection();
        const tell = vi.fn();
        readProfiles(rt as never, idsKey([34]), tell)();
        await settle();

        expect(tell).not.toHaveBeenCalled();
    });
});

describe('followTyping', () => {
    const typing = (ttl = 1000) => {
        const rt = aConnection({}, '42');
        const room = aRoom();
        const tell = vi.fn();
        const stop = followTyping(rt as never, room as never, 'typing', ttl, tell);
        return { room, tell, stop, writers: () => tell.mock.lastCall?.[0] as string[] };
    };

    it('lists who says they type, leaves out this page and ends with their word or their message', () => {
        const { room, writers } = typing();

        room.fire('typing', { on: true }, { from: '34' });
        expect(writers()).toEqual(['34']);

        room.fire('typing', { on: true }, { from: '42' });
        expect(writers()).toEqual(['34']);

        room.fire('typing', { on: true }, { from: '43' });
        room.fire('typing', { on: false }, { from: '34' });
        expect(writers()).toEqual(['43']);

        room.fire('message', { text: 'Hi' }, { from: '43' });
        expect(writers()).toEqual([]);
    });

    it('lets someone go once they have said nothing for its time, and each word starts that again', async () => {
        vi.useFakeTimers();
        try {
            const { room, writers } = typing(1000);

            room.fire('typing', { on: true }, { from: '34' });
            vi.advanceTimersByTime(800);
            room.fire('typing', { on: true }, { from: '34' });
            vi.advanceTimersByTime(800);
            expect(writers()).toEqual(['34']);

            vi.advanceTimersByTime(300);
            expect(writers()).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('says nobody with no room, and stops when told, its timers with it', () => {
        const tell = vi.fn();
        followTyping(null, null, 'typing', 1000, tell);
        expect(tell).toHaveBeenLastCalledWith([]);

        const { room, tell: told, stop } = typing();
        room.fire('typing', { on: true }, { from: '34' });
        stop();
        expect(told).toHaveBeenLastCalledWith([]);

        told.mockClear();
        room.fire('typing', { on: true }, { from: '34' });
        expect(told).not.toHaveBeenCalled();
    });
});

describe('followCalls', () => {
    it('says what rings as it changes, once the calls have loaded', async () => {
        const rt = aConnection();
        const tell = vi.fn();
        followCalls(rt as never, tell);
        await settle();
        const { calls } = rt.made;
        expect(tell).toHaveBeenLastCalledWith({ calls, incoming: [], error: null });

        const ring = anIncoming();
        calls.ringing.push(ring);
        calls.fire('incoming', ring);
        expect(tell.mock.lastCall?.[0].incoming).toEqual([ring]);

        calls.ringing.length = 0;
        ring.fire('over');
        expect(tell.mock.lastCall?.[0].incoming).toEqual([]);
    });

    it('lets a ring go as this page turns it down, though the calls still list it as they say so', async () => {
        const rt = aConnection();
        const tell = vi.fn();
        followCalls(rt as never, tell);
        await settle();
        const ring = anIncoming();
        rt.made.calls.ringing.push(ring);
        rt.made.calls.fire('incoming', ring);

        ring.state = 'declined';
        ring.fire('over', 'declined');

        expect(tell.mock.lastCall?.[0].incoming).toEqual([]);
    });

    it('follows a ring that started before the calls loaded to its end', async () => {
        const rt = aConnection();
        const ring = anIncoming();
        rt.made.calls.ringing.push(ring);
        const tell = vi.fn();
        followCalls(rt as never, tell);
        await settle();
        expect(tell.mock.lastCall?.[0].incoming).toEqual([ring]);

        rt.made.calls.ringing.length = 0;
        ring.fire('over');
        expect(tell.mock.lastCall?.[0].incoming).toEqual([]);
    });

    it('says the code calls() was refused with, and nothing more once told to stop', async () => {
        const rt = aConnection();
        rt.calls.mockRejectedValueOnce(Object.assign(new Error('no_webrtc'), { code: 'no_webrtc' }));
        const tell = vi.fn();
        followCalls(rt as never, tell);
        await settle();
        expect(tell).toHaveBeenLastCalledWith({ calls: null, incoming: [], error: 'no_webrtc' });

        const other = aConnection();
        const quiet = vi.fn();
        const stop = followCalls(other as never, quiet);
        await settle();
        stop();
        quiet.mockClear();
        other.made.calls.fire('incoming', anIncoming());
        expect(quiet).not.toHaveBeenCalled();
    });
});

describe('callHolder', () => {
    const holder = (rt: ReturnType<typeof aConnection> | null = aConnection()) => {
        const tell = vi.fn();
        return { rt, holding: callHolder(() => rt as never, tell), status: () => tell.mock.lastCall?.[0] as typeof NO_CALL };
    };

    it('places a call and opens what its type asks for, the camera and the microphone for a video call', async () => {
        const { rt, holding, status } = holder();
        await holding.start('support:{pair}', { to: 34 });
        await settle();
        const { call } = rt!.made;

        expect(rt!.call).toHaveBeenCalledWith('support:{pair}', { to: 34, type: 'video' });
        expect(status().call).toBe(call);
        expect(status().peer).toEqual({ user: 34, info: { name: 'Ann' } });
        expect(status().camera).toBe('camera-track');
        expect(status().microphone).toBe('microphone-track');
    });

    it('opens only the microphone for an audio call, and nothing with devices false', async () => {
        const audio = holder();
        await audio.holding.start('support:{pair}', { to: 34, type: 'audio' });
        await settle();
        expect(audio.rt!.made.call.setCamera).not.toHaveBeenCalled();
        expect(audio.status().microphone).toBe('microphone-track');

        const none = holder();
        await none.holding.start('support:{pair}', { to: 34, devices: false });
        await settle();
        expect(none.rt!.made.call.setMicrophone).not.toHaveBeenCalled();
    });

    it('follows the call, and says why it ended once it has', async () => {
        const { rt, holding, status } = holder();
        await holding.start('support:{pair}', { to: 34 });
        const { call } = rt!.made;

        call.fire('state', 'connected');
        expect(status().state).toBe('connected');

        const remote = { ...call.remote, camera: 'their-camera' };
        call.fire('remote', remote);
        expect(status().remote).toEqual(remote);

        holding.end();
        expect(status()).toMatchObject({ call: null, state: 'idle', remote: null, peer: null, endReason: 'hangup' });
    });

    it('keeps the group call a call became, with the reason it ended', async () => {
        const { rt, holding, status } = holder();
        await holding.start('support:{pair}', { to: 34 });
        const group = aGroup();
        rt!.made.call.fire('group', group);
        rt!.made.call.fire('ended', 'group');

        expect(status()).toMatchObject({ call: null, group, endReason: 'group' });
    });

    it('holds one call at a time, and the one it let go of can\'t undo the next', async () => {
        const rt = aConnection();
        const first = aCall();
        const second = aCall();
        rt.call.mockResolvedValueOnce(first as never).mockResolvedValueOnce(second as never);
        const { holding, status } = holder(rt);

        await holding.start('support:{pair}', { to: 34, devices: false });
        await holding.start('support:{pair}', { to: 35, devices: false });
        expect(first.end).toHaveBeenCalled();
        expect(status().call).toBe(second);

        first.fire('ended', 'hangup');
        first.fire('state', 'ended');
        expect(status().call).toBe(second);
        expect(status().state).toBe('ringing');
    });

    it('answers a ring, and holds nothing for a ring into a group call but that group call', async () => {
        const call = aCall();
        const { holding, status } = holder();
        await holding.answer(anIncoming(call) as never, { devices: false });
        expect(status().call).toBe(call);

        const group = aGroup();
        const other = holder();
        await other.holding.answer(anIncoming(group) as never);
        expect(other.status()).toMatchObject({ call: null, group });
    });

    it('says the code of what was refused, a camera apart from its microphone', async () => {
        const rt = aConnection();
        rt.call.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 'forbidden' }));
        const refused = holder(rt);
        await refused.holding.start('support:{pair}', { to: 34 });
        expect(refused.status().error).toBe('forbidden');

        const none = holder(null);
        await none.holding.start('support:{pair}', { to: 34 });
        expect(none.status().error).toBe('not_connected');

        const device = holder();
        device.rt!.made.call.setCamera.mockRejectedValueOnce(Object.assign(new Error('device_denied'), { code: 'device_denied' }));
        await device.holding.start('support:{pair}', { to: 34 });
        await settle();
        expect(device.status().error).toBe('device_denied');
        expect(device.status().microphone).toBe('microphone-track');
    });

    it('reads what the page sends again after each change, and refuses with no call', async () => {
        const { holding, status } = holder();
        await expect(holding.setCamera(true)).rejects.toMatchObject({ code: 'not_connected' });

        await holding.start('support:{pair}', { to: 34, devices: false });
        expect(status().camera).toBeNull();
        await holding.setCamera(true);
        expect(status().camera).toBe('camera-track');
        await holding.setCamera(false);
        expect(status().camera).toBeNull();
    });

    it('ends its call as the component goes, and one placed meanwhile too', async () => {
        const { rt, holding } = holder();
        await holding.start('support:{pair}', { to: 34, devices: false });
        holding.stop();
        expect(rt!.made.call.end).toHaveBeenCalled();

        const later = aConnection();
        const { holding: going } = holder(later);
        const placed = going.start('support:{pair}', { to: 34 });
        going.stop();
        await placed;
        expect(later.made.call.end).toHaveBeenCalled();
        expect(later.made.call.setCamera).not.toHaveBeenCalled();
    });
});

describe('holdStream', () => {
    const holder = () => {
        const tell = vi.fn();
        return { tell, status: () => tell.mock.lastCall?.[0] as typeof NO_STREAM };
    };

    it('joins nothing with no connection or no name', () => {
        const rt = aConnection();
        const { tell, status } = holder();

        holdStream(null, 'show:7', tell)();
        holdStream(rt as never, null, tell)();

        expect(rt.stream).not.toHaveBeenCalled();
        expect(status()).toBe(NO_STREAM);
    });

    it('joins, says how it is as it changes, and leaves when told', async () => {
        const rt = aConnection();
        const { tell, status } = holder();
        const stop = holdStream(rt as never, 'show:7', tell);
        expect(status()).toBe(NO_STREAM);
        await settle();
        const { stream } = rt.made;

        expect(rt.stream).toHaveBeenCalledWith('show:7');
        expect(status()).toEqual({ stream, state: { status: 'ready', media: 'live', viewers: 1 }, error: null });

        stream.change({ viewers: 5 });
        expect(status().state?.viewers).toBe(5);

        stop();
        expect(stream.leave).toHaveBeenCalledTimes(1);
        expect(stream.listening()).toBe(0);
        expect(status()).toBe(NO_STREAM);
    });

    it('leaves a stream that answers once it was told to go, and says nothing more', async () => {
        const rt = aConnection();
        const { tell, status } = holder();
        const stop = holdStream(rt as never, 'show:7', tell);

        stop();
        await settle();

        expect(rt.made.stream.leave).toHaveBeenCalledTimes(1);
        expect(rt.made.stream.listening()).toBe(0);
        expect(status()).toBe(NO_STREAM);
    });

    it('says what it was refused with', async () => {
        const rt = aConnection();
        rt.stream.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 'forbidden' }));
        const { tell, status } = holder();
        holdStream(rt as never, 'show:7', tell);
        await settle();

        expect(status()).toEqual({ stream: null, state: null, error: 'forbidden' });
    });
});

describe('showStream', () => {
    it('shows the stream muted, as its sound plays apart, until told to stop', () => {
        const { stream } = aConnection().made;
        const video = { muted: false };

        const stop = showStream(video as never, stream as never);
        expect(video.muted).toBe(true);
        expect(stream.watch).toHaveBeenCalledWith(video);

        stop();
        expect(stream.stopWatching).toHaveBeenCalledTimes(1);
    });

    it('does nothing with no element or no stream', () => {
        const { stream } = aConnection().made;

        showStream(null, stream as never)();
        showStream({ muted: false } as never, null)();

        expect(stream.watch).not.toHaveBeenCalled();
    });
});

describe('groupHolder', () => {
    const holder = () => {
        const tell = vi.fn();
        return { holding: groupHolder(tell), status: () => tell.mock.lastCall?.[0] as typeof NO_GROUP };
    };

    it('joins nothing with no connection or no name', () => {
        const rt = aConnection();
        const { holding, status } = holder();

        holding.hold(null, 'meeting:7')();
        holding.hold(rt as never, null)();

        expect(rt.groupCall).not.toHaveBeenCalled();
        expect(status()).toBe(NO_GROUP);
    });

    it('joins, says who is in it as that changes, and leaves when told', async () => {
        const rt = aConnection();
        const { holding, status } = holder();
        const stop = holding.hold(rt as never, 'meeting:7', 'audio');
        await settle();
        const { group } = rt.made;

        expect(rt.groupCall).toHaveBeenCalledWith('meeting:7', { type: 'audio' });
        expect(status()).toMatchObject({ group, state: 'connected', people: [{ identity: 'user_34', user: 34 }], self: { user: 42 } });

        group.people.mockReturnValue([]);
        group.fire('person_left', {});
        expect(status().people).toEqual([]);

        group.fire('state', 'reconnecting');
        expect(status().state).toBe('reconnecting');

        stop();
        expect(group.leave).toHaveBeenCalled();
        expect(status()).toBe(NO_GROUP);
    });

    it('reads what the page sends again after each change, and refuses with no call', async () => {
        const rt = aConnection();
        const { holding, status } = holder();
        await expect(holding.setCamera(true)).rejects.toMatchObject({ code: 'not_connected' });

        holding.hold(rt as never, 'meeting:7');
        await settle();
        await holding.setCamera(true);
        expect(status().camera).toBe('camera-track');
    });

    it('says the code it was refused with, and leaves one that joins after it was told to go', async () => {
        const refused = aConnection();
        refused.groupCall.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 'forbidden' }));
        const first = holder();
        first.holding.hold(refused as never, 'meeting:7');
        await settle();
        expect(first.status().error).toBe('forbidden');

        const late = aConnection();
        const second = holder();
        second.holding.hold(late as never, 'meeting:7')();
        await settle();
        expect(late.made.group.leave).toHaveBeenCalled();
        expect(second.status()).toBe(NO_GROUP);
    });
});

describe('showTrack', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('attaches a track someone else sends and lets it go', () => {
        const element = {} as HTMLMediaElement;
        const track = { attach: vi.fn(), detach: vi.fn() };
        const stop = showTrack(element, track as never);

        expect(track.attach).toHaveBeenCalledWith(element);
        stop();
        expect(track.detach).toHaveBeenCalledWith(element);
    });

    it('shows this page\'s own muted, and puts the element back after', () => {
        vi.stubGlobal('MediaStream', class {
            constructor(readonly tracks: unknown[]) {}
        });
        const element = { muted: false, srcObject: null } as unknown as HTMLMediaElement;
        const track = { kind: 'video' } as MediaStreamTrack;
        const stop = showTrack(element, track);

        expect(element.muted).toBe(true);
        expect((element.srcObject as unknown as { tracks: unknown[] }).tracks).toEqual([track]);

        stop();
        expect(element.muted).toBe(false);
        expect(element.srcObject).toBeNull();
    });

    it('does nothing with no track or no element', () => {
        expect(() => showTrack({} as HTMLMediaElement, null)()).not.toThrow();
        expect(() => showTrack(null, { attach: vi.fn() } as never)()).not.toThrow();
    });
});

describe('the package', () => {
    const external = ['vue', 'svelte', 'svelte/*', 'react', 'react/*', 'next/*'];

    /** What a bundler reaches from an entry, with every framework left out and named if it is asked for. */
    const reached = async (entry: string) => {
        const { metafile } = await build({ entryPoints: [join(root, 'src', entry)], bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser', logLevel: 'silent', external });
        return Object.values(metafile.outputs).flatMap((output) => output.imports.filter((found) => found.external).map((found) => found.path));
    };

    it('asks for no framework in its core and server, so an app needs none it does not use', async () => {
        for (const entry of ['browser.ts', 'bindings.ts']) {
            expect(await reached(entry)).toEqual([]);
        }
    });

    it('asks for its own framework in each helper, and no other', async () => {
        expect(new Set(await reached('vue.ts'))).toEqual(new Set(['vue']));
        expect(new Set(await reached('svelte.ts'))).toEqual(new Set(['svelte', 'svelte/store']));
    });

    describe('its README', () => {
        const readme = readFileSync(join(root, 'README.md'), 'utf8');
        const samples = (language: string) => [...readme.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map((found) => found[1]);

        it('has Vue samples that compile with nothing to say', () => {
            expect(samples('vue').length).toBeGreaterThanOrEqual(3);
            for (const source of samples('vue')) {
                const { descriptor, errors } = parseVue(source, { filename: 'Sample.vue' });
                expect(errors).toEqual([]);
                const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const script = compileScript(descriptor, { id: 'sample', inlineTemplate: true });
                expect(script.warnings ?? []).toEqual([]);
                expect(warn).not.toHaveBeenCalled();
                warn.mockRestore();
            }
        });

        it('has Svelte samples that compile with nothing to say', () => {
            expect(samples('svelte').length).toBeGreaterThanOrEqual(3);
            for (const source of samples('svelte')) {
                expect(compile(source, { filename: 'Sample.svelte' }).warnings).toEqual([]);
            }
        });
    });

    it('lists each helper with its types, its framework an optional peer', () => {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

        for (const name of ['vue', 'svelte']) {
            expect(pkg.exports['./' + name]).toEqual({ types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` });
            expect(pkg.typesVersions['*'][name]).toEqual([`./dist/${name}.d.ts`]);
            expect(pkg.peerDependencies[name]).toBeDefined();
            expect(pkg.peerDependenciesMeta[name]).toEqual({ optional: true });
            expect(pkg.dependencies[name]).toBeUndefined();
        }
    });
});
