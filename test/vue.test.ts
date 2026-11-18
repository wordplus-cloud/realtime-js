import { createRenderer, createSSRApp, defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aConnection, anIncoming } from './framework-fakes.js';

// The composables an app draws its own screens on, in Vue itself, on a renderer that needs no page. What they share is
// test/framework-bindings.test.ts's, and test/e2e/frameworks.mjs runs them in a new Vite app and a new Nuxt app in Chromium.

const made: Array<ReturnType<typeof aConnection>> = [];

vi.mock('../src/browser.js', () => ({
    connect: vi.fn(async (options: unknown) => {
        const rt = aConnection(options);
        made.push(rt);
        return rt;
    }),
}));

const { AudioTrack, provideRealtime, StreamVideo, useCall, useCalls, useConnection, useGroupCall, useOnline, usePresence, useProfiles, useRealtime, useRoom, useStream, useTyping, useUserEvent, VideoTrack } = await import('../src/vue.js');
const browser = await import('../src/browser.js');

const renderer = createRenderer<object, object>({
    insert() {},
    remove() {},
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText() {},
    setElementText() {},
    parentNode: () => null,
    nextSibling: () => null,
    patchProp() {},
});

const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    await nextTick();
};

/** `setup` in a child of the root that holds the connection, or in the root itself: what it answered, and how to end it. */
async function mounted<T>(setup: () => T, { options, inRoot = false }: { options?: Parameters<typeof provideRealtime>[0]; inRoot?: boolean } = {}) {
    let seen!: T;
    const child = defineComponent({
        setup() {
            seen = setup();
            return () => null;
        },
    });
    const root = defineComponent({
        setup() {
            provideRealtime(options);
            if (inRoot) seen = setup();
            return () => (inRoot ? null : h(child));
        },
    });
    const app = renderer.createApp(root);
    app.mount({});
    await settle();
    return { seen, unmount: () => app.unmount() };
}

afterEach(() => {
    made.length = 0;
    vi.mocked(browser.connect).mockClear();
    vi.restoreAllMocks();
});

describe('provideRealtime', () => {
    it('connects once with no options, the routes saying which app, and closes as the root goes', async () => {
        const { seen, unmount } = await mounted(() => useRealtime());

        expect(browser.connect).toHaveBeenCalledTimes(1);
        expect(made[0].options).toEqual({});
        expect(seen.value).toBe(made[0]);

        unmount();
        expect(made[0].close).toHaveBeenCalled();
    });

    it('connects again when its options say something else, as a ref or a getter, and not for the same again', async () => {
        const options = ref<{ app: string }>({ app: 's1' });
        const { seen } = await mounted(() => useRealtime(), { options });

        options.value = { app: 's1' };
        await settle();
        expect(made).toHaveLength(1);

        options.value = { app: 's2' };
        await settle();
        expect(made).toHaveLength(2);
        expect(made[0].close).toHaveBeenCalled();
        expect(seen.value).toBe(made[1]);
    });

    it('serves the component it was called in too', async () => {
        const { seen } = await mounted(() => useRoom('chat:7'), { inRoot: true });

        expect(made[0].join).toHaveBeenCalledWith('chat:7');
        expect(seen.state.value).toBe('joining');
    });

    it('says in the console when a helper has none above it', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const app = renderer.createApp(defineComponent({
            setup() {
                useRoom('chat:7');
                return () => null;
            },
        }));
        app.mount({});
        await settle();

        expect(warn.mock.lastCall?.[0]).toContain('provideRealtime()');
        expect(browser.connect).not.toHaveBeenCalled();
    });
});

describe('useConnection', () => {
    it('says whether the connection is up, and why it was refused until it connects', async () => {
        const { seen } = await mounted(() => useConnection());

        expect(seen.connected.value).toBe(false);
        made[0].fire('connected');
        expect(seen.connected.value).toBe(true);
        made[0].fire('disconnected');
        expect(seen.connected.value).toBe(false);

        made[0].fire('error', { code: 'wrong_origin' });
        expect(seen.error.value).toEqual({ code: 'wrong_origin' });
        made[0].fire('connected');
        expect(seen.error.value).toBeNull();
    });
});

