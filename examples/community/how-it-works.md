<!--
"How this page works" under the demo's pages (CLUB_DEMO=1): a card for each part of a page, in short steps. Each step
shows the site's own code, a function at a time, with what happens on the page open now in its comments. Each __name__
is one of those values, filled in by the page (app/how-it-works-cards.tsx) from /api/how-it-works: put one only in a
comment or a string. Lines may be left out (// … says so), and so may Tailwind's classes, but every line of code shown
is in the file named above it: scripts/how-it-works.mjs checks it as it turns this file into lib/how-it-works.json,
before `dev` and `build`. A block that isn't the site's code, such as the last step's run of it all, takes note="…" in
place of title="…".

Each card is `## key: Title`, then a paragraph about it, then its steps: a paragraph each, with the code under it. Its
last step, "All together", follows one run through the functions above it, in order, with this page's values.
-->

## club: What's on now

The club at a glance: an event live now, the lounges with who is in each, and the channels. This server keeps no table of the calls or the streams: WordPlus Cloud knows which lounges have someone in them and which events are live. Now: __lounges_now__, and live __live_now__.

`loungesNow` asks WordPlus Cloud for the group calls on now, and for each lounge with someone in it, who.

```ts title="lib/realtime.ts"
export async function loungesNow(): Promise<Map<string, string[]>> {
    const now = new Map<string, string[]>();
    for (const call of await realtime.listCalls()) {
        const lounge = idIn(call.name, 'lounge');
        if (!lounge || call.people === 0) continue;
        const { list } = await realtime.call(call.name).get();
        now.set(lounge, list.flatMap((person) => (person.user ? [String(person.user)] : [])));
    }
    return now;
}
```

The page keeps itself current. Every page joins the room `club`. When someone drops into a lounge or leaves it, or an event goes live or ends, WordPlus Cloud tells this server by webhook, the server says so in the room, and every page asks for itself again, with no reload.

```ts title="lib/realtime.ts"
realtime.room('club', async (user) => isMember(user));
// … and in the group.joined, group.left, stream.live and stream.ended webhooks:
    await realtime.to('club').emit('changed');
```

```tsx title="app/(app)/live.tsx"
export function ClubLive() {
    const router = useRouter();
    useRoom('club', { changed: () => router.refresh() });
    return null;
}
```

## channel: Channels and photos

A channel is the whole club's conversation about one thing, with the photos its members share in it. WordPlus Cloud carries the messages, sealed, and never has the photos: this server keeps them, for the club's members alone. This is `__room__`.

One rule says who may read and write: any member, in a channel.

```ts title="lib/realtime.ts"
realtime.room('channel:{id}', async (user, _params, room) => mayWrite(user, room), MESSAGES);
```

The ready-made conversation window (`<Chat>`), with the names and photos of the club for its older messages, and `upload`, this server's route for photos: picked, pasted or dropped on it.

```tsx title="app/(app)/channels/[id]/channel.tsx"
        <Chat
            room={room}
            people={people}
            messages={`/api/messages?room=${room}`}
            upload="/api/files"
            accept="image/jpeg,image/png,image/webp,image/gif"
        />
```

The route asks the room's own rule, with `mayJoin`, and keeps the photo. It takes photos alone: nothing a browser would run.

```ts title="app/api/files/route.ts"
    if (!me || !(file instanceof File) || !/^(channel|chat):\d+$/.test(room) || !(await realtime.mayJoin(room, me))) {
        return Response.json({ error: 'This photo is not for this conversation.' }, { status: 403 });
    }
    if (!KINDS.test(file.type)) return Response.json({ error: 'Photos only: JPEG, PNG, WebP or GIF.' }, { status: 415 });
```

## lounge: Lounges

A lounge is a group call on WordPlus Cloud's media servers that members drop into, by voice or with their cameras, and leave as they like. This is `__call__`, `__kind__`.

This server's own route says who may come in, and answers a token: any member, and a host as its host, with mute and remove on everyone's tile. For __me_name__: __answer__.

```ts title="app/api/lounge-token/route.ts"
    const lounge = await loungeOf(id);
    if (!lounge || !(await isMember(me))) return new Response(null, { status: 403 });
    const token = await realtime.groupCallToken(me!, `lounge:${lounge.id}`, {
        type: lounge.kind,
        admin: await isHost(me),
    });
```

The call shows in the page, where the page puts it, with `CallSpot`. The button asks the route for a token and drops in, by voice or with cameras, the microphone and camera off until the member turns them on from the call.

```tsx title="app/(app)/lounges/[id]/lounge.tsx"
    const tokenUrl = `/api/lounge-token?id=${id}`;
        <CallSpot call={room} tokenUrl={tokenUrl}>
                <GroupCallButton call={room} tokenUrl={tokenUrl} type={kind} title={name}>
                    {people.length > 0 ? 'Drop in' : `Open ${name}`}
                </GroupCallButton>
        </CallSpot>
```

## live: Events live now

The club's events, those live first, then those to come. Every member hears as one goes live, on whatever page they are.

WordPlus Cloud knows which streams are live, and how many watch each: __live_now__.

```ts title="lib/realtime.ts"
export async function liveNow(): Promise<Map<string, number>> {
    const live = new Map<string, number>();
    for (const stream of await realtime.listStreams()) {
        const event = idIn(stream.name, 'event');
        if (event) live.set(event, stream.viewers);
    }
    return live;
}
```

When an event goes live, every member hears it, on whatever page they are:

```ts title="lib/realtime.ts"
realtime.on('stream.live', async ({ stream }) => {
    // …
    const everyone = (await members()).map((person) => person.id).filter((person) => person !== event.host);
    await realtime.toUser(everyone).emit('live', { event: event.id, title: event.title, host: event.hostName });
});
```

## event: An event

An event is a live stream its host goes live in, from their studio, for every member to watch, with its chat beside it. This is `__stream__`, __event_title__ with __host_name__.

This server's own route says who is who, and answers a token: its host, and every member a viewer. For __me_name__: __role__.

```ts title="app/api/event-token/route.ts"
    const event = await eventOf(id);
    if (!event || !(await isMember(me))) return new Response(null, { status: 403 });
    const hosts = me === event.host;
    const token = await realtime.streamToken(me, `event:${event.id}`, {
        role: hosts ? 'host' : 'viewer',
        quality: hosts ? '1080p' : undefined,
        settings: { stage: true, reactions: true },
    });
```

The player and its chat, WordPlus Cloud's ready-made screens, which ask the route for a token, and again as each runs out: the host sees the way to the studio in it.

```tsx title="app/(app)/events/[id]/page.tsx"
            <LiveStream name={`event:${event.id}`} tokenUrl={`/api/event-token?id=${event.id}`} title={event.title} studioUrl={hosts ? `/studio/${event.id}` : undefined} />
```

## stage: On stage

A member raises a hand from the player while the event is live, and the host invites them on stage from the studio, with their camera and microphone: everyone watching sees them beside the host. The token's `stage: true` is all it takes.

The host's studio, a page of its own:

```tsx title="app/(app)/studio/[id]/page.tsx"
        <LiveStream
            name={`event:${event.id}`}
            tokenUrl={`/api/event-token?id=${event.id}`}
            view="studio-page"
            title={event.title}
            url={`/events/${event.id}`}
            backUrl={`/events/${event.id}`}
        />
```

## online: Who is online

Every member of the club, those online first, each a message or a call away.

WordPlus Cloud tells the page who is online as they come and go, with no request to this server.

```tsx title="app/(app)/members/directory.tsx"
    const { online } = useOnline(people.map((person) => person.id));
    const here = people.filter((person) => online[person.id]);
    const away = people.filter((person) => !online[person.id]);
```

## call: A conversation and its call

A conversation between two, with its photos, and its call, which shows in the conversation, beside the messages. This is `__room__`, with __them_name__.

A rule says who may write in it, its two, and this server's own route who may call in it, both of them, with the conversation's name the chat sends.

```ts title="lib/realtime.ts"
realtime.room('chat:{id}', async (user, _params, room) => mayWrite(user, room), MESSAGES);
```

```ts title="app/api/chat-call-token/route.ts"
    if (!me || !idIn(name, 'chat') || !(await mayWrite(me, name)) || !(await mayWrite(to, name))) {
        return new Response(null, { status: 403 });
    }
    return Response.json({ token: await realtime.callToken(me, to, { type: ask.get('type'), name }) });
```

The ready-made conversation window (`<Chat>`), with the other one on top and their call in it (`to` and `tokenUrl`), and photos (`upload`):

```tsx title="app/(app)/members/[id]/chat.tsx"
        <Chat
            room={room}
            to={to}
            name={name}
            avatar={avatar}
            tokenUrl="/api/chat-call-token"
            startCall={start}
            upload="/api/files"
        />
```
