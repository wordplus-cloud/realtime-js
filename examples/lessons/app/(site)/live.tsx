'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useRoom, useUserEvent } from '@wordplus/realtime/react';

type Notice = { key: number; text: string; href: string };
type WentLive = { lesson: string; title: string; teacher: string };

/** What is live, as every page lists it: the page asks the server again when a lesson goes live or ends. */
export function LiveNow() {
    const router = useRouter();
    // What the server sends every page (realtime.to( 'live' ).emit( 'changed' ) in lib/realtime.ts).
    useRoom('live', { changed: () => router.refresh() });
    return null;
}

/** What the server tells this person, on whatever page they are: a lesson they may watch has gone live. */
export function Notices() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const path = usePathname();

    const drop = (key: number) =>
        setNotices((list) => list.filter((notice) => notice.key !== key));

    // What the server sends them (realtime.toUser( ids ).emit( 'live', … ) in lib/realtime.ts).
    useUserEvent('live', (data: WentLive) => {
        if (path === `/lessons/${data.lesson}`) return; // its page shows it already
        const key = Date.now() + Math.random(); // its own, to drop it by
        setNotices((list) => [...list, { key, text: `${data.teacher} is live: ${data.title}`, href: `/lessons/${data.lesson}` }]);
        setTimeout(() => drop(key), 10000);
    });

    return (
        <div className="fixed bottom-4 left-1/2 z-20 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2">
            {notices.map((notice) => (
                <Link key={notice.key} href={notice.href} className="rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
                    <span className="mr-2 inline-block size-2 rounded-full bg-red-500" />
                    {notice.text}
                </Link>
            ))}
        </div>
    );
}

/** The mark of a lesson live now, with how many watch it. */
export function LiveMark({ viewers }: { viewers: number }) {
    return (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            <span className="size-1.5 rounded-full bg-white" />
            Live{viewers > 0 ? ` · ${viewers} watching` : ''}
        </span>
    );
}
