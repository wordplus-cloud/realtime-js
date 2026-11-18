import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The hooks an app draws its own screens on, on the connection the provider made. The provider's reconnects are
// react-provider.test.ts's. @wordplus/realtime-ui/react has the same names, and reads the same context.

type Listener = (...args: any[]) => void;

function emitter<T extends object>(fields: T) {
    const listeners = new Map<string, Listener[]>();
    return Object.assign(fields, {
        on(event: string, fn: Listener) {
            listeners.set(event, [...(listeners.get(event) ?? []), fn]);
            return this;
        },
        off(event: string, fn?: Listener) {
            listeners.set(event, (listeners.get(event) ?? []).filter((f) => fn && f !== fn));
            return this;
        },
        fire(event: string, ...args: unknown[]) {
            for (const fn of listeners.get(event) ?? []) fn(...args);
        },
    });
}

const group = () => emitter({ state: 'connected', people: vi.fn((): unknown[] => [{ user: 34 }]), leave: vi.fn() });
const made: Array<ReturnType<typeof connection>> = [];

function connection(options: unknown) {
    const room = emitter({ name: 'chat:1', state: 'joined', error: null, members: new Map(), count: null, emit: vi.fn(), emitWithAck: vi.fn() });
    return emitter({
        options,
        user: '42',
        connected: false,
        room_: room,
        group_: group(),
        room: vi.fn(() => room),
        join: vi.fn(() => room),
        leave: vi.fn(),
        users: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { user_id: id, name: 'User ' + id }]))),
        groupCall: vi.fn(async function (this: any) { return this.group_; }),
        joinGroupCall: vi.fn(async function (this: any) { return this.group_; }),
        joinStream: vi.fn(async () => ({ leave: vi.fn(), subscribe: () => () => {}, snapshot: () => null })),
        callScreen: vi.fn(async () => true),
        close: vi.fn(),
    });
}

vi.mock('../src/browser.js', () => ({
    connect: vi.fn(async (options: unknown) => {
        const rt = connection(options);
        made.push(rt);
        return rt;
    }),
}));

const { AudioTrack, CallScreen, RealtimeProvider, StreamVideo, useCall, useConnection, useGroupCall, useProfiles, useRealtime, useRoom, useStream, useTyping, VideoTrack } = await import('../src/react.js');

/** A hook inside the provider, what it answered last. */
async function hooked<T>(hook: () => T, props: Record<string, unknown> = {}) {
    const seen: { current: T | null } = { current: null };
    function Probe() {
        seen.current = hook();
        return null;
    }
    let root!: ReturnType<typeof create>;
    await act(async () => {
        root = create(createElement(RealtimeProvider, props as never, createElement(Probe)));
    });
    return { seen, root };
}

afterEach(() => {
    made.length = 0;
});

describe('RealtimeProvider', () => {
    it('needs no options: connect() finds the app through the routes', async () => {
        const { seen } = await hooked(() => useRealtime());

        expect(made[0].options).toEqual({});
        expect(seen.current).toBe(made[0]);
    });

    it('tells `onError` what the connection is refused, the keys route failing among it', async () => {
        const onError = vi.fn();
        await hooked(() => null, { onError });

        act(() => made[0].fire('error', { code: 'keys_failed', status: 500 }));

        expect(onError).toHaveBeenCalledWith({ code: 'keys_failed', status: 500 });
    });
});

