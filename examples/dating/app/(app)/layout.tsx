import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';
import { signOut } from '../account';
import { Notices, OnlineNow } from './live';
import { CallOnEveryPage, Screens } from './screens';
import { HowItWorks } from '../how-it-works';

// Every page of a signed-in member. One connection to WordPlus Cloud for all of them, kept as they move between pages,
// and the call screen, which rings on any of them.
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<p className="p-6 text-stone-500">Loading…</p>}>
            <Connected>{children}</Connected>
        </Suspense>
    );
}

async function Connected({ children }: { children: React.ReactNode }) {
    await connection(); // made for each request: the settings are signed for this member, now
    const me = await currentUserId();
    if (!me) redirect('/signin');
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <Screens />
            <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
                <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
                    <Link href="/members" className="text-xl font-bold text-rose-600">Spark</Link>
                    <Link href="/members" className="hover:text-rose-600">People</Link>
                    <Link href="/messages" className="hover:text-rose-600">Messages</Link>
                    <Link href="/profile" className="hover:text-rose-600">Profile</Link>
                    <OnlineNow />
                    <form action={signOut}>
                        <button className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
                    </form>
                </nav>
            </header>
            <Notices />
            <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
                <CallOnEveryPage />
                {children}
                <HowItWorks />
            </main>
        </RealtimeProvider>
    );
}
