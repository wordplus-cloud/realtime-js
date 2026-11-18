import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// "Build a community site" (docs/nextjs/community.md) quotes examples/community: every block with a file's title is that
// file, or parts of it, as it is now. A part is each run of lines between blank lines and lines that only say what is
// left out (// …), so the guide may join a file's functions and leave lines out, and never shows a line the file doesn't
// have. The example's demo lines (its "How this page works") are not quoted.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(join(root, 'docs', 'nextjs', 'community.md'), 'utf8');
const example = join(root, 'examples', 'community');

const DEMO = /HowItWorks/;
const LEFT_OUT = /^\s*(\/\/|\{\/\*|\*|#|--)\s*…/;
const asQuoted = (text: string) => text.split('\n').filter((line) => !DEMO.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');
const partsOf = (text: string) =>
    text
        .split('\n')
        .reduce<string[][]>((parts, line) => {
            if (!line.trim() || LEFT_OUT.test(line)) parts.push([]);
            else parts[parts.length - 1].push(line);
            return parts;
        }, [[]])
        .filter((part) => part.length > 0)
        .map((part) => part.join('\n'));

const quoted = [...guide.matchAll(/^```\w+ title="([^"]+)"\n([\s\S]*?)\n```$/gm)].map(([, file, text]) => ({ file, text }));

describe('the community site guide', () => {
    it('quotes the files of its example', () => {
        expect(quoted.length).toBeGreaterThan(10);
        for (const { file, text } of quoted) {
            const path = join(example, file);
            expect(existsSync(path), `${file} is in examples/community`).toBe(true);
            const own = asQuoted(readFileSync(path, 'utf8'));
            for (const part of partsOf(text)) expect(own, `the guide quotes ${file} as it is`).toContain(part);
        }
    });

    it('quotes the realtime side whole', () => {
        // The files a reader adds to their own app: whole, not a part.
        for (const file of [
            'lib/realtime.ts',
            'app/api/realtime/[...path]/route.ts',
            'app/api/realtime/calls/route.ts',
            'app/api/lounge-token/route.ts',
            'app/api/event-token/route.ts',
            'app/api/chat-call-token/route.ts',
            'app/(app)/layout.tsx',
            'app/(app)/members/[id]/chat.tsx',
        ]) {
            const block = quoted.find((q) => q.file === file);
            expect(block, `${file} is quoted`).toBeDefined();
            expect(asQuoted(readFileSync(join(example, file), 'utf8')).trim()).toBe(block!.text.trim());
        }
    });

    it('starts its calls, lounges and events from tokens of the site, with no rule for them', () => {
        const server = readFileSync(join(example, 'lib', 'realtime.ts'), 'utf8');
        for (const text of [guide, server]) expect(text).not.toMatch(/realtime\.(calls|groupCalls|streams)\(/);
        for (const route of ['lounge-token', 'event-token', 'chat-call-token']) expect(existsSync(join(example, 'app', 'api', route, 'route.ts')), route).toBe(true);
    });
});
