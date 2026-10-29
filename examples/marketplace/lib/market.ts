import { randomUUID } from 'node:crypto';
import { db } from './db';

/** A neighbour, as the pages and the profile of lib/realtime.ts show them. */
export interface Person {
    id: string;
    name: string;
    area: string;
    about: string;
}

export type Status = 'available' | 'reserved' | 'sold';

/** An item for sale, with the addresses of its photos. */
export interface Listing {
    id: string;
    seller: string;
    sellerName: string;
    title: string;
    about: string;
    price: number;
    category: string;
    area: string;
    status: Status;
    buyer: string | null;
    buyerName: string | null;
    photos: string[];
    createdAt: number;
}

/** A conversation about an item, between its seller and a buyer. */
export interface Deal {
    id: string;
    listing: Listing;
    buyer: string;
    buyerName: string;
    /** The offer of the buyer's waiting for an answer, or answered last. */
    offer: Offer | null;
}

export interface Offer {
    id: string;
    amount: number;
    status: 'open' | 'accepted' | 'declined' | 'withdrawn';
}

/** A conversation in the inbox: the item, the other one, and its last message. */
export interface Thread {
    deal: string;
    title: string;
    photo: string | null;
    other: string;
    otherName: string;
    selling: boolean;
    last: { text: string; mine: boolean; at: number } | null;
}

/** A message as this server keeps it: the id of the event that brought it, its conversation, who wrote it, and when. */
export interface Message {
    id: string;
    deal: string;
    from: string;
    text: string;
    files: unknown[];
    at: number;
}

export interface KeptFile {
    id: string;
    url: string;
    name: string;
    type: string;
    size: number;
}

const isNumber = (id: string) => /^[0-9]+$/.test(id);

/** The address of a neighbour's photo, and of an item's. */
export const photoOf = (id: string) => `/photos/${id}`;
export const itemPhoto = (id: string) => `/item-photos/${id}`;

export async function personOf(id: string): Promise<Person | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(
        `select u.id::text as id, u.name, coalesce(p.area, '') as area, coalesce(p.about, '') as about from "user" u left join profile p on p.user_id = u.id where u.id = $1`,
        [id],
    );
    return rows[0] ?? null;
}

export async function nameOf(id: string): Promise<string | null> {
    return (await personOf(id))?.name ?? null;
}

export async function photo(id: string): Promise<Buffer | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(`select photo from profile where user_id = $1`, [id]);
    return rows[0]?.photo ?? null;
}

// Listings

const LISTING = `l.id::text as id, l.seller::text as seller, s.name as seller_name, l.title, l.about, l.price, l.category, l.area, l.status,
                 l.buyer::text as buyer, b.name as buyer_name, l.created_at,
                 coalesce((select array_agg(p.id order by p.position) from listing_photo p where p.listing_id = l.id), '{}') as photos
                 from listing l join "user" s on s.id = l.seller left join "user" b on b.id = l.buyer`;

type Row = Record<string, unknown>;
const toListing = (row: Row): Listing => ({
    id: row.id as string,
    seller: row.seller as string,
    sellerName: row.seller_name as string,
    title: row.title as string,
    about: row.about as string,
    price: row.price as number,
    category: row.category as string,
    area: row.area as string,
    status: row.status as Status,
    buyer: (row.buyer as string | null) ?? null,
    buyerName: (row.buyer_name as string | null) ?? null,
    photos: (row.photos as string[]).map(itemPhoto),
    createdAt: (row.created_at as Date).getTime(),
});

/** Every item, those still for sale first, the newest first. */
export async function listings(): Promise<Listing[]> {
    const { rows } = await db.query(`select ${LISTING} order by l.status = 'available' desc, l.created_at desc, l.id desc`);
    return rows.map(toListing);
}

export async function listingOf(id: string): Promise<Listing | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(`select ${LISTING} where l.id = $1`, [id]);
    return rows[0] ? toListing(rows[0]) : null;
}

/** A new item for sale, with its photos. */
export async function sell(seller: string, item: { title: string; about: string; price: number; category: string; photos: Array<{ type: string; data: Buffer }> }): Promise<string> {
    const person = await personOf(seller);
    const { rows } = await db.query(
        `insert into listing (seller, title, about, price, category, area) values ($1, $2, $3, $4, $5, $6) returning id::text as id`,
        [seller, item.title.trim().slice(0, 100), item.about.trim().slice(0, 2000), item.price, item.category.trim().slice(0, 40) || 'Other', person?.area ?? ''],
    );
    for (const [position, picture] of item.photos.entries()) {
        await db.query(`insert into listing_photo (id, listing_id, position, type, data) values ($1, $2, $3, $4, $5)`, [randomUUID(), rows[0].id, position, picture.type, picture.data]);
    }
    return rows[0].id;
}

