// GET /api/call-token?to=34&type=video: a call between two people of a shop, asked by <CallButton> and <OnlineList> as
// a call button is pressed. The app's own check, then the token that lets this user call that one.
import { NextResponse, type NextRequest } from 'next/server';
import { realtime } from '@/lib/realtime';
import { currentUserId } from '@/lib/session';
import { isStaff, sameShop } from '@/lib/shop';

// #region demo: members
export async function GET(request: NextRequest) {
    const me = await currentUserId();
    const to = request.nextUrl.searchParams.get('to');

    // Two people of the same shop, one of them staff: customers never call each other.
    if (me === null || !to || String(me) === to || !sameShop(me, to)) return new NextResponse(null, { status: 403 });
    if (!isStaff(me) && !isStaff(to)) return new NextResponse(null, { status: 403 });

    return NextResponse.json({ token: await realtime.callToken(me, to, { type: request.nextUrl.searchParams.get('type') }) });
}
// #endregion
