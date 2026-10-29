import { currentUserId } from '@/lib/auth';
import { keepAndTell } from '@/lib/realtime';

// A message this page's member sent, from the chat's onSent: keep it, and in a conversation between two, tell the other
// one. The webhook does the same on a server the cloud reaches, and the message is kept once, by its id. On localhost no
// webhook arrives, so this is what keeps the messages while you develop.
export async function POST(request: Request) {
    const me = await currentUserId();
    const sent = await request.json().catch(() => null);
    const whole = typeof sent?.room === 'string' && typeof sent.id === 'string' && typeof sent.text === 'string' && typeof sent.at === 'number';
    if (!me || !whole) return new Response(null, { status: 400 });
    // keepAndTell keeps it only from someone who may write in the room, with only the photos kept for it.
    await keepAndTell({ id: sent.id, room: sent.room, from: me, text: sent.text, files: sent.files ?? [], at: sent.at });
    return new Response(null, { status: 204 });
}
