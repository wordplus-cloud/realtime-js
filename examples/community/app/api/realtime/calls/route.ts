// POST /api/realtime/calls: a page asks to drop into a lounge, as { room: 'lounge:2', type: 'audio' }, to call a member
// or answer them, as { call: 'chat:7', to: '10', role: 'caller', … }, to watch an event or go live in it, or for a
// host's mute or remove (moderate). This server runs the rule of the call or the stream (realtime.groupCalls,
// realtime.calls and realtime.streams in lib/realtime.ts) for the member signed in, and answers a pass for it, signed
// with the app's secret, or why not.
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
