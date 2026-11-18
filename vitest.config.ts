import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The served browser files are written before the tests run (scripts/files.mjs): src/server/files is not kept in git.
// Next.js is an optional peer no test installs: next.test.ts mocks the one thing next.tsx uses of it, which must resolve.
export default defineConfig({
    resolve: { alias: { 'next/headers': fileURLToPath(new URL('./test/stubs/next-headers.ts', import.meta.url)) } },
    test: { globalSetup: ['./scripts/files-setup.mjs'] },
});
