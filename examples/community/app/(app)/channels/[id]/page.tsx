import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { channelOf, members, photoOf } from '@/lib/club';
import { ChannelChat } from './channel';

export default function ChannelPage(props: PageProps<'/channels/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Channel {...props} />
        </Suspense>
    );
}

// A channel of the club, the whole club's: its messages with the photos shared in them, kept by this server.
async function Channel({ params }: PageProps<'/channels/[id]'>) {
    const { id } = await params;
    const [channel, everyone] = await Promise.all([channelOf(id), members()]);
    if (!channel) notFound();
    // The names and photos of the club, by id, for the channel's older messages too.
    const people = Object.fromEntries(everyone.map((member) => [member.id, { name: member.name, avatar: photoOf(member.id) }]));

    return (
        <section className="flex flex-col gap-3">
            <div>
                <h1 className="text-xl font-semibold"><span className="text-stone-400">#</span>{channel.name}</h1>
                <p className="text-stone-600">{channel.about}</p>
            </div>
            <div id="chat" className="h-[calc(100dvh-12rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <ChannelChat room={`channel:${channel.id}`} name={channel.name} people={people} />
            </div>
        </section>
    );
}
