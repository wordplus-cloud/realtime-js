// Vitest's global setup: the served browser files, as npm run build writes them (scripts/files.mjs).
export default async function setup() {
    await import('./files.mjs');
}
