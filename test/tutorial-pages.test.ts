import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The tutorials of docs/use-cases show their example's four files whole, as a reader copies them into an empty folder:
// each block titled with a file's name is that file of examples/, byte for byte. test/e2e/tutorials.mjs checks the same
// before it runs each tutorial, but only where the local realtime server is; this holds it in every run of the suite.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TUTORIALS = { 'support-calls.md': 'support-calls', 'meetings.md': 'team-meetings', 'live-streaming.md': 'live-streaming' };
const FILES = [['package.json', 'package.json'], ['.env', '.env.example'], ['server.mjs', 'server.mjs'], ['page.js', 'page.js']];

describe('the tutorials', () => {
    for (const [page, example] of Object.entries(TUTORIALS)) {
        it(`${page} shows the files of examples/${example} as they are`, () => {
            const text = readFileSync(join(root, 'docs', 'use-cases', page), 'utf8');
            for (const [title, file] of FILES) {
                const shown = text.match(new RegExp('```\\w+ title="' + title.replace('.', '\\.') + '"\\n([\\s\\S]*?)\\n```'));
                expect(shown, `${page} has a block titled ${title}`).not.toBeNull();
                expect(shown![1] + '\n', `${page}'s ${title}`).toBe(readFileSync(join(root, 'examples', example, file), 'utf8'));
            }
        });
    }
});
