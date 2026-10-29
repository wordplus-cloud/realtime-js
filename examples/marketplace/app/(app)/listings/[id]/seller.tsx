'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { mark, reprice } from '../../actions';

type Props = {
    id: string;
    price: number;
    status: 'available' | 'reserved' | 'sold';
    buyerName: string | null;
    asking: Array<{ deal: string; buyer: string; name: string; offer: number | null }>;
};

/**
 * The seller's own: a new price, which every page of the item shows at once, sold or for sale again, and who is asking
 * about it, with their offer waiting.
 */
export function SellerControls({ id, price, status, buyerName, asking }: Props) {
    const [value, setValue] = useState(String(price));
    const [pending, start] = useTransition();
    const changed = Number(value) !== price && /^\d+$/.test(value);

    return (
        <div className="flex flex-col gap-4" id="seller">
            {status !== 'sold' && (
                <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { await reprice(id, Number(value)); }); }}>
                    <label className="flex flex-1 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 focus-within:border-blue-600">
                        <span className="text-stone-500">$</span>
                        <input value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} inputMode="numeric" aria-label="Price" className="w-full outline-none" />
                    </label>
                    <button disabled={!changed || pending} className="rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-40">Change price</button>
                </form>
            )}
            {status === 'reserved' && <p className="text-sm text-stone-600">Reserved for {buyerName}.</p>}
            <div className="flex gap-2">
                {status !== 'sold'
                    ? <button onClick={() => start(() => mark(id, 'sold'))} disabled={pending} className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50">Mark as sold</button>
                    : <button onClick={() => start(() => mark(id, 'available'))} disabled={pending} className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50">Put it up again</button>}
                {status === 'reserved' && <button onClick={() => start(() => mark(id, 'available'))} disabled={pending} className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50">For sale again</button>}
            </div>
            <div>
                <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">Asking about it</h2>
                {asking.length ? (
                    <ul className="flex flex-col gap-2">
                        {asking.map((one) => (
                            <li key={one.deal}>
                                <Link href={`/messages/${one.deal}`} className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 shadow-sm hover:ring-1 hover:ring-blue-200">
                                    <span>{one.name}</span>
                                    {one.offer !== null && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-900">Offers ${one.offer}</span>}
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-stone-500">Nobody yet.</p>
                )}
            </div>
        </div>
    );
}
