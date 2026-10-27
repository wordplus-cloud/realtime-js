import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { inMeeting } from '@/lib/realtime';
import { channelsOf, isMember, meetingOf, peopleIn, photoOf, roomOf, teamOf } from '@/lib/team';
import { Colleagues } from '../../live';
import { ChannelChat } from './channel';
import { MeetingRoom } from './meeting';

export default function TeamPage(props: PageProps<'/teams/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Team {...props} />
        </Suspense>
    );
}

// A team, for its members: its meeting room, its channels, and who is in it, online first.
async function Team({ params, searchParams }: PageProps<'/teams/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const team = await teamOf(id);
    if (!team || !(await isMember(id, me))) notFound();
    const [people, channels, inIt] = await Promise.all([peopleIn(id), channelsOf(id), inMeeting(id)]);
    const asked = (await searchParams).channel;
    const channel = channels.find((one) => one.id === asked) ?? channels[0];
    // The team by name and photo, for the channel's messages and the meeting room.
    const named = Object.fromEntries(people.map((person) => [person.id, { name: person.name, avatar: photoOf(person.id) }]));

    return (
        <section className="flex flex-col gap-5">
            <header>
                <h1 className="text-2xl font-semibold">{team.name}</h1>
                <p className="text-stone-600">{team.about}</p>
            </header>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div className="flex min-w-0 flex-col gap-5">
                    {/* A room of its own for each team, so opening another team's page decides again whether to join. */}
                    <MeetingRoom key={id} room={meetingOf(id)} team={team.name} host={team.lead === me}
                                 people={inIt.flatMap((person) => (named[person] ? [{ id: person, ...named[person] }] : []))} />
                    {channel && (
                        <div className="flex flex-col gap-2">
                            <nav className="flex gap-1" id="channels">
                                {/* Another channel in the same place: the page stays where it is, the meeting room above it. */}
                                {channels.map((one) => (
                                    <Link key={one.id} href={`/teams/${id}?channel=${one.id}`} scroll={false} aria-current={one.id === channel.id ? 'page' : undefined}
                                          className="rounded-full px-3 py-1 text-sm hover:bg-white aria-[current=page]:bg-indigo-700 aria-[current=page]:text-white">
                                        #{one.name}
                                    </Link>
                                ))}
                            </nav>
                            <div id="chat" className="h-[30rem] overflow-hidden rounded-2xl border border-stone-200 bg-white">
                                <ChannelChat key={channel.id} room={roomOf(channel.id)} name={channel.name} people={named} />
                            </div>
                        </div>
                    )}
                </div>
                <aside className="flex flex-col gap-2">
                    <p className="text-sm font-semibold text-stone-500">{people.length} in the team</p>
                    <Colleagues me={me} people={people.map((person) => ({
                        id: person.id, name: person.name, title: person.title, photo: photoOf(person.id), lead: person.id === team.lead,
                    }))} />
                </aside>
            </div>
        </section>
    );
}
