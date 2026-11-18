// GET /api/deal-call-token?to=10&type=video&name=deal:3: a conversation's video or audio call button asks for a token
// before it calls, to see the item before coming over. This server makes its own check for the neighbour signed in:
// the call is that of a conversation, and both of them are its seller and its buyer (mayTalk). Then it answers a token
// for this call alone, signed with the app's secret, which takes the name of the conversation, so the call shows in it.
// With the token, WordPlus Cloud rings the other one, who answers with no token of their own.
import { currentUserId } from '@/lib/auth';
import { idIn, mayTalk } from '@/lib/market';
import { realtime } from '@/lib/realtime';

export async function GET(request: Request) {
    const ask = new URL(request.url).searchParams;
    const me = await currentUserId();
    const to = ask.get('to') ?? '';
    const name = ask.get('name') ?? '';
    // The name comes from the page: deal:3 is conversation 3, and any other name is refused.
    const deal = idIn(name, 'deal');

    // 1. The one calling is of the conversation.
    if (!me || !deal || !(await mayTalk(me, deal))) return new Response(null, { status: 403 });
    // 2. So is the one called, who is not the one calling.
    if (to === me || !(await mayTalk(to, deal))) return new Response(null, { status: 403 });

    // The call takes the name of the conversation, so it shows there.
    return Response.json({ token: await realtime.callToken(me, to, { type: ask.get('type'), name }) });
}
