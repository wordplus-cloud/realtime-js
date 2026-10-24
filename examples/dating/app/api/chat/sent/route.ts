import { currentUserId } from '@/lib/auth';
import { chatIn } from '@/lib/dating';
import { keepAndTell } from '@/lib/realtime';

// A message this page's user sent, from the chat's onSent: keep it, and tell the others in the chat. The webhook does
// the same on a server the cloud reaches, and the message is kept once, by its id. On localhost no webhook arrives, so
// this is what keeps the conversation while you develop.
export async function POST(request: Request) {
    const me = await currentUserId();
    const sent = await request.json().catch(() => null);
    const chat = typeof sent?.room === 'string' ? chatIn(sent.room) : null;
    const whole = typeof sent?.id === 'string' && typeof sent.text === 'string' && typeof sent.at === 'number';
    if (!me || !chat || !whole) return new Response(null, { status: 400 });
    // keepAndTell keeps it only from someone who may write in the chat.
    await keepAndTell({ id: sent.id, chat, from: me, text: sent.text, at: sent.at });
    return new Response(null, { status: 204 });
}
