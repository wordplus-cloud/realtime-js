import { describe, expect, it, vi } from 'vitest';
import { Suspense, type ReactElement } from 'react';
import { createRealtime } from '../src/server/index.js';

// The provider a Next.js layout writes, without Next.js: it only reads the request's headers. A real app builds it and
// runs it in test/e2e/next-provider.mjs, with Cache Components on and off.

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Headers({ cookie: 'session=ann', host: 'shop.example.com', 'x-forwarded-proto': 'https' })),
}));
vi.mock('../src/react.js', () => ({ RealtimeProvider: 'client-provider' }));

const { RealtimeProvider } = await import('../src/next.js');

const realtime = (user?: (request: Request) => string | null) =>
    createRealtime({ app: 's1500000007', secret: 'a-secret', localKey: 'ab'.repeat(32), user, profile: (id) => ({ name: 'User ' + id }) });

/** What the layout's element comes to on the server: the Suspense around it, and the client provider it renders. */
async function render(props: Record<string, unknown>): Promise<{ outer: ReactElement<any>; provider: ReactElement<any> }> {
    const outer = RealtimeProvider(props as never) as ReactElement<any>;
    const connected = outer.props.children as ReactElement<any>;
    return { outer, provider: await (connected.type as (p: unknown) => Promise<ReactElement<any>>)(connected.props) };
}

/** The user's id config() signed: the subject of its identity token. */
const signedFor = (options: { keys: { identity?: { token: string } } }) =>
    options.keys.identity ? JSON.parse(Buffer.from(options.keys.identity.token.split('.')[1], 'base64url').toString()).sub : null;

describe('RealtimeProvider of Next.js', () => {
    it('signs the settings for the user your `user` option finds in this request', async () => {
        const user = vi.fn((request: Request) => (request.headers.get('cookie') === 'session=ann' ? '7' : null));
        const { provider } = await render({ realtime: realtime(user), children: 'page' });

        expect(provider.type).toBe('client-provider');
        expect(provider.props.children).toBe('page');
        expect(signedFor(provider.props.options)).toBe('7');
        expect(provider.props.options.site).toBe('s1500000007');
        expect(new URL(user.mock.calls[0][0].url).origin).toBe('https://shop.example.com');
    });

    it('takes the user from `user`, an id or a function, over the option', async () => {
        const option = vi.fn(() => '1');

        expect(signedFor((await render({ realtime: realtime(option), user: 8 })).provider.props.options)).toBe('8');
        expect(signedFor((await render({ realtime: realtime(option), user: async () => '9' })).provider.props.options)).toBe('9');
        expect(option).not.toHaveBeenCalled();
    });

    it('connects with no user where there is none, signed in or not', async () => {
        expect(signedFor((await render({ realtime: realtime(() => null) })).provider.props.options)).toBeNull();
        expect(signedFor((await render({ realtime: realtime() })).provider.props.options)).toBeNull();
        expect(signedFor((await render({ realtime: realtime(() => '7'), user: null })).provider.props.options)).toBeNull();
    });

    it('waits for the request in a Suspense of its own, so the layout around it stays prerendered', async () => {
        const { outer } = await render({ realtime: realtime(), fallback: 'loading' });

        expect(outer.type).toBe(Suspense);
        expect(outer.props.fallback).toBe('loading');
        expect(RealtimeProvider({ realtime: realtime() } as never).props.fallback).toBeNull();
    });
});
