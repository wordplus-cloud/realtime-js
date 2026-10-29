// A page of a conversation's messages: GET /api/messages?room=deal:3, with &before=<id> for older ones. Only its seller
// and its buyer may read it.
import { currentUserId } from '@/lib/auth';
import { idIn, mayTalk, messagesPage } from '@/lib/market';

export async function GET(request: Request) {
    const url = new URL(request.url);
    const deal = idIn(url.searchParams.get('room') ?? '', 'deal');
    const before = url.searchParams.get('before');
    const me = await currentUserId();
    if (!deal || !(await mayTalk(me, deal))) {
        return new Response(null, { status: 403 });
    }
    return Response.json(await messagesPage(deal, before));
}
