import { randomUUID } from 'node:crypto';
import { db } from './db';

/** Someone on the site: an expert, who takes appointments, or a client, who books them. */
export interface Person {
    id: string;
    name: string;
    role: 'expert' | 'client';
    title: string;
    field: string;
    about: string;
}

/** A client's half hour with an expert, its times in milliseconds. */
export interface Appointment {
    id: string;
    expert: string;
    client: string;
    expertName: string;
    clientName: string;
    expertTitle: string;
    startsAt: number;
    endsAt: number;
    topic: string;
    /** When the expert let the client in, if they did. */
    admittedAt: number | null;
    startedAt: number | null;
    endedAt: number | null;
    /** What the expert wrote down after the visit, for the client. */
    notes: string | null;
}

/** A message as this server keeps it: the id of the event that brought it, its appointment, who wrote it, and when. */
export interface Message {
    id: string;
    appointment: string;
    from: string;
    text: string;
    files: unknown[];
    at: number;
}

/** A file as this server keeps it, and as a message carries it: where it is, what it is. */
export interface KeptFile {
    id: string;
    url: string;
    name: string;
    type: string;
    size: number;
}

export const SESSION_MINUTES = 30;
const MINUTE = 60_000;
/** A visit opens this long before it starts. */
export const OPENS_BEFORE = 10 * MINUTE;

const isNumber = (id: string) => /^[0-9]+$/.test(id);
const ms = (at: Date | null) => (at ? at.getTime() : null);

const PERSON = `u.id::text as id, u.name, coalesce(p.role, 'client') as role, coalesce(p.title, '') as title,
                coalesce(p.field, '') as field, coalesce(p.about, '') as about`;

/** The address of a person's photo. */
export function photoOf(id: string): string {
    return `/photos/${id}`;
}

export async function personOf(id: string): Promise<Person | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(`select ${PERSON} from "user" u left join profile p on p.user_id = u.id where u.id = $1`, [id]);
    return rows[0] ?? null;
}

export async function nameOf(id: string): Promise<string | null> {
    return (await personOf(id))?.name ?? null;
}

export async function photo(id: string): Promise<Buffer | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(`select photo from profile where user_id = $1`, [id]);
    return rows[0]?.photo ?? null;
}

/** Every expert, by name. */
export async function experts(): Promise<Person[]> {
    const { rows } = await db.query(`select ${PERSON} from "user" u join profile p on p.user_id = u.id where p.role = 'expert' order by u.name`);
    return rows;
}

// Appointments

const APPOINTMENT = `a.id::text as id, a.expert::text as expert, a.client::text as client, e.name as expert_name, c.name as client_name,
                     coalesce(ep.title, '') as expert_title, a.starts_at, a.ends_at, a.topic, a.admitted_at, a.started_at, a.ended_at, a.notes
                     from appointment a join "user" e on e.id = a.expert join "user" c on c.id = a.client left join profile ep on ep.user_id = a.expert`;

type Row = Record<string, unknown>;
const toAppointment = (row: Row): Appointment => ({
    id: row.id as string,
    expert: row.expert as string,
    client: row.client as string,
    expertName: row.expert_name as string,
    clientName: row.client_name as string,
    expertTitle: row.expert_title as string,
    startsAt: ms(row.starts_at as Date)!,
    endsAt: ms(row.ends_at as Date)!,
    topic: row.topic as string,
    admittedAt: ms(row.admitted_at as Date | null),
    startedAt: ms(row.started_at as Date | null),
    endedAt: ms(row.ended_at as Date | null),
    notes: (row.notes as string | null) ?? null,
});

export async function appointmentOf(id: string): Promise<Appointment | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(`select ${APPOINTMENT} where a.id = $1`, [id]);
    return rows[0] ? toAppointment(rows[0]) : null;
}

/** Someone's appointments, as their expert or their client, the earliest first. */
export async function appointmentsOf(user: string): Promise<Appointment[]> {
    const { rows } = await db.query(`select ${APPOINTMENT} where a.expert = $1 or a.client = $1 order by a.starts_at`, [user]);
    return rows.map(toAppointment);
}

