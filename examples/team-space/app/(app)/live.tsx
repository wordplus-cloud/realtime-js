'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useOnline, useRoom, useUserEvent } from '@wordplus/realtime/react';

type Notice = { key: number; text: string; href: string };
type NewMessage = { from: string; name: string; text: string };
type MeetingStarted = { team: string; name: string; by: string };

/**
 * What the server tells this colleague, on whatever page they are: a message to them, unless its chat is open, and
 * their team's meeting starting, unless they are on its page.
 */
export function Notices() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const path = usePathname();

    const drop = (key: number) =>
        setNotices((list) => list.filter((notice) => notice.key !== key));
    const show = (text: string, href: string) => {
        const key = Date.now() + Math.random(); // its own, to drop it by
        setNotices((list) => [...list, { key, text, href }]);
        setTimeout(() => drop(key), 8000);
    };

    // What the server sends this colleague (realtime.toUser( ids ).emit( … ) in lib/realtime.ts).
    useUserEvent('message', (data: NewMessage) => {
        if (path === `/people/${data.from}`) return; // the chat shows it already
        show(`${data.name}: ${data.text}`, `/people/${data.from}`);
    });
    useUserEvent('meeting', (data: MeetingStarted) => {
        if (path === `/teams/${data.team}`) return; // its page shows it already
        show(`${data.by} started the ${data.name} meeting`, `/teams/${data.team}`);
    });

    return (
        <div className="fixed bottom-4 left-1/2 z-20 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2">
            {notices.map((notice) => (
                <Link key={notice.key} href={notice.href} className="rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">{notice.text}</Link>
            ))}
        </div>
    );
}

/** The meetings on now, as every page lists them: the page asks the server again when someone comes into one or leaves. */
export function MeetingsLive() {
    const router = useRouter();
    // What the server sends every page (realtime.to( 'meetings' ).emit( 'changed' ) in lib/realtime.ts).
    useRoom('meetings', { changed: () => router.refresh() });
    return null;
}

/** How many colleagues are online now, across the site. */
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

type Colleague = { id: string; name: string; title: string; photo: string; lead?: boolean };

/** Colleagues with who is online now, those online first: WordPlus Cloud tells the page as they come and go. */
export function Colleagues({ people, me }: { people: Colleague[]; me: string }) {
    const { online } = useOnline(people.map((person) => person.id));
    const sorted = [...people.filter((person) => online[person.id]), ...people.filter((person) => !online[person.id])];
    return (
        <ul className="flex flex-col gap-1" id="colleagues">
            {sorted.map((person) => (
                <li key={person.id} data-online={online[person.id] ? '' : undefined}>
                    <Link href={person.id === me ? '/people' : `/people/${person.id}`} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-white">
                        <span className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={person.photo} alt="" className="size-9 rounded-full object-cover" />
                            {online[person.id] && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-white bg-emerald-500" />}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{person.name}{person.id === me ? ' (you)' : ''}</span>
                            <span className="block truncate text-xs text-stone-500">{person.lead ? 'Lead · ' : ''}{person.title}</span>
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

function ago(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
