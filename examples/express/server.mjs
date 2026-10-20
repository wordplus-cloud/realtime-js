// The API demo on Express: sign in as Ann (support), Ben (a customer) or Cara (the warehouse), then watch the order of
// order move on, chat, see who is in the shop and who is online, call them, and meet in the daily meeting.
//
//   cp .env.example .env     # your app key and secret from WordPlus Cloud, and a local key of your own
//   npm install              # bundles the page: the browser files of the SDK come from its routes
//   npm start                # http://localhost:3000
//
// It is the mobile example server too: they sign in with POST /api/token, and send the token as Authorization.
import { createHmac } from 'node:crypto';
import express from 'express';
import session from 'express-session';
import { createRealtime } from '@wordplus/realtime/server';
import { installDemo } from './demo.mjs';

// The shop people and data. A real app has its users and orders in a database.
//
// Shop 0 is the one of this example. A demo (WORDPLUS_DEMO=1, demo.mjs) opens a shop for each visitor, numbered s, whose people
// are s × 100 + 34, + 42 and + 43 and whose order is s × 10000 + 1042: every rule below finds the shop of a user by
// arithmetic, so the people of one shop never reach another.
const PEOPLE = [
    { id: 34, name: 'Ann', role: 'Support', staff: true, avatar: '/avatars/ann.svg' },
    { id: 42, name: 'Ben', role: 'Customer', staff: false, avatar: '/avatars/ben.svg' },
    { id: 43, name: 'Cara', role: 'Warehouse', staff: true, avatar: '/avatars/cara.svg' },
];
const STATUSES = ['placed', 'packed', 'shipped', 'delivered'];

/**
 * A shop as it opens: its order, placed, and the chat as this server keeps it, its first two messages. What Ann and Ben
 * say next comes by webhook (keepChat below).
 */
const openShop = (s) => {
    const opened = Date.now();
    return {
        order: { id: s * 10000 + 1042, number: 1042, customer: s * 100 + 42, item: 'Two ceramic mugs', status: 'placed' },
        chat: [
            { id: 'first-1', from: s * 100 + 42, text: 'Hi! Has my order left yet?', at: opened - 120_000, reactions: {} },
            { id: 'first-2', from: s * 100 + 34, text: 'Hi Ben, it is being packed now. I will let you know.', at: opened - 60_000, reactions: {} },
        ],
        opened,
    };
};
const shops = new Map([[0, openShop(0)]]);

const shopOf = (user) => Math.floor(Number(user) / 100);
const peopleOf = (s) => PEOPLE.map((p) => ({ ...p, id: s * 100 + p.id, shop: s }));
const person = (id) => (shops.has(shopOf(id)) ? peopleOf(shopOf(id)).find((p) => p.id === Number(id)) : undefined);
const isStaff = (id) => !!person(id)?.staff;
const sameShop = (...ids) => ids.every((id) => person(id) && shopOf(id) === shopOf(ids[0]));

/** The rooms of a shop, by name: those of shop 0 as the guides name them, those of a demo shop with its number. */
const roomsOf = (s) => ({
    order: `order:${s * 10000 + 1042}`,
    chat: `chat:${s * 100 + 34}:${s * 100 + 42}`,
    shop: s ? `shop:${s}` : 'shop',
    meeting: s ? `meeting:${s}` : 'meeting:daily',
    product: s ? `product:${s}` : 'product:mugs',
    webhooks: s ? `webhooks:${s}` : 'webhooks',
    show: s ? `show:${s}` : 'show:mugs',
});

/** The shop a room belongs to, from its name. Null for none. */
function shopOfRoom(room) {
    const [kind, first] = String(room ?? '').split(':');
    if (kind === 'order') return Math.floor(Number(first) / 10000);
    if (kind === 'chat') return shopOf(first);
    if (!['shop', 'meeting', 'product', 'webhooks', 'show'].includes(kind)) return null;
    return first === undefined || first === 'daily' || first === 'mugs' ? 0 : /^\d+$/.test(first) ? Number(first) : null;
}

const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE,
    secret: process.env.WORDPLUS_SECRET,
    localKey: process.env.WORDPLUS_LOCAL_KEY,
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
    const order = shops.get(Math.floor(Number(id) / 10000))?.order;
    return order?.id === Number(id) && (user === order.customer || (isStaff(user) && sameShop(user, order.customer)));
});
// #endregion

// #region demo: chat
// The chat of Ann and Ben: those two only. They send messages, typing, reactions and read ticks straight to the room. The
// messages and reactions reach this server by webhook, and it keeps the conversation (keepChat, GET /chat/messages). The
// room keeps its last events for 5 minutes, for a page that reconnects.
realtime.room('chat:{a}:{b}', { history: 50, emit: ['message', 'typing', 'reaction', 'read'], webhook: ['message', 'reaction'] },
    (user, { a, b }) => [a, b].includes(String(user)) && sameShop(a, b));
// #endregion

