'use server';

import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { admit, answerRequest, appointmentOf, askNow, book, nameOf, REQUEST_WAITS, saveNotes, visitOpen, withdraw } from '@/lib/clinic';
import { endVisit, realtime } from '@/lib/realtime';

// What the pages do, each for the person signed in: the server keeps it, then tells the other one through WordPlus
// Cloud, on whatever page they are (realtime.toUser), and every page following who is free (realtime.to('experts')).

/** A client books a half hour with an expert, then goes to it. Why not, when it can't be booked. */
export async function bookVisit(expert: string, startsAt: number, topic: string): Promise<{ error: string }> {
    const me = await currentUserId();
    if (!me) return { error: 'Sign in first.' };
    const booked = await book(me, expert, startsAt, topic);
    if (typeof booked === 'string') return { error: booked };
    await realtime.toUser(expert).emit('booked', { appointment: booked.id, name: booked.clientName, startsAt: booked.startsAt });
    // Every page showing this expert's times takes this one away.
    await realtime.to('experts').emit('changed');
    redirect(`/appointments/${booked.id}`);
}

/** The client is in the waiting room: the expert hears it, on whatever page they are. */
export async function imHere(id: string) {
    const me = await currentUserId();
    const appointment = await appointmentOf(id);
    if (!me || !appointment || appointment.client !== me || !visitOpen(appointment)) return;
    await realtime.toUser(appointment.expert).emit('waiting', { appointment: id, name: appointment.clientName });
}

/** The expert lets the client in: from now on the visit's rule lets the client come in, and the client hears so. */
export async function letIn(id: string): Promise<boolean> {
    const me = await currentUserId();
    const appointment = me ? await admit(id, me) : null;
    if (!appointment) return false;
    await realtime.toUser(appointment.client).emit('admitted', { appointment: id, name: appointment.expertName });
    return true;
}

/** The expert ends the visit for both. */
export async function endNow(id: string) {
    const me = await currentUserId();
    const appointment = await appointmentOf(id);
    if (!me || !appointment || appointment.expert !== me || appointment.endedAt !== null) return;
    await endVisit(appointment);
}

/** The expert's notes after the visit: kept, and the client hears they are there. */
export async function writeNotes(id: string, notes: string): Promise<boolean> {
    const me = await currentUserId();
    const appointment = me ? await saveNotes(id, me, notes) : null;
    if (!appointment) return false;
    await realtime.toUser(appointment.client).emit('notes', { appointment: id, name: appointment.expertName });
    return true;
}

/** A client asks a free expert for a session now: the expert hears it, and has a minute to take it. */
export async function talkNow(expert: string, topic: string): Promise<{ request: string } | { error: string }> {
    const me = await currentUserId();
    if (!me) return { error: 'Sign in first.' };
    const request = await askNow(me, expert, topic);
    if (typeof request !== 'string') return request;
    await realtime.toUser(expert).emit('request', { request, name: await nameOf(me), topic: topic.trim().slice(0, 140), waits: REQUEST_WAITS });
    return { request };
}

/** The client stops waiting for an answer: the expert's page drops the request. */
export async function stopAsking(request: string, expert: string) {
    const me = await currentUserId();
    if (!me) return;
    await withdraw(request, me);
    await realtime.toUser(expert).emit('withdrawn', { request });
}

/** The expert's answer to a session asked for now. Taken, its appointment, which both go to. */
export async function answer(request: string, accept: boolean): Promise<{ appointment: string } | null> {
    const me = await currentUserId();
    const answered = me ? await answerRequest(request, me, accept) : null;
    if (!answered) return null;
    await realtime.toUser(answered.client).emit('answer', { request, accepted: accept, appointment: answered.appointment, name: await nameOf(me!) });
    if (!answered.appointment) return null;
    await realtime.to('experts').emit('changed');
    return { appointment: answered.appointment };
}
