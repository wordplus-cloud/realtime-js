import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

// React Native's provider: the connection an app makes there (./native), not a page's. Before, the provider made a
// page's, so useCalls() loaded the call engine and held the line, and the app rang for calls it could not answer.
const made: Array<{ options: Record<string, unknown>; calls: () => Promise<unknown>; close: ReturnType<typeof vi.fn> }> = [];
vi.mock('../src/browser.js', async (actual) => ({
    ...(await actual<typeof import('../src/browser.js')>()),
    connect: vi.fn(async (options: Record<string, unknown>) => {
        const rt = { options, calls: async () => ({ on() {}, off() {}, incoming: () => [] }), on() {}, close: vi.fn() };
        made.push(rt);
        return rt;
    }),
}));

const { RealtimeProvider, useCalls, OnlineList, Chat, CallButton } = await import('../src/react.js');

const options = { app: 's1500000007', endpoint: 'https://app.example.com/api/realtime', headers: { Authorization: 'Bearer t' } };

afterEach(() => {
    made.length = 0;
    vi.unstubAllGlobals();
});

describe('React Native', () => {
    it('the provider connects as an app: no worker, and calls refused with no_webrtc, which useCalls() tells', async () => {
        vi.stubGlobal('navigator', { product: 'ReactNative' });
        let seen: ReturnType<typeof useCalls> | null = null;
        function Calls() {
            seen = useCalls();
            return null;
        }
        await act(async () => { create(createElement(RealtimeProvider, { options }, createElement(Calls))); });

        expect(made).toHaveLength(1);
        expect(made[0].options.worker).toBeNull();
        expect(seen).toEqual({ calls: null, incoming: [], error: 'no_webrtc' });
    });

    it('the provider still asks for full addresses there, as connect() of ./native does', async () => {
        vi.stubGlobal('navigator', { product: 'ReactNative' });
        const onError = vi.fn();
        await act(async () => { create(createElement(RealtimeProvider, { options: { app: 's1500000007', endpoint: '/api/realtime' }, onError })); });
        expect(made).toHaveLength(0);
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('full address') }));
    });

    it('the ready-made parts draw nothing there, having no custom elements to draw them', async () => {
        vi.stubGlobal('navigator', { product: 'ReactNative' });
        const root = create(createElement('div', null,
            createElement(OnlineList, { room: 'shop' }),
            createElement(Chat, { room: 'chat:34:42' }),
            createElement(CallButton, { to: 34, call: 'support:{pair}' }, 'Call')));
        expect(root.toJSON()).toEqual({ type: 'div', props: {}, children: null });
    });

    it('a page connects as a page, and draws the elements', async () => {
        let seen: ReturnType<typeof useCalls> | null = null;
        function Calls() {
            seen = useCalls();
            return null;
        }
        await act(async () => { create(createElement(RealtimeProvider, { options }, createElement(Calls))); });
        expect(made[0].options.worker).toBeUndefined();
        expect(seen!.calls).not.toBeNull();
        expect(seen!.error).toBeNull();
        expect(create(createElement(OnlineList, { room: 'shop' })).toJSON()).toMatchObject({ type: 'online-list' });
    });
});