/** Whether someone is the expert or the client of an appointment. A visitor who isn't signed in (null) never is. */
export function isParty(appointment: Appointment, user: string | number | null): boolean {
    return user !== null && [appointment.expert, appointment.client].includes(String(user));
}

/** Whether a visit is open: from ten minutes before it starts until it ends, or until its expert ended it. */
export function visitOpen(appointment: Appointment, now = Date.now()): boolean {
    return appointment.endedAt === null && now >= appointment.startsAt - OPENS_BEFORE && now < appointment.endsAt;
}

/**
 * Whether someone may write in an appointment's messages, and read them: its expert and its client, before the visit,
 * during it and after.
 */
export async function mayChat(user: string | number | null, id: string): Promise<boolean> {
    const appointment = await appointmentOf(id);
    return appointment !== null && isParty(appointment, user);
}

/** Whether someone may come into an appointment's visit now: its expert while it is open, its client once let in. */
export async function mayJoinVisit(user: string | number | null, id: string): Promise<boolean> {
    const appointment = await appointmentOf(id);
    if (!appointment || !isParty(appointment, user) || !visitOpen(appointment)) return false;
    return String(user) === appointment.expert || appointment.admittedAt !== null;
}

/** The half hours an expert is taken in a stretch of time, by when they start. */
export async function takenBetween(expert: string, from: number, to: number): Promise<number[]> {
    if (!isNumber(expert)) return [];
    const { rows } = await db.query(
        `select starts_at, ends_at from appointment where expert = $1 and ends_at > $2 and starts_at < $3 and ended_at is null`,
        [expert, new Date(from), new Date(to)],
    );
    // A session asked for now may start at any minute: it takes every half hour it overlaps.
    const taken = new Set<number>();
    for (const row of rows) {
        for (let slot = Math.floor(ms(row.starts_at)! / (SESSION_MINUTES * MINUTE)) * SESSION_MINUTES * MINUTE; slot < ms(row.ends_at)!; slot += SESSION_MINUTES * MINUTE) taken.add(slot);
    }
    return [...taken].sort((a, b) => a - b);
}

/** Whether an expert has an appointment overlapping a stretch of time. */
async function busy(expert: string, from: number, to: number): Promise<boolean> {
    const { rows } = await db.query(
        `select 1 from appointment where expert = $1 and starts_at < $3 and ends_at > $2 and ended_at is null`,
        [expert, new Date(from), new Date(to)],
    );
    return rows.length > 0;
}

/**
 * Books a half hour with an expert, for a client: on the half hour, from the next one to a week ahead, and free. The
 * appointment, or why not.
 */
export async function book(client: string, expert: string, startsAt: number, topic: string): Promise<Appointment | string> {
    const [who, withWhom] = await Promise.all([personOf(client), personOf(expert)]);
    if (!who || who.role !== 'client') return 'Only a client books a visit.';
    if (!withWhom || withWhom.role !== 'expert') return 'That is no expert of this site.';
    const now = Date.now();
    if (!Number.isInteger(startsAt) || startsAt % (SESSION_MINUTES * MINUTE) !== 0) return 'A visit starts on the half hour.';
    if (startsAt <= now || startsAt > now + 7 * 24 * 60 * MINUTE) return 'Pick a time in the coming week.';
    const endsAt = startsAt + SESSION_MINUTES * MINUTE;
    if (await busy(expert, startsAt, endsAt)) return 'That time was just taken. Pick another.';
    const { rows } = await db.query(
        `insert into appointment (expert, client, starts_at, ends_at, topic) values ($1, $2, $3, $4, $5)
         on conflict do nothing returning id::text as id`,
        [expert, client, new Date(startsAt), new Date(endsAt), topic.trim().slice(0, 140)],
    );
    if (!rows[0]) return 'That time was just taken. Pick another.';
    return (await appointmentOf(rows[0].id))!;
}

