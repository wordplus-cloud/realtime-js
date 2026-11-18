// POST /api/realtime/calls: what a page asks of a call once it has its token from /api/chat-call-token or
// /api/meeting-token: to answer a call ringing for it, which needs no token of its own, to renew its place, or for a
// lead's mute or remove in a meeting. The package checks each ask against what only this server signs, for the
// colleague signed in, and answers. It starts nothing by itself: with no token, nothing rings and no page joins.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function POST(request: Request) {
    // JSON only, which a page of another site can't send here.
    if (!request.headers.get('content-type')?.includes('application/json')) {
        return new Response(null, { status: 415 });
    }
    const ask = await request.json();
    const user = await currentUserId();
    const pass = await realtime.authorizeCall(ask, user);
    return Response.json(pass);
}
