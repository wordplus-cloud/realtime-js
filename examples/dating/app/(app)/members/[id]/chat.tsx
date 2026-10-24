'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRealtime, useRoom, useUserEvent } from '@wordplus/realtime/react';
import { Chat } from '@wordplus/realtime-ui/react';

type Props = { room: string; to: string; name: string; avatar: string; placeholder: string };

/**
 * The conversation with a member, kept by this app's server, with typing, reactions and read ticks. Their name and
 * calls are on its top bar, and a video date or a call shows in the chat itself, beside the messages. On any other
 * page the call goes on at the top, and comes back here when this page opens again. Opened from Video in the catalog
 * (`?call=video`), it calls them as it opens.
 */
export function MemberChat({ room, to, name, avatar, placeholder }: Props) {
    const router = useRouter();
    const path = usePathname();
    const params = useSearchParams();
    // Opened from Video in the catalog: kept for this visit, and out of the address at once, so a reload or Back does
    // not call again.
    const [start] = useState(() => (params.get('call') === 'video' ? ('video' as const) : undefined));
    useEffect(() => {
        if (start) window.history.replaceState(null, '', path);
    }, [start, path]);

    // One of the two blocked the other: this conversation is over. The server says so, and takes this page out of the
    // room (kicked), or the rule turns it away when it joins after (forbidden).
    useUserEvent('closed', (data: { room: string }) => {
        if (data.room === room) router.replace('/members');
    });
    const { error } = useRoom(room);
    useEffect(() => {
        if (error === 'kicked' || error === 'forbidden') router.replace('/members');
    }, [error, router]);

    // The conversation, kept by this server (messages), their name and photo on top from this page, and their calls in
    // it (call), started by itself when the catalog's Video opened it (startCall). On localhost, where no webhook
    // reaches this server, onSent tells it of each message.
    return (
        <Chat
            rt={useRealtime()}
            room={room}
            to={to}
            name={name}
            avatar={avatar}
            call
            startCall={start}
            placeholder={placeholder}
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
