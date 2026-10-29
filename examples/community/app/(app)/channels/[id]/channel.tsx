'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; name: string; people: Record<string, { name: string; avatar: string }> };

/**
 * A channel, kept by this app's server, with typing, reactions and read ticks for the whole club, and photos: picked,
 * pasted or dropped on it, each taken up to this server (/api/files) as it is picked. On localhost, where no webhook
 * reaches this server, onSent tells it of each message.
 */
export function ChannelChat({ room, name, people }: Props) {
    return (
        <Chat
            rt={useRealtime()}
            room={room}
            people={people}
            placeholder={`Message #${name}`}
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
