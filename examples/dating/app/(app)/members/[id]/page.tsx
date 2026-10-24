import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { ageOf, canMeet, chatBetween, photoOf, profileOf, roomOf } from '@/lib/dating';
import { blockMember } from '../../actions';
import { OnlineStatus } from '../../live';
import { MemberChat } from './chat';

type Props = { params: Promise<{ id: string }> };

export default function MemberPage(props: Props) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Member {...props} />
        </Suspense>
    );
}

async function Member({ params }: Props) {
    const { id } = await params;
    const me = await currentUserId();
    const them = await profileOf(id);
    if (!me || !them || !(await canMeet(me, id))) notFound();
    const chat = await chatBetween(me, id);
    const room = roomOf(chat);

    return (
        <section className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoOf(id)} alt="" className="size-20 rounded-full object-cover" />
                <div className="flex-1">
                    <h1 className="text-xl font-semibold">{them.name}, {ageOf(them.birthday)}</h1>
                    {them.city && <p className="text-stone-600">{them.city}</p>}
                    <OnlineStatus id={id} />
                </div>
            </div>
            {them.about && <p className="whitespace-pre-line">{them.about}</p>}

            {/* Taller while a call is in it, the messages in a column beside the call. */}
            <div id="chat" className="h-[30rem] overflow-hidden rounded-2xl border border-stone-200 bg-white transition-[height] has-[[data-call]]:h-[38rem] [--realtime-chat-beside-call:300px]">
                <MemberChat
                    room={room}
                    to={id}
                    name={them.name}
                    avatar={photoOf(id)}
                    placeholder={`Message ${them.name}`}
                />
            </div>

            <details className="text-sm text-stone-600">
                <summary className="cursor-pointer">Block or report {them.name}</summary>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                    <form action={blockMember.bind(null, id, 'block')}>
                        <button className="rounded-full border border-stone-300 px-4 py-2 hover:bg-white">Block</button>
                    </form>
                    <form action={blockMember.bind(null, id, 'report')} className="flex gap-2">
                        <select name="reason" className="rounded-full border border-stone-300 bg-white px-3 py-2">
                            <option value="fake">Fake profile</option>
                            <option value="rude">Rude or abusive</option>
                            <option value="spam">Spam or scam</option>
                            <option value="other">Something else</option>
                        </select>
                        <button className="rounded-full border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50">Report</button>
                    </form>
                </div>
                <p className="mt-2">Either one ends your conversation at once, and you will not see each other again.</p>
            </details>
            <Link href="/members" className="text-sm text-stone-500">Back to people</Link>
        </section>
    );
}
