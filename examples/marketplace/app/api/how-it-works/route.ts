// The values "How this page works" shows on the demo, for the page open (?path=/listings/…): who is signed in, and on
// the page of an item or a conversation, its room and how things stand in it now. Only on the demo.
import { currentUserId } from '@/lib/auth';
import { dealOf, listingOf, listings, personOf, threadsOf } from '@/lib/market';

export async function GET(request: Request) {
    if (process.env.MARKET_DEMO !== '1') return new Response(null, { status: 404 });
    const path = new URL(request.url).searchParams.get('path') ?? '';
    const me = await currentUserId();
    if (me === null) return Response.json({ values: {} });
    const person = await personOf(me);
    const values: Record<string, string> = { me_id: me, me_name: person?.name ?? '' };
    const id = path.match(/^\/\w+\/(\d+)$/)?.[1];

    if (path === '/market') {
        const all = await listings();
        const count = (status: string) => all.filter((item) => item.status === status).length;
        values.items_now = `Now: ${count('available')} for sale, ${count('reserved')} reserved, ${count('sold')} sold`;
    }
    if (path === '/messages') {
        const threads = await threadsOf(me);
        values.threads_now = threads.length === 1 ? 'one conversation' : `${threads.length} conversations`;
    }
    if (id && path.startsWith('/listings/')) {
        const item = await listingOf(id);
        if (item) {
            Object.assign(values, {
                room: `listing:${item.id}`,
                item_title: item.title,
                seller_note: item.seller === me
                    ? 'You sell this one: a new price of yours shows on every page of it at once.'
                    : `${item.sellerName} sells this one: a new price of theirs shows here at once.`,
            });
        }
    }
    if (id && path.startsWith('/messages/')) {
        const deal = await dealOf(id);
        if (deal && [deal.buyer, deal.listing.seller].includes(me)) {
            const selling = deal.listing.seller === me;
            const offer = deal.offer;
            Object.assign(values, {
                room: `deal:${deal.id}`,
                other_name: selling ? deal.buyerName : deal.listing.sellerName,
                offer_now: !offer ? 'no offer yet'
                    : offer.status === 'open' ? `${deal.buyerName} offers $${offer.amount}, and ${deal.listing.sellerName} has not answered yet`
                    : offer.status === 'accepted' ? `${deal.listing.sellerName} took ${deal.buyerName}'s $${offer.amount}`
                    : `${deal.listing.sellerName} declined $${offer.amount}`,
            });
        }
    }
    return Response.json({ values });
}
