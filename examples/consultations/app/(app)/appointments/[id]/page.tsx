import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { appointmentOf, chatOf, isParty, photoOf } from '@/lib/clinic';
import { When } from '../../when';
import { Messages } from './messages';
import { Notes } from './notes';
import { Visit } from './visit';

export default function AppointmentPage(props: PageProps<'/appointments/[id]'>) {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Appointment {...props} />
        </Suspense>
    );
}

// An appointment, for its expert and its client alone: the visit, its messages beside it, and the notes after it.
async function Appointment({ params }: PageProps<'/appointments/[id]'>) {
    const { id } = await params;
    const me = (await currentUserId())!;
    const appointment = await appointmentOf(id);
    if (!appointment || !isParty(appointment, me)) notFound();
    const expert = appointment.expert === me;
    const other = expert
        ? { id: appointment.client, name: appointment.clientName, photo: photoOf(appointment.client) }
        : { id: appointment.expert, name: appointment.expertName, photo: photoOf(appointment.expert) };
    const people = {
        [appointment.expert]: { name: appointment.expertName, avatar: photoOf(appointment.expert) },
        [appointment.client]: { name: appointment.clientName, avatar: photoOf(appointment.client) },
    };

    return (
        <section className="flex flex-col gap-5">
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={other.photo} alt="" className="size-14 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-semibold">{expert ? other.name : `${other.name}, ${appointment.expertTitle.toLowerCase()}`}</h1>
                    <p className="text-stone-600">{appointment.topic}</p>
                </div>
                <p className="w-full text-sm text-stone-600 tabular-nums sm:w-auto"><When at={appointment.startsAt} until={appointment.endsAt} /></p>
            </header>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="flex min-w-0 flex-col gap-5">
                    <Visit id={id} expert={expert} startsAt={appointment.startsAt} endsAt={appointment.endsAt} ended={appointment.endedAt !== null}
                           admitted={appointment.admittedAt !== null} other={other} />
                    {(appointment.endedAt !== null || Date.now() >= appointment.startsAt) && (
                        <Notes id={id} expert={expert} notes={appointment.notes} client={appointment.clientName} from={appointment.expertName} />
                    )}
                </div>
                <div id="messages" className="h-[35rem] overflow-hidden rounded-2xl border border-stone-200 bg-white">
                    <Messages room={chatOf(id)} other={other.name} people={people} />
                </div>
            </div>
            <Link href="/appointments" className="text-sm text-stone-500">Back to appointments</Link>
        </section>
    );
}
