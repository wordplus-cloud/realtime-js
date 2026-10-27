'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; to: string; name: string; avatar: string };

/**
 * The conversation with a colleague, kept by this app's server, with typing, reactions and read ticks. Their name and
 * call buttons are on its top bar, and a call shows in the chat itself, beside the messages. On any other page the call
 * goes on in the corner, and comes back here when this page opens again. Opened from Call in People (`?call=video`), it
 * calls them as it opens.
 */
export function PersonChat({ room, to, name, avatar }: Props) {
    const path = usePathname();
    const params = useSearchParams();
    // Opened from Call: kept for this visit, and out of the address at once, so a reload or Back does not call again.
    const [start] = useState(() => (params.get('call') === 'video' ? ('video' as const) : undefined));
    useEffect(() => {
        if (start) window.history.replaceState(null, '', path);
    }, [start, path]);

    // The conversation, kept by this server (messages), their name and photo on top from this page, and their calls in
    // it (call). On localhost, where no webhook reaches this server, onSent tells it of each message.
    return (
        <Chat
            rt={useRealtime()}
            room={room}
            to={to}
            name={name}
            avatar={avatar}
            call
            startCall={start}
            placeholder={`Message ${name}`}
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
