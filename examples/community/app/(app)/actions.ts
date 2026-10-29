'use server';

import { refresh } from 'next/cache';
import { currentUserId } from '@/lib/auth';
import { eventOf, setGoing } from '@/lib/club';

/** Going to an event, or not any more: the page shows it, with how many go. */
export async function setGoingTo(event: string, going: boolean) {
    const me = await currentUserId();
    if (!me || !(await eventOf(event))) return;
    await setGoing(event, me, going);
    refresh();
}
