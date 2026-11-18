import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The ready-made React parts of @wordplus/realtime-ui find the page's connection in <RealtimeProvider>, so none takes
// `rt` (npm's 1.1.0 still asked for it), and GroupCallButton names its call `call`, `room` being its first name: as the
// Next.js getting-started guide writes them. The docs, the apps the whole-site guides are made from, and the shop of the
// Next.js guide's example say nothing older.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WHOLE_SITES = ['community', 'consultations', 'dating', 'lessons', 'marketplace', 'team-space', 'nextjs'];
const OLD = [/\brt=\{/, /<GroupCallButton\b[^>]*\sroom=/];

const filesOf = (folder: string, kind: RegExp) => readdirSync(folder, { recursive: true }).map(String).filter((f) => kind.test(f)).map((f) => join(folder, f));

/**
 * The calls `realtime.room( name, options, rule )` in a text: the order src/server/index.ts marks deprecated, the options
 * before the rule, each as its first line. JavaScript's calls: PHP's `->room(` is left out, and Python's, a rule by name
 * and its options as keywords, never matches. The arguments are split where a comma stands outside brackets, strings and
 * comments, and a rule is a function written there.
 */
export function oldRoomOrder(text: string): string[] {
    const found: string[] = [];
    const isRule = (arg: string) => /^\s*(async\b|function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(arg);
    for (const call of text.matchAll(/(?<![\w$>])room\s*\(/g)) {
        const open = call.index + call[0].length - 1;
        const cuts: number[] = [];
        let depth = 0;
        let quote: string | null = null;
        let end = -1;
        for (let i = open; i < text.length && end < 0; i++) {
            const c = text[i];
            if (quote) {
                if (c === '\\') i++;
                else if (c === quote) quote = null;
            } else if (c === '/' && text[i + 1] === '/') {
                i = text.indexOf('\n', i) - 1;
                if (i < 0) break;
            } else if (c === '"' || c === "'" || c === '`') quote = c;
            else if ('([{'.includes(c)) depth++;
            else if (')]}'.includes(c) && --depth === 0) end = i;
            else if (c === ',' && depth === 1) cuts.push(i);
        }
        if (end < 0 || cuts.length < 2) continue;
        const [name, options, rule] = [text.slice(open + 1, cuts[0]), text.slice(cuts[0] + 1, cuts[1]), text.slice(cuts[1] + 1, cuts[2] ?? end)];
        if (/^\s*['"`]/.test(name) && !isRule(options) && !/^\s*(null|undefined)\s*$/.test(options) && isRule(rule)) found.push(text.slice(call.index, text.indexOf('\n', call.index)));
    }
    return found;
}

describe('the current names', () => {
    it('are the only ones in the docs and the whole-site examples', () => {
        const pages = [...filesOf(join(root, 'docs'), /\.md$/), join(root, 'README.md'), join(root, 'skills', 'wordplus-realtime-apps', 'SKILL.md')];
        const apps = WHOLE_SITES.flatMap((site) => filesOf(join(root, 'examples', site, 'app'), /\.tsx?$/));
        expect(apps.length).toBeGreaterThan(100);
        for (const file of [...pages, ...apps]) {
            const text = readFileSync(file, 'utf8');
            for (const old of OLD) expect(text, file).not.toMatch(old);
        }
    });

    it('write room() with its rule before its options, in the docs, the README, the skill and every example', () => {
        const examples = filesOf(join(root, 'examples'), /\.(md|mjs|js|ts|tsx)$/).filter((f) => !/[/\\](node_modules|public|\.next)[/\\]/.test(f));
        const pages = [...filesOf(join(root, 'docs'), /\.md$/), ...filesOf(join(root, 'skills'), /\.md$/), join(root, 'README.md'), join(root, 'llms.txt')];
        expect(examples.length).toBeGreaterThan(100);
        for (const file of [...pages, ...examples]) expect(oldRoomOrder(readFileSync(file, 'utf8')), file).toEqual([]);
    });

    it('find the old order however a call is laid out, and nothing else', () => {
        expect(oldRoomOrder("realtime.room('shop', { presence: true }, (user) => member(user, 0));")).toHaveLength(1);
        expect(oldRoomOrder("realtime.room( 'chat:{a}:{b}', chat, ( user, { a, b } ) => [ a, b ].includes( String( user ) ) );")).toHaveLength(1);
        expect(oldRoomOrder("realtime.room(\n    'chat:{id}',\n    {\n        history: 50, // the last 50, for a page that's back\n    },\n    async (user, { id }) => mayChat(user, id),\n);")).toHaveLength(1);
        expect(oldRoomOrder("realtime.room( 'help:{id}', help, async function ( user ) { return true; } );")).toHaveLength(1);
        for (const current of [
            "realtime.room('shop', (user) => member(user, 0), { presence: true });",
            "realtime.room( 'help:{id}', async ( user, { id } ) => {\n    return true;\n}, help );",
            "realtime.room('product:{id}', { public: true, count: true });",
            "realtime.room('chat:{pair}');",
            "$realtime->room( 'chat:{a}:{b}', function ( $user, array $p ) { return true; }, $chat );",
            'realtime.room("chat:{a}:{b}", may_join_pair, **chat)',
            "realtime.room('x', null, { public: true });",
        ]) expect(oldRoomOrder(current), current).toEqual([]);
    });
});

// The guides, tutorials and use cases start a call, a group call and a stream from a token of the app's own route
// (realtime.callToken(), groupCallToken(), streamToken()), and so do the examples they quote and what init writes,
// the shop page every stack shares (examples/shop, which the PHP and Python examples serve too) and the Express and
// Capacitor examples that serve it here. A rule stays only in the reference pages' By a rule sections and the WordPress
// tabs (the plugin's own pages ask its rules). The chat pages, the support desk and the marketplace chat among the use
// cases, are held to it as well.
const BY_TOKEN_PAGES = [
    ...['dating-site', 'live-lessons', 'marketplace', 'community', 'consultations', 'team-intranet', 'example'].map((page) => join(root, 'docs', 'nextjs', page + '.md')),
    join(root, 'docs', 'express', 'example.md'),
    ...filesOf(join(root, 'docs', 'use-cases'), /\.md$/),
];
const BY_TOKEN_EXAMPLES = ['community', 'consultations', 'dating', 'lessons', 'marketplace', 'team-space', 'nextjs', 'support-calls', 'team-meetings', 'live-streaming', 'hono', 'shop', 'capacitor'];
const RULE_FIRST = [/realtime\.(calls|groupCalls|streams)\(\s*['"`]/, /\brt\??\.(call|groupCall|stream)\(\s*['"`]/, /call=["{][^"}]*\{pair\}/, /\bcanCall\b/, /\ballowCalls\b/];
// kick() of a room in Node, PHP and Python, which is remove() now. WordPress keeps in() and kick(), and
// wordplus_realtime() never matches here.
const OLD_NAMES = [/\brealtime\.in\(/, /\$realtime->in\(/, /\.in_room\(/, /\bsite: process\.env/, /(?<![\w$])\$?realtime(\.|->)(room|in)\([^)]*\)(\.|->)kick\(/];
// The reference pages keep their By a rule sections, so only the old names are checked there.
const REFERENCE_PAGES = ['rooms', 'sending', 'server', 'permissions', 'presence', 'encryption'].map((page) => join(root, 'docs', page + '.md'));

describe('the guides and their examples', () => {
    it('start calls, group calls and streams from a token, on the current names', () => {
        const examples = BY_TOKEN_EXAMPLES.flatMap((site) => filesOf(join(root, 'examples', site), /\.(md|mjs|js|ts|tsx)$/)).filter((f) => !/[/\\](node_modules|public|\.next)[/\\]/.test(f));
        expect(BY_TOKEN_PAGES.length).toBeGreaterThan(20);
        expect(examples.length).toBeGreaterThan(100);
        for (const file of [...BY_TOKEN_PAGES, ...examples, join(root, 'bin', 'wordplus-realtime.mjs')]) {
            const text = readFileSync(file, 'utf8');
            for (const old of [...RULE_FIRST, ...OLD_NAMES]) expect(text, file).not.toMatch(old);
        }
    });

    it('and the reference pages ask a room on its current names', () => {
        for (const file of REFERENCE_PAGES) {
            const text = readFileSync(file, 'utf8');
            for (const old of OLD_NAMES) expect(text, file).not.toMatch(old);
        }
    });

    it('know kick() of a room from the WordPress one', () => {
        const kick = OLD_NAMES[OLD_NAMES.length - 1];
        for (const old of ["await realtime.in( 'x' ).kick( 4 );", "realtime.room( 'x' ).kick( 4 );", "$realtime->room( 'x' )->kick( 4 );", 'realtime.room("x").kick(4)']) expect(old, old).toMatch(kick);
        for (const current of ["wordplus_realtime()->in( 'x' )->kick( 4 );", "realtime.room( 'x' ).remove( 4 );", "stream.kick( 4 );"]) expect(current, current).not.toMatch(kick);
    });

    it('the shop every stack shares asks its server routes for each token, and Express answers them', () => {
        const page = readFileSync(join(root, 'examples', 'shop', 'shop.js'), 'utf8');
        for (const route of ['callToken', 'meetingToken', 'showToken']) expect(page).toContain('token-url="${shop.routes.' + route + '}"');
        expect(page).toMatch(/<group-call-button call="\$\{shop\.rooms\.meeting\}"/);
        for (const copy of ['express', 'capacitor']) expect(readFileSync(join(root, 'examples', copy, 'shop', 'shop.js'), 'utf8'), copy).toBe(page);

        const server = readFileSync(join(root, 'examples', 'express', 'server.mjs'), 'utf8');
        for (const route of ['call-token', 'meeting-token', 'show-token']) expect(server).toContain(`app.get('/api/${route}'`);
        for (const made of ['realtime.callToken(', 'realtime.groupCallToken(', 'realtime.streamToken(']) expect(server).toContain(made);
    });
});
