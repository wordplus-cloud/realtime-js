// What next.tsx uses of Next.js, an optional peer that only an app on Next.js has installed.
declare module 'next/headers' {
    export function headers(): Promise<Headers>;
}
