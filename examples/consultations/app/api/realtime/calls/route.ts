// POST /api/realtime/calls: a page asks to come into an appointment's visit, as { room: 'visit:7', type: 'video' }. This
// server runs the visit's rule (realtime.groupCalls in lib/realtime.ts) for the person signed in, and answers a pass for
// it, signed with the app's secret, with the key its media is encrypted with, or why not. With the pass, WordPlus Cloud
// lets them in.
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
