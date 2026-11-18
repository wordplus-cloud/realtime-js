import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './auth';
import { chatIn, isConversation, isMember, keepMessage, mayChat, meetingOf, membersOf, nameOf, peopleIn, personOf, photoOf, react, teamIn, teamOf, type Message } from './team';
import { WORLDS, endMeetingOnDemo, webhooksInEveryWorld } from './worlds';

export const realtime = createRealtime({
    // Who is asking: the signed-in user, or null.
    user: () => currentUserId(),
    // What colleagues see of each other: in the chats, the list of who is online and the calls.
    profile: async (user) => {
        const person = await personOf(String(user));
        return person ? { name: person.name, avatar: photoOf(person.id) } : null;
    },
});
// The public demo: the webhooks read and keep the chats and meetings of every visitor's world (lib/worlds.ts).
if (WORLDS) webhooksInEveryWorld(realtime);

// The room of each chat: chat:{id}, a channel of a team or a conversation between two. Its members get in (mayChat in
// lib/team.ts). Messages, typing, reactions and read ticks go from page to page through WordPlus Cloud, and the messages
// and reactions come here too (below), to be kept. A page asks to join at /api/realtime/auth.
realtime.room(
    'chat:{id}',
    async (user, { id }) => mayChat(user, id),
    {
        history: 50,
        emit: ['message', 'typing', 'reaction', 'read'],
        webhook: ['message', 'reaction'],
    },
);

/**
 * The token of a call in a conversation between two, by the name of its room, chat:{id}, which the chat's call buttons
 * send: the one calling and the one called may both use the chat. A channel has no call of its own, as its team meets
 * in its meeting room. Null to refuse. A page asks for it at /api/chat-call-token.
 */
export async function chatCallToken(user: string, to: string, name: string, type: string | null): Promise<string | null> {
    // The name comes from the page: a conversation between two of this site, and no other.
    const chat = chatIn(name);
    if (!chat || !(await isConversation(chat))) return null;
    // The one calling, and the one called.
    if (!(await mayChat(user, chat)) || !(await mayChat(to, chat))) return null;
    // The call takes the name of the chat, so it shows there.
    return realtime.callToken(user, to, { type, name });
}

/**
 * The token of a team's meeting room, meeting:{id}, where {id} is the team's number: a group call on WordPlus Cloud's
 * media servers for the members of the team. Its lead hosts it: the call screen gives them mute and remove on
 * everyone's tile. Null to refuse. A page asks for it at /api/meeting-token.
 */
export async function meetingToken(user: string, team: string): Promise<string | null> {
    if (!(await isMember(team, user))) return null;
    const lead = (await teamOf(team))?.lead === user;
    return realtime.groupCallToken(user, meetingOf(team), { admin: lead });
}

// The meetings on now: every page of a colleague joins it, to hear when someone comes into a meeting or leaves it, and
// show its lists as they are now. Only the server says anything in it.
realtime.room('meetings', async (user) => user !== null);

/** The meetings on now, and how many are in each, by team: WordPlus Cloud knows, with no table here. */
export async function meetingsNow(): Promise<Map<string, number>> {
    const now = new Map<string, number>();
    for (const call of await realtime.listCalls()) {
        const team = teamIn(call.name);
        if (team) now.set(team, call.people);
    }
    return now;
}

/** Who is in a team's meeting now, by their ids. */
export async function inMeeting(team: string): Promise<string[]> {
    const { list } = await realtime.call(meetingOf(team)).get();
    return list.flatMap((person) => (person.user ? [String(person.user)] : []));
}

/** Keeps a message, and the first time, tells the other one of a conversation between two, on whatever page they are. */
export async function keepAndTell(message: Message) {
    if (!(await mayChat(message.from, message.chat))) return;
    if (!(await keepMessage(message))) return; // kept before, so told before
    // A channel's messages wait in the channel: only a conversation between two tells the other one.
    if (!(await isConversation(message.chat))) return;
    const others = (await membersOf(message.chat)).filter((member) => member !== message.from);
    await realtime.toUser(others).emit('message', {
        from: message.from,
        name: await nameOf(message.from),
        text: message.text.slice(0, 140), // enough for a notice
    });
}

// The webhooks of the chat rooms: each message and reaction, as the cloud took it.
realtime.on('message', async ({ room, from, data, event_id, at }) => {
    const chat = chatIn(room);
    if (!from || !chat) return;
    const text = String(data.text ?? '');
    await keepAndTell({ id: event_id, chat, from: String(from), text, at });
});
realtime.on('reaction', async ({ from, data }) => {
    if (from) await react(String(data.id), String(from), String(data.key ?? ''));
});

// The webhooks of the meetings: someone came into one, or left it. Every page shows who is in each meeting now, and when
// someone starts their team's meeting, the rest of the team hears it, on whatever page they are.
realtime.on('group.joined', async ({ call, user }) => {
    const team = teamIn(call);
    if (!team) return;
    await realtime.to('meetings').emit('changed');
    // The first one in starts it.
    const { people, started_at } = await realtime.call(call).get();
    if (people > 1) return;
    const others = (await peopleIn(team)).map((person) => person.id).filter((id) => id !== String(user));
    await realtime.toUser(others).emit('meeting', {
        team,
        name: (await teamOf(team))?.name,
        by: await nameOf(String(user)),
    });
    // The public demo: a meeting ends by itself after a few minutes (lib/worlds.ts).
    if (WORLDS) endMeetingOnDemo(realtime.call(call), started_at);
});
realtime.on('group.left', async ({ call }) => {
    if (teamIn(call)) await realtime.to('meetings').emit('changed');
});
