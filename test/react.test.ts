import { createElement, Fragment } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CallButton, CallSpot, Chat, GroupCallButton, LiveStream, OnlineCount, OnlineList, Typing } from '../src/react.js';

// The React components that stand for @wordplus/realtime-ui's elements render those elements, their props as the
// elements' attributes. The elements themselves are tested in realtime-ui.

const rendered = (...children: ReturnType<typeof createElement>[]) => create(createElement(Fragment, null, ...children)).toJSON();

describe('the elements, as React renders them', () => {
    it('the call buttons are <call-button> and <room-button>', () => {
        expect(rendered(
            createElement(CallButton, { to: 34, call: 'support:34:42', name: 'Ann' }, 'Call'),
            createElement(GroupCallButton, { name: 'meeting:daily', title: 'Daily meeting' }, 'Join'),
        )).toMatchObject([
            { type: 'call-button', props: { to: '34', call: 'support:34:42', type: 'video', name: 'Ann' }, children: ['Call'] },
            { type: 'room-button', props: { room: 'meeting:daily', type: 'video', title: 'Daily meeting' }, children: ['Join'] },
        ]);
    });

    it('a call in the page is <call-spot>, its children shown until a call comes', () => {
        expect(rendered(
            createElement(CallSpot, { call: 'match:{a}:{b}', className: 'date', style: { height: 420 } }, 'The chat'),
            createElement(CallSpot, {}),
        )).toMatchObject([
            { type: 'call-spot', props: { call: 'match:{a}:{b}', className: 'date', style: { height: 420 } }, children: ['The chat'] },
            { type: 'call-spot', props: {} },
        ]);
    });

    it('the conversation and the people on a room are <chat-room>, <online-list>, <typing-line> and <online-count>', () => {
        expect(rendered(
            createElement(Chat, { room: 'chat:34:42', placeholder: 'Write a message', reactions: ['1f44d', '2764'], maxLength: 2000 }),
            createElement(OnlineList, { room: 'shop', title: 'In the shop now', call: 'support:{pair}', type: 'video' }),
            createElement(Typing, { room: 'chat:34:42' }),
            createElement(OnlineCount, { room: 'shop' }),
        )).toMatchObject([
            { type: 'chat-room', props: { room: 'chat:34:42', placeholder: 'Write a message', reactions: '1f44d 2764', 'max-length': '2000' } },
            { type: 'online-list', props: { room: 'shop', title: 'In the shop now', call: 'support:{pair}', type: 'video' } },
            { type: 'typing-line', props: { room: 'chat:34:42' } },
            { type: 'online-count', props: { room: 'shop' } },
        ]);
    });

    it('a chat between two with its call is <chat-room to call>', () => {
        const [own, named, none] = rendered(
            createElement(Chat, { room: 'chat:34:42', to: 42, name: 'Ben', avatar: '/ben.jpg', call: true, startCall: 'video' }),
            createElement(Chat, { room: 'chat:34:42', to: '42', call: 'date:{pair}' }),
            createElement(Chat, { room: 'chat:34:42' }),
        ) as Array<{ props: Record<string, unknown> }>;
        expect(own.props).toMatchObject({ to: '42', name: 'Ben', avatar: '/ben.jpg', call: 'true', 'start-call': 'video' });
        expect(named.props).toMatchObject({ to: '42', call: 'date:{pair}' });
        expect(none.props.to).toBeUndefined();
        expect(none.props.call).toBeUndefined();
    });

    it('a live stream is <live-stream>, in one piece or one of its parts', () => {
        expect(rendered(
            createElement(LiveStream, { name: 'show:mugs', title: 'New mugs', loginUrl: '/login' }),
            createElement(LiveStream, { name: 'show:mugs', view: 'chat', height: 480, chat: true }),
            createElement(LiveStream, { name: 'show:talk', chat: false, sticky: true }),
        )).toMatchObject([
            { type: 'live-stream', props: { name: 'show:mugs', title: 'New mugs', 'login-url': '/login' } },
            { type: 'live-stream', props: { name: 'show:mugs', view: 'chat', height: '480' } },
            { type: 'live-stream', props: { name: 'show:talk', chat: 'off', sticky: '' } },
        ]);
        const whole = rendered(createElement(LiveStream, { name: 'show:mugs' })) as { props: Record<string, unknown> };
        expect(whole.props.view).toBeUndefined();
        expect(whole.props.chat).toBeUndefined();
    });

    it('leave out what they are not given', () => {
        const chat = rendered(createElement(Chat, { room: 'chat:34:42' }), createElement(OnlineList, { room: 'shop' })) as Array<{ props: Record<string, unknown> }>;
        expect(chat[0].props.reactions).toBeUndefined();
        expect(chat[0].props['max-length']).toBeUndefined();
        expect(chat[1].props.call).toBeUndefined();
    });

    it('the chat hands onSent the messages its element says the room took, the newest onSent each time', async () => {
        const listeners: Record<string, (event: Event) => void> = {};
        const node = { addEventListener: (name: string, fn: (event: Event) => void) => (listeners[name] = fn), removeEventListener: vi.fn() };
        const first = vi.fn();
        const second = vi.fn();
        let tree!: ReturnType<typeof create>;
        await act(async () => {
            tree = create(createElement(Chat, { room: 'chat:34:42', onSent: first }), { createNodeMock: () => node });
        });
        const message = { id: 'm1', room: 'chat:34:42', text: 'Hi', at: 1 };
        listeners.sent(new CustomEvent('sent', { detail: message }));
        expect(first).toHaveBeenCalledWith(message);

        await act(async () => tree.update(createElement(Chat, { room: 'chat:34:42', onSent: second })));
        listeners.sent(new CustomEvent('sent', { detail: message }));
        expect(second).toHaveBeenCalledTimes(1);
        expect(first).toHaveBeenCalledTimes(1);

        await act(async () => tree.unmount());
        expect(node.removeEventListener).toHaveBeenCalledWith('sent', listeners.sent);
    });
});
