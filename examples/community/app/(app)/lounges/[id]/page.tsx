import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { isHost, loungeOf, personOf, photoOf } from '@/lib/club';
import { loungesNow } from '@/lib/realtime';
import { Kind } from '../../sidebar';
import { LoungeRoom } from './lounge';

export default function LoungePage(props: PageProps<'/lounges/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Lounge {...props} />
        </Suspense>
    );
}

// A lounge: who is in it now, as WordPlus Cloud says, and its call, which any member drops into.
async function Lounge({ params }: PageProps<'/lounges/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const [lounge, now, host] = await Promise.all([loungeOf(id), loungesNow(), isHost(me)]);
    if (!lounge) notFound();
    const people = await Promise.all((now.get(id) ?? []).map(async (person) => ({ id: person, name: (await personOf(person))?.name ?? '', avatar: photoOf(person) })));

    return (
        <section className="flex flex-col gap-3">
            <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold"><Kind kind={lounge.kind} />{lounge.name}</h1>
                <p className="text-stone-600">{lounge.about}</p>
            </div>
            <LoungeRoom room={`lounge:${lounge.id}`} name={lounge.name} kind={lounge.kind} people={people} host={host} />
        </section>
    );
}
