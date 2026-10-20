// The chat this server keeps (lib/shop.ts, keepChat), for one of its two: the newest page, or `?before=<id>` the page
// before that message. The page <Chat> pages through it. The room fills in only what came since.
import { NextResponse, type NextRequest } from 'next/server';
import { currentUserId } from '@/lib/session';
import { chatPage, person, shops } from '@/lib/shop';

// #region demo: chat
export async function GET(request: NextRequest) {
    const me = person(await currentUserId());
    if (!me || ![34, 42].includes(me.id % 100)) return NextResponse.json({ error: 'not_in_chat' }, { status: 403 });
    return NextResponse.json(chatPage(shops().get(me.shop)!.chat, request.nextUrl.searchParams.get('before')));
}
// #endregion
