import { db } from './db';

export type Gender = 'woman' | 'man' | 'nonbinary';
export type Seeking = 'women' | 'men' | 'everyone';

export interface Profile {
    id: string;
    name: string;
    birthday: string; // YYYY-MM-DD
    gender: Gender;
    seeking: Seeking;
    city: string;
    about: string;
    hasPhoto: boolean;
    hideOnline: boolean;
}

/** A conversation in Messages: the one I talk with, our chat, and its last message. */
export interface Conversation {
    id: string;
    name: string;
    chat: string;
    last: { text: string; mine: boolean; at: number };
}

/** A message as this server keeps it: the id of the event that brought it, its chat, who wrote it, and when. */
export interface Message {
    id: string;
    chat: string;
    from: string;
    text: string;
    at: number;
}

// A profile's columns, from "user" u and the profile under the name given: its id as text, as Better Auth gives it.
const columns = (p: string) => `u.id::text as id, u.name, to_char(${p}.birthday, 'YYYY-MM-DD') as birthday, ${p}.gender, ${p}.seeking, ${p}.city,
                                ${p}.about, ${p}.photo is not null as "hasPhoto", ${p}.hide_online as "hideOnline"`;

/** The address of a person's photo. */
export function photoOf(id: string): string {
    return `/photos/${id}`;
}

export function ageOf(birthday: string): number {
    const [year, month, day] = birthday.split('-').map(Number);
    const now = new Date();
    const birthdayPassed = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
    return now.getFullYear() - year - (birthdayPassed ? 0 : 1);
}

/** A profile, or null for someone who has not made theirs yet. */
export async function profileOf(id: string): Promise<Profile | null> {
    const { rows } = await db.query(`select ${columns('p')} from profile p join "user" u on u.id = p.user_id where u.id = $1`, [id]);
    return rows[0] ?? null;
}

export async function nameOf(id: string): Promise<string | null> {
    const { rows } = await db.query(`select name from "user" where id = $1`, [id]);
    return rows[0]?.name ?? null;
}

export async function saveProfile(id: string, name: string, p: Omit<Profile, 'id' | 'name' | 'hasPhoto'>, photo: Buffer | null) {
    await db.query(`update "user" set name = $2 where id = $1`, [id, name]);
    await db.query(
        `insert into profile (user_id, birthday, gender, seeking, city, about, hide_online, photo) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id) do update set birthday = $2, gender = $3, seeking = $4, city = $5, about = $6, hide_online = $7,
                                             photo = coalesce($8, profile.photo)`,
        [id, p.birthday, p.gender, p.seeking, p.city, p.about, p.hideOnline, photo],
    );
}

export async function photo(id: string): Promise<Buffer | null> {
    const { rows } = await db.query(`select photo from profile where user_id = $1`, [id]);
    return rows[0]?.photo ?? null;
}

/** Whom each answer to "Looking for" takes in. */
export const WANTS: Record<Seeking, Gender[]> = {
    women: ['woman'],
    men: ['man'],
    everyone: ['woman', 'man', 'nonbinary'],
};

/** Whether someone has blocked another, or reported them. */
export async function hasBlocked(who: string, whom: string): Promise<boolean> {
    const { rows } = await db.query(`select 1 from block where who = $1 and whom = $2`, [who, whom]);
    return rows.length === 1;
}

/**
 * Whether two people may meet: see each other, chat and call. Each is among those the other looks for, and neither
 * has blocked the other. The rules of their chat and their calls ask it (lib/realtime.ts), and so does the page of a
 * member.
 */
export async function canMeet(a: string, b: string): Promise<boolean> {
    const personA = await profileOf(a);
    const personB = await profileOf(b);
    if (!personA || !personB || a === b) return false;

    const aWantsB = WANTS[personA.seeking].includes(personB.gender);
    const bWantsA = WANTS[personB.seeking].includes(personA.gender);
    const blocked = (await hasBlocked(a, b)) || (await hasBlocked(b, a));

    return aWantsB && bWantsA && !blocked;
}

/** The members someone sees in the catalog: those they may meet, the newest first. */
export async function membersFor(me: string): Promise<Profile[]> {
    const mine = await profileOf(me);
    if (!mine) return [];
    // canMeet with everyone at once: the genders I look for, among those who look for mine, with no block between us.
    // For Mia, a woman looking for men: the men looking for women or everyone.
    const genders = WANTS[mine.seeking];
    const answers = Object.keys(WANTS) as Seeking[];
    const seeking = answers.filter((answer) => WANTS[answer].includes(mine.gender));
    const { rows } = await db.query(
        `select ${columns('p')} from profile p join "user" u on u.id = p.user_id
         where p.user_id <> $1 and p.gender = any($2) and p.seeking = any($3)
           and not exists (select 1 from block k where (k.who = $1 and k.whom = p.user_id) or (k.who = p.user_id and k.whom = $1))
         order by p.created_at desc`,
        [me, genders, seeking],
    );
    return rows;
}

