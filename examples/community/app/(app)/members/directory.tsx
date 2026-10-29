'use client';

import Link from 'next/link';
import { useOnline } from '@wordplus/realtime/react';

type Person = { id: string; name: string; title: string; host: boolean; photo: string };

/** Every member, those online first, kept live as they come and go, each a message or a call away. */
export function Directory({ people, me }: { people: Person[]; me: string }) {
    // Which of them are online now: WordPlus Cloud tells the page as they come and go, with no request to this server.
    const { online } = useOnline(people.map((person) => person.id));
    const here = people.filter((person) => online[person.id]);
    const away = people.filter((person) => !online[person.id]);

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h1 className="text-2xl font-semibold">Members</h1>
                <p className="text-sm text-stone-500">{here.length} of {people.length} online now</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2" id="members">
                {[...here, ...away].map((person) => (
                    <li key={person.id} data-id={person.id} data-online={online[person.id] ? '' : undefined}
                        className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                        <Link href={person.id === me ? '/members' : `/members/${person.id}`} className="relative shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={person.photo} alt="" className="size-12 rounded-full object-cover" />
                            {online[person.id] && <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-white bg-emerald-500" />}
                        </Link>
                        <Link href={person.id === me ? '/members' : `/members/${person.id}`} className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{person.name}{person.id === me ? ' (you)' : ''}{person.host ? <span className="ml-2 text-xs font-normal text-orange-700">Host</span> : null}</span>
                            <span className="block truncate text-sm text-stone-500">{person.title}</span>
                        </Link>
                        {person.id !== me && <>
                            <Link href={`/members/${person.id}`} className="rounded-full border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">Message</Link>
                            {/* Their conversation, which calls them as it opens: the call is there, beside the messages. */}
                            <Link href={`/members/${person.id}?call=video`} className="rounded-full bg-orange-700 px-3 py-1.5 text-sm text-white hover:bg-orange-800">Call</Link>
                        </>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
