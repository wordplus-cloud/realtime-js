// POST /api/realtime/calls: what a page does with a call once a token started it, for the member signed in: answer a
// call that rings for them, renew what it holds as the call goes on, and a host's mute or remove (moderate). Each carries
// a proof only this server makes, which the package checks. Who may call, drop into a lounge or watch an event is the
// site's own token routes: app/api/chat-call-token, lounge-token and event-token.
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
