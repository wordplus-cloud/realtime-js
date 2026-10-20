// Team meetings: a video meeting for the design team. Ann leads it, Ben is
// on the team, and Cara is not. The tutorial:
// https://docs.wordplus.cloud/use-cases/meetings/
//
//   cp .env.example .env   # your app key and secret, and a local key
//   npm install            # bundles page.js
//   npm start              # http://localhost:3000
import express from 'express';
import session from 'express-session';
import { createRealtime } from '@wordplus/realtime/server';

// Your users and your team. A real app has them in its database.
const USERS = {
    34: { name: 'Ann' },
    42: { name: 'Ben' },
    43: { name: 'Cara' },
};
const TEAM = { id: 7, name: 'Design team', lead: 34, members: [34, 42] };

// The WordPlus package, with your keys from .env.
const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE,
    secret: process.env.WORDPLUS_SECRET,
    localKey: process.env.WORDPLUS_LOCAL_KEY,
    // The name the others see in the meeting.
    profile: (id) => (USERS[id] ? { name: USERS[id].name } : null),
});

// The rule: who may join the meeting of a team, such as team:7.
// It runs each time someone joins.
realtime.groupCalls('team:{id}', (user, { id }) => {
    // The members of the team, and nobody else.
    if (!(Number(id) === TEAM.id && TEAM.members.includes(user))) return false;
    // The lead hosts it: mute, let speak and remove, from the call screen.
    return user === TEAM.lead ? { admin: true } : true;
}, { encrypt: true }); // its video and sound encrypted end to end

const app = express();

// Who is signed in, kept in a session cookie.
// Your app has its own sign-in: this stands in for it.
app.use(session({
    secret: process.env.SESSION_SECRET || 'change me',
    resave: false,
    saveUninitialized: false,
}));

// The route the page asks before it joins, /api/realtime/calls,
// and the others the package answers, for the user of the session.
app.use('/api/realtime', realtime.node((req) => req.session.user ?? null));

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

// Sign in as Ann, Ben or Cara.
app.get('/login', (req, res) => res.send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sign in</title></head>
<body>
    <h1>Sign in</h1>
    <form method="post" action="/login">
        <button name="as" value="34">Ann, who leads the team</button>
        <button name="as" value="42">Ben, on the team</button>
        <button name="as" value="43">Cara, not on the team</button>
    </form>
</body>
</html>`));

app.post('/login', (req, res) => {
    if (USERS[req.body.as]) req.session.user = Number(req.body.as);
    res.redirect('/');
});

// Ending the meeting, for the lead alone: the button of Ann posts here,
// and your server ends the call for everyone in it.
app.post('/meetings/7/end', async (req, res) => {
    if (req.session.user !== TEAM.lead) return res.sendStatus(403);
    await realtime.call('team:7').end();
    res.redirect('/');
});

// The button that joins the meeting, for everyone: the rule decides.
const JOIN_BUTTON = `<room-button room="team:7" type="video" title="Design team">
        Join the meeting
    </room-button>`;
// The button that ends it, for the lead.
const END_BUTTON = `<form method="post" action="/meetings/7/end">
        <button>End the meeting for everyone</button>
    </form>`;

// The page: the settings of the user, then the buttons.
app.get('/', async (req, res) => {
    const me = req.session.user;
    if (!USERS[me]) return res.redirect('/login');

    const config = await realtime.config(me);
    const settings = JSON.stringify(config).replace(/</g, '\\u003c');

    res.send(`<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${TEAM.name}</title>
    <script type="application/json" id="realtime">${settings}</script>
    <script type="module" src="/page.js"></script>
</head>
<body>
    <h1>Hello, ${USERS[me].name}</h1>
    ${JOIN_BUTTON}
    ${me === TEAM.lead ? END_BUTTON : ''}
</body>
</html>`);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`http://localhost:${port}`));
