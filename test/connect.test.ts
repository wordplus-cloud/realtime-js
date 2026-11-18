import { afterEach, describe, expect, it, vi } from 'vitest';

// connect() as a page calls it: with no options, its keys route naming the app, and a keys route that fails said aloud.
// The client under it is a stand-in here: the connection itself runs in test/e2e/check.mjs.

type Listener = (...args: any[]) => void;

function fakeRooms(options: Record<string, unknown>) {
    const listeners = new Map<string, Listener[]>();
    return {
        options,
        tab: 't1',
        user: null,
        on(event: string, fn: Listener) {
            listeners.set(event, [...(listeners.get(event) ?? []), fn]);
            return this;
        },
        off() {
            return this;
        },
        fire(event: string, ...args: unknown[]) {
            for (const fn of listeners.get(event) ?? []) fn(...args);
        },
        close() {},
    };
}

vi.mock('../vendor/realtime-client/index.js', async (actual) => ({
    ...(await actual<typeof import('../vendor/realtime-client/index.js')>()),
    rooms: vi.fn((options: Record<string, unknown>) => fakeRooms(options)),
}));

const { connect, connectNow, Realtime } = await import('../src/browser.js');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function keysRoute(answer: () => Response | Promise<Response>) {
    const fetched = vi.fn(async (_url: string, _init: RequestInit) => answer());
    vi.stubGlobal('fetch', fetched);
    return fetched;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('a room of two', () => {
    function page(user: string | null) {
        const rt = connectNow({ app: 's1' }) as any;
        Object.assign(rt.rooms, { user, join: vi.fn((name: string) => ({ name, on() {} })), room: vi.fn(), leave: vi.fn() });
        return rt;
    }

    it('says a room no rule owns in the console, once, and nothing of a user a rule turned away', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const rt = connectNow({ app: 's1' }) as any;
        const heard: Listener[] = [];
        const room = { name: 'nothing:1', on: (_event: string, fn: Listener) => heard.push(fn) };
        Object.assign(rt.rooms, { user: '42', join: vi.fn(() => room) });

        rt.join('nothing:1');
        rt.join('nothing:1');
        expect(heard).toHaveLength(1);

        heard[0]({ code: 'forbidden' });
        expect(warn).not.toHaveBeenCalled();

        heard[0]({ code: 'no_rule' });
        heard[0]({ code: 'no_rule' });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('nothing:1');
        expect(warn.mock.calls[0][0]).toContain('realtime.room(');
        warn.mockRestore();
    });

    it('is named the same by both people, the smaller id first, as a number where both are', () => {
        expect(page('42').join('chat:{pair}', { with: 34 }).name).toBe('chat:34:42');
        expect(page('34').join('chat:{pair}', { with: '42' }).name).toBe('chat:34:42');
        expect(page('9').join('chat:{pair}', { with: 10 }).name).toBe('chat:9:10');
    });

    it('is found and left by the same words', () => {
        const rt = page('42');
        rt.room('chat:{pair}', { with: 34 });
        rt.leave('chat:{pair}', { with: 34 });

        expect(rt.rooms.room).toHaveBeenCalledWith('chat:34:42');
        expect(rt.rooms.leave).toHaveBeenCalledWith('chat:34:42');
    });

    it('needs the other person, and a user', () => {
        expect(() => page('42').join('chat:{pair}')).toThrow(/needs `with`/);
        expect(() => page(null).join('chat:{pair}', { with: 34 })).toThrow(expect.objectContaining({ code: 'no_identity' }));
    });

    it('leaves any other name as it is', () => {
        expect(page(null).join('chat:7').name).toBe('chat:7');
    });
});

