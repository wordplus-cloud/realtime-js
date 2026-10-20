// The shop people and data. A real app has its users and orders in a database. This one keeps them in memory, on
// globalThis, so the route handlers and pages Next.js loads apart share one copy.
//
// Shop 0 is the one of this example. A demo (WORDPLUS_DEMO=1, lib/demo.ts) opens a shop for each visitor, numbered s, whose
// people are s × 100 + 34, + 42 and + 43 and whose order is s × 10000 + 1042: every rule finds the shop of a user by
// arithmetic, so the people of one shop never reach another.
export interface Person {
    id: number;
    name: string;
    role: string;
    staff: boolean;
    avatar: string;
    shop: number;
}

export type Status = 'placed' | 'packed' | 'shipped' | 'delivered';

export interface Order {
    id: number;
    number: number;
    customer: number;
    item: string;
    status: Status;
}

/** A message of the chat as this server keeps it: its room event id, who, what, when, and who reacted with what. */
export interface ChatMessage {
    id: string;
    from: number;
    text: string;
    at: number;
    reactions: Record<string, number[]>;
}

export interface Shop {
    order: Order;
    chat: ChatMessage[];
    opened: number;
}

const PEOPLE = [
    { id: 34, name: 'Ann', role: 'Support', staff: true, avatar: '/avatars/ann.svg' },
    { id: 42, name: 'Ben', role: 'Customer', staff: false, avatar: '/avatars/ben.svg' },
    { id: 43, name: 'Cara', role: 'Warehouse', staff: true, avatar: '/avatars/cara.svg' },
];

export const STATUSES: Status[] = ['placed', 'packed', 'shipped', 'delivered'];

/**
 * A shop as it opens: its order, placed, and the chat as this server keeps it, its first two messages. What Ann and Ben
 * say next comes by webhook (keepChat).
 */
export const openShop = (s: number): Shop => {
    const opened = Date.now();
    return {
        order: { id: s * 10000 + 1042, number: 1042, customer: s * 100 + 42, item: 'Two ceramic mugs', status: 'placed' },
        chat: [
            { id: 'first-1', from: s * 100 + 42, text: 'Hi! Has my order left yet?', at: opened - 120_000, reactions: {} },
            { id: 'first-2', from: s * 100 + 34, text: 'Hi Ben, it is being packed now. I will let you know.', at: opened - 60_000, reactions: {} },
        ],
        opened,
    };
};

/**
 * The chat as this server keeps it, from the webhook: a message by the id of its room event, once. A reaction as the
 * one key on it, an empty key taking it back. A real app saves them in its database.
 */
export function keepChat(chat: ChatMessage[], event: { event: string; data: unknown; from?: string; event_id?: string; at: number }) {
    const data = (event.data ?? {}) as { text?: unknown; id?: unknown; key?: unknown };
    const from = Number(event.from);
    if (event.event === 'message' && event.event_id && !chat.some((m) => m.id === event.event_id)) {
        chat.push({ id: event.event_id, from, text: String(data.text ?? ''), at: event.at, reactions: {} });
    }
    const message = event.event === 'reaction' ? chat.find((m) => m.id === data.id) : undefined;
    if (message) {
        for (const key of Object.keys(message.reactions)) {
            message.reactions[key] = message.reactions[key].filter((user) => user !== from);
            if (!message.reactions[key].length) delete message.reactions[key];
        }
        if (typeof data.key === 'string' && data.key) (message.reactions[data.key] ??= []).push(from);
    }
}

/** A page of the chat, oldest first: the newest 50, or the 50 before the message `before`. */
export function chatPage(chat: ChatMessage[], before: string | null) {
    const end = before ? chat.findIndex((m) => m.id === before) : -1;
    const upTo = end < 0 ? chat.length : end;
    const start = Math.max(0, upTo - 50);
    return { messages: chat.slice(start, upTo), more: start > 0 };
}

const scope = globalThis as typeof globalThis & { exampleShops?: Map<number, Shop> };

/** The shops, by number: shop 0, or on a demo those of its visitors alone. */
export const shops = () => (scope.exampleShops ??= new Map<number, Shop>(process.env.WORDPLUS_DEMO === '1' ? [] : [[0, openShop(0)]]));

export const shopOf = (user: unknown) => Math.floor(Number(user) / 100);
export const peopleOf = (s: number): Person[] => PEOPLE.map((p) => ({ ...p, id: s * 100 + p.id, shop: s }));
export const person = (id: unknown): Person | undefined => (shops().has(shopOf(id)) ? peopleOf(shopOf(id)).find((p) => p.id === Number(id)) : undefined);
export const isStaff = (id: unknown): boolean => !!person(id)?.staff;
export const sameShop = (...ids: unknown[]) => ids.every((id) => person(id) && shopOf(id) === shopOf(ids[0]));
export const orderOf = (id: unknown): Order | undefined => {
    const order = shops().get(Math.floor(Number(id) / 10000))?.order;
    return order?.id === Number(id) ? order : undefined;
};

/** The chat belongs to Ann and Ben. */
export const chatOf = (s: number) => [s * 100 + 34, s * 100 + 42];

/** The rooms of a shop, by name: those of shop 0 as the guides name them, those of a demo shop with its number. */
export const roomsOf = (s: number) => ({
    order: `order:${s * 10000 + 1042}`,
    chat: `chat:${s * 100 + 34}:${s * 100 + 42}`,
    shop: s ? `shop:${s}` : 'shop',
    meeting: s ? `meeting:${s}` : 'meeting:daily',
    product: s ? `product:${s}` : 'product:mugs',
    webhooks: s ? `webhooks:${s}` : 'webhooks',
    show: s ? `show:${s}` : 'show:mugs',
});

export type Rooms = ReturnType<typeof roomsOf>;

/** The shop a room belongs to, from its name. Null for none. */
export function shopOfRoom(room: string | null | undefined): number | null {
    const [kind, first] = String(room ?? '').split(':');
    if (kind === 'order') return Math.floor(Number(first) / 10000);
    if (kind === 'chat') return shopOf(first);
    if (!['shop', 'meeting', 'product', 'webhooks', 'show'].includes(kind)) return null;
    return first === undefined || first === 'daily' || first === 'mugs' ? 0 : /^\d+$/.test(first) ? Number(first) : null;
}