describe('useConnection', () => {
    it('says whether the connection is up, as it changes', async () => {
        const { seen } = await hooked(() => useConnection());

        expect(seen.current).toEqual({ connected: false, error: null });

        act(() => made[0].fire('connected'));
        expect(seen.current).toEqual({ connected: true, error: null });

        act(() => made[0].fire('disconnected'));
        expect(seen.current).toEqual({ connected: false, error: null });
    });

    it('says why it was refused, until it connects, and not an event a page could not open', async () => {
        const { seen } = await hooked(() => useConnection());

        act(() => made[0].fire('error', { code: 'unopened', event: 'message' }));
        expect(seen.current?.error).toBeNull();

        act(() => made[0].fire('error', { code: 'wrong_origin' }));
        expect(seen.current?.error).toEqual({ code: 'wrong_origin' });

        act(() => made[0].fire('connected'));
        expect(seen.current?.error).toBeNull();
    });

    it('says why the page could not connect at all', async () => {
        const browser = await import('../src/browser.js');
        vi.mocked(browser.connect).mockRejectedValueOnce(Object.assign(new Error('keys_failed'), { code: 'keys_failed' }));

        const { seen } = await hooked(() => useConnection());

        expect((seen.current?.error as { code: string }).code).toBe('keys_failed');
        expect(seen.current?.connected).toBe(false);
    });
});

/** A call as rt.call() and incoming.accept() make it. */
function aCall() {
    const tracks: Record<string, unknown> = {};
    return emitter({
        peer: { user: 34, info: { name: 'Ann' } },
        state: 'ringing',
        remote: { camera: null, microphone: null, screen: null, screenAudio: null, media: {}, quality: 'unknown' },
        get camera() { return tracks.camera ?? null; },
        get microphone() { return tracks.microphone ?? null; },
        screen: null,
        setCamera: vi.fn(async (on: boolean) => { tracks.camera = on ? 'camera-track' : null; }),
        setMicrophone: vi.fn(async (on: boolean) => { tracks.microphone = on ? 'microphone-track' : null; }),
        setScreenShare: vi.fn(async () => true),
        end: vi.fn(function (this: { fire(event: string, reason: string): void }) { this.fire('ended', 'hangup'); }),
    });
}

