// GET /api/show-token?id=mugs: the live show of a shop, asked by <LiveStream>, again as each ten-minute token runs out.
// The name comes from the id: show:mugs for the shop of the guides, show:7 for a demo shop.
import { NextResponse, type NextRequest } from 'next/server';
import { realtime } from '@/lib/realtime';
import { currentUserId } from '@/lib/session';
import { person, shopOfRoom, shops } from '@/lib/shop';

// #region demo: show
export async function GET(request: NextRequest) {
    const me = await currentUserId();
    const name = 'show:' + (request.nextUrl.searchParams.get('id') ?? '');

    // 1. A show of a shop here: any other is refused.
    const s = shopOfRoom(name);
    if (s === null || !shops().has(s)) return new NextResponse(null, { status: 403 });

    // 2. Ann of the shop presents it, and everyone else watches and writes in its chat.
    const host = person(me)?.shop === s && person(me)?.name === 'Ann';
    const token = await realtime.streamToken(me, name, { ...(host ? { role: 'host' as const } : {}), settings: { reactions: true } });
    return NextResponse.json({ token });
}
// #endregion
