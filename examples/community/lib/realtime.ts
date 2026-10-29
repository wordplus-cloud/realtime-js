import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './auth';
import { eventOf, filesFor, idIn, isHost, isMember, keepMessage, mayWrite, members, membersOf, nameOf, personOf, photoOf, react, type Message } from './club';
import { DEMO_LIVE_MINUTES, WORLDS, endCallOnDemo, webhooksInEveryWorld } from './worlds';

export const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: the signed-in member, or null.
    user: () => currentUserId(),
    // What members see of each other: in the channels, the lounges, on stage and in who is online.
    profile: async (user) => {
        const person = await personOf(String(user));
        return person ? { name: person.name, avatar: photoOf(person.id) } : null;
    },
});
// The public demo: the webhooks read and keep the club of every visitor's world (lib/worlds.ts).
if (WORLDS) webhooksInEveryWorld(realtime);

// The channels, channel:{id}, the whole club's, and the conversations between two, chat:{id}, their two's (mayWrite in
// lib/club.ts). Messages with their photos, typing, reactions and read ticks go from page to page sealed, and the
// messages and reactions come here too (below), to be kept. A page asks to join at /api/realtime/auth.
const MESSAGES = { history: 50, emit: ['message', 'typing', 'reaction', 'read'], webhook: ['message', 'reaction'] };
realtime.room('channel:{id}', MESSAGES, async (user, _params, room) => mayWrite(user, room));
realtime.room('chat:{id}', MESSAGES, async (user, _params, room) => mayWrite(user, room));

// The call of a conversation between two, by the name of its room: both of them may use it.
realtime.calls('chat:{id}', async (user, other, _params, room) => (await mayWrite(user, room)) && (await mayWrite(other, room)));

// The lounges, lounge:{id}: group calls any member drops into, by voice or with their camera, for as long as they like.
// The hosts look after them: the call screen gives them mute and remove on everyone's tile.
realtime.groupCalls('lounge:{id}', async (user) => {
    if (!(await isMember(user))) return false;
    return (await isHost(user)) ? { admin: true } : true;
});

// The events, event:{id}: a live stream its host goes live in, from the studio, and every member watches. A member may
// raise a hand from the player, and the host brings them on stage with their camera and microphone.
realtime.streams(
    'event:{id}',
    async (user, { id }) => {
        const event = await eventOf(id);
        if (!event || !(await isMember(user))) return false;
        return String(user) === event.host ? { role: 'host', quality: '1080p' } : 'viewer';
    },
    { stage: true, reactions: true },
);

// What is on in the club: every page of a member joins it, to hear when someone drops into a lounge or leaves it, or an
// event goes live or ends, and show it as it is now. Only the server says anything in it.
realtime.room('club', async (user) => isMember(user));

/** Who is in each lounge now, by lounge: WordPlus Cloud knows, with no table here. */
export async function loungesNow(): Promise<Map<string, string[]>> {
    const now = new Map<string, string[]>();
    for (const call of await realtime.listCalls()) {
        const lounge = idIn(call.name, 'lounge');
        if (!lounge || call.people === 0) continue;
        const { list } = await realtime.call(call.name).get();
        now.set(lounge, list.flatMap((person) => (person.user ? [String(person.user)] : [])));
    }
    return now;
}

/** The events live now, and how many watch each. */
export async function liveNow(): Promise<Map<string, number>> {
    const live = new Map<string, number>();
    for (const stream of await realtime.listStreams()) {
        const event = idIn(stream.name, 'event');
        if (event) live.set(event, stream.viewers);
    }
    return live;
}

/** Keeps a message, and the first time, in a conversation between two, tells the other one, on whatever page they are. */
export async function keepAndTell(message: Message) {
    if (!(await mayWrite(message.from, message.room))) return;
    // Only the files kept for this room, as they were kept: anyone may write anything into a message of their own.
    const files = await filesFor(message.room, message.files);
    if (!message.text && !files.length) return;
    if (!(await keepMessage({ ...message, files }))) return; // kept before, so told before
    const chat = idIn(message.room, 'chat');
    if (!chat) return; // a channel's messages wait in the channel
    const others = (await membersOf(chat)).filter((member) => member !== message.from);
    await realtime.toUser(others).emit('message', {
        from: message.from,
        name: await nameOf(message.from),
        text: message.text ? message.text.slice(0, 140) : files.length === 1 ? 'sent a photo' : `sent ${files.length} photos`,
    });
}

// The webhooks of the channels and conversations: each message and reaction, as the cloud took it.
realtime.on('message', async ({ room, from, data, event_id, at }) => {
    if (!from) return;
    await keepAndTell({ id: event_id, room, from: String(from), text: String(data.text ?? ''), files: data.files as unknown[], at });
});
realtime.on('reaction', async ({ from, data }) => {
    if (from) await react(String(data.id), String(from), String(data.key ?? ''));
});

// The webhooks of the lounges: someone dropped in, or left. Every page shows who is in each lounge now.
realtime.on('group.joined', async ({ call }) => {
    if (!idIn(call, 'lounge')) return;
    await realtime.to('club').emit('changed');
    // The public demo: a lounge's call ends by itself a few minutes after the first one dropped in (lib/worlds.ts).
    if (WORLDS) {
        const { people, started_at } = await realtime.call(call).get();
        if (people === 1) endCallOnDemo(realtime.call(call), started_at);
    }
});
realtime.on('group.left', async ({ call }) => {
    if (idIn(call, 'lounge')) await realtime.to('club').emit('changed');
});

// The webhooks of the events: one went live, and every member hears at once, on whatever page they are, or it ended.
realtime.on('stream.live', async ({ stream }) => {
    const id = idIn(stream, 'event');
    const event = id ? await eventOf(id) : null;
    if (!event) return;
    await realtime.to('club').emit('changed');
    const everyone = (await members()).map((person) => person.id).filter((person) => person !== event.host);
    await realtime.toUser(everyone).emit('live', { event: event.id, title: event.title, host: event.hostName });
    // The public demo: an event ends by itself after a few minutes (lib/worlds.ts).
    if (WORLDS) setTimeout(() => realtime.stream(stream).end().catch(() => {}), DEMO_LIVE_MINUTES * 60_000).unref();
});
realtime.on('stream.ended', async ({ stream }) => {
    if (idIn(stream, 'event')) await realtime.to('club').emit('changed');
});
