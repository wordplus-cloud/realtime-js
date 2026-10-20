import { defineConfig } from 'vitest/config';

// The served browser files are written before the tests run (scripts/files.mjs): src/server/files is not kept in git.
export default defineConfig({ test: { globalSetup: ['./scripts/files-setup.mjs'] } });
