// POST /api/realtime/calls: a page asks to call someone, as { call: 'chat:7', to: '10', role: 'caller', … }, or to
// answer a call, or whom it may call. This server runs the call's rule (realtime.calls in lib/realtime.ts) for the
// member signed in, and answers a pass for the call, signed with the app's secret, or why not. With the pass, WordPlus
// Cloud rings the other one.
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
