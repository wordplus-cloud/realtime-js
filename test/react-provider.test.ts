import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The connection as the provider makes it: each connect() a connection of its own, closed or not.
const made: Array<{ close: ReturnType<typeof vi.fn> }> = [];
vi.mock('../src/browser.js', () => ({
    connect: vi.fn(async () => {
        const rt = { close: vi.fn() };
        made.push(rt);
        return rt;
    }),
}));

const { RealtimeProvider } = await import('../src/react.js');

/** config()'s options for a user, as a page's server signs them on each request: a new iat, exp and sealed profile. */
let signed = 0;
function config(sub: string, pdh = 'profile-of-' + sub) {
    signed++;
    const claims = { iss: 's1500000021', aud: 'wordplus-realtime identity', iat: 1793118609 + signed, exp: 1793140209 + signed, sub, pd: { name: 'sealed-' + signed }, pdh };
    const token = ['header', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'signature-' + signed].join('.');
    return {
        server: 'wss://rt.wordplus.cloud',
        site: 's1500000021',
        auth: { endpoint: '/api/realtime/auth', headers: {} },
        keys: { endpoint: '/api/realtime/keys', headers: {}, entries: ['entry-' + sub], identity: { token, exp: claims.exp } },
    } as never;
}

beforeEach(() => {
    made.length = 0;
});

describe('RealtimeProvider', () => {
    it('keeps its connection when the server signs the same user again, as a refreshed layout does', async () => {
        // router.refresh() drew the layout again with config() signed anew, and the provider connected again: the call
        // on the screen ended and what was sent meanwhile was lost (Team Space, 2026-10-27).
        let root!: ReturnType<typeof create>;
        await act(async () => { root = create(createElement(RealtimeProvider, { options: config('8') })); });
        await act(async () => { root.update(createElement(RealtimeProvider, { options: config('8') })); });
        await act(async () => { root.update(createElement(RealtimeProvider, { options: config('8') })); });

        expect(made).toHaveLength(1);
        expect(made[0].close).not.toHaveBeenCalled();
    });

    it('connects again for another user, or for the same user with another profile', async () => {
        let root!: ReturnType<typeof create>;
        await act(async () => { root = create(createElement(RealtimeProvider, { options: config('8') })); });
        await act(async () => { root.update(createElement(RealtimeProvider, { options: config('9') })); });
        expect(made).toHaveLength(2);
        expect(made[0].close).toHaveBeenCalled();

        await act(async () => { root.update(createElement(RealtimeProvider, { options: config('9', 'a new name') })); });
        expect(made).toHaveLength(3);
        expect(made[1].close).toHaveBeenCalled();
    });
});
