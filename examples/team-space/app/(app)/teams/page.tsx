import Link from 'next/link';
import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { meetingsNow } from '@/lib/realtime';
import { peopleIn, photoOf, teamsOf } from '@/lib/team';

export default function Teams() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <MyTeams />
        </Suspense>
    );
}

// The teams of this colleague, each with its meeting room as it is now: WordPlus Cloud says which meetings are on and
// how many are in each, the database what each team is.
async function MyTeams() {
    const me = (await currentUserId())!;
    const [teams, now] = await Promise.all([teamsOf(me), meetingsNow()]);
    const on = teams.filter((team) => now.has(team.id));

    return (
        <section className="flex flex-col gap-6">
            <h1 className="text-2xl font-semibold">Your teams</h1>
            {on.length > 0 && (
                <div className="rounded-2xl bg-indigo-700 p-4 text-white" id="meetings-now">
                    <p className="font-medium">Meetings on now</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                        {on.map((team) => (
                            <li key={team.id}>
                                <Link href={`/teams/${team.id}`} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25">
                                    <span className="size-2 rounded-full bg-emerald-400" />{team.name} · {now.get(team.id)} in it
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {teams.length === 0 && <p className="text-stone-600">You are in no team yet.</p>}
            <ul className="grid gap-4 sm:grid-cols-2" id="teams">
                {teams.map((team) => (
                    <li key={team.id}>
                        <TeamCard id={team.id} name={team.name} about={team.about} leadName={team.leadName} inMeeting={now.get(team.id) ?? 0} />
                    </li>
                ))}
            </ul>
        </section>
    );
}

async function TeamCard({ id, name, about, leadName, inMeeting }: { id: string; name: string; about: string; leadName: string | null; inMeeting: number }) {
    const people = await peopleIn(id);
    return (
        <Link href={`/teams/${id}`} className="flex h-full flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm hover:shadow">
            <div className="flex items-start justify-between gap-3">
                <span>
                    <span className="block text-lg font-semibold">{name}</span>
                    <span className="block text-sm text-stone-500">{leadName ? `Led by ${leadName}` : ''}</span>
                </span>
                {inMeeting > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <span className="size-1.5 rounded-full bg-emerald-500" />Meeting · {inMeeting}
                    </span>
                )}
            </div>
            <p className="text-sm text-stone-600">{about}</p>
            <div className="mt-auto flex -space-x-2">
                {people.slice(0, 8).map((person) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={person.id} src={photoOf(person.id)} alt={person.name} title={person.name} className="size-8 rounded-full border-2 border-white object-cover" />
                ))}
                {people.length > 8 && <span className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-stone-100 text-xs">+{people.length - 8}</span>}
            </div>
        </Link>
    );
}
