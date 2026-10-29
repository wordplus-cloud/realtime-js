import { randomUUID } from 'node:crypto';
import { db } from './db';

/** A member, as the pages and the profile of lib/realtime.ts show them. A host runs events and looks after the lounges. */
export interface Person {
    id: string;
    name: string;
    role: 'host' | 'member';
    title: string;
    about: string;
}

export interface Channel {
    id: string;
    name: string;
    about: string;
}

export interface Lounge {
    id: string;
    name: string;
    about: string;
    kind: 'audio' | 'video';
}

export interface Event {
    id: string;
    title: string;
    about: string;
    host: string;
    hostName: string;
    startsAt: number;
    going: number;
}

/** A conversation between two, as the sidebar lists it: the other one, our chat, and when its last message came. */
export interface Conversation {
    id: string;
    name: string;
    chat: string;
    at: number;
}

/** A message as this server keeps it: the id of the event that brought it, its room, who wrote it, and when. */
export interface Message {
    id: string;
    room: string;
    from: string;
    text: string;
    files: unknown[];
    at: number;
}

/** A file as this server keeps it, and as a message carries it. */
export interface KeptFile {
    id: string;
    url: string;
    name: string;
    type: string;
    size: number;
}

const isNumber = (id: string) => /^[0-9]+$/.test(id);
const PERSON = `u.id::text as id, u.name, coalesce(p.role, 'member') as role, coalesce(p.title, '') as title, coalesce(p.about, '') as about`;

/** The address of a member's photo. */
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

/** Every member of the club, its hosts first, then by name. */
export async function members(): Promise<Person[]> {
    const { rows } = await db.query(`select ${PERSON} from "user" u left join profile p on p.user_id = u.id order by p.role = 'host' desc, u.name`);
    return rows;
}

/** Whether someone is a member: anyone signed in. A visitor who isn't (null) never is. */
export async function isMember(user: string | number | null): Promise<boolean> {
    return user !== null && (await personOf(String(user))) !== null;
}

export async function isHost(user: string | number | null): Promise<boolean> {
    return user !== null && (await personOf(String(user)))?.role === 'host';
}

// Channels, lounges and events

export async function channels(): Promise<Channel[]> {
    const { rows } = await db.query(`select id::text as id, name, about from channel order by position, id`);
    return rows;
}

export async function channelOf(id: string): Promise<Channel | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(`select id::text as id, name, about from channel where id = $1`, [id]);
    return rows[0] ?? null;
}

export async function lounges(): Promise<Lounge[]> {
    const { rows } = await db.query(`select id::text as id, name, about, kind from lounge order by id`);
    return rows;
}

export async function loungeOf(id: string): Promise<Lounge | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(`select id::text as id, name, about, kind from lounge where id = $1`, [id]);
    return rows[0] ?? null;
}

const EVENT = `e.id::text as id, e.title, e.about, e.host::text as host, h.name as "hostName", e.starts_at,
               (select count(*) from going g where g.event_id = e.id)::int as going
               from event e join "user" h on h.id = e.host`;
const toEvent = (row: Record<string, unknown>): Event => ({ ...(row as unknown as Event), startsAt: (row.starts_at as Date).getTime() });

/** Every event, the earliest first. */
export async function events(): Promise<Event[]> {
    const { rows } = await db.query(`select ${EVENT} order by e.starts_at`);
    return rows.map(toEvent);
}

export async function eventOf(id: string): Promise<Event | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(`select ${EVENT} where e.id = $1`, [id]);
    return rows[0] ? toEvent(rows[0]) : null;
}

export async function isGoing(event: string, user: string): Promise<boolean> {
    const { rows } = await db.query(`select 1 from going where event_id = $1 and user_id = $2`, [event, user]);
    return rows.length === 1;
}

/** Going, or not going any more. */
export async function setGoing(event: string, user: string, going: boolean) {
    if (going) await db.query(`insert into going (event_id, user_id) values ($1, $2) on conflict do nothing`, [event, user]);
    else await db.query(`delete from going where event_id = $1 and user_id = $2`, [event, user]);
}

// Rooms and calls by name: channel 3 is channel:3, conversation 7 chat:7, lounge 2 lounge:2, event 5 event:5.

/** The number in a room's or call's name of a kind: 3 for channel:3 with 'channel', none for any other name. */
export function idIn(name: string, kind: 'channel' | 'chat' | 'lounge' | 'event'): string | null {
    const id = name.startsWith(`${kind}:`) ? name.slice(kind.length + 1) : '';
    return isNumber(id) ? id : null;
}

// Conversations between two

