import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// "Build a team intranet" (docs/nextjs/team-intranet.md) quotes examples/team-space: every block with a file's title is
// that file, or parts of it, as it is now: each run of lines between blank lines is in the file. The example's demo
// lines (its "How this page works", and the public demo's worlds) are not quoted.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(join(root, 'docs', 'nextjs', 'team-intranet.md'), 'utf8');
const example = join(root, 'examples', 'team-space');

const DEMO = /HowItWorks|WORLDS|public demo/;
const asQuoted = (text: string) => text.split('\n').filter((line) => !DEMO.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');

const quoted = [...guide.matchAll(/^```\w+ title="([^"]+)"\n([\s\S]*?)\n```$/gm)].map(([, file, text]) => ({ file, text }));

describe('the team intranet guide', () => {
    it('quotes the files of its example', () => {
        expect(quoted.length).toBeGreaterThan(10);
        for (const { file, text } of quoted) {
            const path = join(example, file);
            expect(existsSync(path), `${file} is in examples/team-space`).toBe(true);
            const shown = asQuoted(readFileSync(path, 'utf8'));
            for (const part of text.split(/\n\n+/)) expect(shown, `the guide quotes ${file} as it is`).toContain(part);
        }
    });

    it('quotes the realtime side whole, with none of the public demo in it', () => {
        // The files a reader adds to their own app: whole, not a part.
        for (const file of ['lib/realtime.ts', 'app/api/meeting-token/route.ts', 'app/api/chat-call-token/route.ts', 'app/api/realtime/auth/route.ts', 'app/api/realtime/calls/route.ts', 'app/api/realtime/[...path]/route.ts', 'app/(app)/layout.tsx', 'app/(app)/teams/[id]/meeting.tsx', 'app/(app)/people/[id]/chat.tsx']) {
            const block = quoted.find((q) => q.file === file);
            expect(block, `${file} is quoted`).toBeDefined();
            expect(asQuoted(readFileSync(join(example, file), 'utf8')).trim()).toBe(block!.text.trim());
            expect(block!.text, `${file} as quoted names no world`).not.toMatch(/worlds|WORLDS/);
        }
    });
});
