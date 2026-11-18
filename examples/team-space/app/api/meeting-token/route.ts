// GET /api/meeting-token?id=3: the token of team 3's meeting room, which Start the meeting, Join the meeting and the
// meeting room joined as the page opens ask, or 403. Who comes in, and who hosts, is meetingToken's, in lib/realtime.ts.
import { currentUserId } from '@/lib/auth';
import { meetingToken } from '@/lib/realtime';

export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    const me = await currentUserId();
    const token = me && (await meetingToken(me, id));
    if (!token) return new Response(null, { status: 403 });
    return Response.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