/** The chat of two members: theirs, or a new one the first time either of them opens the other's page. */
export async function chatBetween(me: string, them: string): Promise<string> {
    const pair = [Number(me), Number(them)].sort((a, b) => a - b).join(':');
    await db.query(`insert into chat (pair) values ($1) on conflict do nothing`, [pair]);
    const { rows } = await db.query(`select id::text as id from chat where pair = $1`, [pair]);
    const chat = rows[0].id;
    await db.query(`insert into chat_member (chat_id, user_id) values ($1, $2), ($1, $3) on conflict do nothing`, [chat, me, them]);
    return chat;
}

/** The two of a conversation. */
export async function membersOf(chat: string): Promise<string[]> {
    if (!isNumber(chat)) return [];
    const { rows } = await db.query(`select user_id::text as id from chat_member where chat_id = $1`, [chat]);
    return rows.map((row) => row.id);
}

/** My conversations between two with a message in them, the latest first. */
export async function conversationsOf(me: string): Promise<Conversation[]> {
    const { rows } = await db.query(
        `select c.id::text as chat, other.user_id::text as id, u.name, max(m.at) as at
         from chat c
         join chat_member mine on mine.chat_id = c.id and mine.user_id = $1
         join chat_member other on other.chat_id = c.id and other.user_id <> $1
         join "user" u on u.id = other.user_id
         join message m on m.room = 'chat:' || c.id
         group by c.id, other.user_id, u.name order by max(m.at) desc`,
        [me],
    );
    return rows.map((row) => ({ ...row, at: Number(row.at) }));
}

/**
 * Whether someone may read and write in a room of messages: a channel, any member, and a conversation between two, its
 * two. A visitor who isn't signed in (null) never may.
 */
export async function mayWrite(user: string | number | null, room: string): Promise<boolean> {
    if (idIn(room, 'channel')) return (await channelOf(idIn(room, 'channel')!)) !== null && (await isMember(user));
    const chat = idIn(room, 'chat');
    return chat !== null && user !== null && (await membersOf(chat)).includes(String(user));
}

// Messages and files

/** Keeps a message once, by its event id. True when it is new, so the other one is told only once. */
export async function keepMessage(message: Message): Promise<boolean> {
    const { rowCount } = await db.query(
        `insert into message (id, room, sender, text, files, at) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`,
        [message.id, message.room, message.from, message.text, JSON.stringify(message.files), message.at],
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

/** A page of a room's messages, oldest first: the newest 50, or the 50 before a message. */
export async function messagesPage(room: string, before: string | null) {
    const { rows } = await db.query(
        `select id, sender::text as "from", text, files, at, reactions from message
         where room = $1 and ($2::text is null or at < (select at from message where id = $2))
         order by at desc limit 51`,
        [room, before],
    );
    const messages = rows.slice(0, 50).reverse().map((row) => ({ ...row, at: Number(row.at) }));
    return { messages, more: rows.length > 50 };
}

/** The last message of each channel, for the club's page. */
export async function lastInChannels(): Promise<Map<string, { name: string; text: string; at: number }>> {
    const { rows } = await db.query(
        `select distinct on (m.room) m.room, u.name, m.text, m.files, m.at from message m join "user" u on u.id = m.sender
         where m.room like 'channel:%' order by m.room, m.at desc`,
    );
    return new Map(rows.map((row) => [idIn(row.room, 'channel')!, { name: row.name, text: row.text || (row.files.length ? 'shared a photo' : ''), at: Number(row.at) }]));
}

/** Where a kept file opens. */
export const fileUrl = (id: string) => `/files/${id}`;

/** The files a message may carry: those kept for its room, as kept, whatever the message said of them. */
export async function filesFor(room: string, given: unknown): Promise<KeptFile[]> {
    if (!Array.isArray(given)) return [];
    const ids = given.map((file) => (file as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string').slice(0, 10);
    if (!ids.length) return [];
    const { rows } = await db.query(`select id, name, type, size from file where room = $1 and id = any($2)`, [room, ids]);
    return rows.map((row) => ({ id: row.id, url: fileUrl(row.id), name: row.name, type: row.type, size: row.size }));
}

/** Keeps a file sent in a room. */
export async function keepFile(room: string, owner: string, file: { name: string; type: string; data: Buffer }): Promise<KeptFile> {
    const id = randomUUID();
    await db.query(`insert into file (id, room, owner, name, type, size, data) values ($1, $2, $3, $4, $5, $6, $7)`, [
        id, room, owner, file.name, file.type, file.data.length, file.data,
    ]);
    return { id, url: fileUrl(id), name: file.name, type: file.type, size: file.data.length };
}

/** A kept file with its room, to check who may open it. */
export async function fileOf(id: string): Promise<{ room: string; name: string; type: string; data: Buffer } | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const { rows } = await db.query(`select room, name, type, data from file where id = $1`, [id]);
    return rows[0] ?? null;
}
