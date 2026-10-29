import Link from 'next/link';
import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { channels, events, lastInChannels, lounges, nameOf, photoOf } from '@/lib/club';
import { liveNow, loungesNow } from '@/lib/realtime';
import { Kind } from '../sidebar';
import { Ago, When } from '../when';

export default function ClubPage() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Club />
        </Suspense>
    );
}

// The club now: an event live, or the next one, the lounges with who is in each, and the channels with their last
// message. What is on WordPlus Cloud knows, and every page asks again as it changes.
async function Club() {
    const me = (await currentUserId())!;
    const [name, allChannels, allLounges, allEvents, inLounges, live, last] = await Promise.all([
        nameOf(me), channels(), lounges(), events(), loungesNow(), liveNow(), lastInChannels(),
    ]);
    const onAir = allEvents.find((event) => live.has(event.id));
    // The next one: one of the hour gone by not yet live is about to be, as its host goes live.
    const next = allEvents.find((event) => !live.has(event.id) && event.startsAt > Date.now() - 60 * 60_000);
    const featured = onAir ?? next;
    const starting = !onAir && next !== undefined && next.startsAt <= Date.now();

    return (
        <section className="flex flex-col gap-8">
            <h1 className="text-2xl font-semibold">Welcome back, {name}</h1>

            {featured && (
                <Link href={`/events/${featured.id}`} className="flex flex-col gap-2 rounded-2xl bg-stone-900 p-6 text-white hover:bg-stone-800 sm:flex-row sm:items-center" id="featured">
                    <span className="flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium text-stone-300">
                            {onAir ? <><span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-white">LIVE</span>{live.get(featured.id)} watching</>
                                : starting ? <>Starting now · {featured.hostName} goes live in a moment</> : <>Next event · <When at={featured.startsAt} /></>}
                        </span>
                        <span className="mt-2 block text-2xl font-semibold">{featured.title}</span>
                        <span className="mt-1 block text-stone-300">with {featured.hostName}. {featured.about}</span>
                    </span>
                    <span className="self-start rounded-full bg-orange-600 px-5 py-2.5 font-medium sm:self-center">{onAir ? 'Watch now' : `${featured.going} going`}</span>
                </Link>
            )}

            <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">Lounges</h2>
                <ul className="grid gap-3 sm:grid-cols-3" id="lounges">
                    {allLounges.map((lounge) => {
                        const people = inLounges.get(lounge.id) ?? [];
                        return (
                            <li key={lounge.id}>
                                <Link href={`/lounges/${lounge.id}`} className="flex h-full flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm hover:ring-1 hover:ring-orange-200">
                                    <span className="flex items-center gap-2 font-medium"><Kind kind={lounge.kind} />{lounge.name}</span>
                                    <span className="text-sm text-stone-600">{lounge.about}</span>
                                    <span className="mt-auto flex items-center gap-2 pt-1 text-sm">
                                        {people.length > 0 ? (
                                            <>
                                                <span className="flex -space-x-2">
                                                    {people.slice(0, 5).map((id) => (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img key={id} src={photoOf(id)} alt="" className="size-7 rounded-full border-2 border-white object-cover" />
                                                    ))}
                                                </span>
                                                <span className="text-emerald-700">{people.length} in now</span>
                                            </>
                                        ) : (
                                            <span className="text-stone-500">Quiet. Be the first in.</span>
                                        )}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">Channels</h2>
                <ul className="grid gap-3 sm:grid-cols-2" id="channels">
                    {allChannels.map((channel) => {
                        const latest = last.get(channel.id);
                        return (
                            <li key={channel.id}>
                                <Link href={`/channels/${channel.id}`} className="flex h-full flex-col gap-1 rounded-2xl bg-white p-4 shadow-sm hover:ring-1 hover:ring-orange-200">
                                    <span className="font-medium"><span className="text-stone-400">#</span>{channel.name}</span>
                                    <span className="text-sm text-stone-600">{channel.about}</span>
                                    {latest && <span className="mt-1 truncate text-sm text-stone-500">{latest.name}: {latest.text} · <Ago at={latest.at} /></span>}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
}
