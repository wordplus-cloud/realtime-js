import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { events, photoOf } from '@/lib/club';
import { liveNow } from '@/lib/realtime';
import { When } from '../when';

export default function EventsPage() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Events />
        </Suspense>
    );
}

// The club's events: those live now first, as WordPlus Cloud says, then those to come, then those past.
async function Events() {
    await connection(); // made for each request: what is live and what is past are of this moment
    const [all, live] = await Promise.all([events(), liveNow()]);
    const now = Date.now();
    const onAir = all.filter((event) => live.has(event.id));
    const coming = all.filter((event) => !live.has(event.id) && event.startsAt > now - 60 * 60_000);
    const past = all.filter((event) => !live.has(event.id) && event.startsAt <= now - 60 * 60_000).reverse();
    const row = (event: (typeof all)[number], label: React.ReactNode) => (
        <li key={event.id}>
            <Link href={`/events/${event.id}`} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm hover:ring-1 hover:ring-orange-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoOf(event.host)} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                <span className="min-w-0 flex-1">
                    <span className="block font-medium">{event.title}</span>
                    <span className="block truncate text-sm text-stone-600">with {event.hostName}. {event.about}</span>
                </span>
                <span className="shrink-0 text-right text-sm">{label}</span>
            </Link>
        </li>
    );

    return (
        <section className="flex flex-col gap-6">
            <h1 className="text-2xl font-semibold">Events</h1>
            {onAir.length > 0 && (
                <ul className="flex flex-col gap-3" id="live">
                    {onAir.map((event) => row(event, <span className="flex items-center gap-2"><span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">LIVE</span>{live.get(event.id)} watching</span>))}
                </ul>
            )}
            <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">Coming up</h2>
                <ul className="flex flex-col gap-3" id="coming">
                    {coming.map((event) => row(event, <><span className="block"><When at={event.startsAt} /></span><span className="block text-xs text-stone-500">{event.going} going</span></>))}
                </ul>
            </div>
            {past.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">Past</h2>
                    <ul className="flex flex-col gap-3">{past.map((event) => row(event, <span className="text-stone-500"><When at={event.startsAt} /></span>))}</ul>
                </div>
            )}
        </section>
    );
}