describe('useRoom', () => {
    it('joins as the component mounts, stays current, and leaves as it goes', async () => {
        const { seen, unmount } = await mounted(() => useRoom('chat:7'));
        const room = made[0].rooms.get('chat:7')!;

        expect(seen.state.value).toBe('joining');
        expect(seen.room.value).toBe(room);

        room.state = 'joined';
        room.count = 2;
        room.members.set('34', { name: 'Ann' });
        room.fire('joined', []);
        expect(seen.state.value).toBe('joined');
        expect(seen.members.value).toEqual([{ id: '34', info: { name: 'Ann' } }]);
        expect(seen.count.value).toBe(2);

        unmount();
        expect(made[0].leave).toHaveBeenCalledWith('chat:7');
    });

    it('gives its handlers each event, and error covers a rule that says no and a kick', async () => {
        const handlers = { message: vi.fn(), kicked: vi.fn() };
        const { seen } = await mounted(() => useRoom('chat:7', handlers));
        const room = made[0].rooms.get('chat:7')!;

        room.fire('message', { text: 'Hi' }, { from: '34' });
        expect(handlers.message).toHaveBeenCalledWith({ text: 'Hi' }, { from: '34' });

        room.state = 'failed';
        room.error = 'forbidden';
        room.fire('error', { code: 'forbidden' });
        expect(seen.error.value).toBe('forbidden');

        room.error = 'kicked';
        room.fire('kicked', { code: 'kicked' });
        expect(seen.error.value).toBe('kicked');
        expect(handlers.kicked).toHaveBeenCalledTimes(1);
    });

    it('moves to another room as its name changes, and joins nothing for null', async () => {
        const name: Ref<string | null> = ref('chat:7');
        const { seen } = await mounted(() => useRoom(() => name.value));

        name.value = 'chat:8';
        await settle();
        expect(made[0].leave).toHaveBeenCalledWith('chat:7');
        expect(made[0].join).toHaveBeenLastCalledWith('chat:8');

        name.value = null;
        await settle();
        expect(made[0].leave).toHaveBeenCalledWith('chat:8');
        expect(seen.state.value).toBe('idle');
        expect(seen.room.value).toBeNull();
    });

    it('stays in its room when what its name is read from changes and the name does not', async () => {
        // Vue runs a watch again for any change with a shallow ref among its sources, and the connection is one.
        const id = ref(7);
        await mounted(() => useRoom(() => (id.value > 0 ? 'chat:7' : 'chat:0')));

        id.value = 8;
        await settle();

        expect(made[0].join).toHaveBeenCalledTimes(1);
        expect(made[0].leave).not.toHaveBeenCalled();
    });

    it('waits for `with` on {pair}, then joins the room of the two', async () => {
        const other = ref<number | null>(null);
        const { seen } = await mounted(() => useRoom('chat:{pair}', {}, { with: other }));

        expect(seen.state.value).toBe('idle');
        expect(made[0].join).not.toHaveBeenCalled();

        other.value = 34;
        await settle();
        expect(made[0].join).toHaveBeenCalledWith('chat:34:42');
    });

    it('keeps its room when the connection only drops, as the room comes back by itself', async () => {
        await mounted(() => useRoom('chat:7'));

        made[0].fire('disconnected');
        made[0].fire('connected');
        await settle();

        expect(made[0].join).toHaveBeenCalledTimes(1);
        expect(made[0].leave).not.toHaveBeenCalled();
    });

    it('sends to the room, and refuses with not_joined when there is none', async () => {
        const { seen } = await mounted(() => useRoom('chat:7'));
        seen.emit('message', { text: 'Hi' });
        expect(made[0].rooms.get('chat:7')!.emit).toHaveBeenCalledWith('message', { text: 'Hi' });
        await expect(seen.emitWithAck('message', { text: 'Hi' })).resolves.toEqual({ id: '1', at: 1 });

        const none = await mounted(() => useRoom(null));
        expect(() => none.seen.emit('message')).not.toThrow();
        await expect(none.seen.emitWithAck('message')).rejects.toMatchObject({ code: 'not_joined' });
    });
});

describe('usePresence', () => {
    it('lists who is in the room as that changes', async () => {
        const { seen } = await mounted(() => usePresence('lobby'));
        const room = made[0].rooms.get('lobby')!;

        room.members.set('34', { name: 'Ann' });
        room.fire('join', { id: '34' });

        expect(seen.value).toEqual([{ id: '34', info: { name: 'Ann' } }]);
    });
});

