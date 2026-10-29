import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './auth';
import {
    appointmentIn, appointmentOf, filesFor, isParty, keepMessage, markEnded, markStarted, mayChat, mayJoinVisit, nameOf, personOf, photoOf, react,
    visitOf, type Appointment, type Message,
} from './clinic';
import { DEMO_VISIT_MINUTES, WORLDS, webhooksInEveryWorld } from './worlds';

export const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: the signed-in user, or null.
    user: () => currentUserId(),
    // What people see of each other: in the messages, the waiting room and the visit.
    profile: async (user) => {
        const person = await personOf(String(user));
        return person ? { name: person.name, avatar: photoOf(person.id) } : null;
    },
});
// The public demo: the webhooks read and keep the appointments of every visitor's world (lib/worlds.ts).
if (WORLDS) webhooksInEveryWorld(realtime);

// An appointment's messages: chat:{id}, where {id} is the appointment's number. Its expert and its client write there
// before the visit, during it and after, with files. Messages, typing, reactions and read ticks go from page to page
// sealed, and the messages and reactions come here too (below), to be kept. A page asks to join at /api/realtime/auth.
realtime.room(
    'chat:{id}',
    {
        history: 50,
        emit: ['message', 'typing', 'reaction', 'read'],
        webhook: ['message', 'reaction'],
    },
    async (user, { id }) => mayChat(user, id),
);

// Its waiting room: waiting:{id}, a presence room. The client waits there once they are ready, and the expert's pages
// see them in it, as they come and go.
realtime.room('waiting:{id}', { presence: true }, async (user, { id }) => mayChat(user, id));

// Its visit: visit:{id}, a group call on WordPlus Cloud's media servers, encrypted end to end: each browser encrypts
// what it sends with a key this server makes, which only those the rule lets in get, so the media servers forward
// what they can't see or hear. Its expert comes in while it is open, from ten minutes before it starts, and its client
// once the expert let them in (lib/clinic.ts). A page asks to join at /api/realtime/calls.
realtime.groupCalls('visit:{id}', async (user, { id }) => mayJoinVisit(user, id), { encrypt: true });

// Who is free: every signed-in page joins it, and hears when a visit starts or ends, or a time is booked, to show the
// experts as they are now. Only the server says anything in it.
realtime.room('experts', async (user) => user !== null);

/** The experts in a visit now: WordPlus Cloud knows which visits are on, with no table here. */
export async function inVisitNow(): Promise<Set<string>> {
    const busy = new Set<string>();
    for (const call of await realtime.listCalls()) {
        const id = appointmentIn(call.name, 'visit');
        const appointment = id && call.people > 0 ? await appointmentOf(id) : null;
        if (appointment) busy.add(appointment.expert);
    }
    return busy;
}

/** Keeps a message, and the first time, tells the other one of the appointment, on whatever page they are. */
export async function keepAndTell(message: Message) {
    const appointment = await appointmentOf(message.appointment);
    if (!appointment || !isParty(appointment, message.from)) return;
    // Only the files kept for this appointment, as they were kept: anyone may write anything into a message of their own.
    const files = await filesFor(appointment.id, message.files);
    if (!message.text && !files.length) return;
    if (!(await keepMessage({ ...message, files }))) return; // kept before, so told before
    const other = message.from === appointment.expert ? appointment.client : appointment.expert;
    await realtime.toUser(other).emit('message', {
        appointment: appointment.id,
        name: await nameOf(message.from),
        text: message.text ? message.text.slice(0, 140) : files.length === 1 ? `sent ${files[0].name}` : `sent ${files.length} files`,
    });
}

// The webhooks of the messages: each message and reaction, as the cloud took it.
realtime.on('message', async ({ room, from, data, event_id, at }) => {
    const id = appointmentIn(room, 'chat');
    if (!from || !id) return;
    await keepAndTell({ id: event_id, appointment: id, from: String(from), text: String(data.text ?? ''), files: data.files as unknown[], at });
});
realtime.on('reaction', async ({ from, data }) => {
    if (from) await react(String(data.id), String(from), String(data.key ?? ''));
});

// The webhooks of the visits: someone came in, or left. The first one in starts it, and it ends at its time. Every page
// shows who is free.
realtime.on('group.joined', async ({ call }) => {
    const id = appointmentIn(call, 'visit');
    if (!id) return;
    await markStarted(id);
    await realtime.to('experts').emit('changed');
    const appointment = await appointmentOf(id);
    if (appointment) endAtItsTime(appointment);
});
realtime.on('group.left', async ({ call }) => {
    if (appointmentIn(call, 'visit')) await realtime.to('experts').emit('changed');
});

/** Ends a visit for both: its call, and the tokens they had, so nobody comes back into it. */
export async function endVisit(appointment: Appointment) {
    await realtime.call(visitOf(appointment.id)).end().catch(() => {}); // not on, if nobody came in
    await markEnded(appointment.id);
    await realtime.toUser([appointment.expert, appointment.client]).emit('ended', { appointment: appointment.id });
    await realtime.to('experts').emit('changed');
}

const ending = new Set<string>();

/**
 * A visit ends at the end of its half hour, unless its expert ended it before. A timer of this server's, set as the
 * visit starts: a site of your own may run a job for it instead. The public demo ends a visit after a few minutes.
 */
function endAtItsTime(appointment: Appointment) {
    if (ending.has(appointment.id)) return;
    ending.add(appointment.id);
    const end = WORLDS ? Math.min(appointment.endsAt, Date.now() + DEMO_VISIT_MINUTES * 60_000) : appointment.endsAt;
    setTimeout(async () => {
        ending.delete(appointment.id);
        const now = await appointmentOf(appointment.id).catch(() => null);
        if (now && now.endedAt === null) await endVisit(now).catch(() => {});
    }, Math.max(0, end - Date.now())).unref();
}
