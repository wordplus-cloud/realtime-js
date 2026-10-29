// POST /api/realtime/calls: a page asks to call the other one of a conversation, to see the item on video, as
// { call: 'deal:3', to: '10', role: 'caller', … }, or to answer. This server runs the call's rule (realtime.calls in
// lib/realtime.ts) for the neighbour signed in, and answers a pass for it, signed with the app's secret, or why not.
// With the pass, WordPlus Cloud rings the other one.
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