describe('useOnline', () => {
    it('says who of them is online as that changes, and follows new ids, not a new array of the same', async () => {
        const ids = ref([34]);
        const { seen } = await mounted(() => useOnline(ids));
        const { online } = made[0];

        expect(online.watch).toHaveBeenLastCalledWith(['34']);
        expect(seen.online.value).toEqual({ 34: false });

        online.known.add('34');
        online.fire('change', { id: '34', online: true });
        expect(seen.online.value).toEqual({ 34: true });

        online.watch.mockClear();
        ids.value = [34];
        await settle();
        expect(online.watch).not.toHaveBeenCalled();

        ids.value = [34, 42];
        await settle();
        expect(online.watch).toHaveBeenLastCalledWith(['34', '42']);
    });

    it('says how many are online with `count`', async () => {
        const { seen } = await mounted(() => useOnline([], { count: true }));

        made[0].online.count = 7;
        made[0].online.fire('count', 7);

        expect(seen.count.value).toBe(7);
    });
});

describe('useProfiles', () => {
    it('adds the names of the people asked for as they arrive', async () => {
        const ids = ref([34]);
        const { seen } = await mounted(() => useProfiles(ids));
        expect(seen.value[34]?.name).toBe('User 34');

        ids.value = [42];
        await settle();
        expect(seen.value[34]?.name).toBe('User 34');
        expect(seen.value[42]?.name).toBe('User 42');
    });
});

describe('useTyping', () => {
    it('takes what useRoom() answered, and a room\'s other news restarts nothing', async () => {
        const { seen } = await mounted(() => useTyping(useRoom('chat:7')));
        const room = made[0].rooms.get('chat:7')!;

        room.fire('typing', { on: true }, { from: '34' });
        await settle();
        expect(seen.value).toEqual(['34']);

        room.fire('join', { id: '43' });
        await settle();
        expect(seen.value).toEqual(['34']);
    });

    it('takes a room, or a ref or a getter of one', async () => {
        const held = ref<any>(null);
        const { seen } = await mounted(() => useTyping(held));
        const rt = made[0];
        expect(seen.value).toEqual([]);

        held.value = rt.join('chat:9');
        await settle();
        rt.rooms.get('chat:9')!.fire('typing', { on: true }, { from: '34' });
        expect(seen.value).toEqual(['34']);
    });
});

