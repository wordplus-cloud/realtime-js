# Live streaming

One person live to everyone who opens the page: a launch, a class, a talk, a concert. The host goes live from the browser, a phone or OBS, viewers watch without signing in, those who sign in write in the chat and react, and moderators keep the chat tidy. The player, the chat and the studio of Easy Stream do all of it with one element.

This page builds it with you from an empty folder: a small Node.js app where Ann goes live, and Ben watches and writes in the chat, as does anyone who opens the page, signed in or not. Every file is here in full, and you run it in three browser windows at the end. Then [your own app](#into-your-own-app) changes three things.

## How it goes

Ann goes live, user `34` in your app. Ben watches, user `42`. A visitor has not signed in.

1. **Ann opens the page.** It holds the live stream `live:1`. There is nothing to create first: the stream is there for whoever opens its name, and waits until its host goes live.
2. **Her page asks your server** who she is in the stream: the SDK sends a request to `/api/realtime/calls` on your own server, with her usual cookie. It is your own route, not ours: WordPlus Cloud never sees this request.
3. **Your server runs your rule,** which makes Ann the host, and signs the answer with your secret. Her page shows the studio: her camera before she goes live, and Go live.
4. **Ben and the visitor open the same page.** Your rule makes them viewers: they see the player, waiting for the stream to start, and its chat.
5. **Ann presses Go live.** Everyone on the page sees and hears her at once.
6. **Ben writes in the chat,** and Ann reads it in her studio. The visitor watches and reads, and signs in to write.
7. **Ann presses End stream.** It ends for everyone. She may go live again later under the same name.

You write none of the requests of steps 2 and 3: the SDK in the page and the WordPlus package on your server make them. You write the rule, one line for the route, and a page with the stream, as below.

## What you need

- **Node.js 22** or newer.
- **An app in WordPlus Cloud.** Apps are in early access, so first [ask for it](https://www.wordplus.cloud/contact). Then in your account, go to Apps, then Add app, and give it the address `http://localhost:3000`. You get its **key** and its **secret** ([getting started](../getting-started.md#1-your-app-in-wordplus-cloud)).
- **Three browser windows:** a normal window, a private one, and one of another browser, for Ann, Ben and the visitor.

## Step 1. Make the project

Make a folder, and in it the file `package.json`:

```bash
mkdir live-streaming
cd live-streaming
```

```json title="package.json"
{
  "name": "live-streaming",
  "private": true,
  "type": "module",
  "scripts": {
    "postinstall": "npm run build",
    "build": "esbuild page.js --bundle --format=esm --target=es2022 --outfile=public/page.js",
    "start": "node --env-file-if-exists=.env server.mjs"
  },
  "dependencies": {
    "@wordplus/realtime": "^1.0.0",
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
- **`WORDPLUS_SECRET`** is its secret. It stays on your server, and signs every answer of your rule.
- **`WORDPLUS_LOCAL_KEY`** is a key of your own, which seals what goes through WordPlus Cloud. Make one with `openssl rand -hex 32`.
- **`SESSION_SECRET`** signs the session cookie of this example: any long random string.

## Step 3. The server

The file `server.mjs`. Read it from the top: each part has a comment, and the notes under it say more.

```js title="server.mjs"
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
    site: process.env.WORDPLUS_SITE,
    secret: process.env.WORDPLUS_SECRET,
    localKey: process.env.WORDPLUS_LOCAL_KEY,
    // The name the others see in the chat of the stream.
    profile: (id) => (USERS[id] ? { name: USERS[id].name } : null),
});

// The rule: who is who in a live stream, such as live:1.
// It runs each time someone opens the stream.
realtime.streams('live:{id}', (user) => {
    // 1. A visitor who is not signed in watches, and signs in to write.
    if (user === null) return 'viewer';

    // 2. Ann hosts: she goes live, and ends the stream.
    if (user === HOST) return 'host';

    // 3. Everyone else watches, and writes in the chat.
    return 'viewer';
}, { reactions: true });

