// The values "How this page works" shows on the demo, for the page open (?path=/members/…): the member signed in, the
// people of their catalog and who of them hides, the one whose page it is with their room and whether the two may meet,
// or the latest message of their conversations. Who is online the page knows itself. Only on the demo.
import { currentUserId } from '@/lib/auth';
import { canMeet, chatBetween, conversationsOf, membersFor, membersOf, messagesPage, nameOf, profileOf, roomOf, WANTS, type Profile } from '@/lib/dating';

/** A person as canMeet's comments say it: "a woman", "a man", "nonbinary". */
const is = (p: Profile) => (p.gender === 'nonbinary' ? 'nonbinary' : `a ${p.gender}`);

export async function GET(request: Request) {
    if (process.env.SPARK_DEMO !== '1') return new Response(null, { status: 404 });
    const me = await currentUserId();
    const mine = me ? await profileOf(me) : null;
    if (!me || !mine) return Response.json({ values: {}, people: [] });
    const path = new URL(request.url).searchParams.get('path') ?? '';
    const values: Record<string, string> = { me_id: me, me_name: mine.name, me_hides: String(mine.hideOnline) };

    // The catalog's people, of whom the page shows one online and one away, as it finds them, and who of them hides.
    let people: Array<{ id: string; name: string }> = [];
    if (path === '/members') {
        const members = await membersFor(me);
        people = members.map((p) => ({ id: p.id, name: p.name }));
        const ids = members.map((p) => `'${p.id}'`);
        values.ids = ids.length > 6 ? [...ids.slice(0, 5), '…'].join(', ') : ids.join(', ');
        values.names = members.map((p) => p.name).join(', ') || 'nobody yet';
        const hides = members.find((p) => p.hideOnline);
        const shows = members.find((p) => !p.hideOnline);
        values.hidden_yes = hides ? `For ${hides.name} ('${hides.id}'): true, so nobody sees ${hides.name} online` : 'Nobody among your people hides now';
        if (shows) values.hidden_no = `For ${shows.name} ('${shows.id}'): false, so others see when ${shows.name} is online`;
    }

    const id = /^\/members\/([^/]+)$/.exec(path)?.[1];
    const them = id ? await profileOf(decodeURIComponent(id)) : null;
    if (them) {
        const chat = await chatBetween(me, them.id);
        Object.assign(values, {
            them_id: them.id, them_name: them.name,
            chat, room: roomOf(chat), members: (await membersOf(chat)).map((member) => `'${member}'`).join(', '),
            pair: `${Math.min(Number(me), Number(them.id))}:${Math.max(Number(me), Number(them.id))}`,
            me_seeking: mine.seeking, me_is: is(mine),
            them_seeking: them.seeking, them_is: is(them),
            me_wants: String(WANTS[mine.seeking].includes(them.gender)),
            them_wants: String(WANTS[them.seeking].includes(mine.gender)),
            may_meet: String(await canMeet(me, them.id)),
        });
    }

    if (path === '/messages') {
        const latest = (await conversationsOf(me))[0];
        const page = latest ? await messagesPage(latest.chat, null) : null;
        const message = page?.messages.at(-1);
        if (latest && page && message) {
            const members = await membersOf(latest.chat);
            const to = members.find((member) => member !== message.from) ?? '';
            Object.assign(values, {
                conv_chat: latest.chat, conv_room: roomOf(latest.chat), conv_members: members.map((member) => `'${member}'`).join(', '),
                conv_id: message.id, conv_from: message.from, conv_to: to,
                conv_from_name: (await nameOf(message.from)) ?? '', conv_to_name: (await nameOf(to)) ?? '',
                conv_text: message.text.slice(0, 60), conv_at: String(message.at), conv_more: String(page.more),
            });
        }
    }
    return Response.json({ values, people });
}
