// GET /api/lounge-token?id=2: a lounge's button and its spot ask it before they drop in (app/(app)/lounges/[id]/lounge.tsx).
// Any member drops into a lounge, by voice or with their camera, for as long as they like. The hosts look after them:
// the call screen gives them mute and remove on everyone's tile.
import { currentUserId } from '@/lib/auth';
import { isHost, isMember, loungeOf } from '@/lib/club';
import { realtime } from '@/lib/realtime';

export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    const me = await currentUserId();

    // A lounge of the club, and a member.
    const lounge = await loungeOf(id);
    if (!lounge || !(await isMember(me))) return new Response(null, { status: 403 });

    // The name is built here, from the lounge's number: lounge:2.
    const token = await realtime.groupCallToken(me!, `lounge:${lounge.id}`, {
        type: lounge.kind,
        admin: await isHost(me),
    });
    return Response.json({ token });
}
