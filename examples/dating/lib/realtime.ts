import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './auth';
import { chatIn, keepMessage, mayChat, membersOf, nameOf, photoOf, profileOf, react, type Message } from './dating';

export const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: the signed-in user, or null.
    user: () => currentUserId(),
    // What the other person sees in the chat and the call: the name and photo.
    profile: async (user) => {
        const name = await nameOf(String(user));
        return name ? { name, avatar: photoOf(String(user)) } : null;
    },
    // Someone who chose to hide when they are online is never shown online.
    hidden: async (user) => {
        const profile = await profileOf(String(user));
        return profile?.hideOnline === true;
    },
});

// The room of each chat: chat:{id}, where {id} is the chat's number (chatBetween in lib/dating.ts). Its members get
// in, while they may still meet the others in it (mayChat). Messages, typing, reactions and read ticks go from page to
// page through WordPlus Cloud, and the messages and reactions come here too (below), to be kept. A page asks to join
// at /api/realtime/auth.
realtime.room(
    'chat:{id}',
    {
        history: 50,
        emit: ['message', 'typing', 'reaction', 'read'],
        webhook: ['message', 'reaction'],
    },
    async (user, { id }) => mayChat(user, id),
);

// Video and voice calls in a chat, by the name of its room: the one asking and the other one may both use the chat. A
// page asks to call, or to answer, at /api/realtime/calls.
realtime.calls('chat:{id}', async (user, other, { id }) => {
    // The one asking: who calls, as they call, or who is called, as they answer.
    const userMayChat = await mayChat(user, id);
    // The other one of the call.
    const otherMayChat = await mayChat(other, id);
    return userMayChat && otherMayChat;
});

/** Keeps a message, and the first time, tells the others in its chat, on whatever page they are. */
export async function keepAndTell(message: Message) {
    if (!(await mayChat(message.from, message.chat))) return;
    if (!(await keepMessage(message))) return; // kept before, so told before
    // Everyone else in the chat: the other one of two.
    const members = await membersOf(message.chat);
    const others = members.filter((member) => member !== message.from);
    await realtime.toUser(others).emit('message', {
        chat: message.chat,
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
