'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; other: string; people: Record<string, { name: string; avatar: string }> };

/**
 * The appointment's messages, kept by this app's server, with typing, reactions and read ticks, and files: a picture,
 * a scan, a contract, each taken up to this server (/api/files) as it is picked, and opened only by the two of them.
 * Before the visit, during it and after. On localhost, where no webhook reaches this server, onSent tells it of each
 * message.
 */
export function Messages({ room, other, people }: Props) {
    return (
        <Chat
            rt={useRealtime()}
            room={room}
            people={people}
            placeholder={`Message ${other}`}
            messages={`/api/messages?room=${room}`}
            upload="/api/files"
            accept="image/*,.pdf,.doc,.docx,.txt"
            maxFileSize={10 * 1024 * 1024}
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
