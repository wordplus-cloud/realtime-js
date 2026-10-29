'use client';

import Link from 'next/link';
import { usePresence } from '@wordplus/realtime/react';
import { relative, useNow, When } from '../when';

type Item = {
    id: string;
    other: string;
    name: string;
    title: string;
    photo: string;
    topic: string;
    startsAt: number;
    endsAt: number;
    ended: boolean;
    notes: boolean;
    /** Its waiting room, a presence room: waiting:{id}. */
    waiting: string;
};

const OPENS_BEFORE = 10 * 60 * 1000;

/**
 * Appointments to come, then those past. A visit open now says so, and on an expert's page, whether its client is in the
 * waiting room, as WordPlus Cloud tells the page who comes and goes.
 */
export function AppointmentList({ appointments, expert }: { appointments: Item[]; expert: boolean }) {
    const now = useNow(15_000);
    if (now === null) return <div className="h-64" />;
    const over = (one: Item) => one.ended || now >= one.endsAt;
    const upcoming = appointments.filter((one) => !over(one));
    const past = appointments.filter(over).reverse();

    return (
        <section className="flex flex-col gap-8">
            <div>
                <h1 className="text-2xl font-semibold">Appointments</h1>
                <p className="text-stone-600">{expert ? 'Your clients, and who is waiting for you now.' : 'Your visits, and the notes from those past.'}</p>
            </div>
            <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">Coming up</h2>
                {upcoming.length ? (
                    <ul className="flex flex-col gap-3" id="upcoming">
                        {upcoming.map((one) => <Row key={one.id} one={one} now={now} expert={expert} />)}
                    </ul>
                ) : (
                    <p className="rounded-2xl bg-white p-5 text-stone-600 shadow-sm">
                        {expert ? 'Nothing booked yet.' : <>Nothing booked. <Link href="/experts" className="text-teal-700">Find an expert</Link>.</>}
                    </p>
                )}
            </div>
            {past.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">Past</h2>
                    <ul className="flex flex-col gap-3" id="past">
                        {past.map((one) => <Row key={one.id} one={one} now={now} expert={expert} past />)}
                    </ul>
                </div>
            )}
        </section>
    );
}

function Row({ one, now, expert, past }: { one: Item; now: number; expert: boolean; past?: boolean }) {
    const open = !past && now >= one.startsAt - OPENS_BEFORE;
    return (
        <li data-id={one.id} data-open={open ? '' : undefined}>
            <Link href={`/appointments/${one.id}`} className={`flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm hover:ring-1 hover:ring-teal-200 ${open ? 'ring-1 ring-teal-300' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={one.photo} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                <span className="min-w-0 flex-1">
                    <span className="block font-medium">{one.name}{one.title ? <span className="font-normal text-stone-500"> · {one.title}</span> : null}</span>
                    <span className="block truncate text-sm text-stone-600">{one.topic}</span>
                </span>
                <span className="shrink-0 text-right">
                    <span className="block text-sm tabular-nums"><When at={one.startsAt} until={one.endsAt} /></span>
                    {past ? (
                        <span className="block text-xs text-stone-500">{one.notes ? 'Notes from the visit' : 'Ended'}</span>
                    ) : open ? (
                        expert ? <Waiting room={one.waiting} client={one.other} name={one.name} /> : <span className="block text-xs font-medium text-teal-700">Open now</span>
                    ) : (
                        <span className="block text-xs text-stone-500">{relative(one.startsAt, now)}</span>
                    )}
                </span>
            </Link>
        </li>
    );
}

/** Whether the client is in the waiting room now: the room's members, kept current by WordPlus Cloud. */
function Waiting({ room, client, name }: { room: string; client: string; name: string }) {
    const members = usePresence(room);
    const here = members.some((member) => String(member.id) === client);
    return here
        ? <span className="flex items-center justify-end gap-1.5 text-xs font-medium text-amber-700" data-waiting=""><span className="size-2 animate-pulse rounded-full bg-amber-500" />{name} is waiting</span>
        : <span className="block text-xs font-medium text-teal-700">Open now</span>;
}
