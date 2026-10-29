'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useOnline, useRoom, useUserEvent } from '@wordplus/realtime/react';

type Notice = { key: number; text: string; href: string; live?: boolean };

/**
 * What the server tells this member, on whatever page they are: a message to them, unless its conversation is open, and
 * an event going live, unless they are on its page.
 */
export function Notices() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const path = usePathname();

    const drop = (key: number) => setNotices((list) => list.filter((notice) => notice.key !== key));
    const show = (notice: Omit<Notice, 'key'>) => {
        const key = Date.now() + Math.random(); // its own, to drop it by
        setNotices((list) => [...list, { ...notice, key }]);
        setTimeout(() => drop(key), 10000);
    };

    // What the server sends this member (realtime.toUser( ids ).emit( … ) in lib/realtime.ts).
    useUserEvent('message', (data: { from: string; name: string; text: string }) => {
        if (path !== `/members/${data.from}`) show({ text: `${data.name}: ${data.text}`, href: `/members/${data.from}` });
    });
    useUserEvent('live', (data: { event: string; title: string; host: string }) => {
        if (path !== `/events/${data.event}`) show({ text: `${data.host} is live: ${data.title}`, href: `/events/${data.event}`, live: true });
    });

    return (
        <div className="fixed bottom-4 left-1/2 z-20 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2">
            {notices.map((notice) => (
                <Link key={notice.key} href={notice.href} className="flex items-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
                    {notice.live && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide">LIVE</span>}
                    {notice.text}
                </Link>
            ))}
        </div>
    );
}

/** What is on in the club, as every page shows it: the page asks the server again as a lounge fills or empties, or an event goes live or ends. */
export function ClubLive() {
    const router = useRouter();
    // What the server sends every page (realtime.to( 'club' ).emit( 'changed' ) in lib/realtime.ts).
    useRoom('club', { changed: () => router.refresh() });
    return null;
}

/** A link of the sidebar, marked while its page is open. */
export function NavLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
    const here = usePathname() === href;
    return (
        <Link href={href} aria-current={here ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[15px] ${here ? 'bg-orange-50 font-medium text-orange-800' : 'text-stone-700 hover:bg-stone-100'} ${className}`}>
            {children}
        </Link>
    );
}

type Member = { id: string; name: string; title: string; photo: string; host: boolean };

/** Who is online now, those first, then the rest: WordPlus Cloud tells the page as members come and go. */
export function OnlinePanel({ members, me }: { members: Member[]; me: string }) {
    const { online } = useOnline(members.map((member) => member.id));
    const here = members.filter((member) => online[member.id]);
    const away = members.filter((member) => !online[member.id]);
    const row = (member: Member, on: boolean) => (
        <li key={member.id} data-online={on ? '' : undefined}>
            <Link href={member.id === me ? '/members' : `/members/${member.id}`} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-stone-100 ${on ? '' : 'opacity-50'}`}>
                <span className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={member.photo} alt="" className="size-8 rounded-full object-cover" />
                    {on && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-stone-50 bg-emerald-500" />}
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{member.name}{member.host ? <span className="ml-1.5 text-xs font-normal text-orange-700">Host</span> : null}</span>
                    <span className="block truncate text-xs text-stone-500">{member.title}</span>
                </span>
            </Link>
        </li>
    );
    return (
        <div className="flex flex-col gap-4" id="online">
            <section>
                <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Online · {here.length}</h2>
                <ul>{here.map((member) => row(member, true))}</ul>
            </section>
            <section>
                <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Offline · {away.length}</h2>
                <ul>{away.map((member) => row(member, false))}</ul>
            </section>
        </div>
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
