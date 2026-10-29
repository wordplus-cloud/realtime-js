// The values "How this page works" shows on the demo, for the page open (?path=/lounges/…): who is signed in, and on
// the page of a channel, a lounge, an event or a member, its room and what its rule answers now. Only on the demo.
import { currentUserId } from '@/lib/auth';
import { channelOf, chatBetween, eventOf, isHost, loungeOf, personOf } from '@/lib/club';
import { liveNow, loungesNow } from '@/lib/realtime';

export async function GET(request: Request) {
    if (process.env.CLUB_DEMO !== '1') return new Response(null, { status: 404 });
    const path = new URL(request.url).searchParams.get('path') ?? '';
    const me = await currentUserId();
    if (me === null) return Response.json({ values: {} });
    const person = await personOf(me);
    const host = await isHost(me);
    const values: Record<string, string> = { me_id: me, me_name: person?.name ?? '', me_role: host ? 'a host' : 'a member' };

    // What is on now, as WordPlus Cloud says.
    const [lounges, live] = await Promise.all([loungesNow(), liveNow()]);
    values.lounges_now = [...lounges.entries()].map(([id, people]) => `'lounge:${id}' (${people.length} in)`).join(', ') || 'none';
    values.live_now = [...live.entries()].map(([id, viewers]) => `'event:${id}' (${viewers} watching)`).join(', ') || 'none';

    const id = path.match(/^\/\w+\/(\d+)$/)?.[1];
    if (id && path.startsWith('/channels/')) {
        const channel = await channelOf(id);
        if (channel) Object.assign(values, { room: `channel:${channel.id}`, channel_name: channel.name });
    }
    if (id && path.startsWith('/lounges/')) {
        const lounge = await loungeOf(id);
        if (lounge) Object.assign(values, { call: `lounge:${lounge.id}`, lounge_name: lounge.name, kind: lounge.kind, answer: host ? '{ admin: true }: a host' : 'true: a member' });
    }
    if (id && path.startsWith('/events/')) {
        const event = await eventOf(id);
        if (event) {
            Object.assign(values, {
                stream: `event:${event.id}`, event_title: event.title, host_name: event.hostName,
                role: me === event.host ? `{ role: 'host' }: ${person?.name} hosts it` : `'viewer': ${person?.name} is a member`,
            });
        }
    }
    if (id && path.startsWith('/members/') && id !== me) {
        const them = await personOf(id);
        if (them) Object.assign(values, { them_name: them.name, room: `chat:${await chatBetween(me, id)}` });
    }
    return Response.json({ values });
}