/** The expert lets the client in: the client may come into the visit from now on. */
export async function admit(id: string, expert: string): Promise<Appointment | null> {
    const appointment = await appointmentOf(id);
    if (!appointment || appointment.expert !== expert || !visitOpen(appointment)) return null;
    await db.query(`update appointment set admitted_at = coalesce(admitted_at, now()) where id = $1`, [id]);
    return appointmentOf(id);
}

/** The visit began: the first one came in. */
export async function markStarted(id: string) {
    await db.query(`update appointment set started_at = coalesce(started_at, now()) where id = $1`, [id]);
}

/** The visit ended: by its expert, or at its time. */
export async function markEnded(id: string) {
    await db.query(`update appointment set ended_at = coalesce(ended_at, now()) where id = $1`, [id]);
}

/** The expert's notes after a visit, for the client. */
export async function saveNotes(id: string, expert: string, notes: string): Promise<Appointment | null> {
    const appointment = await appointmentOf(id);
    if (!appointment || appointment.expert !== expert || appointment.startsAt > Date.now()) return null;
    await db.query(`update appointment set notes = $2, notes_at = now() where id = $1`, [id, notes.trim().slice(0, 4000)]);
    return appointmentOf(id);
}

// Sessions asked for now

export interface Request {
    id: string;
    expert: string;
    client: string;
    topic: string;
    createdAt: number;
    answer: 'accepted' | 'declined' | null;
    appointment: string | null;
}

/** How long a session asked for now waits for its expert. */
export const REQUEST_WAITS = MINUTE;

export async function requestOf(id: string): Promise<Request | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(
        `select id::text as id, expert::text as expert, client::text as client, topic, created_at, answer, appointment::text as appointment from request where id = $1`,
        [id],
    );
    return rows[0] ? { ...rows[0], createdAt: ms(rows[0].created_at) } : null;
}

/** A client asks an expert for a session now, while the expert is free. Its id, or why not. */
export async function askNow(client: string, expert: string, topic: string): Promise<string | { error: string }> {
    const [who, withWhom] = await Promise.all([personOf(client), personOf(expert)]);
    if (!who || who.role !== 'client' || !withWhom || withWhom.role !== 'expert') return { error: 'Only a client asks an expert.' };
    if (await busy(expert, Date.now(), Date.now() + SESSION_MINUTES * MINUTE)) return { error: `${withWhom.name} has a visit now. Book a time instead.` };
    const { rows } = await db.query(`insert into request (expert, client, topic) values ($1, $2, $3) returning id::text as id`, [expert, client, topic.trim().slice(0, 140)]);
    return rows[0].id;
}

/**
 * The expert's answer to a session asked for now, once: taken, it is an appointment from this minute, its client let
 * in already. The request as answered, or null when it was answered before, timed out, or is someone else's.
 */
export async function answerRequest(id: string, expert: string, accept: boolean): Promise<Request | null> {
    const request = await requestOf(id);
    if (!request || request.expert !== expert || request.answer !== null || Date.now() - request.createdAt > REQUEST_WAITS) return null;
    if (!accept) {
        await db.query(`update request set answer = 'declined' where id = $1 and answer is null`, [id]);
        return { ...request, answer: 'declined' };
    }
    const startsAt = Math.floor(Date.now() / MINUTE) * MINUTE;
    if (await busy(expert, startsAt, startsAt + SESSION_MINUTES * MINUTE)) return null;
    const { rows } = await db.query(
        `insert into appointment (expert, client, starts_at, ends_at, topic, admitted_at) values ($1, $2, $3, $4, $5, now())
         on conflict do nothing returning id::text as id`,
        [expert, request.client, new Date(startsAt), new Date(startsAt + SESSION_MINUTES * MINUTE), request.topic || 'A session now'],
    );
    if (!rows[0]) return null;
    await db.query(`update request set answer = 'accepted', appointment = $2 where id = $1`, [id, rows[0].id]);
    return { ...request, answer: 'accepted', appointment: rows[0].id };
}

