// POST /api/realtime/calls: a page asks to join a lesson's stream, as { stream: 'lesson:7' }. This server runs the
// stream's rule (realtime.streams in lib/realtime.ts) for whoever asks, signed in or not, and answers a pass for the
// stream, signed with the app's secret, or why not: the teacher's to go live, a viewer's to watch.
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
