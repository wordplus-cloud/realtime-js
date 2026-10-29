import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { appointmentsOf, personOf, photoOf, waitingOf } from '@/lib/clinic';
import { AppointmentList } from './list';

export default function AppointmentsPage() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Appointments />
        </Suspense>
    );
}

// My appointments, as an expert or a client: those to come, a visit open now first, then those past.
async function Appointments() {
    const me = (await currentUserId())!;
    const [all, person] = await Promise.all([appointmentsOf(me), personOf(me)]);
    const expert = person?.role === 'expert';
    return (
        <AppointmentList
            expert={expert}
            appointments={all.map((one) => {
                const other = expert ? one.client : one.expert;
                return {
                    id: one.id,
                    other,
                    name: expert ? one.clientName : one.expertName,
                    title: expert ? '' : one.expertTitle,
                    photo: photoOf(other),
                    topic: one.topic,
                    startsAt: one.startsAt,
                    endsAt: one.endsAt,
                    ended: one.endedAt !== null,
                    notes: one.notes !== null,
                    waiting: waitingOf(one.id),
                };
            })}
        />
    );
}
