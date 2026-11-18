// Where next/headers resolves in the tests, which mock it: Next.js isn't installed here (vitest.config.ts).
export const headers = async (): Promise<Headers> => new Headers();
