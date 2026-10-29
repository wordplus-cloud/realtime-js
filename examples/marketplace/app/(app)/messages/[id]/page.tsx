import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { dealOf, photoOf } from '@/lib/market';
import { DealChat } from './chat';
import { OfferPanel } from './offer';

export default function DealPage(props: PageProps<'/messages/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Deal {...props} />
        </Suspense>
    );
}

// A conversation about an item, for its seller and its buyer alone: the item on top as it is now, the offer, and the
// messages with their photos and their call.
async function Deal({ params }: PageProps<'/messages/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const deal = await dealOf(id);
    if (!deal || ![deal.buyer, deal.listing.seller].includes(me)) notFound();
    const selling = deal.listing.seller === me;
    const other = selling ? { id: deal.buyer, name: deal.buyerName } : { id: deal.listing.seller, name: deal.listing.sellerName };
    const item = deal.listing;

    return (
        <section className="mx-auto flex max-w-3xl flex-col gap-4">
            <Link href={`/listings/${item.id}`} className="flex items-center gap-4 rounded-2xl bg-white p-3 shadow-sm hover:ring-1 hover:ring-blue-200" id="item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.photos[0] && <img src={item.photos[0]} alt="" className="size-16 rounded-xl object-cover" />}
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.title}</span>
                    <span className="block text-sm text-stone-600">
                        ${item.price}
                        {item.status === 'sold' ? ' · Sold' : item.status === 'reserved' ? (item.buyer === me ? ' · Reserved for you' : item.buyer === deal.buyer ? ` · Reserved for ${deal.buyerName}` : ' · Reserved') : ''}
                    </span>
                </span>
                <span className="text-sm text-blue-700">See the item</span>
            </Link>
            <OfferPanel deal={id} selling={selling} other={other.name} status={item.status} reservedHere={item.buyer === deal.buyer} offer={deal.offer} price={item.price} />
            {/* Taller while a call is in it, the messages in a column beside the call. */}
            <div id="chat" className="h-[30rem] overflow-hidden rounded-2xl border border-stone-200 bg-white transition-[height] has-[[data-call]]:h-[38rem] [--realtime-chat-beside-call:300px]">
                <DealChat room={`deal:${id}`} to={other.id} name={other.name} avatar={photoOf(other.id)} />
            </div>
        </section>
    );
}
