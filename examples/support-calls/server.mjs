// Calls from a button: Ben, a customer, calls Ann, his support agent.
// The tutorial: https://docs.wordplus.cloud/use-cases/support-calls/
//
//   cp .env.example .env   # your app key and secret, and a local key
//   npm install            # bundles page.js
//   npm start              # http://localhost:3000
import express from 'express';
import session from 'express-session';
import { createRealtime } from '@wordplus/realtime/server';

// Your users. A real app has them in its database.
const USERS = {
    34: { name: 'Ann', agent: true },
    42: { name: 'Ben', agent: false },
};
const isAgent = (id) => USERS[id]?.agent === true;

// The WordPlus package, with your keys from .env.
const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE,
    secret: process.env.WORDPLUS_SECRET,
    localKey: process.env.WORDPLUS_LOCAL_KEY,
    // The name the other person sees in the call.
    profile: (id) => (USERS[id] ? { name: USERS[id].name } : null),
});

// The rule: who may call whom.
// It runs when Ben calls, and again when Ann answers.
realtime.calls('support:{a}:{b}', (user, withUser, { a, b }) => {
    // 1. Both people are the two in the name, such as support:34:42.
    const named = [a, b];
    if (!named.includes(String(user))) return false;
    if (!named.includes(String(withUser))) return false;

    // 2. One of them is an agent: customers never call each other.
    return isAgent(user) || isAgent(withUser);
});

const app = express();

// Who is signed in, kept in a session cookie.
// Your app has its own sign-in: this stands in for it.
app.use(session({
    secret: process.env.SESSION_SECRET || 'change me',
    resave: false,
    saveUninitialized: false,
}));

// The route the page asks before a call, /api/realtime/calls,
// and the others the package answers, for the user of the session.
app.use('/api/realtime', realtime.node((req) => req.session.user ?? null));

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

// Sign in as Ben or Ann.
app.get('/login', (req, res) => res.send(`<!doctype html>
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

app.post('/login', (req, res) => {
    if (USERS[req.body.as]) req.session.user = Number(req.body.as);
    res.redirect('/');
});

// The button that calls Ann, user 34, for Ben. A note for Ann.
const CALL_BUTTON = `<call-button to="34" call="support:{pair}" type="video" name="Ann">
        Call support
    </call-button>`;
const ON_DUTY = '<p>You are on duty. Calls from customers ring here.</p>';

// The page: the settings of the user, then the button or the note.
app.get('/', async (req, res) => {
    const me = req.session.user;
    if (!USERS[me]) return res.redirect('/login');

    const config = await realtime.config(me);
    const settings = JSON.stringify(config).replace(/</g, '\\u003c');

    res.send(`<!doctype html>
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
app.listen(port, () => console.log(`http://localhost:${port}`));
