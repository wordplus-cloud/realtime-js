'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; to: string; name: string; avatar: string };

/**
 * The conversation about the item, kept by this app's server, with typing, reactions, read ticks and photos, and its
 * call: the buyer sees the item on video before coming over. The other one's name and call buttons are on its top bar,
 * and a call shows in the chat itself, beside the messages. On localhost, where no webhook reaches this server, onSent
 * tells it of each message.
 */
export function DealChat({ room, to, name, avatar }: Props) {
    return (
        <Chat
            rt={useRealtime()}
            room={room}
            to={to}
            name={name}
            avatar={avatar}
            call
            placeholder={`Message ${name}`}
            messages={`/api/messages?room=${room}`}
            upload="/api/files"
            accept="image/jpeg,image/png,image/webp,image/gif"
            maxFileSize={15 * 1024 * 1024}
            onSent={(message) => {
                fetch('/api/chat/sent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(message),
                });
            }}
        />
    );
}
