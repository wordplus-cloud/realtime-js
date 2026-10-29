// "How this page works" on the demo's pages: how-it-works.md, its cards and their steps, with the code coloured, into
// lib/how-it-works.json, before `next dev` and `next build`. The pages show it only on the demo (MARKET_DEMO=1), so a site
// made from this one shows none.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeToHtml } from 'shiki';

const root = join(import.meta.dirname, '..');
const source = readFileSync(join(root, 'how-it-works.md'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

/** A paragraph as HTML: its `code` and **bold**, the rest as text. */
const inline = (text) => text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/** A line as it is compared with the file: without its comment at the end, Tailwind's classes and its indent. */
const bare = (line) => line.replace(/\s+\/\/\s.*$/, '').replace(/ className="[^"]*"/g, '').trim();
/** A line of a card's code that is only a comment, such as // … for lines left out. */
const isComment = (line) => /^(\/\/|\/\*|\*|\{\/\*)/.test(line.trim());

/** Every line of code a card shows is the site's own, in the file it names. */
function check(key, file, code) {
    const lines = new Set(readFileSync(join(root, file), 'utf8').split('\n').map(bare));
    const missing = code.filter((line) => line.trim() && !isComment(line) && !lines.has(bare(line)));
    if (missing.length) throw new Error(`how-it-works.md, ${key}: not in ${file}:\n${missing.join('\n')}`);
}

/**
 * A run through several files ("All together"): each part under a line naming its file, // app/api/messages/route.ts,
 * is checked against that file, up to the next blank line. A line of code outside such a part is refused.
 */
function checkParts(key, code) {
    let file = null;
    let part = [];
    const end = () => {
        if (file) check(key, file, part);
        file = null;
        part = [];
    };
    for (const line of code) {
        const named = /^\/\/ ((?:app|lib|db)\/\S+\.(?:tsx?|mjs|sql))$/.exec(line.trim());
        if (named) {
            end();
            file = named[1];
        } else if (!line.trim()) {
            end();
        } else if (file) {
            part.push(line);
        } else if (!isComment(line)) {
            throw new Error(`how-it-works.md, ${key}: a line of code with no file named above it:\n${line}`);
        }
    }
    end();
}

const cards = {};
for (const section of source.split(/^## /m).slice(1)) {
    const [heading, ...rest] = section.split('\n');
    const [, key, title] = /^([\w-]+): (.+)$/.exec(heading.trim());
    // Its paragraphs and code blocks, in order, a line at a time: a code block runs from its ``` to the next.
    const blocks = [];
    let paragraph = [];
    const endParagraph = () => {
        if (paragraph.length) blocks.push({ text: inline(paragraph.join(' ')) });
        paragraph = [];
    };
    for (let i = 0; i < rest.length; i++) {
        // ```ts title="lib/realtime.ts" for the site's code, checked against the file, note="All together" for a run
        // through several files, checked a part at a time, or another note="…" for what isn't code, such as an answer.
        const fence = /^```(\w+)(?: (title|note)="([^"]+)")?\s*$/.exec(rest[i]);
        if (fence) {
            endParagraph();
            const code = [];
            while (++i < rest.length && !/^```\s*$/.test(rest[i])) code.push(rest[i]);
            if (fence[2] === 'title') check(key, fence[3], code);
            if (fence[2] === 'note' && fence[3] === 'All together') checkParts(key, code);
            const html = await codeToHtml(code.join('\n'), { lang: fence[1], theme: 'github-dark-default' });
            // The page fills each __value__ in: one the colouring split would stay as it is.
            const split = [...code.join('\n').matchAll(/__[a-z0-9_]+__/g)].map(([v]) => v).filter((v) => !html.includes(v));
            if (split.length) throw new Error(`how-it-works.md, ${key}: ${split.join(', ')} split by the colouring: put it in a string or a comment`);
            // A step may show several files, one under the other.
            (blocks.at(-1).codes ??= []).push({ file: fence[3] ?? null, html });
        } else if (rest[i].trim()) {
            paragraph.push(rest[i].trim());
        } else {
            endParagraph();
        }
    }
    endParagraph();
    const [about, ...steps] = blocks;
    if (about.codes) throw new Error(`how-it-works.md, ${key}: its first paragraph says what the card is about, with no code under it`);
    cards[key] = { title, about: about.text, steps };
}

writeFileSync(join(root, 'lib/how-it-works.json'), JSON.stringify(cards, null, 1) + '\n');
console.log(`lib/how-it-works.json: ${Object.entries(cards).map(([key, card]) => `${key} (${card.steps.length} steps)`).join(', ')}`);