describe('useUserEvent', () => {
    it('hears what the server sends the user while the component is on the page', async () => {
        const handler = vi.fn();
        const { unmount } = await mounted(() => useUserEvent('notice', handler));

        made[0].fire('notice', { text: 'Hi' }, { at: 1 });
        expect(handler).toHaveBeenCalledWith({ text: 'Hi' }, { at: 1 });

        unmount();
        made[0].fire('notice', { text: 'Again' }, { at: 2 });
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe('useCalls', () => {
    it('loads the calls, and says what rings as it changes', async () => {
        const { seen } = await mounted(() => useCalls());
        const { calls } = made[0].made;
        expect(seen.calls.value).toBe(calls);
        expect(seen.incoming.value).toEqual([]);

        const ring = anIncoming();
        calls.ringing.push(ring);
        calls.fire('incoming', ring);
        expect(seen.incoming.value).toEqual([ring]);
    });

    it('says what they were refused with', async () => {
        vi.mocked(browser.connect).mockImplementationOnce(async (options) => {
            const rt = aConnection(options);
            rt.calls.mockRejectedValueOnce(Object.assign(new Error('no_webrtc'), { code: 'no_webrtc' }));
            made.push(rt);
            return rt as never;
        });
        const { seen } = await mounted(() => useCalls());

        expect(seen.error.value).toBe('no_webrtc');
        expect(seen.calls.value).toBeNull();
    });
});

describe('useCall', () => {
    it('starts with no call, places one with what its type asks for, and ends it as the component goes', async () => {
        const { seen, unmount } = await mounted(() => useCall());
        expect(seen.state.value).toBe('idle');
        expect(seen.call.value).toBeNull();

        await seen.start('support:{pair}', { to: 34 });
        await settle();
        const { call } = made[0].made;
        expect(seen.call.value).toBe(call);
        expect(seen.state.value).toBe('ringing');
        expect(seen.camera.value).toBe('camera-track');

        call.fire('state', 'connected');
        expect(seen.state.value).toBe('connected');

        unmount();
        expect(call.end).toHaveBeenCalled();
    });

    it('answers what rings, turns its camera off and on, and says why it ended', async () => {
        const { seen } = await mounted(() => useCall());
        const { call } = made[0].made;

        await seen.answer(anIncoming(call) as never);
        await settle();
        expect(seen.peer.value).toEqual(call.peer);

        await seen.setCamera(false);
        expect(seen.camera.value).toBeNull();

        seen.end();
        expect(seen.state.value).toBe('idle');
        expect(seen.endReason.value).toBe('hangup');
    });
});

describe('a token from the app\'s own server', () => {
    it('useCall() starts the call in it', async () => {
        const { seen } = await mounted(() => useCall());
        await settle();
        await seen.start('a-token');
        expect(made[0].startCall).toHaveBeenCalledWith('a-token');
        expect(made[0].call).not.toHaveBeenCalled();
    });

    it('useGroupCall() asks for it, and joins the call it names, once while the name stays', async () => {
        const getToken = vi.fn(async () => 'a-token');
        const name = ref<string | null>('meeting:7');
        const { seen } = await mounted(() => useGroupCall(name, getToken));
        await settle();
        expect(getToken).toHaveBeenCalledTimes(1);
        expect(made[0].joinGroupCall).toHaveBeenCalledWith('a-token');
        expect(made[0].groupCall).not.toHaveBeenCalled();
        expect(seen.group.value).toBe(made[0].made.group);
    });

    it('useGroupCall() says why when the app\'s route refuses', async () => {
        const getToken = vi.fn(async () => { throw Object.assign(new Error('forbidden'), { code: 'forbidden' }); });
        const { seen } = await mounted(() => useGroupCall('meeting:7', getToken));
        await settle();
        expect(seen.error.value).toBe('forbidden');
        expect(made[0].joinGroupCall).not.toHaveBeenCalled();
    });

    it('useStream() joins with the function, for the SDK to ask again as each token runs out', async () => {
        const getToken = vi.fn(async () => 'a-token');
        await mounted(() => useStream('show:7', getToken));
        await settle();
        expect(made[0].joinStream).toHaveBeenCalledWith(getToken);
        expect(made[0].stream).not.toHaveBeenCalled();
    });
});

describe('useGroupCall', () => {
    it('joins, says who is in it, and leaves as its name goes or the component does', async () => {
        const name = ref<string | null>('meeting:7');
        const { seen, unmount } = await mounted(() => useGroupCall(name, { type: 'audio' }));
        const { group } = made[0].made;

        expect(made[0].groupCall).toHaveBeenCalledWith('meeting:7', { type: 'audio' });
        expect(seen.group.value).toBe(group);
        expect(seen.state.value).toBe('connected');
        expect(seen.people.value).toEqual([{ identity: 'user_34', user: 34 }]);
        expect(seen.self.value).toEqual({ user: 42 });

        await seen.setCamera(true);
        expect(seen.camera.value).toBe('camera-track');

        name.value = null;
        await settle();
        expect(group.leave).toHaveBeenCalledTimes(1);
        expect(seen.state.value).toBe('idle');

        name.value = 'meeting:7';
        await settle();
        unmount();
        expect(group.leave).toHaveBeenCalledTimes(2);
    });

    it('joins nothing for null', async () => {
        const { seen } = await mounted(() => useGroupCall(null));

        expect(made[0].groupCall).not.toHaveBeenCalled();
        expect(seen.state.value).toBe('idle');
    });

    it('says what it was refused with', async () => {
        vi.mocked(browser.connect).mockImplementationOnce(async (options) => {
            const rt = aConnection(options);
            rt.groupCall.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 'forbidden' }));
            made.push(rt);
            return rt as never;
        });
        const { seen } = await mounted(() => useGroupCall('meeting:7'));

        expect(seen.error.value).toBe('forbidden');
    });
});

describe('useStream', () => {
    it('joins, says how it is as it changes, and leaves as its name goes or the component does', async () => {
        const name = ref<string | null>('show:7');
        const { seen, unmount } = await mounted(() => useStream(name));
        const { stream } = made[0].made;

        expect(made[0].stream).toHaveBeenCalledWith('show:7');
        expect(seen.stream.value).toBe(stream);
        expect(seen.state.value?.viewers).toBe(1);

        stream.change({ viewers: 5 });
        expect(seen.state.value?.viewers).toBe(5);

        name.value = null;
        await settle();
        expect(stream.leave).toHaveBeenCalledTimes(1);
        expect(seen.stream.value).toBeNull();
        expect(seen.state.value).toBeNull();

        name.value = 'show:7';
        await settle();
        unmount();
        expect(stream.leave).toHaveBeenCalledTimes(2);
    });

    it('joins nothing for null', async () => {
        const { seen } = await mounted(() => useStream(null));

        expect(made[0].stream).not.toHaveBeenCalled();
        expect(seen.stream.value).toBeNull();
    });

    it('says what it was refused with', async () => {
        vi.mocked(browser.connect).mockImplementationOnce(async (options) => {
            const rt = aConnection(options);
            rt.stream.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 'forbidden' }));
            made.push(rt);
            return rt as never;
        });
        const { seen } = await mounted(() => useStream('show:7'));

        expect(seen.error.value).toBe('forbidden');
    });
});

