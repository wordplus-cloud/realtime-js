import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The HTTP API pages (docs/api/) show code that is checked elsewhere: the helpers of examples/http-api against the test
// values and the API, the Go example end to end (test/e2e/http-api.mjs). So the pages carry that code exactly, and the
// OpenAPI file names every route the realtime server answers.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = (name: string) => readFileSync(join(root, 'docs', 'api', name), 'utf8');
const example = (path: string) => readFileSync(join(root, 'examples', 'http-api', path), 'utf8').replace(/\n$/, '');

describe('the HTTP API pages', () => {
    it('show each request helper exactly as it is checked', () => {
        const signing = page('signing.md');
        for (const file of ['curl/wordplus.sh', 'node/wordplus.mjs', 'python/wordplus.py', 'php/wordplus.php']) {
            expect(signing, file).toContain(example(file));
        }
    });

    it('quote the Go example exactly', () => {
        const go = page('go.md');
        const main = example('go/main.go');
        for (const name of ['auth', 'webhook']) {
            const start = main.indexOf(`func ${name}(`);
            const body = main.slice(start, main.indexOf('\n}\n', start) + 2);
            expect(body.length, name).toBeGreaterThan(20);
            expect(go, name).toContain(body);
        }
    });

    it('describe every route of the realtime server in the OpenAPI file', () => {
        const spec = readFileSync(join(root, 'spec', 'openapi.yaml'), 'utf8');
        const routes = [
            '/wordplus/realtime/emit:', '/wordplus/realtime/emit/batch:', '/wordplus/realtime/rooms:', '/wordplus/realtime/rooms/{name}:', '/wordplus/realtime/rooms/{name}/history:',
            '/wordplus/realtime/rooms/{name}/kick:', '/wordplus/realtime/online:', '/wordplus/realtime/users/{id}:', '/wordplus/realtime/users/{id}/disconnect:',
            '/wordplus/realtime/users/{id}/ask:', '/wordplus/realtime/streams:', '/wordplus/realtime/streams/{name}:', '/wordplus/realtime/streams/{name}/people:',
            '/wordplus/realtime/streams/{name}/chat:', '/wordplus/realtime/streams/{name}/chat/{id}:', '/wordplus/realtime/streams/{name}/pin:',
            '/wordplus/realtime/streams/{name}/slow:', '/wordplus/realtime/streams/{name}/end:', '/wordplus/realtime/streams/{name}/reactions:',
            '/wordplus/realtime/streams/{name}/kick:', '/wordplus/realtime/streams/{name}/ban:', '/wordplus/realtime/streams/{name}/unban:',
            '/wordplus/realtime/streams/{name}/bans:', '/wordplus/realtime/streams/{name}/timeout:', '/wordplus/realtime/streams/{name}/untimeout:',
            '/wordplus/realtime/calls:', '/wordplus/realtime/calls/{name}:', '/wordplus/realtime/calls/{name}/mute:', '/wordplus/realtime/calls/{name}/remove:',
            '/wordplus/realtime/calls/{name}/permit:', '/wordplus/realtime/calls/{name}/end:', '/wordplus/realtime/usage:', '/wordplus/realtime/webhooks:', '/wordplus/realtime/webhooks/{id}/resend:',
            '/wordplus/realtime/webhooks/test:',
        ];
        for (const route of routes) expect(spec, route).toContain('\n  ' + route + '\n');
        // Every request has an example in each of the five languages, and the webhook its check in the four with a server.
        const samples = codeSamples(spec);
        expect(samples).toHaveLength(39);
        for (const set of samples.slice(0, 38)) expect(set.map((s) => s.label).join(',')).toBe('curl,Node,Python,PHP,Go');
        expect(samples[38].map((s) => s.label).join(',')).toBe('Node,Python,PHP,Go');
    });

    it('check the webhook in the reference exactly as the webhooks page does', () => {
        const webhooks = page('webhooks.md');
        const part = webhooks.slice(webhooks.indexOf('## Checking it'), webhooks.indexOf('## The events'));
        const blocks = [...part.matchAll(/```(?:js|python|php|go)\n([\s\S]*?)```/g)].map((m) => m[1]);
        const spec = readFileSync(join(root, 'spec', 'openapi.yaml'), 'utf8');
        expect(codeSamples(spec).at(-1)!.map((s) => s.source)).toEqual(blocks);
    });
});

/** Each x-codeSamples list of the OpenAPI file, in order: the label and the source of each sample, as YAML reads a `|` block. */
function codeSamples(spec: string) {
    return spec.split('x-codeSamples:\n').slice(1).map((rest) => {
        const lines = rest.split('\n');
        const end = lines.findIndex((line) => line !== '' && !line.startsWith('        '));
        return lines.slice(0, end).join('\n').split(/^        - lang: .*\n/m).slice(1).map((sample) => ({
            label: /label: (.+)/.exec(sample)![1],
            source: sample.split('source: |\n')[1].replace(/\n+$/, '\n').split('\n').map((line) => line.slice(12)).join('\n'),
        }));
    });
}
