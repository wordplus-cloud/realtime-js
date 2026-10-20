import { describe, expect, it } from 'vitest';
import { settingsOf } from '../src/browser.js';
import { connectNow } from '../src/native.js';

// What connect() hands the client, from its own options or from the server's config(). The connection itself runs in
// test/e2e/check.mjs, in real browsers against a realtime server.

describe('connect()\'s settings', () => {
    it('put the routes beside each other under the endpoint, on WordPlus Cloud by default, the browser files from them', () => {
        expect(settingsOf({ site: 's1500000007' })).toEqual({
            site: 's1500000007',
            server: 'https://ws.wordplus.cloud',
            path: '/websocket',
            worker: '/api/realtime/files/realtime-worker.js',
            rooms: '/api/realtime/files/realtime-rooms.min.js',
            api: 'https://rest.wordplus.cloud',
            auth: { endpoint: '/api/realtime/auth', headers: {} },
            calls: { endpoint: '/api/realtime/calls', headers: {} },
            keys: { endpoint: '/api/realtime/keys', headers: {}, entries: [] },
        });
        expect(settingsOf({ site: 's1', endpoint: '/rt/' })).toMatchObject({ worker: '/rt/files/realtime-worker.js', rooms: '/rt/files/realtime-rooms.min.js' });
        expect(settingsOf({ site: 's1', worker: null }).worker).toBeNull();   // each tab by itself

        const given = settingsOf({ site: 's1', endpoint: '/rt/', headers: { 'X-CSRF-Token': 't' }, worker: '/realtime-worker.js', rooms: '/rooms.js', streamsUi: '/js/streams.js', ring: false, keys: { entries: ['d:1:ab'], identity: { token: 'x', exp: 1 } } });
        expect(given).toMatchObject({
            worker: '/realtime-worker.js',
            rooms: '/rooms.js',
            streamsUi: '/js/streams.js',
            ring: false,
            auth: { endpoint: '/rt/auth', headers: { 'X-CSRF-Token': 't' } },
            keys: { endpoint: '/rt/keys', entries: ['d:1:ab'], identity: { token: 'x', exp: 1 } },
        });
    });

    it('take the server\'s config() as it is', () => {
        const config = {
            site: 's1',
            server: 'https://ws.example.test',
            path: '/websocket',
            api: 'https://rest.example.test',
            auth: { endpoint: 'https://app.example.com/realtime/auth', headers: { A: 'b' } },
            calls: { endpoint: 'https://app.example.com/realtime/calls', headers: { A: 'b' } },
            keys: { endpoint: 'https://app.example.com/realtime/keys', headers: { A: 'b' }, entries: ['u:1:1:ff'] },
        };

        expect(settingsOf(config)).toMatchObject({ ...config, worker: null });
        // Without the calls and keys routes named, they are beside the auth route.
        expect(settingsOf({ site: 's1', auth: { endpoint: '/x/auth' } })).toMatchObject({ calls: { endpoint: '/x/calls' }, keys: { endpoint: '/x/keys', entries: [] } });
    });

    it('need the app\'s key, as `app` or `site`, and carry the public rooms\' grants', () => {
        expect(() => settingsOf({ site: '' })).toThrow(/app/);
        const grants = [{ token: 't', exp: 1, rooms: ['product:{id}'] }];
        expect(settingsOf({ app: 's2', grants })).toMatchObject({ site: 's2', grants });
        expect(settingsOf({ site: 's1', auth: { endpoint: '/x/auth' }, grants })).toMatchObject({ grants });
    });

    it('put a route at an address of its own, the others beside `endpoint`', () => {
        expect(settingsOf({ site: 's1', endpoint: '/rt', routes: { calls: '/check-call' } })).toMatchObject({
            auth: { endpoint: '/rt/auth' },
            calls: { endpoint: '/check-call' },
            keys: { endpoint: '/rt/keys' },
        });
    });

    it('in a native app, need the routes\' full address', () => {
        expect(() => connectNow({ site: 's1', endpoint: '/api/realtime' })).toThrow(/full address/);
        expect(() => connectNow({ site: 's1', endpoint: 'https://app.example.com/api/realtime', routes: { calls: '/check-call' } })).toThrow(/full address/);
    });
});

describe('the elements\' prefix', () => {
    it('comes with connect()\'s screen settings, as with the server\'s config()', async () => {
        const { settingsOf } = await import('../src/browser.js');
        expect(settingsOf({ app: 's1', screen: { prefix: 'shop' } }).screen).toEqual({ prefix: 'shop' });
        expect(settingsOf({ app: 's1' }).screen).toBeUndefined();
    });

    it('goes on the script\'s tag, which the script reads as it runs, before it defines the elements', async () => {
        const { loadScreen } = await import('../src/browser.js');
        const g = globalThis as any;
        const saved = g.document;
        const added: any[] = [];
        g.document = {
            createElement: () => ({ dataset: {} }),
            head: { appendChild: (script: any) => { added.push(script); queueMicrotask(() => { g.prefixTestScreen = { start: () => true }; script.onload(); }); } },
        };
        try {
            expect(await loadScreen('prefixTestScreen', '/api/realtime/files/abc/realtime-ui-streams.min.js', 'shop')).not.toBeNull();
            expect(added[0].dataset.prefix).toBe('shop');
        } finally {
            g.document = saved;
            delete g.prefixTestScreen;
        }
    });
});

describe('a browser file that does not load', () => {
    it('is named once in the console, with its status and where the routes must serve it', async () => {
        // The online list, the chat and the call screen stayed empty with only the browser's own 404 (an SDK review, 2026-10-15).
        const { vi } = await import('vitest');
        const { loadScreen } = await import('../src/browser.js');
        const g = globalThis as any;
        const saved = { document: g.document, fetch: g.fetch };
        g.document = { createElement: () => ({}), head: { appendChild: (script: any) => queueMicrotask(() => script.onerror()) } };
        g.fetch = vi.fn(async () => ({ status: 404 }));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            expect(await loadScreen('wordplusRealtimeUi', '/api/realtime/files/abc/realtime-ui.min.js')).toBeNull();
            await new Promise((r) => setTimeout(r, 0));
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain('/api/realtime/files/abc/realtime-ui.min.js did not load (404)');
            expect(warn.mock.calls[0][0]).toContain('app/api/realtime/[...path]/route.ts exports GET as well as POST');

            await loadScreen('wordplusRealtimeStreams', '/api/realtime/files/abc/realtime-ui-streams.min.js');
            await new Promise((r) => setTimeout(r, 0));
            expect(warn).toHaveBeenCalledTimes(1);   // once a page
        } finally {
            warn.mockRestore();
            g.document = saved.document;
            g.fetch = saved.fetch;
        }
    });
});
