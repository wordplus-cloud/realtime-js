# Live streams in Next.js

One person presents live to everyone watching: the picture, a chat beside it, reactions, and the count of who watches. The host goes live from the browser, a phone or OBS. Viewers may be signed in or not.

## Who is who

Your server declares streams beside its rooms and calls, in `lib/realtime.ts`. The rule says who each person is in the stream:

```ts
// The show of the shop, show:mugs: Ann presents it, and everyone else watches and writes in its chat, signed in or not.
realtime.streams('show:{id}', (user, { id }) => {
    if (id !== 'mugs') return false;
    return user === ANN ? 'host' : 'viewer';
}, { reactions: true });
```

- **The answer:** `false`, `'host'` or `'viewer'`, or `{ role, info, chat, mod, src, quality }` for more: what others see of them, whether they write in the chat (`write` or `read`), whether they keep it, and what the host sends.
- **A visitor who is not signed in** comes with `user` null, and may only be a viewer.
- **The settings of the stream**, the third argument: `reactions`, `people` and `chat: { offline, links, fresh }` ([live streams in depth](../streams.md#who-is-who)).

The realtime route (`app/api/realtime/[...path]/route.ts`) answers streams too: nothing more to add.

Your server hears each stream go live and end by [webhook](sending.md#webhooks): `stream.live` and `stream.ended`, with its name in `stream`, and `started_at` and `ended_at` in milliseconds.

## The page

Optional, as every ready-made part: [a screen of your own](#a-screen-of-your-own) below draws the stream with no element.

The stream drawn ready: its player with the chat beside it, and the studio where the host goes live.

```tsx
'use client';
import { LiveStream } from '@wordplus/realtime/react';

export function Show() {
    return <LiveStream name="show:mugs" title="The new mugs" />;
}
```

- **The host** sees the studio in it: the camera and microphone, the picture before going live, Go live and End stream. Everyone else sees the player, how many watch, and the chat.
- **Its parts apart**, each where the page wants it: `view="player"`, `chat` (with `height={ 480 }`), `details` or `studio`. The parts of one stream share it.
- **Its props:** `title`, `cover`, `url` (the page to share), `loginUrl` (where a visitor signs in to chat) and `chat={ false }`.
- **Its script**, realtime-ui-streams.min.js, comes from the realtime route with the others, and loads with the first stream on a page.

`Show` in `app/(shop)/shop.tsx` of the API demo is this.

## A screen of your own

`useStream( name )` joins the stream while the component is on the page, and gives its state as it changes:

```tsx
'use client';
import { useCallback } from 'react';
import { useStream } from '@wordplus/realtime/react';

export function Show() {
    const { stream, state, error } = useStream('show:mugs');
    const picture = useCallback((video: HTMLVideoElement | null) => (video && stream ? stream.watch(video) : undefined), [stream]);
    if (error) return <p>The show is not available here ({error}).</p>;

    const live = state?.stream?.state === 'live';
    return (
        <section>
            <video ref={picture} muted playsInline autoPlay />
            {stream?.role === 'host' && !live && <button onClick={() => stream.goLive()}>Go live</button>}
            {live && <p>{state.viewers} watching</p>}
            <ul>{state?.chat.map((m) => <li key={m.id}><strong>{m.from.name}</strong> {m.text}</li>)}</ul>
        </section>
    );
}
```

- **`state`** is everything the screen of the stream draws: its phase, the audience, the chat, the pictures and their layout ([live streams in depth](../streams.md#a-screen-of-your-own)).
- **`stream`** does what the page does: `chat.send( text )`, `react( '❤️' )`, `preview()`, `goLive()`, `end()`.
- **The picture** follows the stream as it changes. `video` stays `muted`, and the sound plays from the page.

With `@wordplus/realtime-ui` in your app, `StreamView` draws the same stream in your React tree ([live streams in depth](../streams.md#drawn-ready)).

## More

Reactions, keeping the chat, OBS, and the refusals: [live streams in depth](../streams.md).
