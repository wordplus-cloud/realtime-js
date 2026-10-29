import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { LiveStream } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { eventOf, isGoing } from '@/lib/club';
import { setGoingTo } from '../../actions';
import { When } from '../../when';

export default function EventPage(props: PageProps<'/events/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Event {...props} />
        </Suspense>
    );
}

// An event: its stream, with its chat beside it, for every member. Its host is shown the way to the studio, where they
// go live, and a member raises a hand from the player to come on stage.
async function Event({ params }: PageProps<'/events/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const event = await eventOf(id);
    if (!event) notFound();
    const hosts = me === event.host;
    const going = await isGoing(id, me);

    return (
        <article className="flex flex-col gap-5">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-sm text-orange-700"><When at={event.startsAt} /> · with {event.hostName}</p>
                    <h1 className="text-2xl font-semibold">{event.title}</h1>
                    <p className="mt-1 max-w-2xl text-stone-600">{event.about}</p>
                </div>
                {hosts ? (
                    <Link href={`/studio/${event.id}`} className="rounded-full bg-orange-700 px-5 py-2.5 font-medium text-white hover:bg-orange-800">Open your studio</Link>
                ) : (
                    <form action={setGoingTo.bind(null, event.id, !going)}>
                        <button className={`rounded-full px-5 py-2.5 font-medium ${going ? 'border border-stone-300 hover:bg-white' : 'bg-orange-700 text-white hover:bg-orange-800'}`}>
                            {going ? `Going · ${event.going}` : 'I’m going'}
                        </button>
                    </form>
                )}
            </header>
            {/* The player and its chat: WordPlus Cloud's ready-made screens, which ask this server for the stream's pass
                (/api/realtime/calls) with the rule of lib/realtime.ts. */}
            <LiveStream name={`event:${event.id}`} title={event.title} studioUrl={hosts ? `/studio/${event.id}` : undefined} />
        </article>
    );
}
