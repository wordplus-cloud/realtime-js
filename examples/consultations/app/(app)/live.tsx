'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useOnline, useRoom, useUserEvent } from '@wordplus/realtime/react';
import { answer } from './actions';
import { When } from './when';

type Notice = { key: number; text: React.ReactNode; href: string };
type Request = { request: string; name: string; topic: string; waits: number };

/**
 * What the server tells this person, on whatever page they are: a message about an appointment, unless its page is
 * open, a client in the waiting room, a time booked, the expert letting the client in, and notes after a visit.
 */
export function Notices() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const path = usePathname();
    const router = useRouter();

    const drop = (key: number) => setNotices((list) => list.filter((notice) => notice.key !== key));
    const show = (text: React.ReactNode, href: string) => {
        const key = Date.now() + Math.random(); // its own, to drop it by
        setNotices((list) => [...list, { key, text, href }]);
        setTimeout(() => drop(key), 8000);
    };
    const elsewhere = (appointment: string) => path !== `/appointments/${appointment}`;

    // What the server sends this person (realtime.toUser( id ).emit( … ) in lib/realtime.ts and app/(app)/actions.ts).
    useUserEvent('message', (data: { appointment: string; name: string; text: string }) => {
        if (elsewhere(data.appointment)) show(`${data.name}: ${data.text}`, `/appointments/${data.appointment}`);
    });
    useUserEvent('waiting', (data: { appointment: string; name: string }) => {
        if (elsewhere(data.appointment)) show(`${data.name} is in the waiting room`, `/appointments/${data.appointment}`);
        router.refresh(); // the appointments say who waits
    });
    useUserEvent('booked', (data: { appointment: string; name: string; startsAt: number }) => {
        show(<>{data.name} booked a visit, <When at={data.startsAt} /></>, `/appointments/${data.appointment}`);
        router.refresh();
    });
    useUserEvent('admitted', (data: { appointment: string; name: string }) => {
        if (elsewhere(data.appointment)) show(`${data.name} is ready for you`, `/appointments/${data.appointment}`);
    });
    useUserEvent('notes', (data: { appointment: string; name: string }) => {
        if (elsewhere(data.appointment)) show(`${data.name} wrote notes from your visit`, `/appointments/${data.appointment}`);
        else router.refresh();
    });

    return (
        <div className="fixed bottom-4 left-1/2 z-20 flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2">
            {notices.map((notice) => (
                <Link key={notice.key} href={notice.href} className="rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">{notice.text}</Link>
            ))}
        </div>
    );
}

/**
 * An expert's: a client asking to talk now, with Take it and Not now, until the expert answers, the client stops
 * asking, or a minute goes by. Taken, both go to their new appointment and into its visit.
 */
export function Requests() {
    const [requests, setRequests] = useState<Request[]>([]);
    const router = useRouter();
    const drop = (request: string) => setRequests((list) => list.filter((one) => one.request !== request));

    useUserEvent('request', (data: Request) => {
        setRequests((list) => [...list, data]);
        setTimeout(() => drop(data.request), data.waits);
    });
    useUserEvent('withdrawn', (data: { request: string }) => drop(data.request));

    const reply = async (request: string, accept: boolean) => {
        drop(request);
        const taken = await answer(request, accept);
        if (taken) router.push(`/appointments/${taken.appointment}?join=1`);
    };

    if (!requests.length) return null;
    return (
        <div className="fixed top-20 right-4 z-30 flex w-[min(92vw,22rem)] flex-col gap-3" id="requests">
            {requests.map((one) => (
                <div key={one.request} className="rounded-2xl border border-teal-200 bg-white p-4 shadow-lg" role="alertdialog" aria-label={`${one.name} asks to talk now`}>
                    <p className="font-medium">{one.name} would like to talk now</p>
                    {one.topic && <p className="mt-1 text-sm text-stone-600">“{one.topic}”</p>}
                    <div className="mt-3 flex gap-2">
                        <button onClick={() => reply(one.request, true)} className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">Take it</button>
                        <button onClick={() => reply(one.request, false)} className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50">Not now</button>
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Who is free, as every page shows it: the page asks the server again when a visit starts or ends, or a time is booked. */
export function ExpertsLive() {
    const router = useRouter();
    // What the server sends every page (realtime.to( 'experts' ).emit( 'changed' ) in lib/realtime.ts).
    useRoom('experts', { changed: () => router.refresh() });
    return null;
}

/** Whether an expert is free now: online and in no visit, in a visit, or away. */
export function Availability({ id, inVisit }: { id: string; inVisit: boolean }) {
    const { online, lastSeen } = useOnline([id]);
    const [, tick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => tick((n) => n + 1), 60_000);
        return () => clearInterval(timer);
    }, []);
    if (inVisit) return <span className="inline-flex items-center gap-1.5 text-sm text-amber-700"><span className="size-2 rounded-full bg-amber-500" />In a visit</span>;
    if (online[id]) return <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />Free now</span>;
    return <span className="text-sm text-stone-500">{lastSeen[id] ? `Away, seen ${ago(lastSeen[id])}` : 'Away'}</span>;
}

function ago(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
