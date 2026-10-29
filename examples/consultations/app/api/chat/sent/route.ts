import { currentUserId } from '@/lib/auth';
import { appointmentIn } from '@/lib/clinic';
import { keepAndTell } from '@/lib/realtime';

// A message this page's user sent, from the chat's onSent: keep it, and tell the other one. The webhook does the same on
// a server the cloud reaches, and the message is kept once, by its id. On localhost no webhook arrives, so this is what
// keeps the messages while you develop.
export async function POST(request: Request) {
    const me = await currentUserId();
    const sent = await request.json().catch(() => null);
    const appointment = typeof sent?.room === 'string' ? appointmentIn(sent.room, 'chat') : null;
    const whole = typeof sent?.id === 'string' && typeof sent.text === 'string' && typeof sent.at === 'number';
    if (!me || !appointment || !whole) return new Response(null, { status: 400 });
    // keepAndTell keeps it only from the expert or the client, with only the files kept for this appointment.
    await keepAndTell({ id: sent.id, appointment, from: me, text: sent.text, files: sent.files ?? [], at: sent.at });
    return new Response(null, { status: 204 });
}
