import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every guide teaches one first call and one first stream: a route of the app that answers callToken() or streamToken()
// for the signed-in user, then the button, element or component that asks it (asked on 2026-11-09: "the users application
// provides the authorization token to client to start call so we need to make a clear that in api and examples"). A
// rule is the other way, in a section of its own, "By a rule", after the token way. The guides of PHP and Python hold
// their own pages to the same (realtime-php's DocsTest, realtime-python's test_docs).

const docs = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');

/** The text of a page's `## heading` section, up to the next `## `. */
function section(page: string, heading: string): string {
    const text = readFileSync(join(docs, page), 'utf8');
    const start = text.indexOf(`\n## ${heading}\n`);
    expect(start, `${page}: ## ${heading}`).toBeGreaterThan(-1);
    const end = text.indexOf('\n## ', start + 1);
    return text.slice(start, end < 0 ? undefined : end);
}

const TOKEN_URL = /tokenUrl=|token-url=/;
const RULES = /realtime\.(calls|groupCalls|streams)\(/;

describe('the first call and the first stream', () => {
    for (const guide of ['nextjs', 'express']) {
        it(`are by a token in ${guide}`, () => {
            const call = section(`${guide}/calls.md`, 'Your first call');
            expect(call).toMatch(/realtime\.callToken\(/);
            expect(call).toMatch(TOKEN_URL);
            expect(call).not.toMatch(RULES);

            const stream = section(`${guide}/streams.md`, 'Your first stream');
            expect(stream).toMatch(/realtime\.streamToken\(/);
            expect(stream).toMatch(TOKEN_URL);
            expect(stream).not.toMatch(RULES);

            // Group calls too: the token first, the rule named after it.
            expect(section(`${guide}/calls.md`, 'Who may call')).toMatch(/realtime\.groupCallToken\(/);
            expect(section(`${guide}/calls.md`, 'Group calls')).toMatch(TOKEN_URL);
        });

        it(`name the rule as the other way in ${guide}`, () => {
            const who = section(`${guide}/calls.md`, 'Who may call');
            expect(who.indexOf('\n### By a rule\n'), 'calls: By a rule').toBeGreaterThan(who.indexOf('realtime.callToken('));
            expect(who).toMatch(/realtime\.calls\(/);

            const whoIs = section(`${guide}/streams.md`, 'Who is who');
            expect(whoIs.indexOf('\n### By a rule\n'), 'streams: By a rule').toBeGreaterThan(whoIs.indexOf('realtime.streamToken('));
            expect(whoIs).toMatch(/realtime\.streams\(/);
        });
    }

    it('are by a token in the pages of every stack', () => {
        expect(section('calls.md', 'Your first call')).toMatch(/realtime\.callToken\(/);
        expect(section('streams.md', 'Your first stream')).toMatch(/realtime\.streamToken\(/);
    });
});
