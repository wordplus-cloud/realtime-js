import Link from 'next/link';
import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { conversationsOf, photoOf } from '@/lib/dating';
import { OnlineStatus } from '../live';

export default function Messages() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Conversations />
        </Suspense>
    );
}

// Everyone this member has talked with, the latest conversation first.
async function Conversations() {
    const me = (await currentUserId())!;
    const conversations = await conversationsOf(me);

    return (
        <section className="flex flex-col gap-3">
            <h1 className="text-2xl font-semibold">Messages</h1>
            {conversations.length === 0 && <p className="text-stone-600">No conversations yet. <Link href="/members" className="text-rose-600">Find someone</Link> and say hi.</p>}
            <ul className="flex flex-col gap-2" id="conversations">
                {conversations.map((conversation) => (
                    <li key={conversation.id}>
                        <Link href={`/members/${conversation.id}`} className="flex items-center gap-4 rounded-2xl bg-white p-3 shadow-sm hover:bg-rose-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoOf(conversation.id)} alt="" className="size-14 rounded-full object-cover" />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium">{conversation.name}</p>
                                <p className="truncate text-sm text-stone-600">{conversation.last.mine ? 'You: ' : ''}{conversation.last.text}</p>
                            </div>
                            <OnlineStatus id={conversation.id} />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