describe('connect()', () => {
    it('needs no options: the routes at /api/realtime name the app', async () => {
        const fetched = keysRoute(() => json({ keys: ['d:1:ab'], identity: { token: 't', exp: 1 }, app: 's1500000007' }));

        const rt = await connect();

        expect(fetched.mock.calls[0][0]).toBe('/api/realtime/keys');
        expect(rt.settings.site).toBe('s1500000007');
        expect(rt.settings.keys).toMatchObject({ entries: ['d:1:ab'], identity: { token: 't', exp: 1 } });
    });

    it('asks the routes where `endpoint` says, and takes the key `app` names over theirs', async () => {
        const fetched = keysRoute(() => json({ keys: [], app: 's-route' }));

        const rt = await connect({ app: 's-named', endpoint: '/rt' });

        expect(fetched.mock.calls[0][0]).toBe('/rt/keys');
        expect(rt.settings.site).toBe('s-named');
    });

    it('still takes `site`, and asks nothing given the server\'s config() with a user\'s keys', async () => {
        const fetched = keysRoute(() => json({ keys: [] }));

        expect((await connect({ site: 's-old' })).settings.site).toBe('s-old');
        fetched.mockClear();

        const rt = await connect({ site: 's1', auth: { endpoint: '/x/auth' }, keys: { entries: ['d:1:ab'] } });
        expect(rt.settings.site).toBe('s1');
        expect(fetched).not.toHaveBeenCalled();
    });

    it('says what to do where a server older than this names no app', async () => {
        keysRoute(() => json({ keys: [] }));

        await expect(connect()).rejects.toThrow(/pass `app`, or update the server package/);
    });

    it('rejects with `keys_failed` where the route fails and nothing names the app', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        keysRoute(() => json({}, 500));

        await expect(connect()).rejects.toMatchObject({ code: 'keys_failed', name: 'RealtimeError' });
    });
});

describe('a keys route that fails', () => {
    it('leaves the page connected, and `error` says why even to a listener added after connect() returned', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        keysRoute(() => json({}, 500));

        const rt = await connect({ app: 's1' });
        const heard: unknown[] = [];
        rt.on('error', (e) => heard.push(e));
        await flush();

        expect(heard).toEqual([{ code: 'keys_failed', status: 500 }]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('/api/realtime/keys');
        expect(warn.mock.calls[0][0]).toContain('500');

        // Said once, to the first who listens.
        const later: unknown[] = [];
        rt.on('error', (e) => later.push(e));
        await flush();
        expect(later).toEqual([]);
    });

    it('that did not answer says so', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        keysRoute(() => Promise.reject(new TypeError('Failed to fetch')));

        const rt = await connect({ app: 's1' });
        const heard: unknown[] = [];
        rt.on('error', (e) => heard.push(e));
        await flush();

        expect(heard).toEqual([{ code: 'keys_failed' }]);
        expect(warn.mock.calls[0][0]).toContain('did not answer');
    });

    it('that answers something else than JSON fails the same', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        keysRoute(() => new Response('<html>', { status: 200 }));

        const rt = await connect({ app: 's1' });
        const heard: unknown[] = [];
        rt.on('error', (e) => heard.push(e));
        await flush();

        expect(heard).toEqual([{ code: 'keys_failed', status: 200 }]);
    });

    it('keeps the console quiet for a visitor a route of the app\'s own turned away', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        keysRoute(() => json({}, 401));

        const rt = await connect({ app: 's1' });
        const heard: unknown[] = [];
        rt.on('error', (e) => heard.push(e));
        await flush();

        expect(warn).not.toHaveBeenCalled();
        expect(heard).toEqual([{ code: 'keys_failed', status: 401 }]);
    });
});

describe('connectNow()', () => {
    it('needs the app\'s key, having no time to ask', () => {
        expect(() => connectNow({})).toThrow(/app/);
    });
});

describe('the short ways to a call', () => {
    function page() {
        const rt = new Realtime({ site: 's1' } as never);
        const calls = {
            start: vi.fn(async () => 'a call'),
            group: vi.fn(async () => 'a group call'),
            stream: vi.fn(async () => 'a stream'),
        };
        rt.calls = (async () => calls) as never;
        return { rt, calls };
    }

    it('are the page\'s calls, so nothing else need be held', async () => {
        const { rt, calls } = page();

        expect(await rt.call('support:{pair}', { to: 34, type: 'audio' })).toBe('a call');
        expect(calls.start).toHaveBeenCalledWith('support:{pair}', { to: 34, type: 'audio' });

        expect(await rt.groupCall('meeting:daily', { type: 'audio' })).toBe('a group call');
        expect(calls.group).toHaveBeenCalledWith('meeting:daily', { type: 'audio' });

        expect(await rt.stream('show:42', { video: false })).toBe('a stream');
        expect(calls.stream).toHaveBeenCalledWith('show:42', { video: false });
    });

    it('reject as the calls do where a page has none', async () => {
        const { rt } = page();
        rt.calls = (() => Promise.reject(Object.assign(new Error('no_webrtc'), { code: 'no_webrtc' }))) as never;

        await expect(rt.call('support:34:42', { to: 34 })).rejects.toMatchObject({ code: 'no_webrtc' });
        await expect(rt.groupCall('meeting:daily')).rejects.toMatchObject({ code: 'no_webrtc' });
        await expect(rt.stream('show:42')).rejects.toMatchObject({ code: 'no_webrtc' });
    });
});
