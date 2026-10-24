'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useOnline } from '@wordplus/realtime/react';

type Member = { id: string; name: string; age: number; city: string; photo: string };

/** The people for this member, those online first, kept live as people come and go. */
export function Catalog({ members }: { members: Member[] }) {
    // Which of them are online now: WordPlus Cloud tells the page as they come and go, with no request to this server.
    const { online } = useOnline(members.map((member) => member.id));
    const [onlineOnly, setOnlineOnly] = useState(false);
    const here = members.filter((member) => online[member.id]);
    const away = members.filter((member) => !online[member.id]);
    // Those online first, or only them while "Online now" is ticked.
    const shown = onlineOnly ? here : [...here, ...away];

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">People for you</h1>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={onlineOnly} onChange={(event) => setOnlineOnly(event.target.checked)} />
                    Online now ({here.length})
                </label>
            </div>
            {shown.length === 0 && <p className="text-stone-600">{onlineOnly ? 'Nobody is online right now.' : 'Nobody here yet. New people join every day.'}</p>}
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3" id="members">
                {shown.map((member) => (
                    <li key={member.id} data-id={member.id} data-online={online[member.id] ? '' : undefined} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                        <Link href={`/members/${member.id}`} className="block">
                            <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={member.photo} alt="" className="aspect-[4/5] w-full object-cover" />
                                {online[member.id] && (
                                    <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                        <span className="size-2 rounded-full bg-emerald-500" />Online
                                    </span>
                                )}
                            </div>
                            <p className="px-3 pt-3 font-medium">{member.name}, {member.age}</p>
                            <p className="px-3 text-sm text-stone-500">{member.city || ' '}</p>
                        </Link>
                        <div className="flex gap-2 p-3">
                            <Link href={`/members/${member.id}`} className="flex-1 rounded-full border border-stone-300 py-1.5 text-center text-sm hover:bg-stone-50">Chat</Link>
                            {/* Their chat, which calls them as it opens: the video date is there, beside the messages. */}
                            <Link href={`/members/${member.id}?call=video`} className="flex-1 rounded-full bg-rose-600 py-1.5 text-center text-sm text-white hover:bg-rose-700">Video</Link>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
