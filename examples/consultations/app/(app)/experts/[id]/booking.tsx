'use client';

import { useState, useTransition } from 'react';
import { bookVisit } from '../../actions';
import { dayOf, timeOf, useNow } from '../../when';

const HALF_HOUR = 30 * 60 * 1000;

/** "today", "tomorrow", or "on Fri 31 Oct", as a sentence says it. */
const said = (day: string) => (day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : `on ${day}`);

/**
 * The expert's half hours of the next three days, from 9:00 to 17:00 by the visitor's clock, those taken and those gone
 * by left out, a day at a time, and the booking of one: what about, then Book. The server checks the time again, as it
 * may have just gone to someone else.
 */
export function Booking({ expert, name, taken }: { expert: string; name: string; taken: number[] }) {
    const now = useNow(60_000);
    const [day, setDay] = useState(0);
    const [picked, setPicked] = useState<number | null>(null);
    const [topic, setTopic] = useState('');
    const [error, setError] = useState('');
    const [pending, start] = useTransition();
    if (now === null) return <div className="h-72 rounded-2xl bg-white shadow-sm" />;

    const days = [0, 1, 2].map((offset) => {
        const date = new Date(now);
        date.setDate(date.getDate() + offset);
        date.setHours(9, 0, 0, 0);
        const slots = Array.from({ length: 16 }, (_, i) => date.getTime() + i * HALF_HOUR).filter((at) => at > now && !taken.includes(at));
        return { label: dayOf(date.getTime(), now), slots };
    });
    // Taken by someone else since it was picked: picked no more.
    const still = picked !== null && days.some((one) => one.slots.includes(picked)) ? picked : null;

    const book = () => {
        if (still === null) return;
        setError('');
        start(async () => {
            const refused = await bookVisit(expert, still, topic);
            if (refused) setError(refused.error);
        });
    };

    return (
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm" id="booking">
            <h2 className="text-lg font-medium">Book half an hour with {name}</h2>
            <div className="flex gap-2" role="tablist">
                {days.map((one, i) => (
                    <button key={one.label} role="tab" aria-selected={day === i} onClick={() => setDay(i)}
                            className={`flex flex-col items-start rounded-xl px-4 py-2 text-left ${day === i ? 'bg-stone-900 text-white' : 'border border-stone-200 hover:bg-stone-50'}`}>
                        <span className="text-sm font-medium">{one.label}</span>
                        <span className={`text-xs ${day === i ? 'text-stone-300' : 'text-stone-500'}`}>{one.slots.length ? `${one.slots.length} free` : 'Full'}</span>
                    </button>
                ))}
            </div>
            {days[day].slots.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                    {days[day].slots.map((at) => (
                        <button key={at} onClick={() => setPicked(at)} data-at={at} aria-pressed={still === at}
                                className={`rounded-lg py-2 text-sm tabular-nums ${still === at ? 'bg-teal-700 text-white' : 'border border-stone-200 hover:border-teal-600'}`}>
                            {timeOf(at)}
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-stone-500">Nothing free {said(days[day].label)}.</p>
            )}
            {still !== null && (
                <div className="flex flex-col gap-3 border-t border-stone-100 pt-4">
                    <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={140} placeholder="What would you like to talk about?"
                           className="w-full rounded-xl border border-stone-300 px-4 py-2.5 outline-none focus:border-teal-600" />
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <button onClick={book} disabled={pending} className="self-start rounded-full bg-teal-700 px-6 py-2.5 font-medium text-white hover:bg-teal-800 disabled:opacity-60">
                        Book {said(dayOf(still, now))} at {timeOf(still)}
                    </button>
                </div>
            )}
        </div>
    );
}