/** The room of a chat, for its messages and its calls: chat 7 talks in the room chat:7. */
export function roomOf(chat: string): string {
    return `chat:${chat}`;
}

/** The chat of a room: chat 7 for the room chat:7, and none for any other room. */
export function chatIn(room: string): string | null {
    const id = room.startsWith('chat:') ? room.slice('chat:'.length) : '';
    return isNumber(id) ? id : null;
}

/** Whether an id is a number, as the ids of chats and members are: '7', never 'x' or ''. */
const isNumber = (id: string) => /^[0-9]+$/.test(id);

/** The chat of two people: theirs, or a new one the first time either of them opens the other's page. */
export async function chatBetween(me: string, them: string): Promise<string> {
    // Known by their pair of ids, the smaller first, so both find the same one.
    const smaller = Math.min(Number(me), Number(them));
    const larger = Math.max(Number(me), Number(them));
    const pair = `${smaller}:${larger}`;

    // Made the first time, found after.
    await db.query(
        `insert into chat (pair) values ($1) on conflict do nothing`,
        [pair],
    );
    const { rows } = await db.query(
        `select id::text as id from chat where pair = $1`,
        [pair],
    );
    const chat = rows[0].id;

    await db.query(
        `insert into chat_member (chat_id, user_id) values ($1, $2), ($1, $3)
         on conflict do nothing`,
        [chat, me, them],
    );
    return chat;
}

/** The members of a chat: its two people, or everyone in a group. */
export async function membersOf(chat: string): Promise<string[]> {
    if (!isNumber(chat)) return [];
    const { rows } = await db.query(`select user_id::text as id from chat_member where chat_id = $1`, [chat]);
    return rows.map((row) => row.id);
}

/**
 * Whether someone may use a chat: write in it, read it and call in it. They are one of its members, and may still
 * meet each of the others (canMeet). A visitor who isn't signed in (null) never may.
 */
export async function mayChat(user: string | number | null, chat: string) {
    if (user === null) return false;
    const me = String(user);
    const members = await membersOf(chat);
    if (!members.includes(me)) return false;
    for (const other of members) {
        if (other !== me && !(await canMeet(me, other))) return false;
    }
    return true;
}

/** My conversations, the latest first, each with its last message, with the people I may still meet. */
export async function conversationsOf(me: string): Promise<Conversation[]> {
    // The last message of each of my chats, and the other one in it.
    const { rows } = await db.query(
        `select distinct on (m.chat_id) m.chat_id::text as chat, m.sender::text as sender, m.text, m.at, other.user_id::text as other
         from message m
         join chat_member mine on mine.chat_id = m.chat_id and mine.user_id = $1
         join chat_member other on other.chat_id = m.chat_id and other.user_id <> $1
         order by m.chat_id, m.at desc`,
        [me],
    );
    const conversations: Conversation[] = [];
    for (const row of rows) {
        if (!(await canMeet(me, row.other))) continue;
        conversations.push({
            id: row.other,
            name: (await nameOf(row.other)) ?? '',
            chat: row.chat,
            last: { text: row.text, mine: row.sender === me, at: Number(row.at) },
        });
    }
    // The latest first.
    return conversations.sort((one, other) => other.last.at - one.last.at);
}

/** Block, or report with a reason: neither sees the other again, and they can no longer chat or call. */
export async function block(me: string, them: string, reason: string | null) {
    await db.query(
        `insert into block (who, whom, reason) values ($1, $2, $3) on conflict (who, whom) do update set reason = coalesce($3, block.reason)`,
        [me, them, reason],
    );
}

/** Keeps a message once, by its event id. True when it is new, so the others are told only once. */
export async function keepMessage(message: Message): Promise<boolean> {
    const { rowCount } = await db.query(
        `insert into message (id, chat_id, sender, text, at) values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
        [message.id, message.chat, message.from, message.text, message.at],
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

/** A page of a chat, oldest first: the newest 50, or the 50 before a message. */
export async function messagesPage(chat: string, before: string | null) {
    const { rows } = await db.query(
        `select id, sender::text as "from", text, at, reactions from message
         where chat_id = $1 and ($2::text is null or at < (select at from message where id = $2))
         order by at desc limit 51`,
        [chat, before],
    );
    const messages = rows.slice(0, 50).reverse().map((row) => ({ ...row, at: Number(row.at) }));
    return { messages, more: rows.length > 50 };
}
