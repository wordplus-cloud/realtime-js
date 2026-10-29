'use client';

import { useState, useTransition } from 'react';
import { writeNotes } from '../../actions';

/**
 * The notes after a visit: the expert writes them for the client, and shares them, which tells the client's page. The
 * client reads them here.
 */
export function Notes({ id, expert, notes, client, from }: { id: string; expert: boolean; notes: string | null; client: string; from: string }) {
    const [text, setText] = useState(notes ?? '');
    const [shared, setShared] = useState(notes !== null);
    const [pending, start] = useTransition();

    if (!expert) {
        if (notes === null) return null;
        return (
            <article className="rounded-2xl bg-white p-5 shadow-sm" id="notes">
                <h2 className="mb-2 font-medium">Notes from {from}</h2>
                <p className="whitespace-pre-wrap text-stone-700">{notes}</p>
            </article>
        );
    }
    const share = () => start(async () => {
        if (await writeNotes(id, text)) setShared(true);
    });
    return (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm" id="notes">
            <h2 className="font-medium">Notes for {client}</h2>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setShared(false); }} rows={6} maxLength={4000}
                      placeholder={`What you talked about, and what ${client} should do next.`}
                      className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-teal-600" />
            <div className="flex items-center gap-3">
                <button onClick={share} disabled={pending || !text.trim()} className="rounded-full bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60">
                    Share with {client}
                </button>
                {shared && <span className="text-sm text-teal-700">Shared</span>}
            </div>
        </div>
    );
}
