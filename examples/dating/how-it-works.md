<!--
"How this page works" under the demo's pages (SPARK_DEMO=1): a card for each part of a page, in short steps. Each step
shows the site's own code, a function at a time, with what happens on the page open now in its comments: the member
signed in, the one whose page it is, their chat, who is online. Each __name__ is one of those values, filled in by the
page (app/how-it-works-cards.tsx) from /api/how-it-works and from who is online: put one only in a comment or a string.
Lines may be left out (// … says so), and so may Tailwind's classes, but every line of code shown is in the file named
above it: scripts/how-it-works.mjs checks it as it turns this file into lib/how-it-works.json, before `dev` and `build`.
A block that isn't the site's code, such as an answer or the last step's run of it all, takes note="…" in place of
title="…".

Each card is `## key: Title`, then a paragraph about it, then its steps: a paragraph each, with the code under it. Its
last step, "All together", follows one run through the functions above it, in order, with this page's values.
-->

## online: Who is online

Each card shows, live, whether that person is online, and those online come first. No page asks this server: WordPlus Cloud tells every page as people come and go.

The catalog asks which of its people are online, by their ids, with `useOnline`. The answer stays live: open the site as one of them in another window, and watch it change here.

```tsx title="app/(app)/members/catalog.tsx"
export function Catalog({ members }: { members: Member[] }) {
    // The ids of __me_name__'s people: [__ids__]
    const { online } = useOnline(members.map((member) => member.id));
    // online['__p1_id__'] = __online_p1__
    // online['__p2_id__'] = __online_p2__

    const [onlineOnly, setOnlineOnly] = useState(false);
    const here = members.filter((member) => online[member.id]);
    const away = members.filter((member) => !online[member.id]);
    // here: __here__
    // away: __away__

    // Those online first, or only them while "Online now" is ticked.
    const shown = onlineOnly ? here : [...here, ...away];
    // … a card for each of shown, with Online on the photo of those here
}
```

The top bar counts everyone online on the site, with the same hook.

```tsx title="app/(app)/live.tsx"
export function OnlineNow() {
    const { count } = useOnline([], { count: true });   // __count__
    return <span>{count === null ? '' : `${count} online now`}</span>;
}
```

A member's page, and Messages, say when someone was last online. Here for __p2_name__:

```tsx title="app/(app)/live.tsx"
export function OnlineStatus({ id }: { id: string }) {
    // id = '__p2_id__'
    const { online, lastSeen } = useOnline([id]);
    // online['__p2_id__'] = __online_p2__
    // lastSeen['__p2_id__'] = __lastseen_p2__

    // A green dot, and "Online now".
    if (online[id]) return <span><span />Online now</span>;
    return lastSeen[id] ? <span>Active {ago(lastSeen[id])}</span> : null;
}

function ago(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
```

A member can hide when they are online: the server tells WordPlus Cloud who hides, and nobody sees them online. `profileOf` reads a member's profile from the database.

```ts title="lib/realtime.ts"
export const realtime = createRealtime({
    // …
    // Someone who chose to hide when they are online is never shown online.
    hidden: async (user) => {
        const profile = await profileOf(String(user));
        return profile?.hideOnline === true;
        // __hidden_no__
        // __hidden_yes__
    },
});
```

All together, as __me_name__ opened this page:

```tsx note="All together"
// 1. __me_name__ opens /members. Next.js runs the page on this server.
// app/(app)/members/page.tsx
async function People() {
    const me = (await currentUserId())!;   // '__me_id__': __me_name__
    const members = await membersFor(me);   // __names__
    return <Catalog members={cards} />;
}

// 2. In __me_name__'s browser, the catalog asks WordPlus Cloud who of them is
// online. This server is not asked.
// app/(app)/members/catalog.tsx
export function Catalog({ members }: { members: Member[] }) {
    const { online } = useOnline(members.map((member) => member.id));
    // [__ids__]: online now __here__, away __away__
    const shown = onlineOnly ? here : [...here, ...away];
    // Those online first, with Online on their photos.
}

// 3. The top bar, on every page, asks how many are online on the site.
// app/(app)/live.tsx
export function OnlineNow() {
    const { count } = useOnline([], { count: true });   // __count__
}

// 4. Someone opens the site, or leaves it: WordPlus Cloud tells this page, and
// Catalog and OnlineNow show the new values at once.
```

## connect: The connection and the call screen

One connection to WordPlus Cloud serves every page of a signed-in member. A call rings on any page, and goes on at the top of each page as they move around.

The server connects to WordPlus Cloud with the keys of the app. It says who is asking (`user`), and what others see of each member (`profile`). `currentUserId` asks Better Auth who is signed in, `nameOf` reads a name from the database, and `photoOf` gives the address of a photo.

```ts title="lib/realtime.ts"
export const realtime = createRealtime({
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: '__me_id__', as __me_name__ is signed in.
    user: () => currentUserId(),
    // What others see of __me_name__ in the chat and the call.
    profile: async (user) => {
        const name = await nameOf(String(user));   // '__me_name__'
        return name ? { name, avatar: photoOf(String(user)) } : null;
        // { name: '__me_name__', avatar: '/photos/__me_id__' }
    },
    // …
});
```

The SDK answers some routes by itself: the keys of sealed rooms, the webhooks, and its files for the browser. Joining a room and calling are routes of the site's own, `/api/realtime/auth` and `/api/realtime/calls`: the chat card on a member's page shows them.

```ts title="app/api/realtime/[...path]/route.ts"
export const GET = realtime.route;
export const POST = realtime.route;
```

The layout connects every page of __me_name__, with settings the server signs for them.

```tsx title="app/(app)/layout.tsx"
async function Connected({ children }: { children: React.ReactNode }) {
    // Made for each request: the settings are signed for this member, now.
    await connection();
    const me = await currentUserId();   // '__me_id__': __me_name__
    if (!me) redirect('/signin');
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <Screens />
            {/* … the top bar */}
            <Notices />
            <main>
                <CallOnEveryPage />
                {children}
            </main>
        </RealtimeProvider>
    );
}
```

The call screen rings on any page, and a call goes on at the top of the page, never over it.

```tsx title="app/(app)/screens.tsx"
export function Screens() {
    // Rings over any page when someone calls __me_name__.
    return <CallScreen rt={useRealtime()} />;
}

export function CallOnEveryPage() {
    // A call goes on here, at the top of the page.
    return <CallSpot rt={useRealtime()} />;
}
```

All together, for every page __me_name__ opens:

```tsx note="All together"
// 1. __me_name__ opens any page. Next.js runs the layout on this server.
// app/(app)/layout.tsx
async function Connected({ children }: { children: React.ReactNode }) {
    const me = await currentUserId();   // '__me_id__': __me_name__
    // realtime.config('__me_id__') signs __me_name__'s settings, asking:
    //     profile('__me_id__') gives { name: '__me_name__', avatar: '/photos/__me_id__' }
    //     hidden('__me_id__') gives __me_hides__
    return (
        <RealtimeProvider options={await realtime.config(me)}>
            <Screens />
            <main>
                <CallOnEveryPage />
                {children}
            </main>
        </RealtimeProvider>
    );
}

// 2. In __me_name__'s browser, RealtimeProvider connects to WordPlus Cloud with
// those settings, once, and keeps the connection from page to page.

// 3. Someone calls __me_name__. On whatever page it is:
// app/(app)/screens.tsx
export function Screens() {
    return <CallScreen rt={useRealtime()} />;   // rings
}
export function CallOnEveryPage() {
    return <CallSpot rt={useRealtime()} />;   // the call, once answered
}
```

## chat: The chat and its video date

Messages, typing, read ticks and reactions, and the video call, in the same box. Each chat has a number and its members: two here, or a hundred in a group. Only its members get in, while they may meet.

This page is `/members/__them_id__`. It shows __them_name__ only while __me_name__ may meet them (`canMeet`, below), and finds their chat. `profileOf` reads a profile from the database.

```tsx title="app/(app)/members/[id]/page.tsx"
async function Member({ params }: Props) {
    const { id } = await params;   // '__them_id__': __them_name__
    const me = await currentUserId();   // '__me_id__': __me_name__
    const them = await profileOf(id);
    if (!me || !them || !(await canMeet(me, id))) notFound();
    const chat = await chatBetween(me, id);   // '__chat__'
    const room = roomOf(chat);   // '__room__'
    // … __them_name__'s photo and profile, then the chat, below
}
```

The database lists each chat's members. `chatBetween` finds the chat of two people, or makes it the first time, and `roomOf` names the room of a chat.

```ts title="lib/dating.ts"
export function roomOf(chat: string): string {
    return `chat:${chat}`;   // '__room__'
}

export async function chatBetween(me: string, them: string): Promise<string> {
    // me = '__me_id__': __me_name__, them = '__them_id__': __them_name__
    // Known by their pair of ids, the smaller first, so both find the same one.
    const smaller = Math.min(Number(me), Number(them));
    const larger = Math.max(Number(me), Number(them));
    const pair = `${smaller}:${larger}`;   // '__pair__'

    // Made the first time, found after.
    await db.query(
        `insert into chat (pair) values ($1) on conflict do nothing`,
        [pair],
    );
    const { rows } = await db.query(
        `select id::text as id from chat where pair = $1`,
        [pair],
    );
    const chat = rows[0].id;   // '__chat__'

    await db.query(
        `insert into chat_member (chat_id, user_id) values ($1, $2), ($1, $3)
         on conflict do nothing`,
        [chat, me, them],
    );
    return chat;
}
```

The page shows the chat, with __them_name__ on top and their calls. As it opens, it joins the room __room__.

```tsx title="app/(app)/members/[id]/chat.tsx"
export function MemberChat({ room, to, name, avatar, placeholder }: Props) {
    // …
    return (
        <Chat
            rt={useRealtime()}
            room={room}                 // '__room__'
            to={to}                     // '__them_id__'
            name={name}                 // '__them_name__'
            avatar={avatar}             // '/photos/__them_id__'
            call
            startCall={start}           // 'video' from the catalog's Video
            placeholder={placeholder}   // 'Message __them_name__'
            messages={`/api/messages?room=${room}`}
            // … and onSent, for localhost
        />
    );
}
```

To join, the chat first asks this server, at `/api/realtime/auth`. The route runs the rule of the room for __me_name__, and answers a pass signed with the app's secret. The chat shows the pass to WordPlus Cloud, which checks the signature and lets it in.

```ts title="app/api/realtime/auth/route.ts"
export async function POST(request: Request) {
    // JSON only, which a page of another site can't send here.
    if (!request.headers.get('content-type')?.includes('application/json')) {
        return new Response(null, { status: 415 });
    }
    const { rooms } = await request.json();   // ['__room__']
    const user = await currentUserId();   // '__me_id__': __me_name__
    // Runs the rule of __room__, below.
    const pass = await realtime.authorize(rooms, user);
    // { token: 'eyJhbGciOi…', … }: __room__ for 6 hours
    return Response.json(pass);
}
```

The rule of every chat's room. In its name, `chat:{id}`, `{id}` is the chat's number: for __room__, `id` is `'__chat__'`.

```ts title="lib/realtime.ts"
realtime.room(
    'chat:{id}',
    {
        // A page that joins, or comes back, gets the last 50 events.
        history: 50,
        // What its pages send each other.
        emit: ['message', 'typing', 'reaction', 'read'],
        // What comes to this server too, to be kept.
        webhook: ['message', 'reaction'],
    },
    // user = '__me_id__', id = '__chat__'
    async (user, { id }) => mayChat(user, id),
);
```

`mayChat` is the site's own: a member of the chat may use it, while they may still meet each of the others. `membersOf` reads the members of a chat from the database.

```ts title="lib/dating.ts"
export async function mayChat(user: string | number | null, chat: string) {
    // user = '__me_id__': __me_name__, chat = '__chat__'
    if (user === null) return false;
    const me = String(user);
    const members = await membersOf(chat);   // [__members__]
    if (!members.includes(me)) return false;
    for (const other of members) {
        // For '__them_id__', __them_name__: canMeet is __may_meet__
        if (other !== me && !(await canMeet(me, other))) return false;
    }
    return true;
}
```

`canMeet`: two people may meet when each is among those the other looks for, and neither has blocked the other. It reads their profiles (`profileOf`) and their blocks (`hasBlocked`) from the database. Here it is whole, as it ran for __me_name__ and __them_name__:

```ts title="lib/dating.ts"
/** Whom each answer to "Looking for" takes in. */
export const WANTS: Record<Seeking, Gender[]> = {
    women: ['woman'],
    men: ['man'],
    everyone: ['woman', 'man', 'nonbinary'],
};

export async function canMeet(a: string, b: string): Promise<boolean> {
    // a = '__me_id__', b = '__them_id__'
    const personA = await profileOf(a);   // __me_name__, __me_is__ looking for __me_seeking__
    const personB = await profileOf(b);   // __them_name__, __them_is__ looking for __them_seeking__
    if (!personA || !personB || a === b) return false;

    // __me_name__ looks for __me_seeking__, and __them_name__ is __them_is__: __me_wants__
    const aWantsB = WANTS[personA.seeking].includes(personB.gender);
    // __them_name__ looks for __them_seeking__, and __me_name__ is __me_is__: __them_wants__
    const bWantsA = WANTS[personB.seeking].includes(personA.gender);
    // Neither has blocked the other: false
    const blocked = (await hasBlocked(a, b)) || (await hasBlocked(b, a));

    return aWantsB && bWantsA && !blocked;   // __may_meet__
}
```

A call in a chat takes the name of its room. The video button asks this server first, at `/api/realtime/calls`, which runs the calls rule and answers a pass for the call. With it, WordPlus Cloud rings __them_name__. Answering, __them_name__'s page asks the same.

```ts title="app/api/realtime/calls/route.ts"
export async function POST(request: Request) {
    // …
    const ask = await request.json();
    // ask = { call: '__room__', to: '__them_id__', role: 'caller', type: 'video', … }
    const user = await currentUserId();   // '__me_id__': __me_name__
    // Runs the calls rule of __room__, below.
    const pass = await realtime.authorizeCall(ask, user);
    return Response.json(pass);
}
```

The calls rule: the one asking (`user`) and the other one (`other`) may both use the chat. It runs as __me_name__ calls, and again as __them_name__ answers, with the two the other way round.

```ts title="lib/realtime.ts"
realtime.calls('chat:{id}', async (user, other, { id }) => {
    // __me_name__ calls __them_name__: user = '__me_id__', other = '__them_id__', id = '__chat__'
    const userMayChat = await mayChat(user, id);   // __may_meet__
    const otherMayChat = await mayChat(other, id);   // __may_meet__
    return userMayChat && otherMayChat;   // __may_meet__: it rings for __them_name__
});
```

All together, as __me_name__ opened __them_name__'s page:

```tsx note="All together"
// 1. __me_name__ opens /members/__them_id__. Next.js runs the page on this server.
// app/(app)/members/[id]/page.tsx
async function Member({ params }: Props) {
    const { id } = await params;   // '__them_id__': __them_name__
    const me = await currentUserId();   // '__me_id__': __me_name__
    const them = await profileOf(id);
    // canMeet('__me_id__', '__them_id__'): __may_meet__, so the page shows
    if (!me || !them || !(await canMeet(me, id))) notFound();
    const chat = await chatBetween(me, id);   // '__chat__'
    const room = roomOf(chat);   // '__room__'
    // … the page, with the chat in it:
    <MemberChat
        room={room}   // '__room__'
        to={id}   // '__them_id__'
        name={them.name}   // '__them_name__'
        // …
    />
}

// 2. In __me_name__'s browser, the chat joins __room__. It asks this server
// first, and Next.js runs the route.
// app/api/realtime/auth/route.ts
export async function POST(request: Request) {
    const { rooms } = await request.json();   // ['__room__']
    const user = await currentUserId();   // '__me_id__': __me_name__
    const pass = await realtime.authorize(rooms, user);
    // It runs the rule of chat:{id} (lib/realtime.ts), with id '__chat__':
    //     mayChat('__me_id__', '__chat__')
    //         membersOf('__chat__') gives [__members__]
    //         canMeet('__me_id__', '__them_id__') gives __may_meet__
    //     true, so a pass for __room__, signed with the app's secret
    return Response.json(pass);
}

// 3. The chat shows the pass to WordPlus Cloud, which lets it in. Messages,
// typing and reactions go between the two pages through WordPlus Cloud.

// 4. __me_name__ presses the video button. The page asks this server first,
// and Next.js runs the route.
// app/api/realtime/calls/route.ts
export async function POST(request: Request) {
    const ask = await request.json();   // { call: '__room__', to: '__them_id__', … }
    const user = await currentUserId();   // '__me_id__': __me_name__
    const pass = await realtime.authorizeCall(ask, user);
    // It runs the calls rule of chat:{id}, with id '__chat__':
    //     mayChat('__me_id__', '__chat__') gives true
    //     mayChat('__them_id__', '__chat__') gives true
    //     true, so a pass for the call
    return Response.json(pass);
}
// With the pass, WordPlus Cloud rings __them_name__, on any page of the site.
```

## block: Block or report

The chat closes at once on both screens, the other person is taken out of it, and the rules turn them away from then on.

When __me_name__ blocks __them_name__, the server keeps it, takes __them_name__ out of their chat now, and tells both of them. `me` is the signed-in member, and `block` writes it into the database.

```ts title="app/(app)/actions.ts"
export async function blockMember(them: string, how: How, form: FormData) {
    // them = '__them_id__': __them_name__, how = 'block'
    const id = await me();   // '__me_id__': __me_name__
    const reason = how === 'report' ? String(form.get('reason')) : null;
    await block(id, them, reason);

    const room = roomOf(await chatBetween(id, them));   // '__room__'
    // Out of the chat now: the rule says no from here on.
    await realtime.in(room).kick(them);
    // Both of them hear it, on whatever page they are.
    await realtime.toUser([id, them]).emit('closed', { room });
    redirect('/members');
}
```

Their chat pages hear it, and go back to the people.

```tsx title="app/(app)/members/[id]/chat.tsx"
export function MemberChat({ room, to, name, avatar, placeholder }: Props) {
    const router = useRouter();
    // …
    useUserEvent('closed', (data: { room: string }) => {
        // data = { room: '__room__' }: this chat, so back to the people
        if (data.room === room) router.replace('/members');
    });
    // …
}
```

From then on `canMeet` says no for these two, so `mayChat` too: neither can join the chat, call, or see the other.

```ts title="lib/dating.ts"
export async function canMeet(a: string, b: string): Promise<boolean> {
    // …
    // __me_name__ has blocked __them_name__: true
    const blocked = (await hasBlocked(a, b)) || (await hasBlocked(b, a));

    return aWantsB && bWantsA && !blocked;   // false
}
```

All together, if __me_name__ blocked __them_name__ now:

```tsx note="All together"
// 1. __me_name__ presses Block. Next.js runs the server action on this server.
// app/(app)/actions.ts
export async function blockMember(them: string, how: How, form: FormData) {
    // them = '__them_id__': __them_name__, how = 'block'
    const id = await me();   // '__me_id__': __me_name__
    await block(id, them, reason);   // kept in the database
    const room = roomOf(await chatBetween(id, them));   // '__room__'
    await realtime.in(room).kick(them);   // __them_name__ is out of the chat
    await realtime.toUser([id, them]).emit('closed', { room });
    redirect('/members');
}

// 2. In both browsers, the chat hears it, and goes back to the people.
// app/(app)/members/[id]/chat.tsx
useUserEvent('closed', (data: { room: string }) => {
    if (data.room === room) router.replace('/members');   // '__room__'
});

// 3. From then on canMeet('__me_id__', '__them_id__') gives false, and so does
// mayChat for both in chat __chat__: the auth and calls routes answer no,
// and the catalog and the page leave the other out.
```

## keep: Keeping the messages, and the notices

WordPlus Cloud carries each message from one page to the other at once. This server keeps it, and tells the others in the chat, on whatever page they are. Here with the latest message of __me_name__'s conversations.

Each message comes to the server as a webhook, as the room's rule asked (`webhook`). `chatIn` reads the chat's number from its room.

```ts title="lib/realtime.ts"
realtime.on('message', async ({ room, from, data, event_id, at }) => {
    // room = '__conv_room__'
    // from = '__conv_from__': __conv_from_name__
    // data = { text: '__conv_text__' }
    const chat = chatIn(room);   // '__conv_chat__'
    if (!from || !chat) return;
    const text = String(data.text ?? '');
    await keepAndTell({ id: event_id, chat, from: String(from), text, at });
});
```

`keepAndTell` keeps it once, by its id, then tells the others in the chat. `keepMessage` writes the message into the database and says whether it is new, and `nameOf` reads a name.

```ts title="lib/realtime.ts"
export async function keepAndTell(message: Message) {
    // Only from someone who may write in the chat.
    if (!(await mayChat(message.from, message.chat))) return;
    // Kept before, so told before.
    if (!(await keepMessage(message))) return;
    const members = await membersOf(message.chat);   // [__conv_members__]
    const others = members.filter((member) => member !== message.from);
    // others = ['__conv_to__']: __conv_to_name__
    await realtime.toUser(others).emit('message', {
        chat: message.chat,
        from: message.from,
        name: await nameOf(message.from),   // '__conv_from_name__'
        text: message.text.slice(0, 140),
    });
}
```

Any page of __conv_to_name__ shows a notice, unless their chat with __conv_from_name__ is open.

```tsx title="app/(app)/live.tsx"
export function Notices() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const path = usePathname();
    const router = useRouter();

    const drop = (key: number) =>
        setNotices((list) => list.filter((notice) => notice.key !== key));
    const show = (text: string, href: string) => {
        // A key of its own, to drop it by.
        const key = Date.now() + Math.random();
        setNotices((list) => [...list, { key, text, href }]);
        setTimeout(() => drop(key), 6000);
        // The lists on the page show it too.
        router.refresh();
    };

    useUserEvent('message', (data: NewMessage) => {
        // data = { from: '__conv_from__', name: '__conv_from_name__', text: '__conv_text__' }
        // The chat shows it already.
        if (path === `/members/${data.from}`) return;
        show(`${data.name}: ${data.text}`, `/members/${data.from}`);
    });
    // … the notices, at the bottom of the page
}
```

The chat loads its messages from a route of the site, as it opens and as the reader scrolls up. `messagesPage` reads 50 messages from the database.

```ts title="app/api/messages/route.ts"
export async function GET(request: Request) {
    const url = new URL(request.url);
    const chat = chatIn(url.searchParams.get('room') ?? '');   // '__conv_chat__'
    const before = url.searchParams.get('before');   // null: the newest
    const me = await currentUserId();   // '__me_id__'
    if (!chat || !(await mayChat(me, chat))) {
        return new Response(null, { status: 403 });
    }
    return Response.json(await messagesPage(chat, before));
}
```

It answers with the newest 50 messages, the oldest of them first.

```ts note="The answer"
{
    messages: [
        // …
        {
            id: '__conv_id__',
            from: '__conv_from__',   // __conv_from_name__
            text: '__conv_text__',
            at: __conv_at__,   // __conv_ago__
        },
    ],
    more: __conv_more__,   // true while there are older ones
}
```

On localhost no webhook arrives, so the chat tells the server of each message it sent. `/api/chat/sent` keeps it with `keepAndTell`, as the webhook does.

```tsx title="app/(app)/members/[id]/chat.tsx"
<Chat
    // …
    onSent={(message) => {
        fetch('/api/chat/sent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),   // { id, room, text, at }
        });
    }}
/>
```

All together, for "__conv_text__":

```tsx note="All together"
// 1. __conv_from_name__ sends it in __conv_room__. WordPlus Cloud shows it on
// __conv_to_name__'s chat page at once, and sends it to this server as a webhook.
// Next.js runs app/api/realtime/[...path]/route.ts, whose realtime.route
// hands it to the handler of 'message':
// lib/realtime.ts
realtime.on('message', async ({ room, from, data, event_id, at }) => {
    const chat = chatIn(room);   // '__conv_chat__'
    const text = String(data.text ?? '');   // '__conv_text__'
    await keepAndTell({ id: event_id, chat, from: String(from), text, at });
    //     mayChat('__conv_from__', '__conv_chat__') gives true
    //     keepMessage(message) gives true: new, so kept
    //     membersOf('__conv_chat__') gives [__conv_members__]: others ['__conv_to__']
    //     realtime.toUser(['__conv_to__']).emit('message', { name: '__conv_from_name__', … })
});

// 2. On any other page of __conv_to_name__, a notice for 6 seconds.
// app/(app)/live.tsx
useUserEvent('message', (data: NewMessage) => {
    show(`${data.name}: ${data.text}`, `/members/${data.from}`);
    // '__conv_from_name__: __conv_text__'
});

// 3. Either of them opens the chat later. It asks for its messages, and
// Next.js runs the route.
// app/api/messages/route.ts
export async function GET(request: Request) {
    const chat = chatIn(url.searchParams.get('room') ?? '');   // '__conv_chat__'
    // mayChat('__me_id__', '__conv_chat__') gives true
    return Response.json(await messagesPage(chat, before));   // the newest 50
}
```
