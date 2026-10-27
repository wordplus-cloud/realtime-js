import { db } from './db';

/** A colleague, as the pages and the profile of lib/realtime.ts show them. */
export interface Person {
    id: string;
    name: string;
    title: string;
    about: string;
}

/** A team, with its lead, who hosts its meetings. */
export interface Team {
    id: string;
    name: string;
    about: string;
    lead: string | null;
    leadName: string | null;
}

/** A channel of a team: its chat, and its name ('general'). */
export interface Channel {
    id: string;
    team: string;
    name: string;
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

const PERSON = `u.id::text as id, u.name, coalesce(p.title, '') as title, coalesce(p.about, '') as about`;
const TEAM = `t.id::text as id, t.name, t.about, t.lead::text as lead, l.name as "leadName"`;

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

/** Everyone at the company, by name. */
export async function everyone(): Promise<Person[]> {
    const { rows } = await db.query(`select ${PERSON} from "user" u left join profile p on p.user_id = u.id order by u.name`);
    return rows;
}

/** Whether two people may write to and call each other: two colleagues, any two at the company. */
export async function areColleagues(a: string, b: string): Promise<boolean> {
    return a !== b && (await personOf(a)) !== null && (await personOf(b)) !== null;
}

// Teams

export async function teamOf(id: string): Promise<Team | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(`select ${TEAM} from team t left join "user" l on l.id = t.lead where t.id = $1`, [id]);
    return rows[0] ?? null;
}

/** The teams someone is in, by name. */
export async function teamsOf(user: string): Promise<Team[]> {
    const { rows } = await db.query(
        `select ${TEAM} from team t join team_member m on m.team_id = t.id and m.user_id = $1 left join "user" l on l.id = t.lead order by t.name`,
        [user],
    );
    return rows;
}

/** The members of a team, its lead first, then by name. */
export async function peopleIn(team: string): Promise<Person[]> {
    const { rows } = await db.query(
        `select ${PERSON} from team_member m join team t on t.id = m.team_id join "user" u on u.id = m.user_id
         left join profile p on p.user_id = u.id where m.team_id = $1 order by u.id = t.lead desc, u.name`,
        [team],
    );
    return rows;
}

/** Whether someone is in a team. A visitor who isn't signed in (null) never is. */
export async function isMember(team: string, user: string | number | null): Promise<boolean> {
    if (user === null || !isNumber(team)) return false;
    const { rows } = await db.query(`select 1 from team_member where team_id = $1 and user_id = $2`, [team, String(user)]);
    return rows.length === 1;
}

// Meetings: each team has one meeting room, a group call named meeting:{id}.

/** The group call of a team's meetings: team 3 meets in meeting:3. */
export function meetingOf(team: string): string {
    return `meeting:${team}`;
}

/** The team of a meeting: team 3 for meeting:3, and none for any other call. */
export function teamIn(call: string): string | null {
    const id = call.startsWith('meeting:') ? call.slice('meeting:'.length) : '';
    return isNumber(id) ? id : null;
}

// Chats: the channels of the teams, and the conversations between two.

/** The room of a chat, for its messages, and in a conversation between two, its calls: chat 7 is chat:7. */
export function roomOf(chat: string): string {
    return `chat:${chat}`;
}

/** The chat of a room: chat 7 for the room chat:7, and none for any other room. */
export function chatIn(room: string): string | null {
    const id = room.startsWith('chat:') ? room.slice('chat:'.length) : '';
    return isNumber(id) ? id : null;
}

/** Whether an id is a number, as the ids of chats, teams and people are: '7', never 'x' or ''. */
const isNumber = (id: string) => /^[0-9]+$/.test(id);

/** The channels of a team, in the order they were made: 'general' first. */
export async function channelsOf(team: string): Promise<Channel[]> {
    const { rows } = await db.query(`select id::text as id, team_id::text as team, name from chat where team_id = $1 order by id`, [team]);
    return rows;
}

/** A chat's team, when it is a channel. */
async function teamOfChat(chat: string): Promise<string | null> {
    const { rows } = await db.query(`select team_id::text as team from chat where id = $1`, [chat]);
    return rows[0]?.team ?? null;
}

/** The chat of two people: theirs, or a new one the first time either of them opens the other's page. */
export async function chatBetween(me: string, them: string): Promise<string> {
    // Known by their pair of ids, the smaller first, so both find the same one.
    const pair = [Number(me), Number(them)].sort((a, b) => a - b).join(':');
    await db.query(`insert into chat (pair) values ($1) on conflict do nothing`, [pair]);
    const { rows } = await db.query(`select id::text as id from chat where pair = $1`, [pair]);
    const chat = rows[0].id;
    await db.query(`insert into chat_member (chat_id, user_id) values ($1, $2), ($1, $3) on conflict do nothing`, [chat, me, them]);
    return chat;
}

/** The members of a chat: its team's, for a channel, or its two people. */
export async function membersOf(chat: string): Promise<string[]> {
    if (!isNumber(chat)) return [];
    const team = await teamOfChat(chat);
    const { rows } = team
        ? await db.query(`select user_id::text as id from team_member where team_id = $1`, [team])
        : await db.query(`select user_id::text as id from chat_member where chat_id = $1`, [chat]);
    return rows.map((row) => row.id);
}

/**
 * Whether someone may use a chat: read it, write in it, and in a conversation between two, call. They are one of its
 * members: in its team, for a channel. A visitor who isn't signed in (null) never may.
 */
export async function mayChat(user: string | number | null, chat: string): Promise<boolean> {
    if (user === null) return false;
    return (await membersOf(chat)).includes(String(user));
}

/** Whether a chat is a conversation between two, whose messages its other one hears of on any page. */
export async function isConversation(chat: string): Promise<boolean> {
    return isNumber(chat) && (await teamOfChat(chat)) === null;
}

/** My conversations between two, the latest first, each with its last message. */
export async function conversationsOf(me: string): Promise<Conversation[]> {
    // The last message of each of my conversations, and the other one in it.
    const { rows } = await db.query(
        `select distinct on (m.chat_id) m.chat_id::text as chat, m.sender::text as sender, m.text, m.at, other.user_id::text as other, u.name
         from message m
         join chat_member mine on mine.chat_id = m.chat_id and mine.user_id = $1
         join chat_member other on other.chat_id = m.chat_id and other.user_id <> $1
         join "user" u on u.id = other.user_id
         order by m.chat_id, m.at desc`,
        [me],
    );
    return rows
        .map((row) => ({ id: row.other, name: row.name, chat: row.chat, last: { text: row.text, mine: row.sender === me, at: Number(row.at) } }))
        .sort((one, other) => other.last.at - one.last.at);
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