describe('useCall', () => {
    it('starts with no call, and places one, opening the camera and the microphone a video call asks for', async () => {
        const call = aCall();
        const { seen } = await hooked(() => useCall());
        const rt = made[0] as any;
        rt.call = vi.fn(async () => call);

        expect(seen.current).toMatchObject({ call: null, state: 'idle', remote: null, peer: null, error: null });

        await act(async () => seen.current!.start('support:{pair}', { to: 34 }));

        expect(rt.call).toHaveBeenCalledWith('support:{pair}', { to: 34, type: 'video' });
        expect(call.setCamera).toHaveBeenCalledWith(true);
        expect(call.setMicrophone).toHaveBeenCalledWith(true);
        expect(seen.current).toMatchObject({ call, state: 'ringing', peer: { user: 34 }, camera: 'camera-track', microphone: 'microphone-track' });
    });

    it('opens no camera for an audio call, and no device when told not to', async () => {
        const audio = aCall();
        const silent = aCall();
        const { seen } = await hooked(() => useCall());
        const rt = made[0] as any;

        rt.call = vi.fn(async () => audio);
        await act(async () => seen.current!.start('support:{pair}', { to: 34, type: 'audio' }));
        expect(audio.setCamera).not.toHaveBeenCalled();
        expect(audio.setMicrophone).toHaveBeenCalledWith(true);

        rt.call = vi.fn(async () => silent);
        await act(async () => seen.current!.start('support:{pair}', { to: 34, devices: false }));
        expect(silent.setCamera).not.toHaveBeenCalled();
        expect(silent.setMicrophone).not.toHaveBeenCalled();
    });

    it('follows the call as it changes, and goes back to no call when it ends, saying why', async () => {
        const call = aCall();
        const { seen } = await hooked(() => useCall());
        (made[0] as any).call = vi.fn(async () => call);
        await act(async () => seen.current!.start('support:{pair}', { to: 34 }));

        act(() => call.fire('state', 'connected'));
        expect(seen.current?.state).toBe('connected');

        const remote = { ...call.remote, camera: { attach() {}, detach() {} } };
        act(() => call.fire('remote', remote));
        expect(seen.current?.remote).toEqual(remote);

        act(() => call.fire('ended', 'declined'));
        expect(seen.current).toMatchObject({ call: null, state: 'idle', remote: null, peer: null, endReason: 'declined' });
    });

    it('says a device refused while the call goes on, and a call refused with its code', async () => {
        const call = aCall();
        call.setCamera.mockRejectedValueOnce(Object.assign(new Error('device_denied'), { code: 'device_denied' }));
        const { seen } = await hooked(() => useCall());
        const rt = made[0] as any;
        rt.call = vi.fn(async () => call);

        await act(async () => seen.current!.start('support:{pair}', { to: 34 }));
        expect(seen.current).toMatchObject({ call, error: 'device_denied', microphone: 'microphone-track' });

        rt.call = vi.fn(async () => { throw Object.assign(new Error('forbidden'), { code: 'forbidden' }); });
        await act(async () => seen.current!.start('support:{pair}', { to: 43 }));
        expect(seen.current?.error).toBe('forbidden');
    });

    it('answers a call that rings, and a ring into a group call is that group call', async () => {
        const call = aCall();
        const { seen } = await hooked(() => useCall());
        await act(async () => seen.current!.answer({ type: 'audio', accept: async () => call } as never));

        expect(seen.current).toMatchObject({ call });
        expect(call.setCamera).not.toHaveBeenCalled();
        expect(call.setMicrophone).toHaveBeenCalledWith(true);

        const meeting = { people: () => [] };
        await act(async () => seen.current!.answer({ type: 'video', accept: async () => meeting } as never));
        expect(seen.current?.group).toBe(meeting);
    });

    it('ends the call when asked, and when the component goes', async () => {
        const first = aCall();
        const second = aCall();
        const { root, seen } = await hooked(() => useCall());
        const rt = made[0] as any;

        rt.call = vi.fn(async () => first);
        await act(async () => seen.current!.start('support:{pair}', { to: 34 }));
        act(() => seen.current!.end());
        expect(first.end).toHaveBeenCalled();
        expect(seen.current).toMatchObject({ call: null, endReason: 'hangup' });

        rt.call = vi.fn(async () => second);
        await act(async () => seen.current!.start('support:{pair}', { to: 34 }));
        await act(async () => root.unmount());
        expect(second.end).toHaveBeenCalled();
    });

    it('turns what this page sends on and off, drawn again as it changes', async () => {
        const call = aCall();
        const { seen } = await hooked(() => useCall());
        (made[0] as any).call = vi.fn(async () => call);
        await act(async () => seen.current!.start('support:{pair}', { to: 34 }));

        await act(async () => seen.current!.setCamera(false));

        expect(call.setCamera).toHaveBeenLastCalledWith(false, undefined);
        expect(seen.current?.camera).toBeNull();
    });

    it('refuses to open a device with no call', async () => {
        const { seen } = await hooked(() => useCall());

        await expect(seen.current!.setCamera(true)).rejects.toMatchObject({ code: 'not_connected' });
    });
});

describe('StreamVideo', () => {
    it('shows a stream muted, lets it go as another comes, and lets go as it leaves', () => {
        const node = { muted: false };
        const first = { watch: vi.fn(), stop: vi.fn() };
        const second = { watch: vi.fn(), stop: vi.fn() };
        first.watch.mockReturnValue(first.stop);
        second.watch.mockReturnValue(second.stop);

        let root!: ReturnType<typeof create>;
        act(() => {
            root = create(createElement(StreamVideo as never, { stream: first } as never), { createNodeMock: () => node });
        });
        expect(first.watch).toHaveBeenCalledWith(node);
        expect(node.muted).toBe(true);

        act(() => root.update(createElement(StreamVideo as never, { stream: second } as never)));
        expect(first.stop).toHaveBeenCalledTimes(1);
        expect(second.watch).toHaveBeenCalledWith(node);

        act(() => root.unmount());
        expect(second.stop).toHaveBeenCalledTimes(1);
    });

    it('stays empty with no stream', () => {
        let root!: ReturnType<typeof create>;
        act(() => {
            root = create(createElement(StreamVideo as never, { stream: null } as never), { createNodeMock: () => ({}) });
        });

        expect(root.toJSON()).toMatchObject({ type: 'video', props: { muted: true } });
    });
});