/** The seller's new price for an item still for sale. */
export async function setPrice(id: string, seller: string, price: number): Promise<boolean> {
    const { rowCount } = await db.query(`update listing set price = $3 where id = $1 and seller = $2 and status <> 'sold'`, [id, seller, price]);
    return rowCount === 1;
}

/** The seller marks an item sold, or for sale again, which lets go of whoever it was reserved for. */
export async function setStatus(id: string, seller: string, status: Status): Promise<boolean> {
    const { rowCount } = await db.query(
        `update listing set status = $3, buyer = case when $3 = 'available' then null else buyer end where id = $1 and seller = $2`,
        [id, seller, status],
    );
    return rowCount === 1;
}

/** An item's photo, for the pages. */
export async function listingPhoto(id: string): Promise<{ type: string; data: Buffer } | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const { rows } = await db.query(`select type, data from listing_photo where id = $1`, [id]);
    return rows[0] ?? null;
}

// Conversations and offers

/** The conversation of a buyer about an item: theirs, or a new one the first time they write to its seller. */
export async function dealFor(listing: string, buyer: string): Promise<string | null> {
    const item = await listingOf(listing);
    if (!item || item.seller === buyer) return null;
    await db.query(`insert into deal (listing_id, buyer) values ($1, $2) on conflict do nothing`, [listing, buyer]);
    const { rows } = await db.query(`select id::text as id from deal where listing_id = $1 and buyer = $2`, [listing, buyer]);
    return rows[0].id;
}

export async function dealOf(id: string): Promise<Deal | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query(
        `select d.id::text as id, d.listing_id::text as listing, d.buyer::text as buyer, u.name as buyer_name from deal d join "user" u on u.id = d.buyer where d.id = $1`,
        [id],
    );
    if (!rows[0]) return null;
    const listing = await listingOf(rows[0].listing);
    if (!listing) return null;
    const offers = await db.query(
        `select id::text as id, amount, status from offer where deal_id = $1 and status <> 'withdrawn' order by created_at desc limit 1`,
        [id],
    );
    return { id: rows[0].id, listing, buyer: rows[0].buyer, buyerName: rows[0].buyer_name, offer: offers.rows[0] ?? null };
}

/** The two of a conversation: its item's seller, and its buyer. */
export async function partiesOf(deal: string): Promise<string[]> {
    const found = await dealOf(deal);
    return found ? [found.listing.seller, found.buyer] : [];
}

/** Whether someone may read and write in a conversation, and call in it: its seller and its buyer. */
export async function mayTalk(user: string | number | null, deal: string): Promise<boolean> {
    return user !== null && (await partiesOf(deal)).includes(String(user));
}

/** My conversations, buying and selling, the latest first. */
export async function threadsOf(me: string): Promise<Thread[]> {
    const { rows } = await db.query(
        `select d.id::text as deal, l.title, l.seller::text as seller, s.name as seller_name, d.buyer::text as buyer, b.name as buyer_name,
                (select p.id from listing_photo p where p.listing_id = l.id order by p.position limit 1) as photo,
                m.sender::text as sender, m.text, m.files, m.at
         from deal d join listing l on l.id = d.listing_id join "user" s on s.id = l.seller join "user" b on b.id = d.buyer
         left join lateral (select sender, text, files, at from message where deal_id = d.id order by at desc limit 1) m on true
         where l.seller = $1 or d.buyer = $1
         order by coalesce(m.at, extract(epoch from d.created_at) * 1000) desc`,
        [me],
    );
    return rows.map((row) => {
        const selling = row.seller === me;
        return {
            deal: row.deal,
            title: row.title,
            photo: row.photo ? itemPhoto(row.photo) : null,
            other: selling ? row.buyer : row.seller,
            otherName: selling ? row.buyer_name : row.seller_name,
            selling,
            last: row.at ? { text: row.text || (row.files?.length ? 'sent a photo' : ''), mine: row.sender === me, at: Number(row.at) } : null,
        };
    });
}

/** The conversations about one of my items, for its page. */
export async function askingAbout(listing: string): Promise<Array<{ deal: string; buyer: string; name: string; offer: number | null }>> {
    const { rows } = await db.query(
        `select d.id::text as deal, d.buyer::text as buyer, u.name,
                (select o.amount from offer o where o.deal_id = d.id and o.status = 'open' order by o.created_at desc limit 1) as offer
         from deal d join "user" u on u.id = d.buyer where d.listing_id = $1 order by d.created_at`,
        [listing],
    );
    return rows;
}

/** A buyer's offer, for an item still available: it takes the place of their open one. */
export async function makeOffer(deal: string, buyer: string, amount: number): Promise<Offer | string> {
    const found = await dealOf(deal);
    if (!found || found.buyer !== buyer) return 'Only the buyer of this conversation makes an offer.';
    if (found.listing.status !== 'available') return 'This item is no longer available.';
    if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) return 'An offer is a whole amount.';
    await db.query(`update offer set status = 'withdrawn' where deal_id = $1 and status = 'open'`, [deal]);
    const { rows } = await db.query(`insert into offer (deal_id, amount) values ($1, $2) returning id::text as id, amount, status`, [deal, amount]);
    return rows[0];
}

