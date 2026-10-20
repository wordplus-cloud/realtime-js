// The demo frame around the API demo (WORDPLUS_DEMO=1), as the demo sites run it (nextjs.docs.wordplus.cloud and
// the others): a shop for each visitor, for 24 hours, signed in as Ann (app/demo/route.ts), windows that are Ben or
// Cara (/as/<token>, proxy.ts), and what the page draws around the shop: the stacks, the guide, the source, "Try this".
// The example itself is the same with or without it.
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openShop, peopleOf, shops, type Person } from './shop';
import { sign } from './session';

export const DEMO = process.env.WORDPLUS_DEMO === '1';

// The code under each card, "See the code": the parts of this example marked `#region demo: <card>`, which the build of the
// demo sites cuts from its source into WORDPLUS_DEMO_CODE, by stack.
const CODE: Frame['code'] = process.env.WORDPLUS_DEMO_CODE ? JSON.parse(readFileSync(process.env.WORDPLUS_DEMO_CODE, 'utf8')).nextjs : undefined;

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
/** New shops an address opens in an hour. Past them it gets the newest of them again. */
const SHOPS_AN_HOUR = 6;

/** The demos, in the order the top bar lists them, and where the source of each is. */
const STACKS = [
    ['wordpress', 'WordPress', 'realtime-wordpress'],
    ['nextjs', 'Next.js', 'realtime-js'],
    ['laravel', 'Laravel', 'realtime-php'],
    ['django', 'Django', 'realtime-python'],
    ['fastapi', 'FastAPI', 'realtime-python'],
    ['express', 'Express', 'realtime-js'],
    ['php', 'PHP', 'realtime-php'],
    ['flask', 'Flask', 'realtime-python'],
    ['mobile', 'Mobile apps', 'realtime-js'],
];

/** Where the demos are: `{case}` in WORDPLUS_DEMO_SITES, such as https://{case}.docs.wordplus.cloud. */
const SITES = process.env.WORDPLUS_DEMO_SITES || 'https://{case}.docs.wordplus.cloud';

/**
 * How long a call and a meeting may last, in seconds, which the page keeps to: 10 and 15 minutes, as the demo runs on
 * WordPlus Cloud for anyone. WORDPLUS_DEMO_LIMITS ("call,meeting") shortens them, for the demo check.
 */
const [CALL_S, MEETING_S] = (process.env.WORDPLUS_DEMO_LIMITS || '600,900').split(',').map(Number);

const scope = globalThis as typeof globalThis & { exampleDemo?: { opened: Map<string, Array<{ s: number; at: number }>> } };

/** The address recent shops, and shops ending after a day: once for every route and page. */
function state() {
    if (!scope.exampleDemo) {
        scope.exampleDemo = { opened: new Map() };
        setInterval(() => {
            for (const [s, shop] of shops()) if (Date.now() - shop.opened > DAY) shops().delete(s);
        }, 10 * 60 * 1000).unref();
    }
    return scope.exampleDemo;
}

/**
 * The shop for a new visitor at `address`, its number: a new one, or once the address has opened its few this hour, the
 * newest of them again, so nobody is ever turned away and nobody can open thousands.
 */
export function openVisitorShop(address: string): number {
    const { opened } = state();
    const recent = (opened.get(address) ?? []).filter((o) => Date.now() - o.at < HOUR && shops().has(o.s));
    opened.set(address, recent);
    if (recent.length >= SHOPS_AN_HOUR) return recent[recent.length - 1].s;

    let s: number;
    do s = randomInt(100000, 1000000);
    while (shops().has(s));
    shops().set(s, openShop(s));
    recent.push({ s, at: Date.now() });
    return s;
}

export interface Frame {
    stack: string;
    name: string;
    guide: string;
    source: string;
    sites: Array<{ stack: string; name: string; url: string }>;
    token: string;
    open: Array<{ id: number; name: string; url: string }>;
    ends: number;
    limits: { call: number; meeting: number };
    code?: Record<string, Array<{ side: 'server' | 'page'; file: string; text: string }>>;
}

/** What a person page draws around the shop. */
export function frameFor(me: Person): Frame {
    const [, name, repository] = STACKS.find(([slug]) => slug === 'nextjs')!;
    return {
        stack: 'nextjs',
        name,
        guide: 'https://docs.wordplus.cloud/nextjs/getting-started/',
        source: `https://github.com/wordplus-cloud/${repository}/tree/main/examples/nextjs`,
        sites: STACKS.map(([slug, label]) => ({ stack: slug, name: label, url: SITES.replace('{case}', slug) })),
        // This window person, which the page sends with every request. And the others, each a window of their own.
        token: sign(me.id),
        open: peopleOf(me.shop).filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name, url: `/as/${sign(p.id)}` })),
        ends: (shops().get(me.shop)?.opened ?? Date.now()) + DAY,
        limits: { call: CALL_S, meeting: MEETING_S },
        ...(CODE ? { code: CODE } : {}),
    };
}
