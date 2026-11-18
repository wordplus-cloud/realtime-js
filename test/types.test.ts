import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The types are part of the API: test/types/api.ts is what an app writes, what a compiler should refuse marked so.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('the types', () => {
    it('let an app name its events and members, and refuse what it did not name', () => {
        execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', join(root, 'test/types/tsconfig.json')], { cwd: root, stdio: 'pipe' });
    }, 120_000);

    it('do the same for the Vue, Svelte and Angular helpers', () => {
        // A compile of their own, as they need none of the server part.
        execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', join(root, 'test/types/tsconfig.frameworks.json')], { cwd: root, stdio: 'pipe' });
    }, 120_000);

    it('leave out what the client\'s own modules call on each other', () => {
        for (const [file, names] of [
            ['vendor/realtime-client/rooms.d.ts', ['rideFor(', 'joined(', 'memberJoined', 'firstOf', 'lastId:']],
            ['vendor/realtime-client/sdk-calls/group-call.d.ts', ['livekit', 'takeDevices', 'invited(']],
            ['vendor/realtime-client/sdk-calls/calls.d.ts', ['transportFor', 'joinGroup(', 'forget(']],
        ] as Array<[string, string[]]>) {
            const declared = readFileSync(join(root, file), 'utf8');
            for (const name of names) expect(declared, file + ' declares ' + name).not.toContain(name);
        }
    });

    it('keep what realtime-ui reads of a stream', () => {
        expect(readFileSync(join(root, 'vendor/realtime-client/sdk-calls/stream.d.ts'), 'utf8')).toContain('readonly engine: StreamEngine');
    });
});