const app = express();

// Who is signed in, kept in a session cookie.
// Your app has its own sign-in: this stands in for it.
app.use(session({
    secret: process.env.SESSION_SECRET || 'change me',
    resave: false,
    saveUninitialized: false,
}));

// The route the page asks before it opens the stream, /api/realtime/calls,
// and the others the package answers, for the user of the session.
app.use('/api/realtime', realtime.node((req) => req.session.user ?? null));

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
const STREAM = `<live-stream name="live:1" title="Live with Ann">
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
```

What each part does:

1. **Your users.** Ann and Ben, and who hosts: Ann. In your app, they come from your database.
2. **The WordPlus package.** `createRealtime()` takes your keys, where the page finds the browser files, and `profile`: the name the others see in the chat.
3. **The rule.** `realtime.streams()` is called once, for every live stream whose name fits `live:{id}`. It runs each time someone opens the stream, and gives them a role: a viewer for a visitor, whose `user` is `null`, the host for Ann, and a viewer for everyone else. `reactions: true` lets viewers send hearts and the like over the picture.
4. **The route.** `app.use( '/api/realtime', … )` is the one line that answers the page when it asks before opening the stream (step 2 of [how it goes](#how-it-goes)). It gives the package the user of the session, or nobody for a visitor, and the package runs your rule. `/api/realtime` is only the usual address: any other works, as [any address you like](how-it-works.md#any-address-you-like) shows.
5. **Signing in.** Two buttons, for Ann and Ben, and a link to watch without signing in. Your app has its own sign-in instead.
6. **The stream.** `STREAM` is the `<live-stream>` element: the player and its chat for everyone, and for the host the studio, with Go live and End stream.
7. **The page.** It is for anyone: `realtime.config( me )` is what the page needs to connect as the signed-in user, or as a visitor when `me` is `null`, and goes into the page as JSON. Then the stream.

## Step 4. The page script

The file `page.js`:

```js title="page.js"
// The script of the page: it connects, then starts the live streams,
// which draw the player, its chat and, for the host, the studio.
import { connect } from '@wordplus/realtime';

// The settings your server wrote into the page: the user and their keys.
const settings = JSON.parse(document.getElementById('realtime').textContent);

const rt = await connect(settings);
await rt.streamScreen();
```

- **`connect()`** connects the page as the signed-in user, or as a visitor, with the settings your server wrote into the page.
- **`rt.streamScreen()`** starts the live streams. It draws the `<live-stream>` element: for Ann the studio, and for everyone else the player and the chat.

## Step 5. Install and start

```bash
npm install
npm start
```

`npm install` also bundles `public/page.js`. `npm start` prints `http://localhost:3000`.

## Step 6. Go live

1. **Be Ann.** Open `http://localhost:3000/login` in a normal window, and press Ann, who goes live. You see Live with Ann, Hello, Ann, and the studio, with Turn on camera and microphone.
2. **Be Ben.** Open `http://localhost:3000/login` in a private window, and press Ben, who watches. You see the player, waiting for the stream, and its chat.
3. **Be a visitor.** Open `http://localhost:3000` in another browser, and do not sign in. You see the player, and Sign in to write in the chat.
4. **Go live.** As Ann, press Turn on camera and microphone, let the browser use them, then press Go live. Ben and the visitor see and hear her, marked live.
5. **Write.** As Ben, write Can you show that again? in the chat, and press Send. Ann reads it beside her picture.
6. **End.** As Ann, press End stream, then End for everyone. Ben and the visitor see This stream has ended.

## What happened

Each step of [how it goes](#how-it-goes), and the code that did it:

| Step | What happened | The code |
|---|---|---|
| 1, 4 | Ann, then Ben and the visitor, opened the page | `<live-stream name="live:1">` in the page, from `server.mjs` |
| 2 | Their pages asked your server | the SDK, started by `connect()` and `rt.streamScreen()` in `page.js`, posting to `/api/realtime/calls` |
| 3 | Your server ran your rule, and signed the role of each | `app.use( '/api/realtime', realtime.node( … ) )`, then `realtime.streams( 'live:{id}', … )` |
| 5 | Ann went live | the studio of `<live-stream>`, on the media servers of WordPlus Cloud |
| 6 | Ben wrote in the chat | the chat of `<live-stream>`, for viewers who signed in |
| 7 | Ann ended it for everyone | End stream, in her studio |

More on steps 2 and 3: [how a page asks your server](how-it-works.md#how-a-page-asks-your-server).

## If it does not work

- **Ann sees no studio, only the player:** your rule did not make her the host. Sign in as Ann, user `34`.
- **The player of Ben keeps waiting:** Ann has not pressed Go live yet.
- **No page connects:** `.env` must hold the key and secret of your app, and `http://localhost:3000` must be among its addresses in WordPlus Cloud.
- **No camera:** a browser gives the camera only to `https` pages and to `localhost`.

## Into your own app

The same pieces, with three changes:

1. **Who hosts.** `HOST` becomes who hosts this stream, from your database.
2. **Your sign-in.** In `realtime.node( ( req ) => … )`, give the user your own sign-in found, in place of `req.session.user`.
3. **Your streams.** Each stream has a name of its own, `live:` and its id, as `live:1` here: one for each event, channel or class of your app.

On another stack, the guide of each sets up the route and the settings in the page: [Next.js](https://docs.wordplus.cloud/nextjs/getting-started/), [Laravel](https://docs.wordplus.cloud/laravel/getting-started/), [Django](https://docs.wordplus.cloud/django/getting-started/), [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/) and [WordPress](https://docs.wordplus.cloud/wordpress/getting-started/). A fuller rule, in each language, also lets your moderators keep the chat, and makes the host go live in 1080p with a shared screen:

**Node**

```ts
realtime.streams( 'live:{id}', async ( user, { id } ) => {
    // 1. A visitor watches.
    if ( user === null ) return 'viewer';

    // 2. The host, with a camera, a microphone and a shared screen, in 1080p.
    if ( await isHostOf( id, user ) ) {
        return { role: 'host', src: [ 'camera', 'microphone', 'screen' ], quality: '1080p' };
    }

    // 3. Your moderators keep the chat.
    if ( await isModerator( user ) ) return { role: 'viewer', mod: true };

    // 4. Everyone else watches and writes.
    return 'viewer';
}, { reactions: true, chat: { offline: 'closed', links: false } } );
```

**PHP**

```php
$realtime->streams( 'live:{id}', function ( $user, array $p ) {
    // 1. A visitor watches.
    if ( null === $user ) {
        return 'viewer';
    }

    // 2. The host, with a camera, a microphone and a shared screen, in 1080p.
    if ( is_host_of( $p['id'], $user ) ) {
        return [ 'role' => 'host', 'src' => [ 'camera', 'microphone', 'screen' ], 'quality' => '1080p' ];
    }

    // 3. Your moderators keep the chat.
    if ( is_moderator( $user ) ) {
        return [ 'role' => 'viewer', 'mod' => true ];
    }

    // 4. Everyone else watches and writes.
    return 'viewer';
}, [ 'reactions' => true, 'chat' => [ 'offline' => 'closed', 'links' => false ] ] );
```

**Python**

```python
def live_role(user, p):
    # 1. A visitor watches.
    if user is None:
        return "viewer"

    # 2. The host, with a camera, a microphone and a shared screen, in 1080p.
    if is_host_of(p["id"], user):
        return {"role": "host", "src": ["camera", "microphone", "screen"], "quality": "1080p"}

    # 3. Your moderators keep the chat.
    if is_moderator(user):
        return {"role": "viewer", "mod": True}

    # 4. Everyone else watches and writes.
    return "viewer"

realtime.streams("live:{id}", live_role, reactions=True, chat={"offline": "closed", "links": False})
```

**WordPress**

```php
wordplus_realtime()->streams( 'live:{id}', function ( $user_id, array $p ) {
	// 1. A visitor watches.
	if ( 0 === $user_id ) {
		return 'viewer';
	}

	// 2. The host, with a camera, a microphone and a shared screen, in 1080p.
	if ( my_stream_host( (int) $p['id'] ) === $user_id ) {
		return array( 'role' => 'host', 'src' => array( 'camera', 'microphone', 'screen' ), 'quality' => '1080p' );
	}

	// 3. Your moderators keep the chat.
	if ( user_can( $user_id, 'moderate_comments' ) ) {
		return array( 'role' => 'viewer', 'mod' => true );
	}

	// 4. Everyone else watches and writes.
	return 'viewer';
}, array( 'reactions' => true, 'chat' => array( 'offline' => 'closed', 'links' => false ) ) );
```

- **Visitors** watch without signing in, so a link shared anywhere opens the stream.
- **`chat.links: false`** takes links only from those who keep the chat, which keeps spam out.
- **`offline: 'closed'`** closes the chat while the stream is not live.

## The element, in full

```html
<live-stream name="live:1" title="Live with Ann" cover="https://example.com/live-1/cover.jpg"
                 login-url="/login?next=/live/1" sticky></live-stream>
```

```js
await rt.streamScreen();
```

- **The host** sees the studio on the same element: the camera before going live, Go live, OBS, and End stream.
- **`sticky`** keeps the player at the top of a phone while it is live, as the viewer scrolls the page.
- **`login-url`** is where a visitor signs in to write.
- **In parts:** `view="player"` in the page, and `view="chat"` in the side column.

In React, `<LiveStream name="live:1" title="Live with Ann" />`.

## Messages from your server

Your server writes in the chat as the host does, pins a message above it, and slows it down, with no page open:

**Node**

```ts
const show = realtime.stream( 'live:1' );
const message = await show.say( 'Questions are open until 8 pm', { name: 'The team', avatar: 'https://example.com/logo.png' } );
await show.pin( message.id );          // shown above the chat for everyone
await show.slow( 10 );                 // one message every 10 seconds each, while questions pour in
```

**PHP**

```php
$show = $realtime->stream( 'live:1' );
$message = $show->say( 'Questions are open until 8 pm', 'The team', 'https://example.com/logo.png' );
$show->pin( $message['id'] );
```

**Python**

```python
show = realtime.stream("live:1")
message = show.say("Questions are open until 8 pm", "The team", "https://example.com/logo.png")
show.pin(message["id"])
```

**WordPress**

```php
$show    = wordplus_realtime()->stream( 'live:1' );
$message = $show->say( 'Questions are open until 8 pm', 'The team', 'https://example.com/logo.png' );
if ( ! is_wp_error( $message ) ) {
	$show->pin( $message['id'] );
}
```

`realtime.stream( 'live:1' ).get()` gives how many watch and the peak, and `people()` who of the signed-in viewers watches.

## A player of your own

```js
const calls = await rt.calls();
const show = await calls.stream( 'live:1' );

show.watch( player );                                                    // the picture and its sound
show.on( 'viewers', ( n ) => ( watching.textContent = n + ' watching' ) );
show.on( 'message', ( m ) => addLine( m.from.name, m.text ) );
heart.onclick = () => show.react( '❤️' );
```

## Variations

- **A launch, a class, a concert or a match:** the same element, with the name of each stream.
- **Several hosts,** such as a host and a guest: guests on stage ([interviews and questions on stage](interviews.md)).
- **Only for some:** members, ticket holders or students ([members-only streams](members-only.md)).
- **From OBS** for a studio camera: `show.ingest()` gives the address and key, in the studio as well ([live streams](../streams.md#going-live)).
- **Credits:** up to 50 viewers at once are unmetered with 1,000 connections, and each viewer above takes a credit a minute. Each viewer holds one of the connections of your app ([limits](../limits.md)).
