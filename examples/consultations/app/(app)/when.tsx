'use client';

import { useEffect, useState } from 'react';

// Times as the visitor reads them, in their own time zone, which only the browser knows: drawn once the page is in it,
// so the server's render and the browser's agree.

/** Now, every `every` milliseconds: null until the page is in the browser. */
export function useNow(every = 30_000): number | null {
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => {
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), every);
        return () => clearInterval(timer);
    }, [every]);
    return now;
}

const DAY = 24 * 3600 * 1000;

/** "Today", "Tomorrow", "Yesterday", or the day's name and date. */
export function dayOf(at: number, now: number): string {
    const start = (t: number) => new Date(new Date(t).toDateString()).getTime();
    const days = Math.round((start(at) - start(now)) / DAY);
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(at);
}

/** 14:30, or 2:30 PM, as the visitor's clock says it. */
export const timeOf = (at: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at);

/** "Today 14:30", or "Today 14:30–15:00" with its end. */
export function When({ at, until }: { at: number; until?: number }) {
    const now = useNow(60_000);
    if (now === null) return <span className="invisible">Today 00:00</span>;
    return <>{dayOf(at, now)} {timeOf(at)}{until ? `–${timeOf(until)}` : ''}</>;
}

/** "in 12 min", "in 3 h", "now", or "12 min ago". */
export function relative(at: number, now: number): string {
    const minutes = Math.round((at - now) / 60_000);
    if (Math.abs(minutes) < 1) return 'now';
    const span = Math.abs(minutes) < 60 ? `${Math.abs(minutes)} min` : Math.abs(minutes) < 48 * 60 ? `${Math.round(Math.abs(minutes) / 60)} h` : `${Math.round(Math.abs(minutes) / 1440)} days`;
    return minutes > 0 ? `in ${span}` : `${span} ago`;
}
