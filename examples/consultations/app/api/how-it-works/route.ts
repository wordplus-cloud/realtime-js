// The values "How this page works" shows on the demo, for the page open (?path=/appointments/…): who is signed in, and
// on an appointment's page its visit, its waiting room and its messages, with whether the visit is open and who may
// come in now. Only on the demo.
import { currentUserId } from '@/lib/auth';
import { appointmentOf, chatOf, isParty, personOf, visitOf, visitOpen, waitingOf } from '@/lib/clinic';
import { inVisitNow } from '@/lib/realtime';

export async function GET(request: Request) {
    if (process.env.CONSULT_DEMO !== '1') return new Response(null, { status: 404 });
    const path = new URL(request.url).searchParams.get('path') ?? '';
    const me = await currentUserId();
    if (me === null) return Response.json({ values: {} });
    const person = await personOf(me);
    const values: Record<string, string> = { me_id: me, me_name: person?.name ?? '', me_role: person?.role ?? '' };

    // Who is in a visit now, as WordPlus Cloud says and the database names them.
    const busy = await inVisitNow();
    values.in_visit = (await Promise.all([...busy].map(async (id) => (await personOf(id))?.name))).filter(Boolean).join(', ') || 'nobody';

    // An expert's page: the expert.
    const expertId = path.match(/^\/experts\/(\d+)$/)?.[1];
    const expert = expertId ? await personOf(expertId) : null;
    if (expert?.role === 'expert') Object.assign(values, { expert_id: expert.id, expert_name: expert.name });

    // An appointment's page: its rooms, and what its rules answer now.
    const appointmentId = path.match(/^\/appointments\/(\d+)$/)?.[1];
    const appointment = appointmentId ? await appointmentOf(appointmentId) : null;
    if (appointment && isParty(appointment, me)) {
        const open = visitOpen(appointment);
        const mine = appointment.expert === me;
        Object.assign(values, {
            appointment_id: appointment.id,
            visit: visitOf(appointment.id),
            chat: chatOf(appointment.id),
            waiting: waitingOf(appointment.id),
            expert_name: appointment.expertName,
            client_name: appointment.clientName,
            open: open ? 'open' : 'not open now',
            admitted: appointment.admittedAt !== null ? `${appointment.clientName} was let in` : `${appointment.clientName} not let in yet`,
            answer: !open ? 'false: the visit is not open' : mine ? `true: ${appointment.expertName} is its expert` : appointment.admittedAt !== null ? `true: ${appointment.clientName} was let in` : `false: ${appointment.clientName} waits to be let in`,
        });
    }
    return Response.json({ values });
}