describe('VideoTrack and AudioTrack', () => {
    /** Rendered with a media element of its own, which records what it is given. */
    function rendered(type: typeof VideoTrack | typeof AudioTrack, track: unknown, extra: Record<string, unknown> = {}) {
        const node = { srcObject: null as unknown };
        let root!: ReturnType<typeof create>;
        act(() => {
            root = create(createElement(type as never, { track, ...extra } as never), { createNodeMock: () => node });
        });
        return { root, node };
    }

    it('attach what another person sends, and let it go when it changes and when they leave', () => {
        const track = { attach: vi.fn(), detach: vi.fn() };
        const next = { attach: vi.fn(), detach: vi.fn() };
        const { root, node } = rendered(VideoTrack, track);

        expect(track.attach).toHaveBeenCalledWith(node);

        act(() => root.update(createElement(VideoTrack as never, { track: next } as never)));
        expect(track.detach).toHaveBeenCalledWith(node);
        expect(next.attach).toHaveBeenCalledWith(node);

        act(() => root.unmount());
        expect(next.detach).toHaveBeenCalledWith(node);
    });

    it('play this page\'s own picture muted, from its track', () => {
        vi.stubGlobal('MediaStream', class { constructor(readonly tracks: unknown[]) {} });
        const track = { kind: 'video' };
        const { root, node } = rendered(VideoTrack, track);

        expect((node.srcObject as { tracks: unknown[] }).tracks).toEqual([track]);
        expect(root.toJSON()).toMatchObject({ type: 'video', props: { autoPlay: true, playsInline: true, muted: true } });

        act(() => root.unmount());
        expect(node.srcObject).toBeNull();
        vi.unstubAllGlobals();
    });

    it('play another person unmuted, stay empty with no track, and pass on what a video takes', () => {
        expect(rendered(VideoTrack, { attach() {}, detach() {} }).root.toJSON()).toMatchObject({ props: { muted: false } });
        expect(rendered(VideoTrack, null, { className: 'tile' }).root.toJSON()).toMatchObject({ type: 'video', props: { className: 'tile' } });
        expect(rendered(AudioTrack, null).root.toJSON()).toMatchObject({ type: 'audio', props: { autoPlay: true } });
    });
});

describe('CallScreen', () => {
    it('gives the call screen where the app serves its backgrounds and AI noise removal, and nothing it was not given', async () => {
        await act(async () => {
            create(createElement(RealtimeProvider, {} as never,
                createElement(CallScreen, { lang: 'de', add: false, effects: '/effects/', noise: '/noise/' })));
        });

        expect(made[0].callScreen).toHaveBeenCalledWith({ lang: 'de', add: false, effects: '/effects/', noise: '/noise/' });
    });

    it('gives the default for AI noise removal when the app sets one', async () => {
        await act(async () => {
            create(createElement(RealtimeProvider, {} as never,
                createElement(CallScreen, { noise: '/noise/', noiseDefault: 'auto' })));
        });

        expect(made[0].callScreen).toHaveBeenCalledWith({ noise: '/noise/', noiseDefault: 'auto' });
    });

    it('starts with no settings at all', async () => {
        await act(async () => {
            create(createElement(RealtimeProvider, {} as never, createElement(CallScreen)));
        });

        expect(made[0].callScreen).toHaveBeenCalledWith({});
    });
});

