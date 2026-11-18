# Calls from a button

A customer presses Call support on your site, and it rings for their support agent, in every tab the agent has open. The agent answers, and the two talk on video, encrypted end to end.

This page builds it with you from an empty folder: a small Node.js app where Ben, a customer, calls Ann, his support agent. Every file is here in full, and you run it in two browser windows at the end. Then [your own app](#into-your-own-app) changes three things.

**In your stack:** [Next.js](../nextjs/calls.md) · [Express](../express/calls.md) · [Laravel](https://docs.wordplus.cloud/laravel/calls/) · [PHP](https://docs.wordplus.cloud/php/calls/) · [Django](https://docs.wordplus.cloud/django/calls/) · [FastAPI](https://docs.wordplus.cloud/fastapi/calls/) · [Flask](https://docs.wordplus.cloud/flask/calls/) · [WordPress](https://docs.wordplus.cloud/wordpress/calls/)

## How it goes

Ann is a support agent, user `34` in your app. Ben is a customer, user `42`.

1. **Ben presses Call support** on a page of your site. The button names Ann, user `34`.
2. **His page asks your server for a token:** the button sends a GET to `/api/call-token?to=34&type=video`, a route of your own, with his usual cookie. WordPlus Cloud never sees this request.
3. **Your route makes your own check** for Ben and Ann: one of the two must be an agent. It says yes, and answers a token your server signs with your secret, for this call alone.
4. **With that token, WordPlus Cloud rings Ann** in every tab she has open, for up to 45 seconds.
5. **Ann presses Answer.** She needs no token of her own: the one that rang her proves your server said yes.
6. **They talk** on video, encrypted end to end. The call connects on any network, by one of three paths: directly between their devices, through our relays on the ports of the web, 443 and 80, when a firewall blocks that, or through our media servers when even the relays cannot reach. None of the three takes credits ([how it connects](how-it-works.md#how-it-connects)).
7. **Either one hangs up,** and the call ends for both.

Who may call whom is your app's own logic, in your own route: the SDK holds none of it. You write that route, one line for the package routes, and a page with a button, as below.

## What you need

- **Node.js 22** or newer.
- **An app in WordPlus Cloud.** If you have no subscription yet, [choose your connections](https://www.wordplus.cloud/pricing#apps) first. Then in your account, go to Apps, then Add app, and give it the address `http://localhost:3000`. You get its **key** and its **secret** ([getting started](../getting-started.md#1-your-app-in-wordplus-cloud)).
- **Two browser windows,** a normal one and a private one, so you can be Ben in one and Ann in the other.

## Step 1. Make the project

Make a folder, and in it the file `package.json`:

```bash
mkdir support-calls
cd support-calls
```

```json title="package.json"
{
  "name": "support-calls",
  "private": true,
  "type": "module",
  "scripts": {
    "postinstall": "npm run build",
    "build": "esbuild page.js --bundle --format=esm --target=es2022 --outfile=public/page.js",
    "start": "node --env-file-if-exists=.env server.mjs"
  },
  "dependencies": {
    "@wordplus/realtime": "^1.2.0",
    "express": "5.3.0",
    "express-session": "1.19.0"
  },
  "devDependencies": {
    "esbuild": "0.28.2"
  }
}
```

- **The dependencies:** the WordPlus SDK, Express for the server, and express-session for who is signed in.
- **`postinstall`** runs after `npm install`: it bundles your page script. The browser files of the SDK, its worker, room client and ready-made parts, come from the package routes, so there is nothing to copy.
- **`build`** bundles `page.js` with esbuild into `public/page.js`, which the browser loads.
- **`start`** starts the server, with your keys from `.env`.

## Step 2. Your keys

Make the file `.env`, with the key and secret of your app:

```dotenv title=".env"
# Your app in WordPlus Cloud: Apps, then Add app,
# with http://localhost:3000 among its addresses.
WORDPLUS_SITE=
WORDPLUS_SECRET=
# Your own: openssl rand -hex 32. Keep it as long as the app.
WORDPLUS_LOCAL_KEY=
# Signs the session cookie: any long random string.
SESSION_SECRET=
```

- **`WORDPLUS_SITE`** is the key of your app, such as `s1500000007`.
- **`WORDPLUS_SECRET`** is its secret. It stays on your server, and signs every token your route answers.
- **`WORDPLUS_LOCAL_KEY`** is a key of your own, which seals what goes through WordPlus Cloud. Make one with `openssl rand -hex 32`.
- **`SESSION_SECRET`** signs the session cookie of this example: any long random string.

## Step 3. The server

The file `server.mjs`. Read it from the top: each part has a comment, and the notes under it say more.

```js title="server.mjs"
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
    // The name the other person sees in the call.
    profile: (id) => (USERS[id] ? { name: USERS[id].name } : null),
});

// Who may call whom: two of your users, one of them an agent.
// Customers never call each other.
const mayCall = (me, to) => {
    if (!USERS[me] || !USERS[to] || String(me) === String(to)) return false;
    return isAgent(me) || isAgent(to);
};

const app = express();

// Who is signed in, kept in a session cookie.
// Your app has its own sign-in: this stands in for it.
app.use(session({
    secret: process.env.SESSION_SECRET || 'change me',
    resave: false,
    saveUninitialized: false,
}));

// The routes the package answers, for the user of the session:
// the page connects, rings and answers through them.
app.use('/api/realtime', realtime.node((req) => req.session.user ?? null));

// Your route, the one the button asks before a call: /api/call-token?to=34&type=video.
// Your own check first, then the token that lets this user call that one.
app.get('/api/call-token', async (req, res) => {
    const me = req.session.user;
    const to = req.query.to;
    if (!mayCall(me, to)) return res.sendStatus(403);

    res.json({ token: await realtime.callToken(me, to, { type: req.query.type }) });
});

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
const CALL_BUTTON = `<call-button to="34" token-url="/api/call-token" type="video" name="Ann">
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
```

What each part does:

1. **Your users.** Ann, an agent, and Ben, a customer. In your app, they are your users from your database.
2. **The WordPlus package.** `createRealtime()` takes your keys from `.env`, and `profile`: the name the other person sees in the call.
3. **Who may call whom.** `mayCall()` is your app's own logic: two of your users, one of them an agent. Change it into anything your app needs.
4. **The package routes.** `app.use( '/api/realtime', … )` is the one line for them. It gives the package the user of the session. The page connects through them, and the call rings and is answered through them. `/api/realtime` is only the usual address: any other works, as [any address you like](how-it-works.md#any-address-you-like) shows.
5. **Your token route.** `/api/call-token` runs your check for the user of the session and the one they call, and answers `realtime.callToken( me, to, { type } )`, or 403 to refuse. A token rings once, so the button asks for a new one for each call.
6. **Signing in.** Two buttons, Ben and Ann. Your app has its own sign-in instead.
7. **The button and the note.** `CALL_BUTTON` is the `<call-button>` element: a button that calls user `34`, Ann, with a token from `token-url`, your route. `ON_DUTY` is the note Ann sees instead: her page only waits for calls.
8. **The page.** `realtime.config( me )` is what the page needs to connect as the signed-in user, and goes into the page as JSON. Then the button for Ben, or the note for Ann.

## Step 4. The page script

The file `page.js`. It runs on every page, for Ben and for Ann:

```js title="page.js"
// The script of every page: it connects,
// then starts the call screen, which rings here and shows the call.
import { connect } from '@wordplus/realtime';

// The settings your server wrote into the page: the user and their keys.
const settings = JSON.parse(document.getElementById('realtime').textContent);

const rt = await connect(settings);
await rt.callScreen();
```

- **`connect()`** connects the page as the signed-in user, with the settings your server wrote into the page.
- **`rt.callScreen()`** starts the call screen. For Ann, it rings when someone calls. For Ben, it makes the `<call-button>` button work: a press asks your route for a token, then calls with it, and shows the call window. A page without it neither calls nor rings.

## Step 5. Install and start

```bash
npm install
npm start
```

`npm install` also bundles `public/page.js`. `npm start` prints `http://localhost:3000`. Your folder now holds:

```
support-calls/
├── .env
├── package.json
├── page.js
├── server.mjs
└── public/          made by npm install: page.js bundled
```

## Step 6. Make the call

1. **Be Ben.** Open `http://localhost:3000` in a normal window, and press Ben, a customer. You see Hello, Ben, and the Call support button.
2. **Be Ann.** Open `http://localhost:3000` in a private window, and press Ann, a support agent. You see Hello, Ann. You are on duty.
3. **Call.** As Ben, press Call support, and let the browser use the camera. Ben sees the call window, calling Ann.
4. **It rings.** The window of Ann shows Ben calling, with a green button to answer and a red one to decline.

![Ben has pressed a video call button: his browser shows the call window calling Ann, over his own camera, and the browser of Ann rings, with buttons to answer and decline](https://docs.wordplus.cloud/img/apps/calls-ringing.webp)

5. **Answer.** As Ann, press the green button, and let the browser use the camera. Each window shows the other person, and their own camera in a corner.
6. **Hang up.** Move the pointer over the call, and press the red button. The call ends in both windows.

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

## What happened

Each step of [how it goes](#how-it-goes), and the code that did it:

| Step | What happened | The code |
|---|---|---|
| 1 | Ben pressed Call support | `<call-button to="34" token-url="/api/call-token">` in the page of Ben, from `server.mjs` |
| 2 | His page asked your route for a token | the call screen, started by `connect()` and `rt.callScreen()` in `page.js`, with a GET to `/api/call-token?to=34&type=video` |
| 3 | Your route made its check, and answered a token | `app.get( '/api/call-token', … )`: `mayCall()`, then `realtime.callToken( me, to, { type } )` |
| 4 | It rang for Ann | `rt.callScreen()` in the page of Ann |
| 5 | Ann answered, with no token of her own | the call screen, through `app.use( '/api/realtime', realtime.node( … ) )` |
| 6 | They talked | WordPlus Cloud, directly or through our relays or media servers |

More on steps 2 to 4: [how a page asks your server](how-it-works.md#how-a-page-asks-your-server).

## If it does not work

- **Nothing rings for Ann:** her window must be open on `http://localhost:3000`, signed in as Ann. The call screen of `page.js` is what rings, so a page without it never rings.
- **Ben sees You cannot make this call:** your route said no, with a 403. Both must be your users, and one of the two an agent.
- **No page connects:** `.env` must hold the key and secret of your app, and `http://localhost:3000` must be among its addresses in WordPlus Cloud.
- **No camera:** a browser gives the camera only to `https` pages and to `localhost`.

## Into your own app

The same four pieces, with three changes:

1. **Your users.** `USERS`, `isAgent()` and `mayCall()` read your own database.
2. **Your sign-in.** In `realtime.node( ( req ) => … )` and in your token route, give the user your own sign-in found, in place of `req.session.user`.
3. **The agent to call.** Your server writes into `to` the agent your app gives this customer, or one on duty ([variations](#variations)).

On another stack, the guide of each sets up the package routes and the settings in the page: [Next.js](../nextjs/getting-started.md), [Express](../express/getting-started.md), [Laravel](https://docs.wordplus.cloud/laravel/getting-started/), [PHP](https://docs.wordplus.cloud/php/getting-started/), [Django](https://docs.wordplus.cloud/django/getting-started/), [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/), [Flask](https://docs.wordplus.cloud/flask/getting-started/) and [WordPress](https://docs.wordplus.cloud/wordpress/getting-started/). Your token route is then the same in each language. Finding the user and `isAgent()` are yours, from your session and your data:

**Node**

```ts
// Your route, GET /api/call-token?to=34&type=video. Express here, the same in any framework.
app.get( '/api/call-token', async ( req, res ) => {
    const me = userOf( req );
    const { to, type } = req.query;

    // 1. Two of your users, and not the same one.
    if ( ! me || String( me ) === String( to ) ) {
        return res.sendStatus( 403 );
    }

    // 2. One of them is an agent.
    if ( ! ( await isAgent( me ) ) && ! ( await isAgent( to ) ) ) {
        return res.sendStatus( 403 );
    }

    // The token that lets this user call that one.
    res.json( { token: await realtime.callToken( me, to, { type } ) } );
} );
```

**PHP**

```php
// Your route, GET /api/call-token?to=34&type=video. Laravel: the same in a route, with Realtime::callToken().
$me = current_user_id();
$to = $_GET['to'] ?? '';

// 1. Two of your users, and not the same one.
if ( ! $me || (string) $me === (string) $to ) {
    http_response_code( 403 );
    exit;
}

// 2. One of them is an agent.
if ( ! is_agent( $me ) && ! is_agent( $to ) ) {
    http_response_code( 403 );
    exit;
}

// The token that lets this user call that one.
header( 'Content-Type: application/json' );
echo json_encode( [ 'token' => $realtime->callToken( $me, $to, [ 'type' => $_GET['type'] ?? null ] ) ] );
```

**Python**

```python
# Your route, GET /api/call-token?to=34&type=video. Flask here, the same in any framework.
@app.get("/api/call-token")
def call_token():
    me = session.get("user_id")
    to = request.args["to"]

    # 1. Two of your users, and not the same one.
    if not me or str(me) == str(to):
        abort(403)

    # 2. One of them is an agent.
    if not is_agent(me) and not is_agent(to):
        abort(403)

    # The token that lets this user call that one.
    return {"token": realtime.call_token(me, to, type=request.args.get("type"))}
```

- **A token is for its user,** made as they press the button, and rings once. Ann answers with no token of her own.
- **On WordPress,** its package decides who may call by a rule of its own ([WordPress calls](https://docs.wordplus.cloud/wordpress/calls/)).
- **Any user id** your app gives works: numbers, and ids of text such as UUIDs or Auth0 ids, which is why the route compares them as text ([calls](../calls.md)).
- **Adding a colleague** once the call runs is your route again, with `into` ([adding people](../calls.md#adding-people)).

## Your own interface instead

The call screen and the button are optional. The same flow with screens of your own: `rt.startCall( token )` with a token from your route, and `rt.onIncomingCall()` on the page that rings, or `useCall()` in React.

On the page of Ben, steps 1 to 3. `callToken()` asks your route, as the button did:

**Browser**

```js
// Asks your route for a token: GET /api/call-token, as above.
async function callToken( to ) {
    const answer = await fetch( '/api/call-token?type=video&to=' + to );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token;
}

callButton.onclick = async () => {
    const call = await rt.startCall( await callToken( 34 ) );   // rings Ann
    await call.setCamera( true );
    await call.setMicrophone( true );
    call.on( 'state', ( state ) => showState( state ) );    // ringing, connecting, connected, reconnecting, ended
    call.on( 'remote', ( remote ) => {
        remote.camera?.attach( theirVideo );                // a <video>
        remote.microphone?.attach( theirAudio );            // an <audio>: the voice of Ann
    } );
    hangUp.onclick = () => call.end();                      // step 7
};
```

**React**

```tsx
import { AudioTrack, useCall, VideoTrack } from '@wordplus/realtime/react';

// Asks your route for a token: GET /api/call-token, as above.
async function callToken( to: number ) {
    const answer = await fetch( '/api/call-token?type=video&to=' + to );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );

    return ( await answer.json() ).token as string;
}

export function CallSupport() {
    // The call on this component: placed with start( token ), its camera and microphone opened.
    const { call, state, remote, start, end } = useCall();

    if ( ! call ) return <button onClick={ async () => start( await callToken( 34 ) ) }>Call support</button>;
    return (
        <>
            <p>{ state }</p>
            <VideoTrack track={ remote?.camera } />
            <AudioTrack track={ remote?.microphone } />
            <button onClick={ end }>Hang up</button>
        </>
    );
}
```

On every page of Ann, steps 4 and 5:

**Browser**

```js
await rt.onIncomingCall( ( incoming ) => {
    showRinging( incoming.info.name, incoming.type );                       // step 4
    answerButton.onclick = async () => showCall( await incoming.accept() ); // step 5, with no token of her own
    declineButton.onclick = () => incoming.decline();
} );
```

**React**

```tsx
import { useCalls } from '@wordplus/realtime/react';

// Step 4: each call ringing for Ann now, kept current. Step 5: Answer, with no token of her own.
export function Ringing() {
    const { incoming } = useCalls();

    return (
        <>
            { incoming.map( ( ring ) => (
                <div key={ ring.id }>
                    { ( ring.info as { name: string } ).name } calls you
                    <button onClick={ async () => showCall( await ring.accept() ) }>Answer</button>
                    <button onClick={ () => ring.decline() }>Decline</button>
                </div>
            ) ) }
        </>
    );
}
```

- **Adding a colleague:** your route answers a token with `into: call.ref`, and `await call.add( token )` rings them in. Both sides get `group`, the call going on as a group call ([calls](../calls.md#adding-people)).
- **A connection may drop for 45 seconds** during a call and come back without ending it.
- **Why it ended:** `call.endReason`, such as `hangup` or `no_answer` ([calls](../calls.md#why-a-call-ended)).

## Variations

- **Voice only,** for a helpline: `type="audio"` on the button, and no camera asked for.
- **A time limit** of your own: `( await rt.calls() ).on( 'call', ( call ) => setTimeout( () => call.end(), 20 * 60 * 1000 ) )`.
- **The agent on duty:** a presence room the agents join while they work, and the button calls one of them, shown while someone is in it. Your route checks that the one called is on duty ([who is online and who is here](online.md)).
- **On phones:** the iOS and Android apps ring and answer the same calls, with the native call screen of Better Messages ([iOS](https://docs.wordplus.cloud/ios/calls/), [Android](https://docs.wordplus.cloud/android/calls/)), and a Capacitor app does as a browser does ([mobile apps](../mobile/calls.md)).
- **A whole site, in Next.js:** calls between two in the chat of a dating site ([dating site](../nextjs/dating-site.md#the-chat-and-its-video-date)), and between colleagues of a team intranet ([team intranet](../nextjs/team-intranet.md#a-conversation-with-a-colleague-and-its-call)).
