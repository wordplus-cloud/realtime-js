'use client';

import { useState } from 'react';
import { useRealtime } from '@wordplus/realtime/react';
import { CallSpot, GroupCallButton } from '@wordplus/realtime-ui/react';

type Person = { id: string; name: string; avatar: string };
type Props = { room: string; team: string; host: boolean; people: Person[] };

/**
 * The team's meeting room. Its group call shows here, in the page, while this colleague is in it: everyone's camera and
 * screen, with the call's controls. Before that, who is in it now, and the button to start it or join it. Opened while
 * the meeting is on, the page joins it at once, the camera and microphone off. On another page the meeting goes on in
 * the corner, and comes back here when this page opens again.
 */
export function MeetingRoom({ room, team, host, people }: Props) {
    const rt = useRealtime();
    // On as the page opens: joined at once (CallSpot's join), the camera and microphone off until this colleague turns
    // them on. Decided once, so a meeting that starts while the page is open waits for the button, and someone who
    // leaves it or is taken out stays out.
    const [join] = useState(people.length > 0 ? ('video' as const) : undefined);
    return (
        <CallSpot rt={rt} call={room} join={join} className="h-[32rem] overflow-hidden rounded-2xl bg-stone-900 text-white">
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" id="meeting-room">
                <p className="text-lg font-medium">The {team} meeting room</p>
                {people.length > 0 ? (
                    <>
                        <div className="flex -space-x-3">
                            {people.map((person) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={person.id} src={person.avatar} alt={person.name} title={person.name} className="size-14 rounded-full border-2 border-stone-900 object-cover" />
                            ))}
                        </div>
                        <p className="text-stone-300">{names(people)} {people.length === 1 ? 'is' : 'are'} in the meeting.</p>
                    </>
                ) : (
                    <p className="text-stone-300">Nobody is in the meeting.</p>
                )}
                {/* Asks this server for the call's pass (/api/realtime/calls), whose rule is lib/realtime.ts's groupCalls. */}
                <GroupCallButton rt={rt} room={room} type="video" title={`${team} meeting`}
                                 className="rounded-full bg-indigo-500 px-6 py-3 font-medium text-white hover:bg-indigo-400">
                    {people.length > 0 ? 'Join the meeting' : 'Start the meeting'}
                </GroupCallButton>
                {host && <p className="max-w-sm text-sm text-stone-400">You lead this team: in the meeting, you can mute anyone or take them out, from their tile.</p>}
            </div>
        </CallSpot>
    );
}

/** "Mia", "Mia and Ava", "Mia, Ava and Omar". */
function names(people: Person[]): string {
    const all = people.map((person) => person.name);
    return all.length < 2 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
}
