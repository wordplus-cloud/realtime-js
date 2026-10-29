'use server';

import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { answerOffer, dealFor, dealOf, dealsAbout, makeOffer, nameOf, setPrice, setStatus, type Status } from '@/lib/market';
import { realtime } from '@/lib/realtime';

// What the pages do, each for the neighbour signed in: the server keeps it, then says so through WordPlus Cloud: in the
// item's room, to every page showing it, in the conversation, to its two, and to the other one on whatever page they are.

/** A buyer writes to the seller about an item: their conversation, new the first time, opened. */
export async function askSeller(listing: string) {
    const me = await currentUserId();
    const deal = me ? await dealFor(listing, me) : null;
    if (deal) redirect(`/messages/${deal}`);
}

/** Everyone looking at an item, and the market, see it as it is now. */
async function changed(listing: string) {
    await realtime.to(`listing:${listing}`).emit('changed');
    await realtime.to('market').emit('changed');
}

/** The seller's new price, which every page showing the item takes at once. */
export async function reprice(listing: string, price: number): Promise<boolean> {
    const me = await currentUserId();
    if (!me || !Number.isInteger(price) || price < 0 || price > 1_000_000 || !(await setPrice(listing, me, price))) return false;
    await changed(listing);
    return true;
}

/** The seller marks the item sold, or for sale again. */
export async function mark(listing: string, status: Status) {
    const me = await currentUserId();
    if (!me || !(await setStatus(listing, me, status))) return;
    await changed(listing);
    // The conversations about it show it too.
    for (const { deal } of await dealsAbout(listing)) await realtime.to(`deal:${deal}`).emit('changed');
}

/** A buyer's offer: the conversation shows it, and the seller hears it on whatever page they are. */
export async function offer(deal: string, amount: number): Promise<{ error: string } | null> {
    const me = await currentUserId();
    if (!me) return { error: 'Sign in first.' };
    const made = await makeOffer(deal, me, amount);
    if (typeof made === 'string') return { error: made };
    const found = (await dealOf(deal))!;
    await realtime.to(`deal:${deal}`).emit('changed');
    await realtime.toUser(found.listing.seller).emit('offer', { deal, name: found.buyerName, amount, title: found.listing.title });
    return null;
}

/**
 * The seller's answer to the open offer. Taken, the item is reserved for its buyer at that price: every page showing it
 * says so, the other conversations about it show it is no longer available, and a buyer whose offer it declined hears
 * it on whatever page they are.
 */
export async function answer(deal: string, accept: boolean) {
    const me = await currentUserId();
    const answered = me ? await answerOffer(deal, me, accept) : null;
    if (!answered) return;
    const seller = await nameOf(me!);
    await realtime.to(`deal:${deal}`).emit('changed');
    await realtime.toUser(answered.buyer).emit('answer', {
        deal, name: seller, accepted: accept, amount: answered.offer?.amount ?? 0, title: answered.listing.title,
    });
    if (!accept) return;
    await changed(answered.listing.id);
    for (const other of await dealsAbout(answered.listing.id)) {
        if (other.deal !== deal) await realtime.to(`deal:${other.deal}`).emit('changed');
    }
    for (const other of answered.declined) {
        await realtime.toUser(other.buyer).emit('answer', {
            deal: other.deal, name: seller, accepted: false, amount: other.amount, title: answered.listing.title,
        });
    }
}
