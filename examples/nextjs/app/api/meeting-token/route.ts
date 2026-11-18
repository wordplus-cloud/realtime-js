// GET /api/meeting-token?id=daily: the daily meeting of a shop, a group call, asked by <GroupCallButton> as it is
// pressed. The name comes from the id: meeting:daily for the shop of the guides, meeting:7 for a demo shop.
import { NextResponse, type NextRequest } from 'next/server';
import { realtime } from '@/lib/realtime';
import { currentUserId } from '@/lib/session';
import { person } from '@/lib/shop';

// #region demo: meeting
export async function GET(request: NextRequest) {
    const me = await currentUserId();
    const id = request.nextUrl.searchParams.get('id') ?? '';

    // Everyone in the shop, and nobody else.
    if (me === null || person(me)?.shop !== (id === 'daily' ? 0 : Number(id))) return new NextResponse(null, { status: 403 });

    return NextResponse.json({ token: await realtime.groupCallToken(me, 'meeting:' + id) });
}
// #endregion