/** An open offer declined as another on the same item was taken: its conversation, its buyer and its amount. */
export type Declined = { deal: string; buyer: string; amount: number };

/**
 * The seller's answer to the open offer, once: taken, the item is reserved for its buyer at that price, and every other
 * open offer on it is declined. The answered conversation with the offers it declined, or null.
 */
export async function answerOffer(deal: string, seller: string, accept: boolean): Promise<(Deal & { declined: Declined[] }) | null> {
    const found = await dealOf(deal);
    if (!found || found.listing.seller !== seller || found.offer?.status !== 'open') return null;
    await db.query(`update offer set status = $2, answered_at = now() where id = $1`, [found.offer.id, accept ? 'accepted' : 'declined']);
    let declined: Declined[] = [];
    if (accept) {
        await db.query(`update listing set status = 'reserved', buyer = $2, price = $3 where id = $1`, [found.listing.id, found.buyer, found.offer.amount]);
        const { rows } = await db.query(
            `update offer set status = 'declined', answered_at = now() from deal
             where offer.deal_id = deal.id and deal.listing_id = $1 and offer.status = 'open'
             returning deal.id::text as deal, deal.buyer::text as buyer, offer.amount`,
            [found.listing.id],
        );
        declined = rows;
    }
    return { ...(await dealOf(deal))!, declined };
}

/** The conversations about an item, those still open: told when it is reserved or sold to someone else. */
export async function dealsAbout(listing: string): Promise<Array<{ deal: string; buyer: string }>> {
    const { rows } = await db.query(`select id::text as deal, buyer::text as buyer from deal where listing_id = $1`, [listing]);
    return rows;
}

// Rooms by name: item 7 is looked at in listing:7, conversation 3 is in deal:3.

/** The number in a room's or call's name of a kind: 3 for deal:3 with 'deal', none for any other name. */
export function idIn(name: string, kind: 'listing' | 'deal'): string | null {
    const id = name.startsWith(`${kind}:`) ? name.slice(kind.length + 1) : '';
    return isNumber(id) ? id : null;
}

// Messages and files

export async function keepMessage(message: Message): Promise<boolean> {
    const { rowCount } = await db.query(
        `insert into message (id, deal_id, sender, text, files, at) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`,
        [message.id, message.deal, message.from, message.text, JSON.stringify(message.files), message.at],
    );
    return rowCount === 1;
}

export async function react(id: string, user: string, key: string) {
    const { rows } = await db.query(`select reactions from message where id = $1`, [id]);
    if (!rows[0]) return;
    const reactions: Record<string, string[]> = {};
    for (const [reaction, users] of Object.entries(rows[0].reactions as Record<string, string[]>)) {
        const others = users.filter((someone) => someone !== user);
        if (others.length) reactions[reaction] = others;
    }
    if (key) reactions[key] = [...(reactions[key] ?? []), user];
    await db.query(`update message set reactions = $2 where id = $1`, [id, reactions]);
}

export async function messagesPage(deal: string, before: string | null) {
    const { rows } = await db.query(
        `select id, sender::text as "from", text, files, at, reactions from message
         where deal_id = $1 and ($2::text is null or at < (select at from message where id = $2))
         order by at desc limit 51`,
        [deal, before],
    );
    const messages = rows.slice(0, 50).reverse().map((row) => ({ ...row, at: Number(row.at) }));
    return { messages, more: rows.length > 50 };
}

export const fileUrl = (id: string) => `/files/${id}`;

/** The files a message may carry: those kept for its conversation, as kept, whatever the message said of them. */
export async function filesFor(deal: string, given: unknown): Promise<KeptFile[]> {
    if (!Array.isArray(given)) return [];
    const ids = given.map((file) => (file as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string').slice(0, 10);
    if (!ids.length) return [];
    const { rows } = await db.query(`select id, name, type, size from file where deal_id = $1 and id = any($2)`, [deal, ids]);
    return rows.map((row) => ({ id: row.id, url: fileUrl(row.id), name: row.name, type: row.type, size: row.size }));
}

export async function keepFile(deal: string, owner: string, file: { name: string; type: string; data: Buffer }): Promise<KeptFile> {
    const id = randomUUID();
    await db.query(`insert into file (id, deal_id, owner, name, type, size, data) values ($1, $2, $3, $4, $5, $6, $7)`, [
        id, deal, owner, file.name, file.type, file.data.length, file.data,
    ]);
    return { id, url: fileUrl(id), name: file.name, type: file.type, size: file.data.length };
}

export async function fileOf(id: string): Promise<{ deal: string; name: string; type: string; data: Buffer } | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const { rows } = await db.query(`select deal_id::text as deal, name, type, data from file where id = $1`, [id]);
    return rows[0] ?? null;
}
