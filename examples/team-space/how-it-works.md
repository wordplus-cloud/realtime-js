<!--
"How this page works" under the demo's pages (TEAM_DEMO=1): a card for each part of a page, in short steps. Each step
shows the site's own code, a function at a time, with what happens on the page open now in its comments. Each __name__
is one of those values, filled in by the page (app/how-it-works-cards.tsx) from /api/how-it-works: put one only in a
comment or a string. Lines may be left out (// … says so), and so may Tailwind's classes, but every line of code shown
is in the file named above it: scripts/how-it-works.mjs checks it as it turns this file into lib/how-it-works.json,
before `dev` and `build`. A block that isn't the site's code, such as the last step's run of it all, takes note="…" in
place of title="…".

Each card is `## key: Title`, then a paragraph about it, then its steps: a paragraph each, with the code under it. Its
last step, "All together", follows one run through the functions above it, in order, with this page's values.
-->

## teams: Your teams and the meetings on now

Your teams, and which of their meetings are on now, with how many in each. This server keeps no table of the meetings: WordPlus Cloud knows which group calls are on, and the database what each team is.

`meetingsNow` asks WordPlus Cloud for the group calls on now, and keeps the meeting rooms, `meeting:` and a team's number, with how many are in each.

```ts title="lib/realtime.ts"
export async function meetingsNow(): Promise<Map<string, number>> {
    const now = new Map<string, number>();
    for (const call of await realtime.listCalls()) {
        // On now: __meetings_now__
        const team = teamIn(call.name);
        if (team) now.set(team, call.people);
    }
    return now;
}
```

The Teams page puts them with the teams you are in, made for each request, as what is on is of this moment.

```tsx title="app/(app)/teams/page.tsx"
async function MyTeams() {
    const me = (await currentUserId())!;
    const [teams, now] = await Promise.all([teamsOf(me), meetingsNow()]);
    const on = teams.filter((team) => now.has(team.id));
    // … "Meetings on now" above, then a card for each team
}
```

The page keeps itself current. Every page joins the room `meetings`. When someone comes into a meeting or leaves it, WordPlus Cloud tells this server by webhook, the server tells the room, and the page asks for its lists again, with no reload.

```ts title="lib/realtime.ts"
realtime.room('meetings', async (user) => user !== null);

realtime.on('group.left', async ({ call }) => {
    if (teamIn(call)) await realtime.to('meetings').emit('changed');
});
// … and the same in the group.joined webhook ("A meeting starting")
```

```tsx title="app/(app)/live.tsx"
export function MeetingsLive() {
    const router = useRouter();
    useRoom('meetings', { changed: () => router.refresh() });
    return null;
}
```

All together, as this page was made:

```ts note="All together"
// The Teams page, for __me_name__:
// app/(app)/teams/page.tsx
    const [teams, now] = await Promise.all([teamsOf(me), meetingsNow()]);
    // teams: __my_teams__

// lib/realtime.ts
    for (const call of await realtime.listCalls()) {
        const team = teamIn(call.name);
    // on now: __meetings_now__

// app/(app)/teams/page.tsx
    const on = teams.filter((team) => now.has(team.id));
    // __meetings_on__
```

## meeting: A team's meeting room

Each team has a meeting room, a group call on WordPlus Cloud's media servers, for the members of the team. Its lead hosts it.

Who may come in is this site's own logic: the members of the team, and the lead as its host, with mute and remove on everyone's tile. A page asks this server for a token, and the token says what this colleague may do in the call.

```ts title="lib/realtime.ts"
export async function meetingToken(user: string, team: string): Promise<string | null> {
    if (!(await isMember(team, user))) return null;                // __me_name__ is in __team_name__
    const lead = (await teamOf(team))?.lead === user;
    return realtime.groupCallToken(user, meetingOf(team), { admin: lead });   // __answer__
}
```

The page asks for it at a route of the site, which builds the name of the meeting from the team's number, and answers the token, or 403.

```ts title="app/api/meeting-token/route.ts"
export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    const me = await currentUserId();                // '__me_id__'
    const token = me && (await meetingToken(me, id));
    if (!token) return new Response(null, { status: 403 });
    return Response.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
```

The meeting room on the team's page: who is in it now, from WordPlus Cloud, and the button to start it or join it. Opened while the meeting is on, the page joins it at once, with `join` on its `CallSpot`, your camera and microphone off until you turn them on from the call's controls. Once in, the call shows in its place, in the page.

```tsx title="app/(app)/teams/[id]/page.tsx"
    const [people, channels, inIt] = await Promise.all([peopleIn(id), channelsOf(id), inMeeting(id)]);
    // in the meeting now: __in_meeting__
```

```tsx title="app/(app)/teams/[id]/meeting.tsx"
export function MeetingRoom({ id, room, team, host, people }: Props) {
    const tokenUrl = `/api/meeting-token?id=${id}`;
    // On as the page opens: joined at once (CallSpot's join), the camera and microphone off until this colleague turns
    // them on. Decided once, so a meeting that starts while the page is open waits for the button, and someone who
    // leaves it or is taken out stays out.
    const [join] = useState(people.length > 0 ? ('video' as const) : undefined);
    return (
        <CallSpot call={room} tokenUrl={tokenUrl} join={join} className="h-[32rem] overflow-hidden rounded-2xl bg-stone-900 text-white">
            {/* … who is in it now */}
                <GroupCallButton call={room} tokenUrl={tokenUrl} type="video" title={`${team} meeting`}
                                 className="rounded-full bg-indigo-500 px-6 py-3 font-medium text-white hover:bg-indigo-400">
                    {people.length > 0 ? 'Join the meeting' : 'Start the meeting'}
                </GroupCallButton>
        </CallSpot>
    );
}
```

All together, as __me_name__ comes into the __team_name__ meeting:

```ts note="All together"
// app/(app)/teams/[id]/meeting.tsx: Start the meeting, or Join, asks for a token
// app/api/meeting-token/route.ts
    const token = me && (await meetingToken(me, id));
    // GET /api/meeting-token?id=__team_id__&call=__meeting__&type=video

// lib/realtime.ts
    if (!(await isMember(team, user))) return null;
    return realtime.groupCallToken(user, meetingOf(team), { admin: lead });
    // __answer__

// app/(app)/teams/[id]/meeting.tsx: the call shows here, with __in_meeting__ in it now
```

## channel: A team's channels

Each team has its channels, the conversations of everyone in it, kept by this server.

A channel is a chat of its own, `chat:` and its number, and its members are its team's. One rule lets them in, the rule of every chat here: its members.

```ts title="lib/realtime.ts"
realtime.room(
    'chat:{id}',
    async (user, { id }) => mayChat(user, id),
    {
        history: 50,
        emit: ['message', 'typing', 'reaction', 'read'],
        webhook: ['message', 'reaction'],
    },
);
```

```ts title="lib/team.ts"
export async function membersOf(chat: string): Promise<string[]> {
    if (!isNumber(chat)) return [];
    const team = await teamOfChat(chat);
    const { rows } = team
        ? await db.query(`select user_id::text as id from team_member where team_id = $1`, [team])
        : await db.query(`select user_id::text as id from chat_member where chat_id = $1`, [chat]);
    return rows.map((row) => row.id);
}
```

The page shows the channel with the ready-made conversation window (`<Chat>`), its writers by the team's names and photos, as some may not have been online for days.

```tsx title="app/(app)/teams/[id]/channel.tsx"
export function ChannelChat({ room, name, people }: Props) {
    return (
        <Chat
            room={room}
            people={people}
            placeholder={`Message #${name}`}
            messages={`/api/messages?room=${room}`}
        />
    );
}
```

Each message comes to this server too, by webhook, to be kept, and from the page that sent it (`onSent`), where no webhook arrives: kept once, by its id.

```ts title="lib/realtime.ts"
realtime.on('message', async ({ room, from, data, event_id, at }) => {
    const chat = chatIn(room);
    if (!from || !chat) return;
    const text = String(data.text ?? '');
    await keepAndTell({ id: event_id, chat, from: String(from), text, at });
});
```

All together, as __me_name__ writes in #__channel_name__:

```ts note="All together"
// The page joins __channel_room__:
// lib/realtime.ts
    async (user, { id }) => mayChat(user, id),
