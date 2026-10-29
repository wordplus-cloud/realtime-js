<!--
"How this page works" under the demo's pages (MARKET_DEMO=1): a card for each part of a page, in short steps. Each step
shows the site's own code, a function at a time, with what happens on the page open now in its comments. Each __name__
is one of those values, filled in by the page (app/how-it-works-cards.tsx) from /api/how-it-works: put one only in a
comment or a string. Lines may be left out (// … says so), and so may Tailwind's classes, but every line of code shown
is in the file named above it: scripts/how-it-works.mjs checks it as it turns this file into lib/how-it-works.json,
before `dev` and `build`. A block that isn't the site's code, such as the last step's run of it all, takes note="…" in
place of title="…".

Each card is `## key: Title`, then a paragraph about it, then its steps: a paragraph each, with the code under it. Its
last step, "All together", follows one run through the functions above it, in order, with this page's values.
-->

## market: The market as it is now

Every item your neighbours sell, those still for sale first. This server keeps the items, and the page keeps itself current: when someone puts one up, takes an offer, sells it or changes its price, every market page shows it, with no reload. __items_now__.

Every page of someone signed in joins the room `market`. Only this server says anything in it.

```ts title="lib/realtime.ts"
realtime.room('market', async (user) => user !== null);
```

When an item is put up, or one changes, the server says so in it:

```ts title="app/api/listings/route.ts"
    await realtime.to('market').emit('changed');
```

And every page asks for itself again:

```tsx title="app/(app)/live.tsx"
export function MarketLive() {
    const router = useRouter();
    useRoom('market', { changed: () => router.refresh() });
    return null;
}
```

## looking: Looking at it now

How many others have this item open now, counted by WordPlus Cloud: this server keeps no count of it. This is `__room__`, __item_title__.

One rule: anyone may be counted in an item's room, with no list of who, and no word said in it but the server's.

```ts title="lib/realtime.ts"
realtime.room('listing:{id}', { public: true, count: true });
```

The page joins it, and shows the count, less itself.

```tsx title="app/(app)/live.tsx"
export function Looking({ id }: { id: string }) {
    const router = useRouter();
    const { count } = useRoom(`listing:${id}`, { changed: () => router.refresh() });
    const others = count === null ? 0 : count - 1;
    if (others <= 0) return null;
```

## price: A new price, everywhere at once

The seller changes the price, takes an offer or marks it sold, and every page showing the item shows it at once: the seller's, the buyers', the market. __seller_note__

The server keeps the new price, then says so in the item's room and the market's.

```ts title="app/(app)/actions.ts"
export async function reprice(listing: string, price: number): Promise<boolean> {
    const me = await currentUserId();
    if (!me || !Number.isInteger(price) || price < 0 || price > 1_000_000 || !(await setPrice(listing, me, price))) return false;
    await changed(listing);
    return true;
}
```

```ts title="app/(app)/actions.ts"
async function changed(listing: string) {
    await realtime.to(`listing:${listing}`).emit('changed');
    await realtime.to('market').emit('changed');
}
```

Each page of the item, in the same `useRoom` that counts who looks, asks for itself again: `changed: () => router.refresh()`.

## inbox: Messages wherever you are

Your conversations, about what you buy and what you sell, the latest first: __threads_now__. A new message is heard on whatever page you are, as this server keeps it.

The server keeps each message as it comes, then tells the other one of the conversation, on whatever page they are.

```ts title="lib/realtime.ts"
    const other = message.from === deal.buyer ? deal.listing.seller : deal.buyer;
    await realtime.toUser(other).emit('message', {
        deal: deal.id,
        name: await nameOf(message.from),
        title: deal.listing.title,
        text: message.text ? message.text.slice(0, 140) : 'sent a photo',
    });
```

Every page hears it: a notice, unless that conversation is open, and the inbox puts it first.

```tsx title="app/(app)/live.tsx"
    useUserEvent('message', (data: { deal: string; name: string; text: string }) => {
        if (elsewhere(data.deal)) show(`${data.name}: ${data.text}`, `/messages/${data.deal}`);
        if (path === '/messages') router.refresh(); // the inbox puts it first
    });
```

## deal: A conversation and its photos

A conversation about an item, between its seller and one buyer, with the photos they send. WordPlus Cloud carries the messages, sealed, and never has the photos: this server keeps them, for the two alone. This is `__room__`, with __other_name__.

One rule says who may read and write: the seller of the item, and this buyer.

```ts title="lib/realtime.ts"
realtime.room(
    'deal:{id}',
    { history: 50, emit: ['message', 'typing', 'reaction', 'read'], webhook: ['message', 'reaction'] },
    async (user, { id }) => mayTalk(user, id),
);
```

```ts title="lib/market.ts"
export async function mayTalk(user: string | number | null, deal: string): Promise<boolean> {
    return user !== null && (await partiesOf(deal)).includes(String(user));
}
```

The ready-made chat, with `upload`, this server's route for photos: picked, pasted or dropped on it.

```tsx title="app/(app)/messages/[id]/chat.tsx"
        <Chat
            rt={useRealtime()}
            room={room}
            // …
            messages={`/api/messages?room=${room}`}
            upload="/api/files"
            accept="image/jpeg,image/png,image/webp,image/gif"
```

The route asks the room's own rule, with `mayJoin`, before it keeps a photo, and each photo opens for the two alone.

```ts title="app/api/files/route.ts"
    if (!me || !deal || !(file instanceof File) || !(await realtime.mayJoin(room, me))) {
        return Response.json({ error: 'This photo is not for this conversation.' }, { status: 403 });
    }
```

```ts title="app/files/[id]/route.ts"
    if (!file || !(await mayTalk(me, file.deal))) return new Response(null, { status: 404 });
```

## offer: Offers

The buyer makes an offer and the seller takes it or says no: both pages show it at once, and each hears of the other on whatever page they are. Taken, the item is reserved for its buyer at that price, on every page showing it. Now: __offer_now__.

The server keeps the offer, says so in the conversation, and tells the seller.

```ts title="app/(app)/actions.ts"
export async function offer(deal: string, amount: number): Promise<{ error: string } | null> {
    // …
    const made = await makeOffer(deal, me, amount);
    if (typeof made === 'string') return { error: made };
    const found = (await dealOf(deal))!;
    await realtime.to(`deal:${deal}`).emit('changed');
    await realtime.toUser(found.listing.seller).emit('offer', { deal, name: found.buyerName, amount, title: found.listing.title });
```

The answer, the same way, and once taken, to every page of the item, and to the others asking about it.

```ts title="app/(app)/actions.ts"
export async function answer(deal: string, accept: boolean) {
    // …
    await realtime.to(`deal:${deal}`).emit('changed');
    // …
    if (!accept) return;
    await changed(answered.listing.id);
```

Both pages of the conversation ask for themselves again when the server says so in its room.

```tsx title="app/(app)/messages/[id]/offer.tsx"
    useRoom(`deal:${deal}`, { changed: () => router.refresh() });
```

## call: See it on a call

To see the item before coming over: a video call from the conversation, which shows in it, beside the messages. Here, with __other_name__.

One rule: both of the conversation may call each other in it.

```ts title="lib/realtime.ts"
realtime.calls('deal:{id}', async (user, other, { id }) => (await mayTalk(user, id)) && (await mayTalk(other, id)));
```

The chat knows the other one (`to`) and has their call (`call`): its buttons on its top bar.

```tsx title="app/(app)/messages/[id]/chat.tsx"
            to={to}
            name={name}
            avatar={avatar}
            call
```

A page asks this server for the call, which runs the rule and answers a pass, signed with the app's secret. With it, WordPlus Cloud rings the other one.

```ts title="app/api/realtime/calls/route.ts"
    const user = await currentUserId();
    const pass = await realtime.authorizeCall(ask, user);
```

## sell: Putting an item up

The item and its photos, kept here. Every market page shows it as it comes, first.

A form with the photos goes to a route, as photos from a phone are larger than a server action takes. The route keeps the item, then says so in the room `market`.

```ts title="app/api/listings/route.ts"
    const id = await sell(me, {
        title,
        // …
    });
    await realtime.to('market').emit('changed');
    return Response.json({ id }, { status: 201 });
```
