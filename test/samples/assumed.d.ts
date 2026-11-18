// What a sample of the docs may take as given, declared once (scripts/samples.mjs compiles every block with this).
// A block is a part of an app: the app, its database and its signed-in user are the app's, and the imports a page
// leaves out are those its examples have.

/** The app: Express's `app.get( … )`, Hono's, or any framework's. */
declare const app: any;
/** The app's database, whatever it is. */
declare const db: any;
/** The signed-in user, from the app's session, as the app keeps it: its id, or its record with one. */
declare const user: any;
/** The server's connection, `createRealtime()` in the app's lib/realtime.ts. */
declare const realtime: import('@wordplus/realtime/server').Realtime;
/** The page's connection, `await connect()` or `useRealtime()`. */
declare const rt: import('@wordplus/realtime').Realtime;

// The package's names a block uses without importing them, from where the examples import them.
declare const createRealtime: typeof import('@wordplus/realtime/server').createRealtime;
declare const connect: typeof import('@wordplus/realtime').connect;
declare const RealtimeProvider: typeof import('@wordplus/realtime/react').RealtimeProvider;
declare const useRealtime: typeof import('@wordplus/realtime/react').useRealtime;
declare const useConnection: typeof import('@wordplus/realtime/react').useConnection;
declare const useRoom: typeof import('@wordplus/realtime/react').useRoom;
declare const usePresence: typeof import('@wordplus/realtime/react').usePresence;
declare const useOnline: typeof import('@wordplus/realtime/react').useOnline;
declare const useProfiles: typeof import('@wordplus/realtime/react').useProfiles;
declare const useTyping: typeof import('@wordplus/realtime/react').useTyping;
declare const useUserEvent: typeof import('@wordplus/realtime/react').useUserEvent;
declare const useCalls: typeof import('@wordplus/realtime/react').useCalls;
declare const useCall: typeof import('@wordplus/realtime/react').useCall;
declare const useGroupCall: typeof import('@wordplus/realtime/react').useGroupCall;
declare const useStream: typeof import('@wordplus/realtime/react').useStream;
declare const VideoTrack: typeof import('@wordplus/realtime/react').VideoTrack;
declare const AudioTrack: typeof import('@wordplus/realtime/react').AudioTrack;
declare const StreamVideo: typeof import('@wordplus/realtime/react').StreamVideo;
declare const LiveStream: typeof import('@wordplus/realtime/react').LiveStream;
declare const Typing: typeof import('@wordplus/realtime/react').Typing;
// The ready-made screens a block shows without importing them (<CallScreen />, <Chat />, <CallSpot> …) are
// @wordplus/realtime-ui/react's, as the examples import them, and taken as they are.

// React's, as a component of the examples imports them.
declare const useState: typeof import('react').useState;
declare const useEffect: typeof import('react').useEffect;
declare const useRef: typeof import('react').useRef;
declare const useMemo: typeof import('react').useMemo;
declare const useCallback: typeof import('react').useCallback;
declare const useTransition: typeof import('react').useTransition;
declare const Suspense: typeof import('react').Suspense;

// What this package doesn't install, taken as it is: Next.js (an optional peer), the servers' frameworks, and the
// ready-made parts, @wordplus/realtime-ui, by its entries.
declare module 'next';
declare module 'next/link';
declare module 'next/navigation' {
    export function redirect(url: string): never;
    export function permanentRedirect(url: string): never;
    export function notFound(): never;
    export function useRouter(): { push(href: string): void; replace(href: string): void; refresh(): void; back(): void; prefetch(href: string): void };
    export function usePathname(): string;
    export function useSearchParams(): URLSearchParams;
    export function useParams<Params = Record<string, string>>(): Params;
}
declare module 'react-native';
declare module '@vitejs/plugin-vue';
declare module '@sveltejs/vite-plugin-svelte';
declare module '@sveltejs/kit';
declare module '@sveltejs/adapter-node';
declare module 'next/server' {
    export const NextResponse: any;
    export const NextRequest: any;
    export type NextRequest = Request & { nextUrl: URL; cookies: any };
    export function connection(): Promise<void>;
    export function after(task: () => unknown): void;
}
declare module 'next/cache';
declare module 'next/headers' {
    export function cookies(): Promise<any>;
}
declare module 'express';
declare module 'express-session';
declare module 'cors';
declare module 'redis';
declare module '@upstash/redis' {
    export class Redis {
        static fromEnv(): Redis;
        get<T = unknown>(key: string): Promise<T | null>;
        set(key: string, value: unknown, options?: object): Promise<unknown>;
        [command: string]: any;
    }
}
declare module 'react-native-webview';
declare module '@wordplus/realtime-react-native';
declare module '@wordplus/realtime-ui';
declare module '@wordplus/realtime-ui/calls';
declare module '@wordplus/realtime-ui/react';
declare module '@wordplus/realtime-ui/chat';
declare module '@wordplus/realtime-ui/elements';
declare module '@wordplus/realtime-ui/testing';
declare module '@wordplus/realtime-ui/streams';
declare module '@wordplus/realtime-ui/recording';
declare module '@wordplus/realtime-ui/*.css';
