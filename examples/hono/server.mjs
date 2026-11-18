// Calls from a button, on Hono: Ben, a customer, calls Ann, his support agent.
// The support calls tutorial with Hono in place of Express: https://docs.wordplus.cloud/use-cases/support-calls/
// The package's routes take the request as it is, so the same lines run on Bun, Deno and edge workers.
//
//   cp .env.example .env   # your app key and secret, and a local key
//   npm install            # bundles page.js
//   npm start              # http://localhost:3000
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { createRealtime } from '@wordplus/realtime/server';

// Your users. A real app has them in its database.
const USERS = {
    34: { name: 'Ann', agent: true },
    42: { name: 'Ben', agent: false },
};
const isAgent = (id) => USERS[id]?.agent === true;

// Who is signed in: a session id in a cookie, and whose it is.
// Your app has its own sign-in: this stands in for it.
const sessions = new Map();
const userOf = (request) => {
    const session = /(?:^|;\s*)session=([\w-]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
    return sessions.get(session) ?? null;
};

// The WordPlus package, with your keys from .env.
const realtime = createRealtime({
    // The user of each request to the package's routes.
    user: userOf,
    // The name the other person sees in the call.
    profile: (id) => (USERS[id] ? { name: USERS[id].name } : null),
});

// Who may call whom: two of your users, one of them an agent.
// Customers never call each other.
const mayCall = (me, to) => {
    if (!USERS[me] || !USERS[to] || String(me) === String(to)) return false;
    return isAgent(me) || isAgent(to);
};

const app = new Hono();

// The routes the package answers, and the browser files it serves, for GET and POST:
// the page connects, rings and answers through them.
app.all('/api/realtime/*', (c) => realtime.route(c.req.raw));

// Your route, the one the button asks before a call: /api/call-token?to=34&type=video.
// Your own check first, then the token that lets this user call that one.
app.get('/api/call-token', async (c) => {
    const me = userOf(c.req.raw);
    const to = c.req.query('to');
    if (!mayCall(me, to)) return c.body(null, 403);

    return c.json({ token: await realtime.callToken(me, to, { type: c.req.query('type') }) });
});

app.use('/*', serveStatic({ root: './public' }));

// Sign in as Ben or Ann.
app.get('/login', (c) => c.html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sign in</title></head>
<body>
    <h1>Sign in</h1>
    <form method="post" action="/login">
        <button name="as" value="42">Ben, a customer</button>
        <button name="as" value="34">Ann, a support agent</button>
    </form>
</body>
</html>`));

app.post('/login', async (c) => {
    const { as } = await c.req.parseBody();
    if (USERS[as]) {
        const session = crypto.randomUUID();
        sessions.set(session, Number(as));
        setCookie(c, 'session', session, { httpOnly: true, sameSite: 'Lax', path: '/' });
    }
    return c.redirect('/');
});

// The button that calls Ann, user 34, for Ben. A note for Ann.
const CALL_BUTTON = `<call-button to="34" token-url="/api/call-token" type="video" name="Ann">
        Call support
    </call-button>`;
const ON_DUTY = '<p>You are on duty. Calls from customers ring here.</p>';

// The page: the settings of the user, then the button or the note.
app.get('/', async (c) => {
    const me = userOf(c.req.raw);
    if (!USERS[me]) return c.redirect('/login');

    const config = await realtime.config(me);
    const settings = JSON.stringify(config).replace(/</g, '\\u003c');

    return c.html(`<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Support</title>
    <script type="application/json" id="realtime">${settings}</script>
    <script type="module" src="/page.js"></script>
</head>
<body>
    <h1>Hello, ${USERS[me].name}</h1>
    ${isAgent(me) ? ON_DUTY : CALL_BUTTON}
</body>
</html>`);
});

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port }, () => console.log(`http://localhost:${port}`));
