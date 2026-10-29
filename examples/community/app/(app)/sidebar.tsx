import Link from 'next/link';
import { channels, conversationsOf, events, lounges, personOf, photoOf } from '@/lib/club';
import { liveNow, loungesNow } from '@/lib/realtime';
import { NavLink } from './live';
import { When } from './when';

// The club at a glance, beside every page: an event live now, the channels, the lounges with who is in each, the events
// to come, and my conversations. Made for each request, and again whenever the club changes (ClubLive in live.tsx).
export async function Sidebar({ me }: { me: string }) {
    const [allChannels, allLounges, allEvents, inLounges, live, talks] = await Promise.all([
        channels(), lounges(), events(), loungesNow(), liveNow(), conversationsOf(me),
    ]);
    const onAir = allEvents.filter((event) => live.has(event.id));
    // Those to come, and one of the hour gone by not yet live, as its host is about to go live.
    const next = allEvents.filter((event) => !live.has(event.id) && event.startsAt > Date.now() - 60 * 60_000).slice(0, 3);
    const names = new Map(await Promise.all([...new Set([...inLounges.values()].flat())].map(async (id) => [id, (await personOf(id))?.name ?? ''] as const)));

    return (
        <nav className="flex flex-col gap-5" id="sidebar">
            {onAir.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="block rounded-xl bg-stone-900 p-3 text-white hover:bg-stone-800" data-live="">
                    <span className="flex items-center gap-2 text-xs font-semibold tracking-wide"><span className="rounded bg-red-600 px-1.5 py-0.5">LIVE</span>{live.get(event.id)} watching</span>
                    <span className="mt-1.5 block font-medium">{event.title}</span>
                    <span className="block text-sm text-stone-300">with {event.hostName}</span>
                </Link>
            ))}
            <NavLink href="/club">Club</NavLink>
            <Section title="Channels">
                {allChannels.map((channel) => (
                    <NavLink key={channel.id} href={`/channels/${channel.id}`}><span className="text-stone-400">#</span>{channel.name}</NavLink>
                ))}
            </Section>
            <Section title="Lounges">
                {allLounges.map((lounge) => {
                    const people = inLounges.get(lounge.id) ?? [];
                    return (
                        <div key={lounge.id} data-lounge={lounge.id}>
                            <NavLink href={`/lounges/${lounge.id}`}>
                                <Kind kind={lounge.kind} />
                                <span className="flex-1 truncate">{lounge.name}</span>
                                {people.length > 0 && <span className="text-xs text-emerald-700">{people.length}</span>}
                            </NavLink>
                            {people.length > 0 && (
                                <ul className="mb-1 ml-8 flex flex-col gap-0.5">
                                    {people.map((id) => (
                                        <li key={id} className="flex items-center gap-1.5 text-xs text-stone-600">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={photoOf(id)} alt="" className="size-4 rounded-full object-cover" />
                                            {names.get(id)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </Section>
            <Section title="Events" more={{ href: '/events', label: 'All' }}>
                {next.map((event) => (
                    <NavLink key={event.id} href={`/events/${event.id}`} className="flex-col items-start gap-0">
                        <span className="truncate">{event.title}</span>
                        <span className="text-xs text-stone-500"><When at={event.startsAt} /></span>
                    </NavLink>
                ))}
            </Section>
            {talks.length > 0 && (
                <Section title="Messages">
                    {talks.slice(0, 6).map((talk) => (
                        <NavLink key={talk.chat} href={`/members/${talk.id}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoOf(talk.id)} alt="" className="size-5 rounded-full object-cover" />
                            {talk.name}
                        </NavLink>
                    ))}
                </Section>
            )}
        </nav>
    );
}

function Section({ title, more, children }: { title: string; more?: { href: string; label: string }; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-0.5">
            <h2 className="mb-1 flex items-center justify-between px-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
                {title}
                {more && <Link href={more.href} className="font-normal tracking-normal normal-case hover:text-orange-700">{more.label}</Link>}
            </h2>
            {children}
        </section>
    );
}

/** A lounge's kind: a microphone for one by voice, a camera for one with cameras. */
export function Kind({ kind }: { kind: 'audio' | 'video' }) {
    return kind === 'audio' ? (
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2" aria-label="By voice"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
    ) : (
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2" aria-label="With cameras"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></svg>
    );
}
