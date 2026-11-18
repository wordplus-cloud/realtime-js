import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aConnection, anIncoming } from './framework-fakes.js';

// Who a list of ids names, and what still rings. useOnline() and useProfiles() joined their ids with a | and split them on it,
// which took Auth0's `auth0|5f7c` apart, and useCalls() read the rings as a ring says it is over, when the calls still list it.

const made: Array<ReturnType<typeof aConnection>> = [];

vi.mock('../src/browser.js', () => ({
    connect: vi.fn(async (options: unknown) => {
        const rt = aConnection(options);
        made.push(rt);
        return rt;
    }),
}));

const { RealtimeProvider, useCalls, useOnline, useProfiles } = await import('../src/react.js');

const settle = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve));
});

/** A hook inside the provider: what it answered last, and how to draw it again. */
async function hooked<T>(hook: () => T) {
    const seen: { current: T | null } = { current: null };
    function Probe() {
        seen.current = hook();
        return null;
    }
    const tree = () => createElement(RealtimeProvider, {}, createElement(Probe));
    let root!: ReturnType<typeof create>;
    await act(async () => {
        root = create(tree());
    });
    await settle();
    return { seen, draw: () => act(async () => root.update(tree())) };
}

afterEach(() => {
    made.length = 0;
});

describe('useOnline', () => {
    it('watches an id that holds a separator whole, as Auth0 ids do', async () => {
        const { seen } = await hooked(() => useOnline(['auth0|5f7c', 34]));
        const { online } = made[0];

        expect(online.watch).toHaveBeenCalledWith(['34', 'auth0|5f7c']);
        expect(seen.current?.online).toEqual({ 34: false, 'auth0|5f7c': false });

        online.known.add('auth0|5f7c');
        await act(async () => online.fire('change', { id: 'auth0|5f7c', online: true }));

        expect(seen.current?.online).toEqual({ 34: false, 'auth0|5f7c': true });
    });

    it('watches nobody with no ids, and nothing new for a new array of the same people', async () => {
        const none = await hooked(() => useOnline([]));
        expect(made[0].online.watch).toHaveBeenCalledWith([]);
        expect(none.seen.current?.online).toEqual({});

        const same = await hooked(() => useOnline([42, 34, 42]));
        await same.draw();
        expect(made[1].online.watch).toHaveBeenCalledTimes(1);
        expect(made[1].online.watch).toHaveBeenCalledWith(['34', '42']);
    });
});

describe('useProfiles', () => {
    it('asks the directory for an id that holds a separator whole, as Auth0 ids do', async () => {
        const { seen } = await hooked(() => useProfiles(['auth0|5f7c']));

        expect(made[0].users).toHaveBeenCalledWith(['auth0|5f7c']);
        expect(seen.current?.['auth0|5f7c']).toMatchObject({ name: 'User auth0|5f7c' });
    });

    it('asks for nobody with no ids', async () => {
        await hooked(() => useProfiles([]));

        expect(made[0].users).not.toHaveBeenCalled();
    });
});

describe('useCalls', () => {
    /** A ring arriving: the calls list it, and tell whoever listens. */
    const rings = async (calls: ReturnType<typeof aConnection>['made']['calls']) => {
        const ring = anIncoming();
        calls.ringing.push(ring);
        await act(async () => calls.fire('incoming', ring));
        return ring;
    };

    it('says what rings as it arrives', async () => {
        const { seen } = await hooked(() => useCalls());
        const ring = await rings(made[0].made.calls);

        expect(seen.current?.incoming).toEqual([ring]);
    });

    it('lets a ring go as this page turns it down, though the calls still list it as they say so', async () => {
        const { seen } = await hooked(() => useCalls());
        const ring = await rings(made[0].made.calls);

        // Incoming.decline(): its state, then `over`, and only then do the calls let it go.
        ring.state = 'declined';
        await act(async () => ring.fire('over', 'declined'));

        expect(seen.current?.incoming).toEqual([]);
    });

    it('lets a ring go as this page answers it, the same way', async () => {
        const { seen } = await hooked(() => useCalls());
        const ring = await rings(made[0].made.calls);

        ring.state = 'answered';
        await act(async () => ring.fire('over', 'answered'));

        expect(seen.current?.incoming).toEqual([]);
    });

    it('follows a ring that started before the calls loaded to its end', async () => {
        const { connect } = vi.mocked(await import('../src/browser.js'));
        const ring = anIncoming();
        connect.mockImplementationOnce(async (options) => {
            const rt = aConnection(options);
            rt.made.calls.ringing.push(ring);
            made.push(rt);
            return rt as never;
        });
        const { seen } = await hooked(() => useCalls());
        expect(seen.current?.incoming).toEqual([ring]);

        made[0].made.calls.ringing.length = 0;
        await act(async () => ring.fire('over', 'cancelled'));

        expect(seen.current?.incoming).toEqual([]);
    });
});
