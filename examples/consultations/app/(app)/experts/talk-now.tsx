'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useOnline, useUserEvent } from '@wordplus/realtime/react';
import { stopAsking, talkNow } from '../actions';

type State = 'idle' | 'topic' | 'asking' | 'declined' | 'unanswered' | 'error';

/** Talk now on a page of one expert: offered while they are online, as WordPlus Cloud tells the page, and in no visit. */
export function TalkNowIfFree({ expert, name, inVisit }: { expert: string; name: string; inVisit: boolean }) {
    const { online } = useOnline([expert]);
    return <TalkNow expert={expert} name={name} free={!!online[expert] && !inVisit} />;
}

/**
 * Talk now, to an expert who is free: the client says what about, the expert's page shows the request, and the client
 * waits a minute for the answer. Taken, the client goes into the new visit at once, where the click that asked lets its
 * sound play.
 */
export function TalkNow({ expert, name, free }: { expert: string; name: string; free: boolean }) {
    const router = useRouter();
    const [state, setState] = useState<State>('idle');
    const [topic, setTopic] = useState('');
    const [error, setError] = useState('');
    const request = useRef<string | null>(null);

    // The expert's answer (realtime.toUser( client ).emit( 'answer', … ) in app/(app)/actions.ts).
    useUserEvent('answer', (data: { request: string; accepted: boolean; appointment: string | null }) => {
        if (data.request !== request.current) return;
        request.current = null;
        if (data.accepted && data.appointment) router.push(`/appointments/${data.appointment}?join=1`);
        else setState('declined');
    });

    // A minute without an answer: the request goes.
    useEffect(() => {
        if (state !== 'asking') return;
        const timer = setTimeout(() => {
            if (request.current) void stopAsking(request.current, expert);
            request.current = null;
            setState('unanswered');
        }, 60_000);
        return () => clearTimeout(timer);
    }, [state, expert]);

    const ask = async () => {
        setState('asking');
        const asked = await talkNow(expert, topic);
        if ('error' in asked) {
            setError(asked.error);
            setState('error');
            return;
        }
        request.current = asked.request;
    };
    const cancel = () => {
        if (request.current) void stopAsking(request.current, expert);
        request.current = null;
        setState('idle');
    };

    // Offered while the expert is free. A request on its way stays, whatever their status does meanwhile.
    if (state === 'idle') {
        return free ? <button onClick={() => setState('topic')} className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">Talk now</button> : null;
    }
    return (
        <div className="fixed inset-0 z-40 grid place-items-center bg-stone-900/40 p-4" role="dialog" aria-modal="true" aria-label={`Talk to ${name} now`}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                {state === 'topic' && <>
                    <p className="text-lg font-medium">Talk to {name} now</p>
                    <p className="mt-1 text-sm text-stone-600">{name} sees your request and has a minute to take it.</p>
                    <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={140} placeholder="What would you like to talk about?" autoFocus
                           className="mt-4 w-full rounded-xl border border-stone-300 px-4 py-2.5 outline-none focus:border-teal-600" />
                    <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setState('idle')} className="rounded-full px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Cancel</button>
                        <button onClick={ask} className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">Ask {name}</button>
                    </div>
                </>}
                {state === 'asking' && <>
                    <p className="flex items-center gap-2 text-lg font-medium"><span className="size-2.5 animate-pulse rounded-full bg-teal-600" />Asking {name}…</p>
                    <p className="mt-1 text-sm text-stone-600">You join the visit as soon as {name} takes it.</p>
                    <div className="mt-4 flex justify-end">
                        <button onClick={cancel} className="rounded-full px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Stop asking</button>
                    </div>
                </>}
                {state !== 'topic' && state !== 'asking' && <>
                    <p className="text-lg font-medium">
                        {state === 'declined' ? `${name} can't talk right now` : state === 'unanswered' ? `${name} didn't answer in time` : 'Not now'}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">{state === 'error' ? error : 'Book a time instead, and you have the visit to yourselves.'}</p>
                    <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setState('idle')} className="rounded-full px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Close</button>
                        <Link href={`/experts/${expert}`} onClick={() => setState('idle')} className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">Book a time</Link>
                    </div>
                </>}
            </div>
        </div>
    );
}
