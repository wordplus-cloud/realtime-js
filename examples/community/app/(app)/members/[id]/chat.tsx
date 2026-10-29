'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRealtime } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; to: string; name: string; avatar: string };

/**
 * The conversation with a member, kept by this app's server, with typing, reactions, read ticks and photos. Their name
 * and call buttons are on its top bar, and a call shows in the chat itself, beside the messages. Opened from Call in
 * Members (`?call=video`), it calls them as it opens.
 */
export function MemberChat({ room, to, name, avatar }: Props) {
    const path = usePathname();
    const params = useSearchParams();
    // Opened from Call: kept for this visit, and out of the address at once, so a reload or Back does not call again.
    const [start] = useState(() => (params.get('call') === 'video' ? ('video' as const) : undefined));
    useEffect(() => {
        if (start) window.history.replaceState(null, '', path);
    }, [start, path]);

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
