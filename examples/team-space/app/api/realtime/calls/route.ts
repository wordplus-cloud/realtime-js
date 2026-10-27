// POST /api/realtime/calls: a page asks to call a colleague, as { call: 'chat:7', to: '10', role: 'caller', … }, to
// answer a call, to come into its team's meeting, as { room: 'meeting:3', type: 'video' }, or for a lead's mute or
// remove there (moderate). This server runs the rule of the call (realtime.calls and realtime.groupCalls in
// lib/realtime.ts) for the colleague signed in, and answers a pass for it, signed with the app's secret, or why not. With
// the pass, WordPlus Cloud rings the other one, or lets them in.
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
