import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aConnection, anIncoming, aRoom } from './framework-fakes.js';

// The helpers an app draws its own screens on, on Svelte's own stores with its lifecycle played here, so a test needs no page
// and no compiler: a component's context, onMount() run when `mount()` says, what it answered run when `unmount()` says. A
// name changing and what a template reads are effects, which only run in a browser: test/e2e/frameworks.mjs has those, in a new
// Vite app and a new SvelteKit app in Chromium. What they share is test/framework-bindings.test.ts's.

const made: Array<ReturnType<typeof aConnection>> = [];

vi.mock('../src/browser.js', () => ({
    connect: vi.fn(async (options: unknown) => {
        const rt = aConnection(options);
        made.push(rt);
        return rt;
    }),
}));

// One component's life: its context, what asked to run on mount, and what those answered.
const lifecycle = vi.hoisted(() => {
    const state = {
        context: new Map<unknown, unknown>(),
        mounts: [] as Array<() => void | (() => void)>,
        cleanups: [] as Array<() => void>,
    };
    return state;
});

vi.mock('svelte', () => ({
    setContext: (key: unknown, value: unknown) => lifecycle.context.set(key, value),
    getContext: (key: unknown) => lifecycle.context.get(key),
    onMount: (fn: () => void | (() => void)) => {
        lifecycle.mounts.push(fn);
    },
    untrack: (fn: () => unknown) => fn(),
}));

const { provideRealtime, streamVideo, track, useCall, useCalls, useConnection, useGroupCall, useOnline, usePresence, useProfiles, useRealtime, useRoom, useStream, useTyping, useUserEvent } = await import('../src/svelte.js');
const browser = await import('../src/browser.js');

const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The component comes onto the page, as onMount() does in a browser and never on a server. */
async function mount() {
    const waiting = lifecycle.mounts.splice(0);
    for (const fn of waiting) {
        const cleanup = fn();
        if (cleanup) lifecycle.cleanups.push(cleanup);
    }
    await settle();
}

function unmount() {
    for (const cleanup of lifecycle.cleanups.splice(0).reverse()) cleanup();
}

beforeEach(() => {
    lifecycle.context.clear();
    lifecycle.mounts.length = 0;
    lifecycle.cleanups.length = 0;
});