describe('useRoom', () => {
    it('names the room of two from this user and `with`, the smaller id first, and leaves it by that name', async () => {
        const { root, seen } = await hooked(() => useRoom('chat:{pair}', {}, { with: 34 }));
        const rt = made[0];

        expect(rt.room).toHaveBeenCalledWith('chat:34:42');
        expect(seen.current).toMatchObject({ state: 'joined' });

        await act(async () => root.unmount());
        expect(rt.leave).toHaveBeenCalledWith('chat:34:42');
    });

    it('joins nothing while the other person is not known yet', async () => {
        const { seen } = await hooked(() => useRoom('chat:{pair}', {}, { with: null }));

        expect(made[0].room).not.toHaveBeenCalled();
        expect(seen.current).toMatchObject({ state: 'idle', error: null });
    });

    it('fails with no_identity on a page with nobody signed in', async () => {
        const Signed = () => {
            useRealtime();
            return null;
        };
        const { connect } = await import('../src/browser.js');
        vi.mocked(connect).mockImplementationOnce(async (options: unknown) => {
            const rt = Object.assign(connection(options), { user: null });
            made.push(rt as ReturnType<typeof connection>);
            return rt as never;
        });
        const { seen } = await hooked(() => (Signed(), useRoom('chat:{pair}', {}, { with: 34 })));

        expect(seen.current).toMatchObject({ state: 'failed', error: 'no_identity' });
        expect(made[0].room).not.toHaveBeenCalled();
    });

    it('takes a plain name as it is', async () => {
        await hooked(() => useRoom('chat:7'));

        expect(made[0].room).toHaveBeenCalledWith('chat:7');
    });
});

describe('useTyping, given what useRoom answered', () => {
    it('hears the room as it does given the room', async () => {
        const { seen } = await hooked(() => useTyping(useRoom('chat:1')));

        act(() => made[0].room_.fire('typing', { on: true }, { from: '34' }));

        expect(seen.current).toEqual(['34']);
    });
});

describe('a token from the app\'s own server', () => {
    it('useCall() starts the call in it, its type the call\'s own', async () => {
        const call = Object.assign(aCall(), { type: 'audio' });
        const { seen } = await hooked(() => useCall());
        const rt = made[0] as any;
        rt.startCall = vi.fn(async () => call);
        rt.call = vi.fn();

        await act(async () => seen.current!.start('a-token'));

        expect(rt.startCall).toHaveBeenCalledWith('a-token');
        expect(rt.call).not.toHaveBeenCalled();
        expect(call.setCamera).not.toHaveBeenCalled();
        expect(call.setMicrophone).toHaveBeenCalledWith(true);
        expect(seen.current!.call).toBe(call);
    });

    it('useCall() says why a token was refused', async () => {
        const { seen } = await hooked(() => useCall());
        (made[0] as any).startCall = vi.fn(async () => { throw Object.assign(new Error('bad_token'), { code: 'bad_token' }); });

        await act(async () => seen.current!.start('not-a-token'));

        expect(seen.current!.error).toBe('bad_token');
    });

    it('useGroupCall() asks for it, and joins once, however often it draws', async () => {
        const getToken = vi.fn(async () => 'a-token');
        let draw!: () => void;
        const { seen } = await hooked(() => {
            const [ , setDrawn ] = useState( 0 );
            draw = () => setDrawn( ( n ) => n + 1 );
            // A new function at every draw, as an inline one is.
            return useGroupCall('meeting:7', () => getToken());
        });

        expect(getToken).toHaveBeenCalledTimes(1);
        expect((made[0] as any).joinGroupCall).toHaveBeenCalledWith('a-token');
        expect((made[0] as any).groupCall).not.toHaveBeenCalled();
        expect(seen.current!.group).toBe((made[0] as any).group_);

        await act(async () => draw());
        await act(async () => draw());
        expect(getToken).toHaveBeenCalledTimes(1);
        expect((made[0] as any).joinGroupCall).toHaveBeenCalledTimes(1);
    });

    it('useGroupCall() says why when the app\'s route refuses', async () => {
        const { seen } = await hooked(() => useGroupCall('meeting:7', async () => { throw Object.assign(new Error('forbidden'), { code: 'forbidden' }); }));

        expect(seen.current!.error).toBe('forbidden');
        expect((made[0] as any).joinGroupCall).not.toHaveBeenCalled();
    });

    it('useStream() joins once with a function, which asks the latest one the component drew', async () => {
        const first = vi.fn(async () => 'first');
        const second = vi.fn(async () => 'second');
        let given = first;
        let draw!: () => void;
        const { seen } = await hooked(() => {
            const [ , setDrawn ] = useState( 0 );
            draw = () => setDrawn( ( n ) => n + 1 );
            return useStream('show:7', given);
        });
        const rt = made[0] as any;
        expect(rt.joinStream).toHaveBeenCalledTimes(1);
        expect(seen.current!.error).toBeNull();

        given = second;
        await act(async () => draw());
        expect(rt.joinStream).toHaveBeenCalledTimes(1);

        const asks = rt.joinStream.mock.calls[0][0];
        expect(await asks()).toBe('second');
        expect(first).not.toHaveBeenCalled();
    });
});

