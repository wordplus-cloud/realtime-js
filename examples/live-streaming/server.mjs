// Live streaming: Ann goes live, and everyone who opens the page watches
// and writes in its chat, signed in or not. The tutorial:
// https://docs.wordplus.cloud/use-cases/live-streaming/
//
//   cp .env.example .env   # your app key and secret, and a local key
//   npm install            # bundles page.js
//   npm start              # http://localhost:3000
import express from 'express';
import session from 'express-session';
import { createRealtime } from '@wordplus/realtime/server';

// Your users. A real app has them in its database.
const USERS = {
    34: { name: 'Ann' },
    42: { name: 'Ben' },
};
const HOST = 34;

// The WordPlus package, with your keys from .env.
const realtime = createRealtime({
    // The name the others see in the chat of the stream.
    profile: (id) => (USERS[id] ? { name: USERS[id].name } : null),
});

const app = express();

// Who is signed in, kept in a session cookie.
// Your app has its own sign-in: this stands in for it.
app.use(session({
    secret: process.env.SESSION_SECRET || 'change me',
    resave: false,
    saveUninitialized: false,
}));

// The routes the package answers, for the user of the session:
// the page connects, and the stream runs through them.
app.use('/api/realtime', realtime.node((req) => req.session.user ?? null));

// Your route, the one the stream asks before it opens: /api/stream-token?id=1.
// It runs as someone opens the stream, and again as each token runs out.
app.get('/api/stream-token', async (req, res) => {
    const me = USERS[req.session.user] ? req.session.user : null;

    // 1. Your own check: the stream of this app, live:1, and no other.
    if (req.query.id !== '1') return res.sendStatus(403);

    // 2. Who they are in it, and the settings of the stream: it takes reactions.
    const settings = { reactions: true };
    const token = await realtime.streamToken(me, 'live:1', me === null
        // A visitor who is not signed in watches, and signs in to write.
        ? { chat: 'read', settings }
        : me === HOST
            // Ann hosts: she goes live, and ends the stream.
            ? { role: 'host', settings }
            // Everyone else watches, and writes in the chat.
            : { settings });

    res.json({ token });
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

// Sign in as Ann or Ben, or watch without signing in.
app.get('/login', (req, res) => res.send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sign in</title></head>
<body>
    <h1>Sign in</h1>
    <form method="post" action="/login">
        <button name="as" value="34">Ann, who goes live</button>
        <button name="as" value="42">Ben, who watches</button>
    </form>
    <p><a href="/">Watch without signing in</a></p>
</body>
</html>`));

app.post('/login', (req, res) => {
    if (USERS[req.body.as]) req.session.user = Number(req.body.as);
    res.redirect('/');
});

// The stream: the player and its chat for everyone,
// and the studio, with Go live, for Ann.
const STREAM = `<live-stream name="live:1" token-url="/api/stream-token?id=1" login-url="/login" title="Live with Ann">
    </live-stream>`;

// The page, for anyone: the settings of the user, or of a visitor,
// then the stream.
app.get('/', async (req, res) => {
    const me = USERS[req.session.user] ? req.session.user : null;

    const config = await realtime.config(me);
    const settings = JSON.stringify(config).replace(/</g, '\\u003c');
    const hello = me
        ? `Hello, ${USERS[me].name}`
        : '<a href="/login">Sign in</a> to write in the chat';

    res.send(`<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Live with Ann</title>
    <script type="application/json" id="realtime">${settings}</script>
    <script type="module" src="/page.js"></script>
</head>
<body>
    <h1>Live with Ann</h1>
    <p>${hello}</p>
    ${STREAM}
</body>
</html>`);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`http://localhost:${port}`));