// lib/team.ts
    const team = await teamOfChat(chat);
    // the members of __team_name__: __members__

// The message comes back by webhook, or from onSent:
// lib/realtime.ts
    await keepAndTell({ id: event_id, chat, from: String(from), text, at });
```

## started: A meeting starting, and who hears it

When someone starts their team's meeting, the rest of the team hears it at once, on whatever page they are.

WordPlus Cloud tells this server by webhook that someone came into a group call. The first one in starts the meeting, and the server tells the others of the team.

```ts title="lib/realtime.ts"
realtime.on('group.joined', async ({ call, user }) => {
    const team = teamIn(call);
    if (!team) return;
    await realtime.to('meetings').emit('changed');
    const { people, started_at } = await realtime.call(call).get();
    if (people > 1) return;
    const others = (await peopleIn(team)).map((person) => person.id).filter((id) => id !== String(user));
    await realtime.toUser(others).emit('meeting', {
        team,
        name: (await teamOf(team))?.name,
        by: await nameOf(String(user)),
    });
});
```

Each page of the site hears it, and shows a notice that opens the team's page.

```tsx title="app/(app)/live.tsx"
export function Notices() {
    useUserEvent('meeting', (data: MeetingStarted) => {
        if (path === `/teams/${data.team}`) return;
        show(`${data.by} started the ${data.name} meeting`, `/teams/${data.team}`);
    });
}
```

All together, as __me_name__ starts the __team_name__ meeting. The webhook needs the site at an address WordPlus Cloud reaches: on localhost none arrives, and nobody is told.

```ts note="All together"
// WordPlus Cloud sends the webhook: __me_name__ came into '__meeting__'
// lib/realtime.ts
    const { people, started_at } = await realtime.call(call).get();
    // the first one in
    await realtime.toUser(others).emit('meeting', {
    // told: __others__

// Each of them, on whatever page:
// app/(app)/live.tsx
        show(`${data.by} started the ${data.name} meeting`, `/teams/${data.team}`);
    // "__me_name__ started the __team_name__ meeting"
```

## online: Who is online

Who is online now, kept as colleagues come and go, with no request to this server and no table of it.

The page gives WordPlus Cloud the ids it shows, and hears as each comes online or leaves.

```tsx title="app/(app)/people/directory.tsx"
export function Directory({ people }: { people: Person[] }) {
    const { online } = useOnline(people.map((person) => person.id));
    const here = people.filter((person) => online[person.id]);
    const away = people.filter((person) => !online[person.id]);
    // … those online first, each with Message and Call
}
```

How many are online across the site, in the header of every page:

```tsx title="app/(app)/live.tsx"
export function OnlineNow() {
    const { count } = useOnline([], { count: true });
}
```

All together, for __me_name__'s People:

```ts note="All together"
// app/(app)/people/page.tsx: the __people_count__ colleagues of the company, from the database
// app/(app)/people/directory.tsx
    const { online } = useOnline(people.map((person) => person.id));
    // WordPlus Cloud: who of them is online now, then each change as it happens
```

## call: A conversation and its call

A conversation with a colleague, kept by this server, and its call in it, beside the messages.

The first time either of them opens the other's page, their chat is made: a chat of two, known by their ids.

```ts title="lib/team.ts"
export async function chatBetween(me: string, them: string): Promise<string> {
    const pair = [Number(me), Number(them)].sort((a, b) => a - b).join(':');
    await db.query(`insert into chat (pair) values ($1) on conflict do nothing`, [pair]);
    const { rows } = await db.query(`select id::text as id from chat where pair = $1`, [pair]);
    // … its two members
}
```

Its call is named as its room, and both of them may use it. The chat's call buttons ask this server for a token, with the name of the chat, which comes from the page and is checked. A channel has no call of its own: its team meets in its meeting room.

```ts title="lib/realtime.ts"
export async function chatCallToken(user: string, to: string, name: string, type: string | null): Promise<string | null> {
    const chat = chatIn(name);
    if (!chat || !(await isConversation(chat))) return null;
    if (!(await mayChat(user, chat)) || !(await mayChat(to, chat))) return null;
    return realtime.callToken(user, to, { type, name });
}
```

The page shows the ready-made conversation window (`<Chat>`) with its call: their name and the call buttons on top, and the call beside the messages. Opened from Call in People, it calls them as it opens.

```tsx title="app/(app)/people/[id]/chat.tsx"
        <Chat
            room={room}
            to={to}
            name={name}
            avatar={avatar}
            tokenUrl="/api/chat-call-token"
            startCall={start}
        />
```

All together, as __me_name__ calls __them_name__:

```ts note="All together"
// app/(app)/people/[id]/page.tsx
// lib/team.ts
    const { rows } = await db.query(`select id::text as id from chat where pair = $1`, [pair]);
    // their chat: __chat_id__, the room __chat_room__

// app/(app)/people/[id]/chat.tsx: Video on the top bar asks /api/chat-call-token for a token
// lib/realtime.ts
    if (!(await mayChat(user, chat)) || !(await mayChat(to, chat))) return null;
    return realtime.callToken(user, to, { type, name });
    // WordPlus Cloud rings __them_name__ on every page they have open
```
