# Live streams in Express

One person presents live to everyone watching: the picture, a chat beside it, reactions, and the count of who watches. The host goes live from the browser, a phone or OBS, and brings viewers on stage beside them. Viewers may be signed in or not.

How a stream starts, runs and ends is in [how it works](../use-cases/how-it-works.md#live-streams), and [live streaming](../use-cases/live-streaming.md) builds one in Express from an empty folder.

![Ann live in the shop show from its studio, beside Ben watching it: the picture, who is watching, and their chat on both sides. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/streams-live.webp)

## Your first stream

On top of [getting started](getting-started.md), a stream is two pieces: a route of yours that answers a token saying who this person is in it, and the ready-made player, which asks it.

```js
// server.mjs: GET /stream-token?slug=opening-night, which the player asks.
app.get( '/stream-token', async ( req, res ) => {
    const me = req.session.userId ?? null;   // null for a visitor who is not signed in
    const show = await db.shows.findBySlug( req.query.slug );
    if ( ! show ) return res.sendStatus( 403 );

    // Its presenter hosts, a visitor reads the chat, everyone else watches and writes.
    res.json( { token: await realtime.streamToken( me, `show:${ show.slug }`,
        me !== null && me === show.presenterId ? { role: 'host' } : me === null ? { chat: 'read' } : {} ) } );
} );
```

```js
await rt.streamScreen();   // its script, loaded once
```

```html
<live-stream name="show:opening-night" token-url="/stream-token?slug=opening-night" title="Opening night"></live-stream>
```

The presenter opens the page and sees the studio: the camera, the picture before going live, and Go live. Everyone else who opens it, signed in or not, sees the player and the chat, and the picture once it is live. The rest of this page is who may do what, a screen of your own, and [the other way, by a rule](#by-a-rule).

## Who is who

Each stream has a name, as a room has: `show:opening-night` is the show called opening night, one name for each show of your app. The player asks your route for a token, and your route checks whatever it needs and says who this person is in the stream. WordPlus Cloud then holds the page to it, and the SDK holds none of that logic. This route decides:

1. **A show of your shop** opens: any other is refused.
2. **A visitor** who is not signed in watches and reads the chat, and signs in to write.
3. **The presenter** of the show hosts: goes live, brings viewers on stage and keeps the chat.
4. **Your staff** keep the chat beside the host.
5. **Everyone else** watches, writes in the chat, and may raise a hand to come on stage.

Its settings take guests on stage and reactions, and links in the chat only from those who keep it.

```js
// GET /stream-token?slug=opening-night: db is yours.
app.get( '/stream-token', async ( req, res ) => {
    const me = req.session.userId ?? null;   // null for a visitor who is not signed in

    // 1. A show of your shop: any other is refused.
    const show = await db.shows.findBySlug( req.query.slug );
    if ( ! show ) return res.sendStatus( 403 );

    res.json( { token: await realtime.streamToken( me, `show:${ show.slug }`, {
        // 2. A visitor watches and reads the chat, and signs in to write.
        chat: me === null ? 'read' : 'write',
        // 3. Its presenter hosts: goes live, brings viewers on stage and keeps the chat.
        role: me !== null && me === show.presenterId ? 'host' : 'viewer',
        // 4. Your staff keep the chat beside the host. 5. Everyone else watches, writes, and may raise a hand.
        mod: me !== null && await db.users.isStaff( me ),
        // Guests on stage, reactions, and links in the chat only from those who keep it.
        settings: { stage: true, reactions: true, chat: { links: false } },
    } ) } );
} );
```

- **What `streamToken()` takes** beside the user and the name: `role` (`viewer` by default, or `host`), `info` (what everyone sees of them, your `profile` by default), `chat` (`write` or `read`), `mod` (keeps the chat without hosting), `src` (what the host sends: `camera`, `microphone`, `screen`), `quality` (the best picture the host sends: `720p` or `1080p`) and `settings`.
- **A visitor who is not signed in** is `null`, and may only be a viewer: `streamToken()` throws if asked for more. With `chat: 'read'`, the player offers them Log in to chat, to the page its `login-url` names.
- **The settings of the stream** are the same in every token for it: `stage` (guests on stage, on unless `false`), `reactions`, `people` (who sees who is watching: `mods`, the default, or `all`) and `chat: { offline, links, fresh }`: the chat `open` or `closed` while the stream is not live, links from everyone or only from those who keep the chat, and the chat emptied each time it goes live ([live streams in depth](../streams.md#who-is-who)).
- **A token lasts ten minutes,** so the player asks your route again as each runs out, and your route may then say no. To refuse, answer 401 or 403: the player shows no access in place of the stream.

Your server hears each stream go live and end by [webhook](sending.md#webhooks): `stream.live` and `stream.ended`, with its name in `stream`, and `started_at` and `ended_at` in milliseconds.

### By a rule

The other way, for an app that would rather declare who is who once: a rule, a function your server declares for every stream whose name fits a pattern, as it declares rooms and calls. The player then takes the name alone, `<live-stream name="show:opening-night">`, and the routes of `realtime.node()` ask the rule as someone opens the stream. Everything else stays the same: the player and the studio, guests on stage, the chat and who keeps it, your server's `realtime.stream( name )`, the webhooks and credits.

The same five as a rule:

```js
// server.mjs
realtime.streams( 'show:{slug}', async ( user, { slug } ) => {
    // 1. A show of your shop: any other name is refused.
    const show = await db.shows.findBySlug( slug );
    if ( ! show ) return false;

    // 2. A visitor watches and reads the chat, and signs in to write.
    if ( user === null ) return { role: 'viewer', chat: 'read' };

    // 3. Its presenter hosts: goes live, brings viewers on stage and keeps the chat.
    if ( user === show.presenterId ) return 'host';

    // 4. Your staff keep the chat beside the host.
    if ( await db.users.isStaff( user ) ) return { role: 'viewer', mod: true };

    // 5. Everyone else watches, writes, and may raise a hand to come on stage.
    return 'viewer';
}, {
    // Guests on stage, reactions, and links in the chat only from those who keep it.
    stage: true,
    reactions: true,
    chat: { links: false },
} );
```

- **The answer:** `false`, `'host'` or `'viewer'`, or `{ role, info, chat, mod, src, quality }` for more, the same as a token's options.
- **A visitor who is not signed in** comes with `user` null, and may only be a viewer: a rule that gives them more is refused with `no_user`.
- **The settings of the stream** are the third argument, each a value or a function of the parts of its name.

The calls route (`/api/realtime/calls`) asks the rule: nothing more to add to `realtime.node()`.

## The page

Optional, as every ready-made part: [a screen of your own](#a-screen-of-your-own) below draws the stream with no element.

The stream drawn ready: its player with the chat beside it, and the studio where the host goes live.

```html
<live-stream name="show:opening-night" token-url="/stream-token?slug=opening-night" title="Opening night" login-url="/login?next=/shows/opening-night"></live-stream>
```

```js
await rt.streamScreen();    // loads its script, realtime-ui-streams.min.js, once
```

- **`token-url`** is your route ([who is who](#who-is-who)). The player asks it with a GET, with the page's cookies and `stream` added to what you wrote, `?slug=opening-night&stream=show:opening-night`, reads `{ token }`, and asks again as each token runs out. By a rule, `name` alone.

- **The host** sees the studio in it: the camera and microphone, the picture before going live, a shared screen, OBS, the guests, Go live and End stream. Everyone else sees the player, how many watch, and the chat.
- **Guests on stage:** while live, a viewer who is signed in raises a hand from the player, and the host invites them from the studio to come on with their camera and microphone ([guests on stage](#guests-on-stage)).
- **Its parts apart**, each where the page wants it: `view="player"`, `chat` (with `height="480"`), `details` or `studio`, and `<stream-studio name="show:opening-night" token-url="/stream-token?slug=opening-night">` for the studio alone. The parts of one stream share one join, wherever they are, so give each the same `token-url`.
- **A studio page of its own** for the host: `view="studio-page"` on a page of yours, with `url` (where viewers watch) and `back-url`, and `studio-url` on the page viewers watch, which then shows the host the way there in place of the studio ([the studio as a page of its own](../elements.md#the-studio-as-a-page-of-its-own)).
- **Its attributes:** `title`, `cover`, `url` (the page to share), `login-url` (where a visitor signs in to chat), `studio-url`, `back-url`, `chat="off"`, and `sticky` (the player kept at the top of a phone while live).
- **Its words** follow the language of the page: English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew.
- **A refusal** shows its words in place of the stream, such as no access ([refusals](#refusals)).
- **Its script** comes from the realtime routes with the others, and loads with the first stream on a page.

The show card of the API demo is this element, in `showCard()` of `examples/shop/shop.js`.

## A screen of your own

The same stream on markup of your own, with `rt.joinStream()`, given a function that asks your route. A token lasts ten minutes, so the function is asked again as each runs out:

```js
// Asks your route for a token: the route above.
async function showToken() {
    const answer = await fetch( '/stream-token?slug=opening-night' );
    if ( ! answer.ok ) throw new Error( 'Your server said no' );
    return ( await answer.json() ).token;
}

const show = await rt.joinStream( showToken );

show.watch( document.querySelector( '#show video' ) );      // the picture and its sound
show.on( 'state', ( state ) => draw( state ) );            // idle, live, ended
show.on( 'viewers', ( n ) => ( count.textContent = `${ n } watching` ) );
show.on( 'message', ( m ) => addLine( m.from.name, m.text ) );
await show.chat.send( 'Hello!' );
show.react( '❤️' );                                        // any one emoji
```

The page of the host goes live with the camera and ends it:

```js
if ( show.role === 'host' ) {
    await show.preview();    // the camera and microphone, shown in the same video
    await show.goLive();     // everyone watching sees it now
    // …
    await show.end();
}
```

- **By a rule,** `rt.stream( 'show:opening-night' )` in place of `rt.joinStream()`.
- **The picture** follows the stream as it changes: a shared screen, the picture from OBS, else the camera of the host. The `video` stays `muted`, and the sound plays from the page.
- **The host sends** what they turn on: `setCamera()`, `setMicrophone()` and `setScreenShare()`. `goLive()` with nothing on turns the camera and microphone on first.
- **`show.snapshot()`** is everything the screen draws, and `show.subscribe( fn )` hears each change ([live streams in depth](../streams.md#a-screen-of-your-own)).

## Guests on stage

A viewer raises a hand, the host invites them, and they come on stage beside the host with their camera and microphone, for everyone watching: a question from the audience, an interview, a panel. The host may invite anyone signed in who watches, hand raised or not.

The page of a viewer:

```js
raiseButton.onclick = () => show.hand( true );         // show.hand( false ) takes it down
show.on( 'invited', () => offerToJoin() );            // the host asks them on
joinButton.onclick = () => show.joinStage();          // on stage, their camera and microphone live
leaveButton.onclick = () => show.leaveStage();
show.on( 'stage', ( on ) => showOnStage( on ) );      // whether this page is on stage now
```

The page of the host:

```js
show.on( 'hands', ( hands ) => drawHands( hands ) );  // [ { user, name, at } ], the oldest first
await show.invite( hands[ 0 ].user );                  // or anyone watching, by their user id
await show.unstage( 34 );                              // off stage, back to watching
await show.layout( 'speaker' );                        // 'grid', 'speaker', or 'spotlight' with a user id
```

- **A guest** is a viewer on stage: everyone watching sees them in the picture of the stream, by the layout the host chose, and `show.tiles` has each of them with `role: 'guest'`.
- **A guest sends** their camera and microphone, the picture up to 720p.
- **A visitor who is not signed in** watches, and does not come on stage.
- **The stage is on** unless the settings of the stream say `stage: false`, as for a show where nobody but the host appears.
- **The ready-made player** does all of it: Ask to join on stage for a viewer, the hands in the studio with Invite beside each, and the guests with a way to take them off ([interviews and questions on stage](../use-cases/interviews.md)).

## Keeping the chat

The host, and anyone your token or rule made `mod`, keep the chat. In the ready-made player, each message has a menu for them: pin it over the chat, delete it, mute its writer for a minute, 10 minutes, an hour or a day, remove them from the stream, or ban them. The chat settings hold slow mode and Clear the chat, and Who is here lists the signed-in people watching, with the same menu, and those banned, with Let back.

On a screen of your own:

```js
await show.chat.delete( id );
await show.chat.pin( id );              // chat.unpin() takes it down
await show.chat.timeout( user, 600 );   // no writing for 10 minutes, a minute to a day: they go on watching
await show.chat.slow( 30 );             // one message per 30 seconds each, 0 turns it off
await show.chat.clear();                // every message, the pinned one too
await show.kick( user );                // out now: they may come back
await show.ban( user );                 // out, and kept out
```

- **`user`** is the id your token or rule named them by, and `show.snapshot().you.mod` says whether this page keeps the chat.
- **A host is never** put out, banned or timed out.
- **Your server** keeps the chat too, with no page open ([from your server](#from-your-server)): a ban lifted, a timeout lifted, or the stream ended.

## From OBS

A host may stream from OBS, or any encoder that sends over WHIP, in place of the camera: a studio camera, a mixed scene, a game. The studio of the ready-made player has it as Stream from OBS, with the settings that suit a stream, such as a keyframe every second. On a screen of your own:

```js
const { url, key } = await show.ingest();   // ingest( true ) makes a new key and cuts off the old one
```

1. **In OBS**, Settings, Stream: Service **WHIP**, Server the `url`, and Bearer Token the `key`.
2. **Start Streaming in OBS.** Its picture shows in the studio, in place of the camera.
3. **Go live** from the studio, or with `show.goLive()`. Everyone watching sees the picture from OBS.

Only the host gets the key. Keep it as a password: anyone with it streams to the show.

## The sound

A browser plays sound only once the person has clicked or typed on the page, or on the page of your site they came from. A viewer who opens the stream from a link in a new tab sees the picture without its sound, and the ready-made player shows **Turn sound on** over it: the sound starts at that click.

On a screen of your own, the snapshot says so in `audioBlocked`, and `startAudio()` from a click turns it on:

```js
show.on( 'change', ( state ) => ( soundButton.hidden = ! state.audioBlocked ) );
soundButton.onclick = () => show.startAudio();
```

## From your server

Your server reads a stream and keeps its chat as its moderators do, with no page open. Each change reaches everyone watching at once:

```js
await realtime.listStreams();                    // [ { name, started_at, viewers } ], those live now
const show = realtime.stream( 'show:opening-night' );
await show.get();                                // { state, viewers, peak, slow, reactions, pinned }
await show.people();                             // { watching, people: [ { user, name, role, timeout_until? } ] }
await show.chat( { limit: 50 } );                // the last messages, oldest first, up to 200
await show.say( 'We start in five minutes', { name: 'The team', avatar: 'https://example.com/logo.png' } );
await show.deleteMessage( id );                  // clearChat() empties it
await show.pin( id );                            // null unpins
await show.slow( 30 );                           // one message per 30 seconds each, up to 300, 0 turns it off
await show.timeout( user, 600 );                 // untimeout( user ) lifts it
await show.kick( user );                         // out now, they may come back
await show.ban( user );                          // unban( user ) lifts it, bans() lists them
await show.reactions( false );
await show.end();
```

A button of your staff page calls a route of yours, which checks who asks, then speaks in the chat and pins it:

```js
// server.mjs, after express.json()
app.post( '/shows/:slug/announce', async ( req, res ) => {
    if ( ! ( await db.users.isStaff( req.session.userId ) ) ) return res.sendStatus( 403 );

    const show = realtime.stream( `show:${ req.params.slug }` );
    const message = await show.say( req.body.text, { name: 'The team', avatar: 'https://example.com/logo.png' } );
    await show.pin( message.id );
    res.json( { ok: true } );
} );
```

- **A message from your app** shows as a host message, with the name and https picture you give it, up to 500 characters, and nobody may ban it.
- **`user`** is the id your token or rule named them by. A host is never put out or timed out: that is refused with `host`.
- **A timeout** lasts from a minute to a day, and they go on watching.
- **`people()`** lists the signed-in people watching or on stage, and `watching` counts everyone, visitors included.

## Charging for what was watched

An app that charges its users by the minute hears each signed-in person watching or presenting, at its [webhook](sending.md#webhooks):

- **`stream.joined`**, as they start watching while the stream is live: they opened it live, or it went live with them on it.
- **`stream.left`**, as that ends, with `seconds` of live time: they left, or the stream ended.

```js
// server.mjs: each viewer pays for the minutes watched live, the host nothing. charge() is yours, once for each id.
realtime.on( 'stream.left', async ( { id, user, role, seconds } ) => {
    if ( role === 'viewer' && seconds > 0 ) await charge( id, user, Math.ceil( seconds / 60 ) );
} );
```

- **Only live time counts.** A page open before the stream goes live counts from when it goes live. Going live again starts another pair, with the same `watch`.
- **Visitors are not told:** someone who did not sign in has nobody to charge.
- **Each event has an `id`:** an event may come again, so charge once for each.
- **`role`** is the one your token or rule gave them, so the host pays nothing here.

A rule letting a viewer in only with a balance, as your route would, and your server taking out whoever ran out while watching: [charging for calls and streams](../use-cases/charging.md).

## Refusals

`rt.joinStream()`, `rt.stream()` and each action on the stream reject with a code, and the ready-made player shows its words in place of the stream:

| Code | |
|---|---|
| `forbidden` | Your route answered 401 or 403 to the player: a function of your own rejects with what it threw. By a rule: your rule said no, or no pattern matches the name |
| `bad_token` | What your route answered is no token |
| `no_user` | By a rule: your rule gave a visitor who is not signed in more than the place of a viewer |
| `not_included` | The plan of your app does not include live streams |
| `banned` | This user is banned from the stream, until `unban()` lets them back |
| `no_hours` | A new viewer above what your plan includes, while your account has no credits left (below) |
| `not_host` | An action of the host from someone who is not the host |
| `anonymous` | A hand raised by a visitor who is not signed in |
| `no_stage` | A hand or an invitation in a stream whose settings say `stage: false` |
| `not_invited` | `joinStage()` with no invitation |
| `no_encoder` | Going live from OBS before its picture came |
| `read_only`, `slow`, `timeout`, `too_long`, `links`, `not_live` | A message refused: the chat is read-only for them, it came sooner than slow mode allows, they are timed out, it is over 500 characters, a link from someone who does not keep the chat, or the chat is closed while the stream is not live |

**When the credits run out.** Viewers above what your plan includes take credits from your account, a credit a minute each ([limits](../limits.md)). Once the credits of the month, those you bought and what the account may borrow are used, a new viewer above that number is not let in. Everyone watching goes on, the host and the guests come in, and someone signed in who was watching comes back after a reload. Buy credits in your WordPlus Cloud account, or the next month refills them, and new viewers come in again.

## What WordPlus Cloud sees

A stream is for everyone watching it, so its picture and its chat are not encrypted end to end. They are encrypted on the way, and the media servers of WordPlus Cloud see them, as a stream needs.

## More

- Every method, the snapshot and the events of a stream: [live streams in depth](../streams.md) and the [browser reference](../browser.md).
- How a stream starts, runs and ends: [how it works](../use-cases/how-it-works.md#live-streams).
- Use cases: [live streaming](../use-cases/live-streaming.md), [interviews and questions on stage](../use-cases/interviews.md), [members-only streams](../use-cases/members-only.md) and [charging for calls and streams](../use-cases/charging.md).
