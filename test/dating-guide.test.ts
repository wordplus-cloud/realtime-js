import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// "Build a dating site" (docs/nextjs/dating-site.md) quotes examples/dating: every block with a file's title is that
// file, or a part of it, as it is now. The example's demo lines (its "How this page works") are not quoted.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(join(root, 'docs', 'nextjs', 'dating-site.md'), 'utf8');
const example = join(root, 'examples', 'dating');

const DEMO = /HowItWorks/;
const asQuoted = (text: string) => text.split('\n').filter((line) => !DEMO.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');

const quoted = [...guide.matchAll(/^```\w+ title="([^"]+)"\n([\s\S]*?)\n```$/gm)].map(([, file, text]) => ({ file, text }));

describe('the dating site guide', () => {
    it('quotes the files of its example', () => {
        expect(quoted.length).toBeGreaterThan(10);
        for (const { file, text } of quoted) {
            const path = join(example, file);
            expect(existsSync(path), `${file} is in examples/dating`).toBe(true);
            expect(asQuoted(readFileSync(path, 'utf8')), `the guide quotes ${file} as it is`).toContain(text);
        }
    });

    it('quotes the realtime side whole', () => {
        // The files a reader adds to their own app: whole, not a part.
        for (const file of ['lib/realtime.ts', 'app/api/realtime/[...path]/route.ts', 'app/(app)/layout.tsx', 'app/(app)/members/[id]/chat.tsx', 'app/(app)/members/catalog.tsx']) {
            const block = quoted.find((q) => q.file === file);
            expect(block, `${file} is quoted`).toBeDefined();
            expect(asQuoted(readFileSync(join(example, file), 'utf8')).trim()).toBe(block!.text.trim());
        }
    });
});
