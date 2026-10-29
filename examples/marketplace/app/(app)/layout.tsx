import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { personOf } from '@/lib/market';
import { realtime } from '@/lib/realtime';
import { signOut } from '../account';
import { HowItWorks } from '../how-it-works';
import { MarketLive, Notices } from './live';
import { Screens } from './screens';

// Every page of a signed-in neighbour. One connection to WordPlus Cloud for all of them, kept as they move between
// pages, and the call screen, which rings on any of them.
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<p className="p-6 text-stone-500">Loading…</p>}>
            <Connected>{children}</Connected>
        </Suspense>
    );
}

async function Connected({ children }: { children: React.ReactNode }) {
    await connection(); // made for each request: the settings are signed for this neighbour, now
    const me = await currentUserId();
    if (!me) redirect('/signin');
    const person = await personOf(me);
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <Screens />
            <MarketLive />
            <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
                <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
                    <Link href="/market" className="text-xl font-bold text-blue-700">Marketplace</Link>
                    <Link href="/market" className="hover:text-blue-700">Browse</Link>
                    <Link href="/messages" className="hover:text-blue-700">Messages</Link>
                    <Link href="/sell" className="rounded-full bg-blue-700 px-3.5 py-1 text-sm font-medium text-white hover:bg-blue-800">Sell</Link>
                    <span className="ml-auto text-sm text-stone-600">{person?.name}{person?.area ? ` · ${person.area}` : ''}</span>
                    <form action={signOut}>
                        <button className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
                    </form>
                </nav>
            </header>
            <Notices />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
                {children}
                <HowItWorks />
            </main>
        </RealtimeProvider>
    );
}
