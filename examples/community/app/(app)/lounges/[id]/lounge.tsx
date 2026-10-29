'use client';

import { useRealtime } from '@wordplus/realtime/react';
import { CallSpot, GroupCallButton } from '@wordplus/realtime-ui/react';

type Person = { id: string; name: string; avatar: string };
type Props = { room: string; name: string; kind: 'audio' | 'video'; people: Person[]; host: boolean };

/**
 * A lounge's call, shown here in the page while this member is in it: by voice, everyone's picture and who speaks, or
 * with cameras, everyone's camera and screen. Before that, who is in it now and the button to drop in. On another page
 * the call goes on in the corner, and comes back here when this page opens again.
 */
export function LoungeRoom({ room, name, kind, people, host }: Props) {
    const rt = useRealtime();
    return (
        <CallSpot rt={rt} call={room} className="h-[calc(100dvh-14rem)] min-h-[28rem] overflow-hidden rounded-2xl bg-stone-900 text-white">
            <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center" id="lounge">
                {people.length > 0 ? (
                    <>
                        <ul className="flex flex-wrap justify-center gap-4">
                            {people.map((person) => (
                                <li key={person.id} className="flex w-20 flex-col items-center gap-1.5">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={person.avatar} alt="" className="size-16 rounded-full border-2 border-emerald-500 object-cover" />
                                    <span className="truncate text-sm">{person.name}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-stone-300">{people.length === 1 ? `${people[0].name} is in ${name}.` : `${people.length} members are in ${name}.`}</p>
                    </>
                ) : (
                    <p className="text-lg text-stone-300">Nobody is in {name} right now.</p>
                )}
                {/* Asks this server for the call's pass (/api/realtime/calls), whose rule is lib/realtime.ts's groupCalls. */}
                <GroupCallButton rt={rt} room={room} type={kind} title={name} className="rounded-full bg-orange-600 px-6 py-3 font-medium text-white hover:bg-orange-500">
                    {people.length > 0 ? 'Drop in' : `Open ${name}`}
                </GroupCallButton>
                <p className="max-w-sm text-sm text-stone-400">
                    {kind === 'audio' ? 'By voice: you come in muted, and turn your microphone on from the call to talk.' : 'With cameras: you come in with your camera and microphone off, turn them on from the call, and may share your screen.'}
                    {host ? ' You host the club: you can mute anyone here or take them out, from their tile.' : ''}
                </p>
            </div>
        </CallSpot>
    );
}
