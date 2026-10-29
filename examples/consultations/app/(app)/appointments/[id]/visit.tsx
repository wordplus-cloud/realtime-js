'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useOnline, usePresence, useRealtime, useRoom, useUserEvent } from '@wordplus/realtime/react';
import { CallSpot } from '@wordplus/realtime-ui/react';
import { endNow, imHere, letIn } from '../../actions';
import { relative, timeOf, useNow } from '../../when';

type Person = { id: string; name: string; photo: string };
type Props = {
    id: string;
    /** Whether the page's user is the expert of the appointment, rather than its client. */
    expert: boolean;
    startsAt: number;
    endsAt: number;
    ended: boolean;
    admitted: boolean;
    other: Person;
};

const OPENS_BEFORE = 10 * 60 * 1000;

/**
 * The visit: a group call of two, visit:{id}, shown here in the page while it is on. It opens ten minutes before its
 * time. The client says they are ready and waits in the waiting room, a presence room the expert's pages see them in,
 * and the expert lets them in: from then on the visit's rule lets the client come in, and their page comes in by
 * itself. Opened from a session taken now (?join=1), both come straight in.
 */
export function Visit({ id, expert, startsAt, endsAt, ended: endedBefore, admitted: admittedBefore, other }: Props) {
    const rt = useRealtime();
    const router = useRouter();
    const path = usePathname();
    const params = useSearchParams();
    const now = useNow(5_000);
    const [admitted, setAdmitted] = useState(admittedBefore);
    const [ended, setEnded] = useState(endedBefore);
    const [ready, setReady] = useState(false);
    const readyNow = useRef(ready);
    readyNow.current = ready;
    // Into the visit, with the camera and the microphone on: set by a click on this page, or the one that led here.
    const [join, setJoin] = useState<'video' | undefined>(() => (params.get('join') === '1' ? 'video' : undefined));
    useEffect(() => {
        if (params.get('join')) window.history.replaceState(null, '', path); // a reload doesn't come in again
    }, [params, path]);

    // What the server tells this page (realtime.toUser( … ).emit( … ) in app/(app)/actions.ts and lib/realtime.ts).
    useUserEvent('admitted', (data: { appointment: string }) => {
        if (data.appointment !== id) return;
        setAdmitted(true);
        if (readyNow.current) setJoin('video');
    });
    useUserEvent('ended', (data: { appointment: string }) => {
        if (data.appointment !== id) return;
        setEnded(true);
        router.refresh();
    });

    if (now === null) return <div className="h-[34rem] rounded-2xl bg-stone-900" />;

    if (ended || now >= endsAt) {
        return (
            <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-2xl bg-stone-100 p-6 text-center" id="visit" data-state="ended">
                <p className="text-lg font-medium">This visit has ended</p>
                <p className="text-sm text-stone-600">{expert ? `Write your notes for ${other.name} below.` : `Notes from ${other.name} show below once they are written.`}</p>
            </div>
        );
    }

    if (now < startsAt - OPENS_BEFORE) {
        return (
            <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-2xl bg-stone-100 p-6 text-center" id="visit" data-state="later">
                <p className="text-lg font-medium">The visit opens at {timeOf(startsAt - OPENS_BEFORE)}, {relative(startsAt - OPENS_BEFORE, now)}</p>
                <p className="max-w-md text-sm text-stone-600">Ten minutes before it starts. Meanwhile, write to {other.name} beside it, and send what they should see.</p>
            </div>
        );
    }

    const left = Math.max(1, Math.ceil((endsAt - now) / 60_000));
    return (
        <div className="flex flex-col gap-2" id="visit" data-state="open">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white px-4 py-2.5 text-sm shadow-sm">
                <Encrypted />
                <span className="text-stone-500 tabular-nums">{now < startsAt ? `Starts at ${timeOf(startsAt)}` : `${left} min left`}</span>
                {expert && <ExpertControls id={id} client={other} admitted={admitted} onLetIn={() => { setAdmitted(true); setJoin('video'); }} />}
            </div>
            {/* Its group call, in the page while it is on: everyone's camera, and the call's controls. */}
            <CallSpot rt={rt} call={`visit:${id}`} join={join} joinWith="microphone camera" className="h-[32rem] overflow-hidden rounded-2xl bg-stone-900 text-white">
                {expert ? (
                    <ExpertLobby id={id} client={other} admitted={admitted} onJoin={() => setJoin('video')} />
                ) : (
                    <ClientLobby id={id} expert={other} admitted={admitted} ready={ready}
                                 onReady={() => { setReady(true); void imHere(id); }} onJoin={() => setJoin('video')} />
                )}
            </CallSpot>
        </div>
    );
}

