// A page of a chat's messages: GET /api/messages?room=chat:7, with &before=<id> for older ones. Only those who may use
// the chat may read it: its team, for a channel.
import { currentUserId } from '@/lib/auth';
import { chatIn, mayChat, messagesPage } from '@/lib/team';

export async function GET(request: Request) {
    const url = new URL(request.url);
    const chat = chatIn(url.searchParams.get('room') ?? '');
    const before = url.searchParams.get('before');
    const me = await currentUserId();
    if (!chat || !(await mayChat(me, chat))) {
        return new Response(null, { status: 403 });
    }
    return Response.json(await messagesPage(chat, before));
}
