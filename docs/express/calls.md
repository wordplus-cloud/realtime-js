# Calls in Express

Calls between two people that ring in every tab and device the callee has open, group calls on the WordPlus Cloud media servers, and the Better Messages call screen: the buttons, the ring and the call window, with no call code. The media of a call is encrypted end to end, with keys your server gives out.

![Ben has pressed a video call button: his browser shows the call window calling Ann, over his own camera, and the browser of Ann rings, with buttons to answer and decline](https://docs.wordplus.cloud/img/apps/calls-ringing.webp)

## Who may call

Your server declares calls as it declares rooms, by pattern:

```js
// Calls between two people, support:34:42: the two it names, one of them staff.
realtime.calls( 'support:{a}:{b}', async ( user, withUser, { a, b } ) => {
    // The two ids in the name, as text: user 42 is "42" there, user_2abc itself.
    const pair = [ a, b ];
    return pair.includes( String( user ) ) && pair.includes( String( withUser ) ) && ( ( await isStaff( user ) ) || ( await isStaff( withUser ) ) );
} );

// The daily meeting: a group call for everyone signed in.
realtime.groupCalls( 'meeting:{id}', ( user ) => user !== null );
```

- **`withUser`** is the other person: whom `user` calls, or who calls `user`. Your server is asked again when the callee answers, with the callee as `user`.
- **The answer:** `false`, `true`, or `{ info, publish, subscribe, admin, hidden }`: what the others see of `user` (your `profile` by default), and in a group call whether they may send and receive, or stay unlisted. `admin` makes them its host: the call screen gives them mute, let speak or make a listener, and remove on the tile of each of the others, which your calls route takes only from a host ([permissions](../permissions.md#group-calls)).
- **The rooms of a group call** can be encrypted end to end too: `realtime.groupCalls( 'meeting:{id}', rule, { encrypt: true } )`. The rooms that come from a call always are.
- **User ids** are yours: a number, or text such as `user_2abc` or `auth0|5f7c`, up to 64 characters with no space. A rule gets an id of digits as a number and any other as text, so compare them with the name as text. An id calls cannot take is refused with `no_user`.

The calls route (`/api/realtime/calls`) is already among the answers of `realtime.node()`.

## The call screen

Optional, as every ready-made part: [your own call interface](#your-own-call-interface) below places, answers and draws calls with no element, and [your own interface](../interface.md#calls) has the whole of it.

Start it on every page where a call may ring, and put buttons where people call from:

```js
await rt.callScreen();   // the ring and the call window, on this page
```

```html
<call-button to="34" call="support:34:42" type="video" name="Ann" avatar="/avatars/ann.svg">Call Ann</call-button>
<room-button room="meeting:daily" type="video" title="Daily meeting">Join the meeting</room-button>
```

- **`{pair}`** in `call` is filled in with the page user and the one called, in order, so whichever of the two calls names the same call: `support:34:42`.
- **A list with call buttons:** `<online-list room="shop" call="support:{pair}">` puts one on the row of every member ([presence](presence.md#ready-made-who-is-online)).
- **Its words** come in English, German, Spanish, French, Italian, Dutch, Polish, Croatian and Hebrew, by the page `<html lang>` or `rt.callScreen( { lang: 'de' } )`. `strings: { … }` changes any of them.
- **Its look** is that of Better Messages, in a shadow root: your styles do not reach in, and its colours are CSS custom properties your page sets.
- **Group calls** load the room client and its encryption worker from the realtime routes, which `config()` names: nothing to add.

![Ann has answered: each browser shows the other person camera, their own in a corner, and the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/calls-connected.webp)

## Adding people

Once a call is up, either side may ring someone else in, and it goes on as a group call. Say whom the call screen offers:

```js
realtime.calls( 'support:{a}:{b}', maySupport, {
    // The staff not in the call, each still asked of maySupport.
    people: async ( user, call ) => ( await staffIds() ).filter( ( id ) => ! call.split( ':' ).slice( 1 ).includes( String( id ) ) ),
} );
```

The screen then shows an Add person button, listing them with the names and pictures from your `profile`.

## Your own call interface

The call screen is built on this, and nothing else:

```js
const calls = await rt.calls();

const call = await calls.start( 'support:34:42', { to: 34, type: 'video' } );
call.on( 'state', ( state ) => show( state ) );   // ringing, connecting, connected, reconnecting, ended
call.on( 'remote', () => call.remote.camera?.attach( video ) );
call.end();

calls.on( 'incoming', async ( incoming ) => {
    const answered = await incoming.accept();     // the call, or the group call it rings into. Or incoming.decline( 'busy' )
} );

const meeting = await calls.group( 'meeting:daily', { type: 'video' } );
meeting.on( 'person', ( person ) => person.camera?.attach( tileFor( person ) ) );
meeting.leave();
```

![Ann, Ben and Cara in one group call from three browsers, with the call screen grid: each sees the other two and their own camera, then the call controls. The cameras are illustrations](https://docs.wordplus.cloud/img/apps/rooms-meeting.webp)

Every event, why a call ended, and what WordPlus Cloud sees: [calls in depth](../calls.md).
