'use client';

import Link from 'next/link';
import { useOnline } from '@wordplus/realtime/react';

type Person = { id: string; name: string; title: string; teams: string; photo: string };

/** Everyone at the company, those online first, kept live as they come and go, each a message or a call away. */
export function Directory({ people }: { people: Person[] }) {
    // Which of them are online now: WordPlus Cloud tells the page as they come and go, with no request to this server.
    const { online } = useOnline(people.map((person) => person.id));
    const here = people.filter((person) => online[person.id]);
    const away = people.filter((person) => !online[person.id]);

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h1 className="text-2xl font-semibold">People</h1>
                <p className="text-sm text-stone-500">{here.length} of {people.length} online now</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2" id="people">
                {[...here, ...away].map((person) => (
                    <li key={person.id} data-id={person.id} data-online={online[person.id] ? '' : undefined}
                        className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                        <Link href={`/people/${person.id}`} className="relative shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={person.photo} alt="" className="size-12 rounded-full object-cover" />
                            {online[person.id] && <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-white bg-emerald-500" />}
                        </Link>
                        <Link href={`/people/${person.id}`} className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{person.name}</span>
                            <span className="block truncate text-sm text-stone-500">{person.title}{person.teams ? ` · ${person.teams}` : ''}</span>
                        </Link>
                        <Link href={`/people/${person.id}`} className="rounded-full border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">Message</Link>
                        {/* Their chat, which calls them as it opens: the call is there, beside the messages. */}
                        <Link href={`/people/${person.id}?call=video`} className="rounded-full bg-indigo-700 px-3 py-1.5 text-sm text-white hover:bg-indigo-800">Call</Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
