// The app realtime server part, once for every route, page and action: who is asking, what others see of them, and
// who may join which room. Its keys come from the environment (WORDPLUS_SITE, WORDPLUS_SECRET, WORDPLUS_LOCAL_KEY).
// Calls, the meeting and the live show start from tokens of the app's own routes: app/api/call-token,
// meeting-token and show-token.
import { createRealtime } from '@wordplus/realtime/server';
import { currentUserId } from './session';
import { isStaff, keepChat, orderOf, person, roomsOf, sameShop, shopOf, shopOfRoom, shops } from './shop';

export const realtime = createRealtime({
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
realtime.room('order:{id}', (user, { id }) => {
    const order = orderOf(id);
    return !!order && (user === order.customer || (isStaff(user) && sameShop(user, order.customer)));
}, { history: 20 });
// #endregion

// #region demo: chat
// The chat of Ann and Ben: those two only. They send messages, typing, reactions and read ticks straight to the room. The
// messages and reactions reach this server by webhook, and it keeps the conversation (keepChat, /api/chat/messages). The
// room keeps its last events for 5 minutes, for a page that reconnects.
realtime.room('chat:{a}:{b}', (user, { a, b }) => [a, b].includes(String(user)) && sameShop(a, b),
    { history: 50, emit: ['message', 'typing', 'reaction', 'read'], webhook: ['message', 'reaction'] });
// #endregion

// #region demo: presence
// Who is in the shop: its people, with their name and role.
const member = (user: unknown, s: number) => {
    const p = person(user);
    return p?.shop === s ? { info: { name: p.name, role: p.role } } : false;
};
realtime.room('shop', (user) => member(user, 0), { presence: true });
realtime.room('shop:{s}', (user, { s }) => member(user, Number(s)), { presence: true });
// #endregion

// #region demo: product
// The product page: anyone, signed in or not, and a live count of who is looking.
realtime.room('product:{id}', { public: true, count: true });
// #endregion

// #region demo: webhooks
// The webhooks this server got, sent on to the shop people as they come (below), the last 20 kept.
realtime.room('webhooks', (user) => person(user)?.shop === 0, { history: 20 });
realtime.room('webhooks:{s}', (user, { s }) => person(user)?.shop === Number(s), { history: 20 });
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