describe('StreamVideo', () => {
    const stream = () => ({ watch: vi.fn(), stop: vi.fn() });

    it('shows a stream as it comes, lets it go as another does, and lets go as it leaves', async () => {
        const first = stream();
        const second = stream();
        first.watch.mockReturnValue(first.stop);
        second.watch.mockReturnValue(second.stop);
        const given = ref<any>(first);
        const app = renderer.createApp(defineComponent({ setup: () => () => h(StreamVideo, { stream: given.value, class: 'big' }) }));
        app.mount({});
        await settle();
        expect(first.watch).toHaveBeenCalledTimes(1);

        given.value = second;
        await settle();
        expect(first.stop).toHaveBeenCalledTimes(1);
        expect(second.watch).toHaveBeenCalledTimes(1);

        app.unmount();
        expect(second.stop).toHaveBeenCalledTimes(1);
    });

    it('renders on a server, and watches nothing', async () => {
        const first = stream();
        const html = await renderToString(createSSRApp(defineComponent({ setup: () => () => h(StreamVideo, { stream: first as never, class: 'big' }) })));

        expect(html).toContain('<video');
        expect(html).toContain('class="big"');
        expect(first.watch).not.toHaveBeenCalled();
    });
});

describe('VideoTrack and AudioTrack', () => {
    const track = () => ({ attach: vi.fn(), detach: vi.fn() });

    /** The component on the renderer that needs no page. Its `setTrack` changes the track, and it answers the element it drew. */
    async function drawn(component: typeof VideoTrack, first: unknown) {
        const given = ref<any>(first);
        const app = renderer.createApp(defineComponent({ setup: () => () => h(component, { track: given.value, class: 'mine' }) }));
        app.mount({});
        await settle();
        return { given, unmount: () => app.unmount() };
    }

    it('attach a track as it comes, let it go as another does, and let go as they leave', async () => {
        const first = track();
        const second = track();
        const { given, unmount } = await drawn(VideoTrack, first);
        expect(first.attach).toHaveBeenCalledTimes(1);

        given.value = second;
        await settle();
        expect(first.detach).toHaveBeenCalledTimes(1);
        expect(second.attach).toHaveBeenCalledTimes(1);

        given.value = null;
        await settle();
        expect(second.detach).toHaveBeenCalledTimes(1);

        const sound = track();
        const audio = await drawn(AudioTrack, sound);
        expect(sound.attach).toHaveBeenCalledTimes(1);
        audio.unmount();
        expect(sound.detach).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('render on a server with the element and what it was given, and attach nothing', async () => {
        const remote = track();
        const app = createSSRApp(defineComponent({ setup: () => () => h('div', [h(VideoTrack, { track: remote as never, class: 'theirs' }), h(AudioTrack, { track: remote as never })]) }));

        const html = await renderToString(app);

        expect(html).toContain('<video');
        expect(html).toContain('class="theirs"');
        expect(html).toContain('autoplay');
        expect(html).toContain('<audio');
        expect(remote.attach).not.toHaveBeenCalled();
    });
});

describe('on the server', () => {
    it('renders each room and call idle, connecting to nothing and warning of nothing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const child = defineComponent({
            setup() {
                const { state, error } = useRoom('chat:7', { message: () => {} });
                useUserEvent('notice', () => {});
                const { connected } = useConnection();
                const { online } = useOnline([34]);
                const profiles = useProfiles([34]);
                const lobby = usePresence('lobby');
                const typing = useTyping(useRoom('chat:7'));
                const { incoming } = useCalls();
                const call = useCall();
                const group = useGroupCall('meeting:7');
                return () => h('p', [
                    state.value, error.value, connected.value, JSON.stringify(online.value), JSON.stringify(profiles.value), lobby.value.length, typing.value.length, incoming.value.length, call.state.value, group.state.value,
                ].join(' '));
            },
        });
        const app = createSSRApp(defineComponent({
            setup() {
                provideRealtime();
                return () => h(child);
            },
        }));

        expect(await renderToString(app)).toBe('<p>idle  false {} {} 0 0 0 idle idle</p>');
        expect(browser.connect).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });
});
