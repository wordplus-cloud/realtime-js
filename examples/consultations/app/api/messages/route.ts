// A page of an appointment's messages: GET /api/messages?room=chat:7, with &before=<id> for older ones. Only its expert
// and its client may read it.
import { currentUserId } from '@/lib/auth';
import { appointmentIn, mayChat, messagesPage } from '@/lib/clinic';

export async function GET(request: Request) {
    const url = new URL(request.url);
    const appointment = appointmentIn(url.searchParams.get('room') ?? '', 'chat');
    const before = url.searchParams.get('before');
    const me = await currentUserId();
    if (!appointment || !(await mayChat(me, appointment))) {
        return new Response(null, { status: 403 });
    }
    return Response.json(await messagesPage(appointment, before));
}