// #region demo: presence
// Who is in the shop: its people, with their name and role.
const member = (user, s) => {
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
    const pair = [a, b].map(Number);
    if (!sameShop(user, withUser, ...pair)) return false;
    if (pair.includes(user) && pair.includes(withUser)) return isStaff(user) || isStaff(withUser);
    return (pair.includes(user) && isStaff(withUser)) || (isStaff(user) && pair.includes(withUser));
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
    if (s === null || !shops.has(s)) return false;
    return person(user)?.shop === s && person(user).name === 'Ann' ? 'host' : 'viewer';
}, { reactions: true });
// #endregion

// #region demo: webhooks
// What WordPlus Cloud tells this server by webhook (set https://<your server>/api/realtime/webhook on your app page in
// WordPlus Cloud): a message or reaction from a page, someone coming online, the live show going live … each sent on to
// its shop webhooks room. A live stream event names its stream (show:mugs) where the others name a room.
realtime.on('*', async (event) => {
    const room = event.room ?? event.stream ?? null;
    const s = room ? shopOfRoom(room) : shopOf(event.user);
    if (!shops.has(s) || room?.startsWith('webhooks')) return;
    // #region demo: chat
    if (event.type === 'emit' && room === roomsOf(s).chat) keepChat(shops.get(s).chat, event);
    // #endregion
    const type = event.type === 'emit' ? event.event : event.type;
    await realtime.to(roomsOf(s).webhooks).emit('webhook', { type, room, user: event.user ?? event.from ?? null, at: event.at });
});
// #endregion

/**
 * The chat as this server keeps it, from the webhook: a message by the id of its room event, once. A reaction as the
 * one key on it, an empty key taking it back. A real app saves them in its database.
 */
function keepChat(chat, { event, data, from, event_id: id, at }) {
    if (event === 'message' && id && !chat.some((m) => m.id === id)) {
        chat.push({ id, from: Number(from), text: String(data?.text ?? ''), at, reactions: {} });
    }
    const message = event === 'reaction' && chat.find((m) => m.id === data?.id);
    if (message) {
        for (const key of Object.keys(message.reactions)) {
            message.reactions[key] = message.reactions[key].filter((user) => user !== Number(from));
            if (!message.reactions[key].length) delete message.reactions[key];
        }
        if (data.key) (message.reactions[data.key] ??= []).push(Number(from));
    }
}

/** A page of the chat, oldest first: the newest 50, or the 50 before the message `before`. */
function chatPage(chat, before) {
    const end = before ? chat.findIndex((m) => m.id === before) : -1;
    const upTo = end < 0 ? chat.length : end;
    const start = Math.max(0, upTo - 50);
    return { messages: chat.slice(start, upTo), more: start > 0 };
}

const app = express();
// Behind a proxy that speaks HTTPS for it, as a demo is: its secure cookie needs to know.
app.set('trust proxy', 1);

// Mobile apps (the React Native and Capacitor examples) sign in with a token instead of the session cookie: the
// way the example stands in for the tokens of your app, `<user>.<signature>`.
const SIGNING = process.env.SESSION_SECRET || 'example-shop';
const sign = (id) => `${id}.${createHmac('sha256', SIGNING).update(String(id)).digest('base64url')}`;
/** The user a token names, if its signature is right. */
const tokenUser = (token) => {
    const [id] = String(token ?? '').split('.');
    return id && sign(id) === token ? Number(id) : null;
};
const bearer = (req) => tokenUser((req.get('authorization') ?? '').replace(/^Bearer /, ''));

const demo = process.env.WORDPLUS_DEMO === '1';
app.use(session({
    name: demo ? '__Host-shop' : 'shop',
    secret: SIGNING,
    resave: false,
    saveUninitialized: false,
    cookie: demo ? { secure: true, httpOnly: true, sameSite: 'lax', path: '/' } : {},
}));

/** Who is asking: the user of the token in an app, that of the session in a browser. */
const userOf = (req) => (person(bearer(req)) ? bearer(req) : person(req.session.user) ? req.session.user : null);

