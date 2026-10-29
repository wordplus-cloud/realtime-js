import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './auth';
import { dealOf, filesFor, idIn, keepMessage, mayTalk, nameOf, personOf, photoOf, react, type Message } from './market';
import { WORLDS, webhooksInEveryWorld } from './worlds';

export const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: the signed-in neighbour, or null.
    user: () => currentUserId(),
    // What neighbours see of each other: in a conversation and its call.
    profile: async (user) => {
        const person = await personOf(String(user));
        return person ? { name: person.name, avatar: photoOf(person.id) } : null;
    },
});
// The public demo: the webhooks read and keep the market of every visitor's world (lib/worlds.ts).
if (WORLDS) webhooksInEveryWorld(realtime);

// An item, listing:{id}: anyone on its page is in it, counted live, and hears its price or status change. Public: a
// count for anyone, signed in or not, with no list of who.
realtime.room('listing:{id}', { public: true, count: true });

// The market: every page of someone signed in joins it, and hears when an item is put up, reserved or sold, or its
// price changes, to show the market as it is now. Only the server says anything in it.
realtime.room('market', async (user) => user !== null);

// A conversation about an item, deal:{id}, between its seller and one buyer (mayTalk in lib/market.ts): messages with
// photos, typing, reactions and read ticks go from page to page sealed, and the messages and reactions come here too
// (below), to be kept. The server tells it of offers made and answered. A page asks to join at /api/realtime/auth.
realtime.room(
    'deal:{id}',
    { history: 50, emit: ['message', 'typing', 'reaction', 'read'], webhook: ['message', 'reaction'] },
    async (user, { id }) => mayTalk(user, id),
);

// Its call: to see the item before coming over. Both of them may use it. A page asks to call at /api/realtime/calls.
realtime.calls('deal:{id}', async (user, other, { id }) => (await mayTalk(user, id)) && (await mayTalk(other, id)));

/** Keeps a message, and the first time, tells the other one of the conversation, on whatever page they are. */
export async function keepAndTell(message: Message) {
    const deal = await dealOf(message.deal);
    if (!deal || !(await mayTalk(message.from, message.deal))) return;
    // Only the photos kept for this conversation, as they were kept: anyone may write anything into a message of their own.
    const files = await filesFor(message.deal, message.files);
    if (!message.text && !files.length) return;
    if (!(await keepMessage({ ...message, files }))) return; // kept before, so told before
    const other = message.from === deal.buyer ? deal.listing.seller : deal.buyer;
    await realtime.toUser(other).emit('message', {
        deal: deal.id,
        name: await nameOf(message.from),
        title: deal.listing.title,
        text: message.text ? message.text.slice(0, 140) : 'sent a photo',
    });
}

// The webhooks of the conversations: each message and reaction, as the cloud took it.
realtime.on('message', async ({ room, from, data, event_id, at }) => {
    const deal = idIn(room, 'deal');
    if (!from || !deal) return;
    await keepAndTell({ id: event_id, deal, from: String(from), text: String(data.text ?? ''), files: data.files as unknown[], at });
});
realtime.on('reaction', async ({ from, data }) => {
    if (from) await react(String(data.id), String(from), String(data.key ?? ''));
});
