// The app realtime server part, once for every route, page and action: its credentials, who is asking, what others
// see of them, and who may join which room and place which call.
import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './session';
import { isStaff, keepChat, orderOf, peopleOf, person, roomsOf, sameShop, shopOf, shopOfRoom, shops } from './shop';

export const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: the signed-in user id, or null.
    user: () => currentUserId(),
    // What others see of a user: in presence, calls and the directory.
    profile: (user) => {
        const p = person(user);
        return p ? { name: p.name, avatar: p.avatar } : null;
    },
    // WordPlus Cloud unless these say otherwise.
    server: process.env.WORDPLUS_REALTIME_SERVER || undefined,
    api: process.env.WORDPLUS_REALTIME_API || undefined,
});

// #region demo: order
// The room of an order: its customer and the shop staff. The last 20 updates kept, which the page shows as its timeline.
realtime.room('order:{id}', { history: 20 }, (user, { id }) => {
    const order = orderOf(id);
    return !!order && (user === order.customer || (isStaff(user) && sameShop(user, order.customer)));
});
// #endregion

// #region demo: chat
// The chat of Ann and Ben: those two only. They send messages, typing, reactions and read ticks straight to the room. The
// messages and reactions reach this server by webhook, and it keeps the conversation (keepChat, /api/chat/messages). The
// room keeps its last events for 5 minutes, for a page that reconnects.
realtime.room('chat:{a}:{b}', { history: 50, emit: ['message', 'typing', 'reaction', 'read'], webhook: ['message', 'reaction'] },
    (user, { a, b }) => [a, b].includes(String(user)) && sameShop(a, b));
// #endregion

// #region demo: presence
// Who is in the shop: its people, with their name and role.
const member = (user: unknown, s: number) => {
    const p = person(user);
    return p?.shop === s ? { info: { name: p.name, role: p.role } } : false;
};
realtime.room('shop', { presence: true }, (user) => member(user, 0));
realtime.room('shop:{s}', { presence: true }, (user, { s }) => member(user, Number(s)));
// #endregion

// #region demo: product
// The product page: anyone, signed in or not, and a live count of who is looking.
realtime.room('product:{id}', { public: true, count: true });
// #endregion

// #region demo: webhooks
// The webhooks this server got, sent on to the shop people as they come (below), the last 20 kept.
realtime.room('webhooks', { history: 20 }, (user) => person(user)?.shop === 0);
realtime.room('webhooks:{s}', { history: 20 }, (user, { s }) => person(user)?.shop === Number(s));
// #endregion

// #region demo: members
// Calls between two people, support:34:42: the two it names, one of them staff. Either of them may bring more staff in,
// and the call goes on as a group call: the one adding calls the staff member about it, who takes the call from them.
realtime.calls('support:{a}:{b}', (user, withUser, { a, b }) => {
    // The two it names, compared as text: a user may be an id of text as well as a number.
    const named = (u: unknown) => [a, b].includes(String(u));
    if (!sameShop(user, withUser, a, b)) return false;
    if (named(user) && named(withUser)) return isStaff(user) || isStaff(withUser);
    return (named(user) && isStaff(withUser)) || (isStaff(user) && named(withUser));
}, {
    // Whom the call screen offers to add: the shop staff not in the call.
    people: (user, call) => peopleOf(shopOf(user)).filter((p) => p.staff && !call.split(':').slice(1).map(Number).includes(p.id)).map((p) => p.id),
});
// #endregion

// #region demo: meeting
// The daily meeting: a group call for everyone in the shop.
realtime.groupCalls('meeting:{id}', (user, { id }) => person(user)?.shop === (id === 'daily' ? 0 : Number(id)));
// #endregion

// #region demo: show
// The shop live show, show:mugs: Ann presents it, and everyone else watches and writes in its chat, signed in or not.
realtime.streams('show:{id}', (user, { id }) => {
    const s = shopOfRoom(`show:${id}`);
    if (s === null || !shops().has(s)) return false;
    return person(user)?.shop === s && person(user)?.name === 'Ann' ? 'host' : 'viewer';
}, { reactions: true });
// #endregion

// #region demo: webhooks
// What WordPlus Cloud tells this server by webhook (set https://<your server>/api/realtime/webhook on your app page in
// WordPlus Cloud): a message or reaction from a page, someone coming online, the live show going live … each sent on to
// its shop webhooks room. A live stream event names its stream (show:mugs) where the others name a room.
realtime.on('*', async (event) => {
    const room = 'room' in event ? event.room : 'stream' in event ? event.stream : null;
    const s = room ? shopOfRoom(room) : 'user' in event ? shopOf(event.user) : null;
    if (s === null || !shops().has(s) || room?.startsWith('webhooks')) return;
    // #region demo: chat
    if (event.type === 'emit' && room === roomsOf(s).chat) keepChat(shops().get(s)!.chat, event);
    // #endregion
    const type = event.type === 'emit' ? event.event : event.type;
    const user = 'user' in event ? event.user : 'from' in event ? event.from : null;
    await realtime.to(roomsOf(s).webhooks).emit('webhook', { type, room, user: user ?? null, at: event.at });
});
// #endregion