// A Capacitor app page is on its own address (capacitor://localhost), so it reaches this server across origins.
const APPS = (process.env.APP_ORIGINS ?? 'capacitor://localhost,http://localhost,https://localhost').split(',');
app.use((req, res, next) => {
    if (!APPS.includes(req.get('origin'))) return next();
    res.set({ 'Access-Control-Allow-Origin': req.get('origin'), 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Realtime-Tab', 'Access-Control-Allow-Methods': 'GET, POST', Vary: 'Origin' });
    req.method === 'OPTIONS' ? res.sendStatus(204) : next();
});

// The browser routes: POST /api/realtime/auth, /calls and /keys, for the user of the session, or of the app. And the
// realtime server webhook. Before express.json(), so the webhook body is checked as it was sent.
app.use('/api/realtime', realtime.node((req) => userOf(req)));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(express.static('shop', { index: false }));

// A shop for each visitor, on a demo only: its sign-in, the links that open someone else, and the page frame.
const frame = demo ? installDemo(app, { shops, openShop, peopleOf, sign, stack: process.env.WORDPLUS_DEMO_STACK || 'express' }) : null;

const signedIn = (req, res, next) => (userOf(req) !== null ? next() : res.status(401).json({ error: 'sign_in' }));

/** The shop data for its pages and apps: who is signed in, the people, the order, the chat, and the rooms. */
const shopFor = (me) => {
    const { order } = shops.get(me.shop);
    return {
        me,
        people: peopleOf(me.shop),
        order,
        chat: { between: [me.shop * 100 + 34, me.shop * 100 + 42] },
        product: { name: 'Two ceramic mugs', picture: '/products/mugs.webp' },
        routes: { status: `/orders/${order.id}/status`, wire: `/orders/${order.id}/wire`, messages: '/chat/messages' },
        rooms: roomsOf(me.shop),
        events: { order: 'updated', chat: 'message' },
        headers: {},
        ...(frame ? { demo: frame(me) } : {}),
    };
};

// An app signs in: its token, the user realtime settings (keys and identity included, so it connects with no request
// first), and the shop as it is. It picks one of shop 0's people. On a demo, it brings a window token (demo.mjs).
app.post('/api/token', async (req, res) => {
    const me = frame ? person(tokenUser(req.body.token)) : person(req.body.as);
    if (!me || (!frame && me.shop !== 0)) return res.status(403).json({ error: 'unknown' });
    res.json({ token: sign(me.id), realtime: await realtime.config(me.id), shop: shopFor(me) });
});

app.get('/api/shop', signedIn, (req, res) => res.json(shopFor(person(userOf(req)))));

/** The order in the address, for someone of its shop. Null otherwise. */
const orderFor = (req) => {
    const order = shops.get(Math.floor(Number(req.params.id) / 10000))?.order;
    return order?.id === Number(req.params.id) && sameShop(userOf(req), order.customer) ? order : null;
};

// #region demo: order
// The staff move the order on: saved, then emitted to its room, and a notice to its customer alone. `except` skips the
// tab that made the change.
app.post('/orders/:id/status', signedIn, async (req, res) => {
    const order = orderFor(req);
    const { status } = req.body;
    if (!order || !isStaff(userOf(req)) || !STATUSES.includes(status)) return res.status(403).json({ ok: false });

    order.status = status;
    await realtime.to(`order:${order.id}`).except(req.get('x-realtime-tab')).emit('updated', { id: order.id, status });
    await realtime.toUser(order.customer).emit('notice', { text: `Your order #${order.number} is ${status}.` });
    res.json({ ok: true });
});
// #endregion

// #region demo: chat
// The chat this server keeps, for one of its two: the newest page, or `?before=<id>` the page before that message.
app.get('/chat/messages', signedIn, (req, res) => {
    const me = person(userOf(req));
    if (!me || ![34, 42].includes(me.id % 100)) return res.status(403).json({ error: 'not_in_chat' });
    res.json(chatPage(shops.get(me.shop).chat, req.query.before));
});
// #endregion

// What the cloud carries of the order update: its room and event as they are, its data sealed with the room key,
// which WordPlus Cloud never holds. The page shows it beside the update as it opened it.
app.get('/orders/:id/wire', signedIn, async (req, res) => {
    const order = orderFor(req);
    if (!order) return res.status(403).json({ ok: false });
    const room = `order:${order.id}`;
    const data = await realtime.keys.sealJson({ id: order.id, status: order.status }, await realtime.keys.roomLabel(room));
    res.json({ room, event: 'updated', data });
});

// The shop page: the user realtime settings (keys and identity included) and the shop data, rendered in.
app.get('/', async (req, res) => {
    const me = person(userOf(req));
    if (!me) return res.redirect('/login');

    res.send(page(me, await realtime.config(me.id), shopFor(me)));
});

app.get('/login', (req, res) => res.send(signIn()));

app.post('/login', (req, res) => {
    if (person(req.body.as)?.shop === 0) req.session.user = Number(req.body.as);
    res.redirect('/');
});

app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`API demo: http://localhost:${port}/`));

/** JSON for a <script> block: `<` escaped, so nothing in it can close the block. */
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function page(me, config, shop) {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>API demo</title>
    <link rel="stylesheet" href="/shop.css">
    <script type="application/json" id="realtime">${json(config)}</script>
    <script type="application/json" id="shop">${json(shop)}</script>
    <script type="module" src="/shop.js"></script>
</head>
<body>
    <header class="shop-bar">
        <strong>API demo</strong>
        <form class="shop-me" method="post" action="/logout">
            <img class="avatar" src="${me.avatar}" alt="" width="24" height="24"> ${me.name}
            <button class="quiet" type="submit">Sign out</button>
        </form>
    </header>
    <main class="shop-main" id="shop-root"></main>
</body>
</html>`;
}

function signIn() {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in · API demo</title>
    <link rel="stylesheet" href="/shop.css">
</head>
<body>
    <main class="sign-in">
        <h1>API demo</h1>
        <p class="muted">Sign in as Ann, Ben or Cara. Use another browser, or a private window, for a second person.</p>
        <form method="post" action="/login">
            ${peopleOf(0).map((p) => `<button name="as" value="${p.id}"><img class="avatar" src="${p.avatar}" alt="" width="28" height="28"> ${p.name} <small>${p.role}</small></button>`).join('\n            ')}
        </form>
    </main>
</body>
</html>`;
}
