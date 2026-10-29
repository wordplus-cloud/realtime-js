import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { chatBetween, personOf, photoOf } from '@/lib/club';
import { OnlineStatus } from '../../live';
import { MemberChat } from './chat';

export default function MemberPage(props: PageProps<'/members/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Member {...props} />
        </Suspense>
    );
}

// A member: who they are, whether they are online, and our conversation with its calls.
async function Member({ params }: PageProps<'/members/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const them = await personOf(id);
    if (!them || id === me) notFound();
    const chat = await chatBetween(me, id);

    return (
        <section className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoOf(id)} alt="" className="size-20 rounded-full object-cover" />
                <div className="flex-1">
                    <h1 className="text-xl font-semibold">{them.name}{them.role === 'host' ? <span className="ml-2 text-sm font-normal text-orange-700">Host</span> : null}</h1>
                    <p className="text-stone-600">{them.title}</p>
                    <OnlineStatus id={id} />
                </div>
            </div>
            {them.about && <p>{them.about}</p>}

            {/* Taller while a call is in it, the messages in a column beside the call. */}
            <div id="chat" className="h-[30rem] overflow-hidden rounded-2xl border border-stone-200 bg-white transition-[height] has-[[data-call]]:h-[38rem] [--realtime-chat-beside-call:300px]">
                <MemberChat room={`chat:${chat}`} to={id} name={them.name} avatar={photoOf(id)} />
            </div>
            <Link href="/members" className="text-sm text-stone-500">Back to members</Link>
        </section>
    );
}