/** The client gives up waiting: the request can no longer be taken. */
export async function withdraw(id: string, client: string) {
    await db.query(`update request set answer = 'declined' where id = $1 and client = $2 and answer is null`, [id, client]);
}

// Rooms and calls, by an appointment's number: appointment 7 is visited in visit:7, written about in chat:7, and
// waited for in waiting:7.

export const visitOf = (id: string) => `visit:${id}`;
export const chatOf = (id: string) => `chat:${id}`;
export const waitingOf = (id: string) => `waiting:${id}`;

/** The appointment of a room or call: 7 for visit:7 with 'visit', and none for any other name. */
export function appointmentIn(name: string, kind: 'visit' | 'chat' | 'waiting'): string | null {
    const id = name.startsWith(`${kind}:`) ? name.slice(kind.length + 1) : '';
    return isNumber(id) ? id : null;
}

// Messages and files

/** Keeps a message once, by its event id. True when it is new, so the other one is told only once. */
export async function keepMessage(message: Message): Promise<boolean> {
    const { rowCount } = await db.query(
        `insert into message (id, appointment_id, sender, text, files, at) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`,
        [message.id, message.appointment, message.from, message.text, JSON.stringify(message.files), message.at],
    );
    return rowCount === 1;
}

/** One reaction per person and message: `key` replaces theirs, an empty one takes it back. */
export async function react(id: string, user: string, key: string) {
    const { rows } = await db.query(`select reactions from message where id = $1`, [id]);
    if (!rows[0]) return;
    const reactions: Record<string, string[]> = {};
    for (const [reaction, users] of Object.entries(rows[0].reactions as Record<string, string[]>)) {
        const others = users.filter((someone) => someone !== user);
        if (others.length) reactions[reaction] = others;
    }
    if (key) reactions[key] = [...(reactions[key] ?? []), user];
    await db.query(`update message set reactions = $2 where id = $1`, [id, reactions]);
}

/** A page of an appointment's messages, oldest first: the newest 50, or the 50 before a message. */
export async function messagesPage(appointment: string, before: string | null) {
    const { rows } = await db.query(
        `select id, sender::text as "from", text, files, at, reactions from message
         where appointment_id = $1 and ($2::text is null or at < (select at from message where id = $2))
         order by at desc limit 51`,
        [appointment, before],
    );
    const messages = rows.slice(0, 50).reverse().map((row) => ({ ...row, at: Number(row.at) }));
    return { messages, more: rows.length > 50 };
}

/** The files a message may carry: those kept for its appointment, as kept, whatever the message said of them. */
export async function filesFor(appointment: string, given: unknown): Promise<KeptFile[]> {
    if (!Array.isArray(given)) return [];
    const ids = given.map((file) => (file as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string').slice(0, 10);
    if (!ids.length) return [];
    const { rows } = await db.query(`select id, name, type, size from file where appointment_id = $1 and id = any($2)`, [appointment, ids]);
    return rows.map((row) => ({ id: row.id, url: fileUrl(row.id), name: row.name, type: row.type, size: row.size }));
}

/** Where a kept file opens. */
export const fileUrl = (id: string) => `/files/${id}`;

/** Keeps a file sent in an appointment's messages. */
export async function keepFile(appointment: string, owner: string, file: { name: string; type: string; data: Buffer }): Promise<KeptFile> {
    const id = randomUUID();
    await db.query(`insert into file (id, appointment_id, owner, name, type, size, data) values ($1, $2, $3, $4, $5, $6, $7)`, [
        id, appointment, owner, file.name, file.type, file.data.length, file.data,
    ]);
    return { id, url: fileUrl(id), name: file.name, type: file.type, size: file.data.length };
}

/** A kept file with its appointment, to check who may open it. */
export async function fileOf(id: string): Promise<{ appointment: string; name: string; type: string; data: Buffer } | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const { rows } = await db.query(`select appointment_id::text as appointment, name, type, data from file where id = $1`, [id]);
    return rows[0] ?? null;
}
