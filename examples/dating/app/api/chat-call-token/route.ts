// GET /api/chat-call-token?to=10&type=video&name=chat:7: a chat's video or audio call button asks for a token before it
// calls. This server makes its own check for the member signed in: the call is that of a chat, and both of them may
// still use it (mayChat). Then it answers a token for this call alone, signed with the app's secret, which takes the
// name of the chat, so the call shows in it. With the token, WordPlus Cloud rings the other one, who answers with no
// token of their own.
import { currentUserId } from '@/lib/auth';
import { chatIn, mayChat } from '@/lib/dating';
import { realtime } from '@/lib/realtime';

export async function GET(request: Request) {
    const ask = new URL(request.url).searchParams;
    const me = await currentUserId();
    const to = ask.get('to') ?? '';
    const name = ask.get('name') ?? '';
    // The name comes from the page: chat:7 is chat 7, and any other name is refused.
    const chat = chatIn(name);

    // 1. The one calling may use the chat.
    if (!me || !chat || !(await mayChat(me, chat))) return new Response(null, { status: 403 });
    // 2. So may the one called, who is not the one calling.
    if (to === me || !(await mayChat(to, chat))) return new Response(null, { status: 403 });

    // The call takes the name of the chat, so it shows there.
    return Response.json({ token: await realtime.callToken(me, to, { type: ask.get('type'), name }) });
}
