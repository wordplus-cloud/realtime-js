'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useOnline, useUserEvent } from '@wordplus/realtime/react';

type Notice = { key: number; text: string; href: string };
type NewMessage = { from: string; name: string; text: string };

/** What the server tells this member, on whatever page they are: a new message, unless its chat is open. */
export function Notices() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const path = usePathname();
    const router = useRouter();

    const drop = (key: number) =>
        setNotices((list) => list.filter((notice) => notice.key !== key));
    const show = (text: string, href: string) => {
        const key = Date.now() + Math.random(); // its own, to drop it by
        setNotices((list) => [...list, { key, text, href }]);
        setTimeout(() => drop(key), 6000);
        router.refresh(); // the lists on the page show it too
    };

    // What the server sends this member (realtime.toUser( id ).emit( 'message', … )), on whatever page they are.
    useUserEvent('message', (data: NewMessage) => {
        if (path === `/members/${data.from}`) return; // the chat shows it already
        show(`${data.name}: ${data.text}`, `/members/${data.from}`);
    });
    useUserEvent('closed', () => router.refresh());

    return (
        <div className="fixed bottom-4 left-1/2 z-20 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2">
            {notices.map((notice) => (
                <Link key={notice.key} href={notice.href} className="rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">{notice.text}</Link>
            ))}
        </div>
    );
}

/** For someone who signed up but has no profile yet: others see nobody without one. */
export function MakeProfile() {
    return (
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-medium">Make your profile first.</p>
            <p className="mt-2 text-stone-600">People see you once you have one. <Link href="/profile" className="text-rose-600">Make it now</Link>.</p>
        </div>
    );
}

/** How many members are online now, across the site. */
export function OnlineNow() {
    const { count } = useOnline([], { count: true });
    return <span className="ml-auto text-sm text-stone-500">{count === null ? '' : `${count} online now`}</span>;
}

/** A green dot while someone is online, else when they were last seen. */
export function OnlineStatus({ id }: { id: string }) {
    const { online, lastSeen } = useOnline([id]);
    if (online[id]) return <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />Online now</span>;
    return lastSeen[id] ? <span className="text-sm text-stone-500">Active {ago(lastSeen[id])}</span> : null;
}

function ago(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
