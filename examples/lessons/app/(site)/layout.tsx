import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { coursesOf, personOf } from '@/lib/lessons';
import { realtime } from '@/lib/realtime';
import { signOut } from '../account';
import { HowItWorks } from '../how-it-works';
import { LiveNow, Notices } from './live';

// Every page of the site, for a visitor and a member alike: an open lesson needs no account to watch. One connection
// to WordPlus Cloud for all of them, kept as people move between pages.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<p className="p-6 text-stone-500">Loading…</p>}>
            <Connected>{children}</Connected>
        </Suspense>
    );
}

async function Connected({ children }: { children: React.ReactNode }) {
    await connection(); // made for each request: the settings are signed for this person, now
    const me = await currentUserId();
    const person = me ? await personOf(me) : null;
    // A teacher goes live from their studio, a link away on every page.
    const teaches = me ? (await coursesOf(me)).length > 0 : false;
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
                <nav className="site-width mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
                    <Link href="/" className="text-xl font-bold text-teal-700">Live Lessons</Link>
                    <Link href="/lessons" className="hover:text-teal-700">Courses</Link>
                    {teaches && <Link href="/studio" className="font-medium text-teal-700 hover:text-teal-800">Your studio</Link>}
                    {person ? (
                        <>
                            <span className="ml-auto text-sm text-stone-600">{person.name}</span>
                            <form action={signOut}>
                                <button className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
                            </form>
                        </>
                    ) : (
                        <Link href="/signin" className="ml-auto text-sm text-teal-700">Sign in</Link>
                    )}
                </nav>
            </header>
            <LiveNow />
            <Notices />
            <main className="site-width mx-auto w-full max-w-4xl flex-1 px-4 py-6">
                {children}
                <HowItWorks />
            </main>
        </RealtimeProvider>
    );
}
