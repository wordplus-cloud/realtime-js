import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// "Build a marketplace" (docs/nextjs/marketplace.md) quotes examples/marketplace: every block with a file's title is
// that file, or parts of it as it is now, each part a run of lines up to a blank line. The example's demo lines (its
// "How this page works") are not quoted.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(join(root, 'docs', 'nextjs', 'marketplace.md'), 'utf8');
const example = join(root, 'examples', 'marketplace');

const DEMO = /HowItWorks/;
const asQuoted = (text: string) => text.split('\n').filter((line) => !DEMO.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');

const quoted = [...guide.matchAll(/^```\w+ title="([^"]+)"\n([\s\S]*?)\n```$/gm)].map(([, file, text]) => ({ file, text }));

describe('the marketplace guide', () => {
    it('quotes the files of its example', () => {
        expect(quoted.length).toBeGreaterThan(10);
        for (const { file, text } of quoted) {
            const path = join(example, file);
            expect(existsSync(path), `${file} is in examples/marketplace`).toBe(true);
            const own = asQuoted(readFileSync(path, 'utf8'));
            for (const part of text.split(/\n\n+/)) expect(own, `the guide quotes ${file} as it is`).toContain(part);
        }
    });

    it('quotes the realtime side whole, and starts a call from a token of its own route', () => {
        // The files a reader adds to their own app: whole, not a part.
        for (const file of ['lib/realtime.ts', 'app/api/realtime/[...path]/route.ts', 'app/api/realtime/calls/route.ts', 'app/api/deal-call-token/route.ts', 'app/(app)/layout.tsx', 'app/(app)/messages/[id]/chat.tsx']) {
            const block = quoted.find((q) => q.file === file);
            expect(block, `${file} is quoted`).toBeDefined();
            expect(asQuoted(readFileSync(join(example, file), 'utf8')).trim()).toBe(block!.text.trim());
        }
        expect(readFileSync(join(example, 'lib/realtime.ts'), 'utf8')).not.toMatch(/realtime\.calls\(/);
        expect(readFileSync(join(example, 'app/api/deal-call-token/route.ts'), 'utf8')).toContain('realtime.callToken(me, to');
    });
});
