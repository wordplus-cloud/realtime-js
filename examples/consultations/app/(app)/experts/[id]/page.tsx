import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { personOf, photoOf, takenBetween } from '@/lib/clinic';
import { inVisitNow } from '@/lib/realtime';
import { Availability } from '../../live';
import { TalkNowIfFree } from '../talk-now';
import { Booking } from './booking';

export default function ExpertPage(props: PageProps<'/experts/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Expert {...props} />
        </Suspense>
    );
}

const DAY = 24 * 3600 * 1000;

// An expert: who they are, whether they are free now, and their half hours of the next three days, those taken left
// out. A time booked by anyone takes it out of every page showing it, as it asks for itself again.
async function Expert({ params }: PageProps<'/experts/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const [expert, viewer] = await Promise.all([personOf(id), personOf(me)]);
    if (!expert || expert.role !== 'expert') notFound();
    const now = Date.now();
    const [taken, busy] = await Promise.all([takenBetween(id, now, now + 3 * DAY), inVisitNow()]);
    const client = viewer?.role === 'client';

    return (
        <section className="mx-auto flex max-w-3xl flex-col gap-6">
            <div className="flex items-center gap-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoOf(id)} alt="" className="size-24 rounded-full object-cover" />
                <div className="flex-1">
                    <p className="text-sm font-medium text-teal-700">{expert.field}</p>
                    <h1 className="text-2xl font-semibold">{expert.name}</h1>
                    <p className="text-stone-600">{expert.title}</p>
                    <Availability id={id} inVisit={busy.has(id)} />
                </div>
                {client && <TalkNowIfFree expert={id} name={expert.name} inVisit={busy.has(id)} />}
            </div>
            <p className="text-lg">{expert.about}</p>
            {client ? (
                <Booking expert={id} name={expert.name} taken={taken} />
            ) : (
                <p className="rounded-2xl bg-white p-5 text-stone-600 shadow-sm">Clients book {expert.name} from this page: a half hour, from the times still free.</p>
            )}
            <Link href="/experts" className="text-sm text-stone-500">Back to experts</Link>
        </section>
    );
}
