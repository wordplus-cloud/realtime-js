import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../scripts/samples.mjs';

// Every ts, tsx, js and jsx block of the docs, the README and the skill compiles against the package as it is
// (scripts/samples.mjs, which says what a block may take as given): a sample that names what the package no longer has,
// or calls it wrongly, fails here with its page and line.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shown = (errors: Array<{ page: string; line: number; column: number; code: string; message: string }>) => errors.map((e) => `${e.page}:${e.line}:${e.column} ${e.code} ${e.message}`);

describe('the samples of the docs', () => {
    it('compile against the package', async () => {
        const { checked, fragments, errors } = await check();
        expect(checked).toBeGreaterThan(550);
        expect(shown(errors)).toEqual([]);
        // The parts of something larger, marked ```ts fragment and not compiled, by their page and first line: an option
        // alone, a tag with no end, the skill's cheat sheet. Another one is a choice, not a way around this test.
        expect(fragments.map(({ page, first }) => `${page}: ${first}`)).toEqual([
            'docs/encryption.md: createRealtime( { …, generations: {',
            "docs/getting-started.md: <RealtimeProvider options={ { app: 's1500000007', endpoint: 'https://functions.example.com/api/realtime', headers: { Authorization: 'Bearer ' + token } } }>",
            'docs/nextjs/calls.md: <CallSpot call={ room } tokenUrl={ tokenUrl } join={ join } joinWith="microphone" className="h-96">',
            'docs/nextjs/encryption.md: profile: async ( user ) => {',
            "skills/wordplus-realtime-apps/SKILL.md: 'use client';",
        ]);
    }, 120_000);

    it('fail on the line of a mistake, and take the app\'s own as it is', async () => {
        // test/samples/planted.md: a method misspelled, a name the package doesn't export, a connection that may not be
        // up yet in TypeScript and an option no one has in JavaScript, beside the app's own names, a route's body, markup
        // and a fragment, which pass.
        const { errors } = await check({ dir: join(root, 'node_modules', '.cache', 'samples-planted'), from: ['test/samples/planted.md'] });
        expect(errors.map((e) => `${e.page}:${e.line} ${e.code}`)).toEqual([
            'test/samples/planted.md:13 TS2551',
            'test/samples/planted.md:18 TS2724',
            'test/samples/planted.md:23 TS18047',
            'test/samples/planted.md:27 TS2353',
        ]);
    }, 120_000);
});
