import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { personOf } from '@/lib/clinic';
import { realtime } from '@/lib/realtime';
import { signOut } from '../account';
import { HowItWorks } from '../how-it-works';
import { ExpertsLive, Notices, Requests } from './live';
import { Screens } from './screens';

// Every page of someone signed in. One connection to WordPlus Cloud for all of them, kept as they move between pages,
// and the call screen, which shows a visit in its page, or in the corner on any other.
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<p className="p-6 text-stone-500">Loading…</p>}>
            <Connected>{children}</Connected>
        </Suspense>
    );
}

async function Connected({ children }: { children: React.ReactNode }) {
    await connection(); // made for each request: the settings are signed for this person, now
    const me = await currentUserId();
    if (!me) redirect('/signin');
    const person = await personOf(me);
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <Screens />
            <ExpertsLive />
            <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
                <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
                    <Link href={person?.role === 'expert' ? '/appointments' : '/experts'} className="text-xl font-bold text-teal-700">Consultations</Link>
                    <Link href="/experts" className="hover:text-teal-700">Experts</Link>
                    <Link href="/appointments" className="hover:text-teal-700">Appointments</Link>
                    <span className="ml-auto text-sm text-stone-600">{person?.name}{person?.role === 'expert' ? ` · ${person.title}` : ''}</span>
                    <form action={signOut}>
                        <button className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
                    </form>
                </nav>
            </header>
            <Notices />
            {person?.role === 'expert' && <Requests />}
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
                {children}
                <HowItWorks />
            </main>
        </RealtimeProvider>
    );
}
