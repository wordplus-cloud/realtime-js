// POST /api/realtime/calls: what a page asks of a lesson's stream once it has its token from /api/lesson-token. The
// package checks each ask against what only this server signs, for whoever asks, signed in or not, and answers. It
// starts nothing by itself: with no token from /api/lesson-token, no page joins a stream.
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