/** What the visit is, said where it is: encrypted end to end, so the media servers forward what they can't see or hear. */
function Encrypted() {
    return (
        <span className="inline-flex items-center gap-1.5 text-teal-800" title="Your camera and microphone are encrypted in your browser, with a key only the two of you get. WordPlus Cloud's media servers forward them without being able to see or hear them.">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            Encrypted end to end
        </span>
    );
}

/** The client before the visit: ready, then waiting until the expert lets them in, then in. */
function ClientLobby({ id, expert, admitted, ready, onReady, onJoin }: { id: string; expert: Person; admitted: boolean; ready: boolean; onReady: () => void; onJoin: () => void }) {
    const { online } = useOnline([expert.id]);
    return (
        <Lobby photo={expert.photo}>
            {admitted ? (
                <>
                    <p className="text-lg font-medium">{expert.name} is ready for you</p>
                    <button onClick={onJoin} className="rounded-full bg-teal-500 px-6 py-3 font-medium text-white hover:bg-teal-400">Join the visit</button>
                </>
            ) : ready ? (
                <>
                    <InWaitingRoom room={`waiting:${id}`} />
                    <p className="text-lg font-medium" data-waiting="">You are in the waiting room</p>
                    <p className="max-w-sm text-stone-300">
                        {online[expert.id] ? `${expert.name} knows you're here and will let you in shortly.` : `${expert.name} isn't online yet. You'll be let in as soon as ${expert.name} arrives.`}
                    </p>
                </>
            ) : (
                <>
                    <p className="text-lg font-medium">Your visit with {expert.name} is open</p>
                    <p className="max-w-sm text-stone-300">Say you are ready, and {expert.name} lets you in from the waiting room. You come in with your camera and microphone on.</p>
                    <button onClick={onReady} className="rounded-full bg-teal-500 px-6 py-3 font-medium text-white hover:bg-teal-400">I&apos;m ready</button>
                </>
            )}
        </Lobby>
    );
}

/** In the waiting room while on the page: a member of its presence room, which the expert's pages see. */
function InWaitingRoom({ room }: { room: string }) {
    useRoom(room, {});
    return null;
}

/** The expert before the visit: whether the client waits, and the button that lets them in and comes in too. */
function ExpertLobby({ id, client, admitted, onJoin }: { id: string; client: Person; admitted: boolean; onJoin: () => void }) {
    const here = useWaiting(id, client.id);
    return (
        <Lobby photo={client.photo}>
            {admitted ? (
                <>
                    <p className="text-lg font-medium">{client.name} may come in</p>
                    <button onClick={onJoin} className="rounded-full bg-teal-500 px-6 py-3 font-medium text-white hover:bg-teal-400">Join the visit</button>
                </>
            ) : (
                <p className="text-lg font-medium" data-waiting={here ? '' : undefined}>
                    {here ? `${client.name} is in the waiting room` : `${client.name} isn't in the waiting room yet`}
                </p>
            )}
            {!admitted && <p className="max-w-sm text-stone-300">Let {client.name} in when you are ready: you come in together, with your camera and microphone on.</p>}
        </Lobby>
    );
}

/** The expert's buttons above the visit: let the client in, from before the visit or during it, and end it for both. */
function ExpertControls({ id, client, admitted, onLetIn }: { id: string; client: Person; admitted: boolean; onLetIn: () => void }) {
    const here = useWaiting(id, client.id);
    const [busy, setBusy] = useState(false);
    const letThemIn = async () => {
        setBusy(true);
        if (await letIn(id)) onLetIn();
        setBusy(false);
    };
    return (
        <span className="ml-auto flex items-center gap-2">
            {!admitted && (
                <button onClick={letThemIn} disabled={busy} className={`rounded-full px-4 py-1.5 font-medium text-white disabled:opacity-60 ${here ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-700 hover:bg-teal-800'}`}>
                    Let {client.name} in
                </button>
            )}
            <button onClick={() => void endNow(id)} className="rounded-full border border-stone-300 px-4 py-1.5 hover:bg-stone-50">End visit</button>
        </span>
    );
}

/** Whether the client is in the waiting room now, as WordPlus Cloud tells the page. */
function useWaiting(id: string, client: string): boolean {
    return usePresence(`waiting:${id}`).some((member) => String(member.id) === client);
}

function Lobby({ photo, children }: { photo: string; children: React.ReactNode }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" id="lobby">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="size-20 rounded-full border-2 border-stone-700 object-cover" />
            {children}
        </div>
    );
}
