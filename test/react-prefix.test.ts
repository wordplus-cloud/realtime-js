import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';

// No connection here: the names come from the options alone.
vi.mock('../src/browser.js', async (actual) => ({ ...(await actual<typeof import('../src/browser.js')>()), connect: vi.fn(() => new Promise(() => {})) }));

const { CallButton, Chat, LiveStream, OnlineCount, OnlineList, RealtimeProvider, Typing, GroupCallButton } = await import('../src/react.js');

it('names the elements after the prefix in the options\' screen settings, as the scripts define them', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
        tree = create(createElement(RealtimeProvider, { options: { app: 's1', screen: { prefix: 'shop' } } },
            createElement(CallButton, { to: 34, call: 'support:{pair}' }, 'Call'),
            createElement(GroupCallButton, { name: 'meeting:daily' }, 'Join'),
            createElement(Chat, { room: 'chat:34:42' }),
            createElement(OnlineList, { room: 'shop' }),
            createElement(Typing, { room: 'chat:34:42' }),
            createElement(OnlineCount, { room: 'shop' }),
            createElement(LiveStream, { name: 'show:mugs' }),
        ), { createNodeMock: () => ({ addEventListener: () => {}, removeEventListener: () => {} }) });
    });
    expect((tree.toJSON() as Array<{ type: string }>).map((node) => node.type)).toEqual([
        'shop-call-button', 'shop-room-button', 'shop-chat-room', 'shop-online-list', 'shop-typing-line', 'shop-online-count', 'shop-live-stream',
    ]);
});
