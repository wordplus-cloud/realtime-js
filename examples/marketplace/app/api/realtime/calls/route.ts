// POST /api/realtime/calls: the line of a call, once it started with a token from /api/deal-call-token. A page holds
// the line of its neighbour here, so their calls ring, answers a call that rings, and keeps a call going. Every ask
// carries a proof that only this server makes: the token that rang, which says this server already said yes. This
// route checks it for the neighbour signed in, and answers a pass signed with the app's secret, or why not.
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
