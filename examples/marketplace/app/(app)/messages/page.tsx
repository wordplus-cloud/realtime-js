import Link from 'next/link';
import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { threadsOf } from '@/lib/market';
import { Ago } from '../when';

export default function MessagesPage() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Messages />
        </Suspense>
    );
}

// My conversations, about what I buy and what I sell, the latest first: a new message puts its conversation first, as
// the page asks again (Notices in live.tsx).
async function Messages() {
    const me = (await currentUserId())!;
    const threads = await threadsOf(me);
    return (
        <section className="mx-auto flex max-w-3xl flex-col gap-4">
            <h1 className="text-2xl font-semibold">Messages</h1>
            {threads.length ? (
                <ul className="flex flex-col gap-2" id="threads">
                    {threads.map((thread) => (
                        <li key={thread.deal}>
                            <Link href={`/messages/${thread.deal}`} className="flex items-center gap-4 rounded-2xl bg-white p-3 shadow-sm hover:ring-1 hover:ring-blue-200">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {thread.photo ? <img src={thread.photo} alt="" className="size-14 shrink-0 rounded-xl object-cover" /> : <span className="size-14 shrink-0 rounded-xl bg-stone-100" />}
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline justify-between gap-2">
                                        <span className="truncate font-medium">{thread.otherName}</span>
                                        {thread.last && <span className="shrink-0 text-xs text-stone-500"><Ago at={thread.last.at} /></span>}
                                    </span>
                                    <span className="block truncate text-sm text-stone-500">{thread.selling ? 'Asking about your ' : ''}{thread.title}</span>
                                    {thread.last && <span className="block truncate text-sm text-stone-700">{thread.last.mine ? 'You: ' : ''}{thread.last.text}</span>}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="rounded-2xl bg-white p-5 text-stone-600 shadow-sm">No conversations yet. <Link href="/market" className="text-blue-700">Find something you like</Link>, and write to its seller.</p>
            )}
        </section>
    );
}