afterEach(() => {
    made.length = 0;
    vi.mocked(browser.connect).mockClear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('provideRealtime', () => {
    it('connects only once mounted, with no options the routes saying which app, and closes as it goes', async () => {
        provideRealtime();
        const realtime = useRealtime();

        expect(browser.connect).not.toHaveBeenCalled();
        expect(realtime.current).toBeNull();

        await mount();
        expect(made[0].options).toEqual({});
        expect(realtime.current).toBe(made[0]);

        unmount();
        expect(made[0].close).toHaveBeenCalled();
        expect(realtime.current).toBeNull();
    });

    it('takes its options as a getter', async () => {
        provideRealtime(() => ({ app: 's1' }));
        await mount();

        expect(made[0].options).toEqual({ app: 's1' });
    });

    it('says in the console when a helper has none above it', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        useRoom('chat:7');
        await mount();

        expect(warn.mock.lastCall?.[0]).toContain('provideRealtime()');
        expect(browser.connect).not.toHaveBeenCalled();
    });
});

describe('useConnection', () => {
    it('says whether the connection is up, and why it was refused until it connects', async () => {
        provideRealtime();
        const connection = useConnection();
        await mount();

        expect(connection.connected).toBe(false);
        made[0].fire('connected');
        expect(connection.connected).toBe(true);
        made[0].fire('disconnected');
        expect(connection.connected).toBe(false);

        made[0].fire('error', { code: 'wrong_origin' });
        expect(connection.error).toEqual({ code: 'wrong_origin' });
        made[0].fire('connected');
        expect(connection.error).toBeNull();
    });
});

describe('useRoom', () => {
    it('is idle until mounted, then joins, stays current, and leaves as it goes', async () => {
        provideRealtime();
        const chat = useRoom('chat:7');

        expect(chat.state).toBe('idle');
        expect(chat.error).toBeNull();
        expect(chat.members).toEqual([]);
        expect(chat.count).toBeNull();
        expect(chat.room).toBeNull();

        await mount();
        const room = made[0].rooms.get('chat:7')!;
        expect(chat.state).toBe('joining');
        expect(chat.room).toBe(room);

        room.state = 'joined';
        room.count = 2;
        room.members.set('34', { name: 'Ann' });
        room.fire('joined', []);
        expect(chat.state).toBe('joined');
        expect(chat.members).toEqual([{ id: '34', info: { name: 'Ann' } }]);
        expect(chat.count).toBe(2);

        unmount();
        expect(made[0].leave).toHaveBeenCalledWith('chat:7');
    });

    it('gives its handlers each event, and error covers a rule that says no and a kick', async () => {
        provideRealtime();
        const handlers = { message: vi.fn(), kicked: vi.fn() };
        const chat = useRoom('chat:7', handlers);
        await mount();
        const room = made[0].rooms.get('chat:7')!;

        room.fire('message', { text: 'Hi' }, { from: '34' });
        expect(handlers.message).toHaveBeenCalledWith({ text: 'Hi' }, { from: '34' });

        room.state = 'failed';
        room.error = 'forbidden';
        room.fire('error', { code: 'forbidden' });
        expect(chat.error).toBe('forbidden');

        room.error = 'kicked';
        room.fire('kicked', { code: 'kicked' });
        expect(chat.error).toBe('kicked');
        expect(handlers.kicked).toHaveBeenCalledTimes(1);
    });

    it('reads its name and `with` from getters, and joins nothing for null', async () => {
        provideRealtime();
        const pair = useRoom(() => 'chat:{pair}', {}, { with: () => 34 });
        const none = useRoom(() => null);
        await mount();

        expect(made[0].join).toHaveBeenCalledTimes(1);
        expect(made[0].join).toHaveBeenCalledWith('chat:34:42');
        expect(pair.state).toBe('joining');
        expect(none.state).toBe('idle');
    });

    it('waits for `with` on {pair}', async () => {
        provideRealtime();
        const pair = useRoom('chat:{pair}');
        await mount();

        expect(made[0].join).not.toHaveBeenCalled();
        expect(pair.state).toBe('idle');
    });

    it('keeps its room when the connection only drops, as the room comes back by itself', async () => {
        provideRealtime();
        useRoom('chat:7');
        await mount();

        made[0].fire('disconnected');
        made[0].fire('connected');
        await settle();

        expect(made[0].join).toHaveBeenCalledTimes(1);
        expect(made[0].leave).not.toHaveBeenCalled();
    });

    it('sends to the room, and refuses with not_joined when there is none', async () => {
        provideRealtime();
        const chat = useRoom('chat:7');
        const none = useRoom(null);
        await mount();

        chat.emit('message', { text: 'Hi' });
        expect(made[0].rooms.get('chat:7')!.emit).toHaveBeenCalledWith('message', { text: 'Hi' });
        await expect(chat.emitWithAck('message', { text: 'Hi' })).resolves.toEqual({ id: '1', at: 1 });

        expect(() => none.emit('message')).not.toThrow();
        await expect(none.emitWithAck('message')).rejects.toMatchObject({ code: 'not_joined' });
    });
});

describe('usePresence', () => {
    it('lists who is in the room as that changes', async () => {
        provideRealtime();
        const lobby = usePresence('lobby');
        expect(lobby.current).toEqual([]);

        await mount();
        const room = made[0].rooms.get('lobby')!;
        room.members.set('34', { name: 'Ann' });
        room.fire('join', { id: '34' });

        expect(lobby.current).toEqual([{ id: '34', info: { name: 'Ann' } }]);
    });
});

describe('useOnline', () => {
    it('says who of them is online as that changes, and how many with `count`', async () => {
        provideRealtime();
        const status = useOnline(() => [34], { count: true });
        await mount();
        const { online } = made[0];

        expect(online.watch).toHaveBeenLastCalledWith(['34']);
        expect(status.online).toEqual({ 34: false });

        online.known.add('34');
        online.fire('change', { id: '34', online: true });
        expect(status.online).toEqual({ 34: true });

        online.count = 7;
        online.fire('count', 7);
        expect(status.count).toBe(7);
    });
});

describe('useProfiles', () => {
    it('gives the names of the people asked for as they arrive', async () => {
        provideRealtime();
        const profiles = useProfiles([34]);
        expect(profiles.current).toEqual({});

        await mount();
        await settle();
        expect(profiles.current[34]?.name).toBe('User 34');
    });
});

describe('useTyping', () => {
    // A room as it is. What useRoom() answered changes through an effect, which only runs in a browser: frameworks.mjs has that.
    it('lists who is typing in a room, leaving out this page', async () => {
        provideRealtime();
        const room = aRoom();
        const typing = useTyping(room as never);
        await mount();
        expect(typing.current).toEqual([]);

        room.fire('typing', { on: true }, { from: '34' });
        room.fire('typing', { on: true }, { from: '42' });
        expect(typing.current).toEqual(['34']);

        room.fire('typing', { on: false }, { from: '34' });
        expect(typing.current).toEqual([]);
    });
});

describe('useUserEvent', () => {
    it('hears what the server sends the user while the component is on the page', async () => {
        provideRealtime();
        const handler = vi.fn();
        useUserEvent('notice', handler);
        await mount();

        made[0].fire('notice', { text: 'Hi' }, { at: 1 });
        expect(handler).toHaveBeenCalledWith({ text: 'Hi' }, { at: 1 });

        unmount();
        made[0].fire('notice', { text: 'Again' }, { at: 2 });
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe('useCalls', () => {
    it('loads the calls once mounted, and says what rings as it changes', async () => {
        provideRealtime();
        const calls = useCalls();
        expect(calls.calls).toBeNull();

        await mount();
        await settle();
        const fake = made[0].made.calls;
        expect(calls.calls).toBe(fake);

        const ring = anIncoming();
        fake.ringing.push(ring);
        fake.fire('incoming', ring);
        expect(calls.incoming).toEqual([ring]);
    });
});

describe('useCall', () => {
    it('starts with no call, places one with what its type asks for, and ends it as the component goes', async () => {
        provideRealtime();
        const current = useCall();
        expect(current.state).toBe('idle');
        expect(current.call).toBeNull();

        await mount();
        await settle();
        await current.start('support:{pair}', { to: 34 });
        await settle();
        const { call } = made[0].made;
        expect(current.call).toBe(call);
        expect(current.state).toBe('ringing');
        expect(current.camera).toBe('camera-track');

        call.fire('state', 'connected');
        expect(current.state).toBe('connected');

        unmount();
        expect(call.end).toHaveBeenCalled();
    });

    it('answers what rings, turns its camera off and on, and says why it ended', async () => {
        provideRealtime();
        const current = useCall();
        await mount();
        await settle();
        const { call } = made[0].made;

        await current.answer(anIncoming(call) as never);
        await settle();
        expect(current.peer).toEqual(call.peer);

        await current.setCamera(false);
        expect(current.camera).toBeNull();

        current.end();
        expect(current.state).toBe('idle');
        expect(current.endReason).toBe('hangup');
    });

    it('says it has no connection when one is not up yet', async () => {
        provideRealtime();
        const current = useCall();

        await current.start('support:{pair}', { to: 34 });

        expect(current.error).toBe('not_connected');
    });
});

describe('a token from the app\'s own server', () => {
    it('useCall() starts the call in it', async () => {
        provideRealtime();
        const current = useCall();
        await mount();
        await settle();
        await current.start('a-token');
        expect(made[0].startCall).toHaveBeenCalledWith('a-token');
        expect(made[0].call).not.toHaveBeenCalled();
    });

    it('useGroupCall() asks for it, and joins the call it names', async () => {
        const getToken = vi.fn(async () => 'a-token');
        provideRealtime();
        const meeting = useGroupCall('meeting:7', getToken);
        await mount();
        await settle();
        expect(getToken).toHaveBeenCalledTimes(1);
        expect(made[0].joinGroupCall).toHaveBeenCalledWith('a-token');
        expect(made[0].groupCall).not.toHaveBeenCalled();
        expect(meeting.group).toBe(made[0].made.group);
    });

    it('useGroupCall() says why when the app\'s route refuses', async () => {
        const getToken = vi.fn(async () => { throw Object.assign(new Error('forbidden'), { code: 'forbidden' }); });
        provideRealtime();
        const meeting = useGroupCall('meeting:7', getToken);
        await mount();
        await settle();
        expect(meeting.error).toBe('forbidden');
    });

    it('useStream() joins with the function, for the SDK to ask again as each token runs out', async () => {
        const getToken = vi.fn(async () => 'a-token');
        provideRealtime();
        useStream('show:7', getToken);
        await mount();
        await settle();
        expect(made[0].joinStream).toHaveBeenCalledWith(getToken);
        expect(made[0].stream).not.toHaveBeenCalled();
    });
});

describe('useGroupCall', () => {
    it('joins once mounted, says who is in it, and leaves as it goes', async () => {
        provideRealtime();
        const meeting = useGroupCall(() => 'meeting:7', { type: 'audio' });
        expect(meeting.state).toBe('idle');

        await mount();
        await settle();
        const { group } = made[0].made;
        expect(made[0].groupCall).toHaveBeenCalledWith('meeting:7', { type: 'audio' });
        expect(meeting.group).toBe(group);
        expect(meeting.state).toBe('connected');
        expect(meeting.people).toEqual([{ identity: 'user_34', user: 34 }]);
        expect(meeting.self).toEqual({ user: 42 });

        await meeting.setCamera(true);
        expect(meeting.camera).toBe('camera-track');

        unmount();
        expect(group.leave).toHaveBeenCalled();
        expect(meeting.state).toBe('idle');
    });

    it('joins nothing for null', async () => {
        provideRealtime();
        const meeting = useGroupCall(null);
        await mount();
        await settle();

        expect(made[0].groupCall).not.toHaveBeenCalled();
        expect(meeting.state).toBe('idle');
    });
});

describe('useStream', () => {
    it('joins once mounted, says how it is as it changes, and leaves as it goes', async () => {
        provideRealtime();
        const show = useStream(() => 'show:7');
        expect(show.state).toBeNull();

        await mount();
        await settle();
        const { stream } = made[0].made;
        expect(made[0].stream).toHaveBeenCalledWith('show:7');
        expect(show.stream).toBe(stream);
        expect(show.state?.viewers).toBe(1);

        stream.change({ viewers: 5 });
        expect(show.state?.viewers).toBe(5);

        unmount();
        expect(stream.leave).toHaveBeenCalled();
        expect(show.stream).toBeNull();
    });

    it('joins nothing for null', async () => {
        provideRealtime();
        const show = useStream(null);
        await mount();
        await settle();

        expect(made[0].stream).not.toHaveBeenCalled();
        expect(show.stream).toBeNull();
    });
});

describe('use:streamVideo', () => {
    it('shows a stream muted, lets it go as another comes, and lets go as the element leaves', () => {
        const element = { muted: false } as HTMLVideoElement;
        const first = { watch: vi.fn(), stop: vi.fn() };
        const second = { watch: vi.fn(), stop: vi.fn() };
        first.watch.mockReturnValue(first.stop);
        second.watch.mockReturnValue(second.stop);

        const action = streamVideo(element, first as never);
        expect(element.muted).toBe(true);
        expect(first.watch).toHaveBeenCalledWith(element);

        action.update(second as never);
        expect(first.stop).toHaveBeenCalledTimes(1);
        expect(second.watch).toHaveBeenCalledWith(element);

        action.destroy();
        expect(second.stop).toHaveBeenCalledTimes(1);
    });
});

describe('use:track', () => {
    const aTrack = () => ({ attach: vi.fn(), detach: vi.fn() });

    it('attaches a track, lets it go as another comes, and lets go as the element leaves', () => {
        const element = {} as HTMLMediaElement;
        const first = aTrack();
        const second = aTrack();
        const action = track(element, first as never);
        expect(first.attach).toHaveBeenCalledWith(element);

        action.update(second as never);
        expect(first.detach).toHaveBeenCalledWith(element);
        expect(second.attach).toHaveBeenCalledWith(element);

        action.destroy();
        expect(second.detach).toHaveBeenCalledWith(element);
    });

    it('shows this page\'s own muted', () => {
        vi.stubGlobal('MediaStream', class {});
        const element = { muted: false, srcObject: null } as unknown as HTMLMediaElement;
        const action = track(element, {} as MediaStreamTrack);
        expect(element.muted).toBe(true);

        action.update(null);
        expect(element.muted).toBe(false);
        expect(element.srcObject).toBeNull();
    });

    it('stays empty with no track, and takes one when it comes', () => {
        const element = {} as HTMLMediaElement;
        const action = track(element, undefined);
        const arrived = aTrack();

        action.update(arrived as never);

        expect(arrived.attach).toHaveBeenCalledWith(element);
    });
});

describe('on the server', () => {
    it('renders each room and call idle and connects to nothing, as onMount() never runs there', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        provideRealtime();
        const chat = useRoom('chat:7', { message: () => {} });
        useUserEvent('notice', () => {});
        const connection = useConnection();
        const status = useOnline([34]);
        const profiles = useProfiles([34]);
        const lobby = usePresence('lobby');
        const typing = useTyping(chat);
        const calls = useCalls();
        const current = useCall();
        const meeting = useGroupCall('meeting:7');

        expect([chat.state, chat.error, connection.connected, status.online, profiles.current, lobby.current, typing.current, calls.incoming, current.state, meeting.state])
            .toEqual(['idle', null, false, {}, {}, [], [], [], 'idle', 'idle']);
        await settle();
        expect(browser.connect).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });
});
