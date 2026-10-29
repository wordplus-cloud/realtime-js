'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useOnline, useRoom, useUserEvent } from '@wordplus/realtime/react';

type Notice = { key: number; text: string; href: string };

/**
 * What the server tells this neighbour, on whatever page they are: a message in one of their conversations, unless it
 * is open, an offer on one of their items, and the answer to theirs.
 */
export function Notices() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const path = usePathname();
    const router = useRouter();

    const drop = (key: number) => setNotices((list) => list.filter((notice) => notice.key !== key));
    const show = (text: string, href: string) => {
        const key = Date.now() + Math.random(); // its own, to drop it by
        setNotices((list) => [...list, { key, text, href }]);
        setTimeout(() => drop(key), 8000);
    };
    const elsewhere = (deal: string) => path !== `/messages/${deal}`;

    // What the server sends this neighbour (realtime.toUser( id ).emit( … ) in lib/realtime.ts and app/(app)/actions.ts).
    useUserEvent('message', (data: { deal: string; name: string; text: string }) => {
        if (elsewhere(data.deal)) show(`${data.name}: ${data.text}`, `/messages/${data.deal}`);
        if (path === '/messages') router.refresh(); // the inbox puts it first
    });
    useUserEvent('offer', (data: { deal: string; name: string; amount: number; title: string }) => {
        if (elsewhere(data.deal)) show(`${data.name} offers $${data.amount} for ${data.title}`, `/messages/${data.deal}`);
    });
    useUserEvent('answer', (data: { deal: string; name: string; accepted: boolean; amount: number; title: string }) => {
        if (elsewhere(data.deal)) {
            show(data.accepted ? `${data.name} accepted your $${data.amount} for ${data.title}` : `${data.name} declined your $${data.amount} for ${data.title}`, `/messages/${data.deal}`);
        }
    });

    return (
        <div className="fixed bottom-4 left-1/2 z-20 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2">
            {notices.map((notice) => (
                <Link key={notice.key} href={notice.href} className="rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">{notice.text}</Link>
            ))}
        </div>
    );
}

/** The market as every page shows it: the page asks the server again when an item is put up, reserved, sold or repriced. */
export function MarketLive() {
    const router = useRouter();
    // What the server sends every page (realtime.to( 'market' ).emit( 'changed' ) in app/(app)/actions.ts).
    useRoom('market', { changed: () => router.refresh() });
    return null;
}

/**
 * How many others are looking at an item now, on its page: every page of it is in its room, counted live by WordPlus
 * Cloud, this one too. The page also asks the server for itself again when the item's price or status changes.
 */
export function Looking({ id }: { id: string }) {
    const router = useRouter();
    // What the server says in the item's room (realtime.to( `listing:${ id }` ).emit( 'changed' ) in actions.ts).
    const { count } = useRoom(`listing:${id}`, { changed: () => router.refresh() });
    const others = count === null ? 0 : count - 1;
    if (others <= 0) return null;
    return (
        <span className="inline-flex items-center gap-1.5 text-sm text-blue-800" data-looking={others}>
            <span className="size-2 animate-pulse rounded-full bg-blue-500" />
            {others} other {others === 1 ? 'person is' : 'people are'} looking at this
        </span>
    );
}

/** A green dot while someone is online, else when they were last seen. */
export function OnlineStatus({ id }: { id: string }) {
    const { online, lastSeen } = useOnline([id]);
    const [, tick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => tick((n) => n + 1), 60_000);
        return () => clearInterval(timer);
    }, []);
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
