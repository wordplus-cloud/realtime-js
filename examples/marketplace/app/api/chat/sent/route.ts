import { currentUserId } from '@/lib/auth';
import { idIn } from '@/lib/market';
import { keepAndTell } from '@/lib/realtime';

// A message this page's neighbour sent, from the chat's onSent: keep it, and tell the other one. The webhook does the
// same on a server the cloud reaches, and the message is kept once, by its id. On localhost no webhook arrives, so this
// is what keeps the conversations while you develop.
export async function POST(request: Request) {
    const me = await currentUserId();
    const sent = await request.json().catch(() => null);
    const deal = typeof sent?.room === 'string' ? idIn(sent.room, 'deal') : null;
    const whole = typeof sent?.id === 'string' && typeof sent.text === 'string' && typeof sent.at === 'number';
    if (!me || !deal || !whole) return new Response(null, { status: 400 });
    // keepAndTell keeps it only from the seller or the buyer, with only the photos kept for this conversation.
    await keepAndTell({ id: sent.id, deal, from: me, text: sent.text, files: sent.files ?? [], at: sent.at });
    return new Response(null, { status: 204 });
}
