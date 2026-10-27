import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';
import { nameOf } from '@/lib/team';
import { signOut } from '../account';
import { HowItWorks } from '../how-it-works';
import { MeetingsLive, Notices, OnlineNow } from './live';
import { Screens } from './screens';

// Every page of a signed-in colleague. One connection to WordPlus Cloud for all of them, kept as they move between pages,
// and the call screen, which rings on any of them.
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<p className="p-6 text-stone-500">Loading…</p>}>
            <Connected>{children}</Connected>
        </Suspense>
    );
}

async function Connected({ children }: { children: React.ReactNode }) {
    await connection(); // made for each request: the settings are signed for this colleague, now
    const me = await currentUserId();
    if (!me) redirect('/signin');
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <Screens />
            <MeetingsLive />
            <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
                <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
                    <Link href="/teams" className="text-xl font-bold text-indigo-700">Team Space</Link>
                    <Link href="/teams" className="hover:text-indigo-700">Teams</Link>
                    <Link href="/people" className="hover:text-indigo-700">People</Link>
                    <Link href="/messages" className="hover:text-indigo-700">Messages</Link>
                    <OnlineNow />
                    <span className="text-sm text-stone-600">{await nameOf(me)}</span>
                    <form action={signOut}>
                        <button className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
                    </form>
                </nav>
            </header>
            <Notices />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
                {children}
                <HowItWorks />
            </main>
        </RealtimeProvider>
    );
}
