'use client';

import Link from 'next/link';
import { useState } from 'react';

type Item = { id: string; title: string; price: number; category: string; area: string; status: string; photo: string | null; seller: string };

/** The items, by category: each one's page says how many are looking at it now. */
export function Grid({ items }: { items: Item[] }) {
    const categories = [...new Set(items.map((item) => item.category))].sort();
    const [category, setCategory] = useState<string | null>(null);
    const shown = items.filter((item) => !category || item.category === category);

    return (
        <section className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Near you</h1>
                    <p className="text-stone-600">Things your neighbours are selling, the newest first.</p>
                </div>
            </div>
            <div className="flex flex-wrap gap-2" role="tablist">
                {[null, ...categories].map((one) => (
                    <button key={one ?? 'all'} role="tab" aria-selected={category === one} onClick={() => setCategory(one)}
                            className={`rounded-full px-4 py-1.5 text-sm ${category === one ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white hover:bg-stone-50'}`}>
                        {one ?? 'Everything'}
                    </button>
                ))}
            </div>
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" id="items">
                {shown.map((item) => (
                    <li key={item.id} data-id={item.id} data-status={item.status}>
                        <Link href={`/listings/${item.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm hover:ring-1 hover:ring-blue-200">
                            <span className="relative block aspect-square overflow-hidden bg-stone-100">
                                {item.photo && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.photo} alt="" className={`size-full object-cover transition-transform group-hover:scale-[1.03] ${item.status === 'sold' ? 'opacity-50 grayscale' : ''}`} />
                                )}
                                {item.status !== 'available' && (
                                    <span className="absolute top-2 left-2 rounded-full bg-stone-900/80 px-2.5 py-1 text-xs font-medium text-white">
                                        {item.status === 'sold' ? 'Sold' : 'Reserved'}
                                    </span>
                                )}
                            </span>
                            <span className="flex flex-1 flex-col gap-0.5 p-3">
                                <span className="text-lg font-semibold">${item.price}</span>
                                <span className="line-clamp-2 text-sm">{item.title}</span>
                                <span className="mt-auto pt-1 text-xs text-stone-500">{item.area} · {item.seller}</span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
