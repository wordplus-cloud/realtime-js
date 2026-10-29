'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useOnline } from '@wordplus/realtime/react';
import { Availability } from '../live';
import { TalkNow } from './talk-now';

type Expert = { id: string; name: string; title: string; field: string; about: string; photo: string; inVisit: boolean };

/**
 * Every expert, those free now first, kept live: who is online WordPlus Cloud tells the page as they come and go, and who
 * is in a visit the server's next render says, as every page asks for one when a visit starts or ends.
 */
export function Directory({ experts, client, me }: { experts: Expert[]; client: boolean; me: string }) {
    const { online } = useOnline(experts.map((expert) => expert.id));
    const fields = [...new Set(experts.map((expert) => expert.field))].sort();
    const [field, setField] = useState<string | null>(null);
    const free = (expert: Expert) => online[expert.id] && !expert.inVisit;
    const shown = experts.filter((expert) => !field || expert.field === field);
    const sorted = [...shown.filter(free), ...shown.filter((expert) => !free(expert))];

    return (
        <section className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Experts</h1>
                    <p className="text-stone-600">Book a half hour, or talk now to one who is free.</p>
                </div>
                <p className="text-sm text-stone-500">{experts.filter(free).length} free now</p>
            </div>
            <div className="flex flex-wrap gap-2" role="tablist">
                {[null, ...fields].map((one) => (
                    <button key={one ?? 'all'} role="tab" aria-selected={field === one} onClick={() => setField(one)}
                            className={`rounded-full px-4 py-1.5 text-sm ${field === one ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white hover:bg-stone-50'}`}>
                        {one ?? 'All'}
                    </button>
                ))}
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" id="experts">
                {sorted.map((expert) => (
                    <li key={expert.id} data-id={expert.id} data-free={free(expert) ? '' : undefined} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
                        <Link href={`/experts/${expert.id}`} className="flex items-center gap-3">
                            <span className="relative shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={expert.photo} alt="" className="size-16 rounded-full object-cover" />
                                {online[expert.id] && <span className={`absolute -right-0.5 -bottom-0.5 size-4 rounded-full border-2 border-white ${expert.inVisit ? 'bg-amber-500' : 'bg-emerald-500'}`} />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-lg font-medium">{expert.name}</span>
                                <span className="block truncate text-sm text-stone-600">{expert.title}</span>
                                <Availability id={expert.id} inVisit={expert.inVisit} />
                            </span>
                        </Link>
                        <p className="line-clamp-2 text-sm text-stone-600">{expert.about}</p>
                        <div className="mt-auto flex flex-wrap gap-2">
                            <Link href={`/experts/${expert.id}`} className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50">
                                {client ? 'Book a time' : 'Profile'}
                            </Link>
                            {client && expert.id !== me && <TalkNow expert={expert.id} name={expert.name} free={free(expert)} />}
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
