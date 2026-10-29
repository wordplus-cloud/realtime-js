import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { currentUserId } from '@/lib/auth';
import { members, personOf, photoOf } from '@/lib/club';
import { realtime } from '@/lib/realtime';
import { signOut } from '../account';
import { HowItWorks } from '../how-it-works';
import { ClubLive, Notices, OnlinePanel } from './live';
import { Screens } from './screens';
import { Sidebar } from './sidebar';

// Every page of a member. One connection to WordPlus Cloud for all of them, kept as they move between pages, and the
// call screen, which rings on any of them and keeps a lounge or a call going in the corner.
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
    const [person, everyone] = await Promise.all([personOf(me), members()]);
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <Screens />
            <ClubLive />
            <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
                <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
                    <Link href="/club" className="text-xl font-bold text-orange-700">Community</Link>
                    {/* The sidebar's way around, where there is no room for it. */}
                    <span className="flex gap-4 lg:hidden">
                        <Link href="/club" className="hover:text-orange-700">Club</Link>
                        <Link href="/events" className="hover:text-orange-700">Events</Link>
                        <Link href="/members" className="hover:text-orange-700">Members</Link>
                    </span>
                    <span className="ml-auto text-sm text-stone-600">{person?.name}</span>
                    <form action={signOut}>
                        <button className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
                    </form>
                </nav>
            </header>
            <Notices />
            <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-5">
                <aside className="hidden w-60 shrink-0 lg:block">
                    <div className="sticky top-20"><Sidebar me={me} /></div>
                </aside>
                <main className="min-w-0 flex-1">
                    {children}
                    <HowItWorks />
                </main>
                <aside className="hidden w-56 shrink-0 xl:block">
                    <div className="sticky top-20">
                        <OnlinePanel me={me} members={everyone.map((member) => ({ id: member.id, name: member.name, title: member.title, photo: photoOf(member.id), host: member.role === 'host' }))} />
                    </div>
                </aside>
            </div>
        </RealtimeProvider>
    );
}
