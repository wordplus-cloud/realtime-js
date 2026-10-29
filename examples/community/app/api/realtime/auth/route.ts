// POST /api/realtime/auth: a page asks to join rooms, as { rooms: ['channel:2', 'club'] }. This server runs each room's
// rule (realtime.room in lib/realtime.ts) for the member signed in, and answers a pass for the rooms allowed, signed with
// the app's secret, with why each other was refused. The page shows the pass to WordPlus Cloud, which lets it in.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function POST(request: Request) {
    // JSON only, which a page of another site can't send here.
    if (!request.headers.get('content-type')?.includes('application/json')) {
        return new Response(null, { status: 415 });
    }
    const { rooms } = await request.json();
    const user = await currentUserId();
    const pass = await realtime.authorize(rooms, user);
    return Response.json(pass);
}
