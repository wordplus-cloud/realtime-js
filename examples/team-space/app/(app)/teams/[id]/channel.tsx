'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; name: string; people: Record<string, { name: string; avatar: string }> };

/**
 * A channel of the team, kept by this app's server, with typing, reactions and read ticks for everyone in the team. Its
 * writers by the names and photos of the team (`people`), as some may not have been online for days. On localhost,
 * where no webhook reaches this server, onSent tells it of each message.
 */
export function ChannelChat({ room, name, people }: Props) {
    return (
        <Chat
            rt={useRealtime()}
            room={room}
            people={people}
            placeholder={`Message #${name}`}
            messages={`/api/messages?room=${room}`}
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