describe('useGroupCall', () => {
    it('gives what this page sends, and turns it on and off, drawn again as it changes', async () => {
        const tracks: Record<string, string | null> = { camera: null };
        const { seen } = await hooked(() => useGroupCall('meeting:daily'));
        const group = made[0].group_ as any;
        group.self = { user: 42 };
        Object.defineProperty(group, 'camera', { get: () => tracks.camera });
        group.setCamera = vi.fn(async (on: boolean) => { tracks.camera = on ? 'camera-track' : null; });

        await act(async () => seen.current!.setCamera(true));

        expect(group.setCamera).toHaveBeenCalledWith(true, undefined);
        expect(seen.current).toMatchObject({ camera: 'camera-track', self: { user: 42 } });
    });

    it('joins while the component is on the page, says who is in it, and leaves as it goes', async () => {
        const { seen, root } = await hooked(() => useGroupCall('meeting:daily', { type: 'audio' }));
        const rt = made[0];

        expect(rt.groupCall).toHaveBeenCalledWith('meeting:daily', { type: 'audio' });
        expect(seen.current).toMatchObject({ group: rt.group_, state: 'connected', people: [{ user: 34 }], error: null });

        rt.group_.people.mockReturnValue([{ user: 34 }, { user: 56 }]);
        await act(async () => rt.group_.fire('person', { user: 56 }));
        expect(seen.current?.people).toHaveLength(2);

        await act(async () => rt.group_.fire('state', 'reconnecting'));
        expect(seen.current?.state).toBe('reconnecting');

        await act(async () => root.unmount());
        expect(rt.group_.leave).toHaveBeenCalledTimes(1);
    });

    it('joins nothing with no name, and says the refusal\'s code', async () => {
        const none = await hooked(() => useGroupCall(null));
        expect(made[0].groupCall).not.toHaveBeenCalled();
        expect(none.seen.current).toMatchObject({ group: null, state: 'idle', people: [] });

        const { connect } = await import('../src/browser.js');
        vi.mocked(connect).mockImplementationOnce(async () => {
            const rt = connection({});
            rt.groupCall = vi.fn(() => Promise.reject(Object.assign(new Error('forbidden'), { code: 'forbidden' }))) as never;
            return rt as never;
        });
        const refused = await hooked(() => useGroupCall('meeting:daily'));
        expect(refused.seen.current?.error).toBe('forbidden');
    });
});

describe('useProfiles and useTyping', () => {
    it('name people from the directory, as they arrive', async () => {
        const { seen } = await hooked(() => useProfiles([34, '42', 34]));

        expect(made[0].users).toHaveBeenCalledTimes(1);
        expect(seen.current?.['34']).toMatchObject({ name: 'User 34' });
    });

    it('say who is typing, leave the page\'s own user out, and end with their message', async () => {
        const room = emitter({ name: 'chat:1' });
        const { seen } = await hooked(() => useTyping(room as never));

        await act(async () => room.fire('typing', { on: true }, { from: '34' }));
        expect(seen.current).toEqual(['34']);

        await act(async () => room.fire('typing', { on: true }, { from: '42' }));
        expect(seen.current).toEqual(['34']);

        await act(async () => room.fire('message', { text: 'Hi' }, { from: '34' }));
        expect(seen.current).toEqual([]);
    });
});
