// The demo frame around the API demo (WORDPLUS_DEMO=1), as the demo sites run it (express.docs.wordplus.cloud and
// the others): a shop for each visitor, for 24 hours, signed in as Ann. Links that open Ben or Cara in another window,
// each window its own person. And what the page draws around the shop: the stacks, the guide, the source, "Try this".
// The example itself is the same with or without it.
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
/** New shops an address opens in an hour. Past them it gets the newest of them again. */
const SHOPS_AN_HOUR = 6;

/** The demos, in the order the top bar lists them, and where the guide and source of each are. */
export const STACKS = [
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

/**
 * Opens shops for visitors in `shops` (those of the example, by number), signs a new visitor in as the Ann of their shop, and
 * serves `/as/<token>`, a window as the person of the token (the sign-in token of the example itself, sent from then on as a
 * bearer, so each window of one browser is its own person). Answers the frame for the page of a person.
 */
export function installDemo(app, { shops, openShop, peopleOf, sign, stack }) {
    // A demo has only the shops of visitors.
    shops.delete(0);

    // Shops end after a day.
    setInterval(() => {
        for (const [s, shop] of shops) if (Date.now() - shop.opened > DAY) shops.delete(s);
    }, 10 * 60 * 1000).unref();

    // The shop for a new visitor at `address`: a new one, or once the address has opened its few this hour, the newest
    // of them again, so nobody is ever turned away and nobody can open thousands.
    const opened = new Map();
    const shopFor = (address) => {
        const recent = (opened.get(address) ?? []).filter((o) => Date.now() - o.at < HOUR && shops.has(o.s));
        opened.set(address, recent);
        if (recent.length >= SHOPS_AN_HOUR) return recent[recent.length - 1].s;
        let s;
        do s = randomInt(100000, 1000000);
        while (shops.has(s));
        shops.set(s, openShop(s));
        recent.push({ s, at: Date.now() });
        return s;
    };

    // A window as someone else: the page at /as/<token> is the shop page for the person of the token.
    app.use((req, res, next) => {
        const found = req.method === 'GET' && /^\/as\/([\w.-]+)$/.exec(req.path);
        if (found) {
            req.headers.authorization = 'Bearer ' + found[1];
            req.url = '/';
        }
        next();
    });

    // A new visitor: a shop of their own, and they are its Ann.
    app.get('/login', (req, res) => {
        req.session.user = shopFor(req.ip) * 100 + 34;
        res.redirect('/');
    });

    // The mobile app demo: this server is that of the Capacitor app, whose build (WORDPLUS_DEMO_APP) the page shows in a
    // phone, signed in as Ben with his window token.
    const phone = stack === 'mobile' && process.env.WORDPLUS_DEMO_APP;
    if (phone) app.use('/app', express.static(process.env.WORDPLUS_DEMO_APP));

    const [, name, repository] = STACKS.find(([slug]) => slug === stack);
    const example = stack === 'mobile' ? 'capacitor' : stack;
    // The code under each card, "See the code": the parts of this example marked `#region demo: <card>`, which the build of the
    // demo sites cuts from its source into WORDPLUS_DEMO_CODE, by stack.
    const code = process.env.WORDPLUS_DEMO_CODE ? JSON.parse(readFileSync(process.env.WORDPLUS_DEMO_CODE, 'utf8'))[stack] ?? null : null;

    return (me) => {
        const ben = peopleOf(me.shop).find((p) => p.id % 100 === 42);
        return {
            stack,
            name,
            guide: `https://docs.wordplus.cloud/${stack}/getting-started/`,
            source: `https://github.com/wordplus-cloud/${repository}/tree/main/examples/${example}`,
            sites: STACKS.map(([slug, label]) => ({ stack: slug, name: label, url: SITES.replace('{case}', slug) })),
            // This window person, which the page sends with every request. And the others, each a window of their own.
            token: sign(me.id),
            open: peopleOf(me.shop).filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name, url: `/as/${sign(p.id)}` })),
            ends: shops.get(me.shop).opened + DAY,
            limits: { call: CALL_S, meeting: MEETING_S },
            ...(code ? { code } : {}),
            ...(phone && me.id !== ben.id ? { phone: { name: ben.name, url: `/app/#${sign(ben.id)}` } } : {}),
        };
    };
}
