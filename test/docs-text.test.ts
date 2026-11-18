import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// What a reader of the docs would trip on, page by page (reports/launch/F-head.md of wordplus-cloud, section 5): inline
// code that a backtick inside it breaks, and a file named as "in this package" that npm's package doesn't carry.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
    ...readdirSync(join(root, 'docs'), { recursive: true }).map(String).filter((f) => f.endsWith('.md')).map((f) => join('docs', f)),
    'README.md',
];

/** Each line of a page outside its fenced blocks, with its number. */
function prose(page: string): [number, string][] {
    const lines: [number, string][] = [];
    let fence: string | null = null;
    readFileSync(join(root, page), 'utf8').split('\n').forEach((line, i) => {
        const open = /^\s*(`{3,}|~{3,})/.exec(line);
        if (open && (fence === null || open[1].startsWith(fence))) fence = fence === null ? open[1] : null;
        else if (fence === null) lines.push([i + 1, line]);
    });
    return lines;
}

/**
 * The runs of backticks a line leaves unclosed, as CommonMark reads code: a run opens a span that the next run of the
 * same length closes, and one with none after it is shown as backticks. `() => `chat:${ id }`` ends on one.
 */
function unclosed(line: string): string[] {
    const runs = [...line.matchAll(/`+/g)].map((m) => m[0]);
    const left: string[] = [];
    for (let i = 0; i < runs.length; i++) {
        const close = runs.indexOf(runs[i], i + 1);
        if (close < 0) left.push(runs[i]);
        else i = close;
    }
    return left;
}

describe('the docs as a reader sees them', () => {
    it('close every code span they open', () => {
        const broken = pages.flatMap((page) => prose(page).filter(([, line]) => unclosed(line).length).map(([n, line]) => `${page}:${n}: ${line.trim().slice(0, 120)}`));
        expect(broken).toEqual([]);
    });

    it('find unclosed code as CommonMark does', () => {
        expect(unclosed('as one: `() => `chat:${ id }``. Used')).toEqual(['``']);
        expect(unclosed('as one: `` () => `chat:${ id }` ``. Used')).toEqual([]);
    });

    it('say "in this package" only of what npm carries', () => {
        const files: string[] = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).files;
        const under = (path: string, f: string) => path === f || path.startsWith(f + '/');
        const carried = (path: string) => files.some((f) => under(path, f)) && !files.some((f) => f.startsWith('!') && under(path, f.slice(1)));
        for (const page of pages) {
            for (const [, path] of readFileSync(join(root, page), 'utf8').matchAll(/`([\w./-]+)` in this package/g)) {
                expect(carried(path), `${page}: ${path}`).toBe(true);
            }
        }
    });

    // Held out of the release (asked on 2026-11-17): the page stays here for the docs site, and the release snapshot
    // (git archive, .gitattributes) and the npm package (package.json "files") leave it out, below.
    it.skipIf(!existsSync(join(root, 'docs', 'recording.md')))('give the recording page its server code in Node, PHP and Python, as every Other apps page has it', () => {
        const text = readFileSync(join(root, 'docs', 'recording.md'), 'utf8');
        const tabs = [...text.matchAll(/^\*\*(Node|PHP|Python)\*\*$/gm)].map((m) => m[1]).join(' ');
        // Who may record, from your server, and taking the files.
        expect(tabs).toBe(Array(3).fill('Node PHP Python').join(' '));
        expect(text).toMatch(/\$realtime->recordings\(\)->start\(/);
        expect(text).toMatch(/realtime\.recordings\.start\(call=/);
        // A reader of the apps docs doesn't know the WordPress side by its name.
        expect(text).not.toMatch(/WordPlus SDK/);
    });

    it('link files outside docs/ that the repository has', () => {
        for (const page of pages.filter((p) => p.startsWith('docs/'))) {
            for (const [, target] of readFileSync(join(root, page), 'utf8').matchAll(/\]\((\.\.\/[^)#\s]+)/g)) {
                expect(existsSync(join(root, dirname(page), target)), `${page} → ${target}`).toBe(true);
            }
        }
    });

    it('keep the held recording page out of the npm package and the release snapshot, and link to it from nothing that ships', () => {
        const held = ['docs/recording.md', 'skills/wordplus-realtime-apps/references/recording.md'];
        const files: string[] = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).files;
        // The package's .gitattributes leaves itself out of the release snapshot, which has the release's own in its place
        // (and no test/e2e, which the package's leaves out too), so a snapshot checks the package alone.
        const own = existsSync(join(root, 'test', 'e2e')) && existsSync(join(root, '.gitattributes'));
        const attributes = own ? readFileSync(join(root, '.gitattributes'), 'utf8') : null;
        for (const path of held) {
            expect(files, path).toContain('!' + path);
            if (attributes !== null) expect(attributes, path).toMatch(new RegExp('^/' + path.replace(/[.]/g, '\\.') + '\\s+export-ignore$', 'm'));
        }
        const shipped = [...pages.filter((p) => p !== 'docs/recording.md'), 'llms.txt', 'AGENTS.md', 'skills/wordplus-realtime-apps/SKILL.md'];
        for (const page of shipped) expect(readFileSync(join(root, page), 'utf8'), page).not.toMatch(/\]\([^)]*recording\.md/);
    });
});
