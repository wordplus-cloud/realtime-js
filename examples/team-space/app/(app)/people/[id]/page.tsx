import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { areColleagues, chatBetween, personOf, photoOf, roomOf, teamsOf } from '@/lib/team';
import { OnlineStatus } from '../../live';
import { PersonChat } from './chat';

export default function PersonPage(props: PageProps<'/people/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Person {...props} />
        </Suspense>
    );
}

// A colleague: who they are, whether they are online, and our conversation with its calls.
async function Person({ params }: PageProps<'/people/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const them = await personOf(id);
    if (!them || !(await areColleagues(me, id))) notFound();
    const [chat, teams] = await Promise.all([chatBetween(me, id), teamsOf(id)]);

    return (
        <section className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoOf(id)} alt="" className="size-20 rounded-full object-cover" />
                <div className="flex-1">
                    <h1 className="text-xl font-semibold">{them.name}</h1>
                    <p className="text-stone-600">{them.title}{teams.length ? ` · ${teams.map((team) => team.name).join(', ')}` : ''}</p>
                    <OnlineStatus id={id} />
                </div>
            </div>
            {them.about && <p>{them.about}</p>}

            {/* Taller while a call is in it, the messages in a column beside the call. */}
            <div id="chat" className="h-[30rem] overflow-hidden rounded-2xl border border-stone-200 bg-white transition-[height] has-[[data-call]]:h-[38rem] [--realtime-chat-beside-call:300px]">
                <PersonChat room={roomOf(chat)} to={id} name={them.name} avatar={photoOf(id)} />
            </div>
            <Link href="/people" className="text-sm text-stone-500">Back to people</Link>
        </section>
    );
}
