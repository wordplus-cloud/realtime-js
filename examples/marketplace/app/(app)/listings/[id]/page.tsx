import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { askingAbout, listingOf, personOf, photoOf } from '@/lib/market';
import { askSeller } from '../../actions';
import { Looking, OnlineStatus } from '../../live';
import { SellerControls } from './seller';

export default function ListingPage(props: PageProps<'/listings/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Listing {...props} />
        </Suspense>
    );
}

// An item: its photo, its price and what it is, how many others look at it now, and its seller, a message away. Its
// seller sets the price, marks it sold, and sees who is asking about it. A price or status changed shows on every page of
// it at once.
async function Listing({ params }: PageProps<'/listings/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const item = await listingOf(id);
    if (!item) notFound();
    const mine = item.seller === me;
    const [seller, asking] = await Promise.all([personOf(item.seller), mine ? askingAbout(id) : Promise.resolve([])]);

    return (
        <article className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-3xl bg-stone-100">
                    {item.photos[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photos[0]} alt={item.title} className={`aspect-square w-full object-cover ${item.status === 'sold' ? 'opacity-60 grayscale' : ''}`} />
                    )}
                    {item.status !== 'available' && (
                        <span className="absolute top-4 left-4 rounded-full bg-stone-900/85 px-4 py-1.5 font-medium text-white" id="status">
                            {item.status === 'sold' ? 'Sold' : item.buyer === me ? 'Reserved for you' : 'Reserved'}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                    <p className="text-sm text-stone-500">{item.category} · {item.area}</p>
                    <h1 className="text-2xl font-semibold">{item.title}</h1>
                    <p className="text-3xl font-semibold" id="price">${item.price}</p>
                    {item.status !== 'sold' && <Looking id={item.id} />}
                </div>
                <p className="whitespace-pre-wrap text-stone-700">{item.about}</p>

                <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoOf(item.seller)} alt="" className="size-12 rounded-full object-cover" />
                    <div className="min-w-0 flex-1">
                        <p className="font-medium">{mine ? 'You are selling this' : item.sellerName}</p>
                        {!mine && <OnlineStatus id={item.seller} />}
                        {!mine && seller?.area && <p className="text-sm text-stone-500">{seller.area}</p>}
                    </div>
                </div>

                {mine ? (
                    <SellerControls id={item.id} price={item.price} status={item.status} buyerName={item.buyerName} asking={asking} />
                ) : item.status === 'sold' ? (
                    <p className="rounded-2xl bg-stone-100 p-4 text-stone-600">Sold. Have a look at the market for something like it.</p>
                ) : (
                    <form action={askSeller.bind(null, item.id)}>
                        <button className="w-full rounded-full bg-blue-700 px-6 py-3 font-medium text-white hover:bg-blue-800">
                            Message {item.sellerName}
                        </button>
                        <p className="mt-2 text-center text-sm text-stone-500">Ask a question, see it on a video call, or make an offer.</p>
                    </form>
                )}
                <Link href="/market" className="text-sm text-stone-500">Back to the market</Link>
            </div>
        </article>
    );
}
