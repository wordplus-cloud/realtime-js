/**
 * Next.js's App Router for WordPlus Cloud's realtime SDK: the provider as a server component, which signs the page's
 * settings for the request's user and hands them to `@wordplus/realtime/react`'s provider.
 *
 *     // app/(app)/layout.tsx
 *     import { RealtimeProvider } from '@wordplus/realtime/next';
 *     import { realtime } from '@/lib/realtime';
 *
 *     export default function AppLayout( { children } ) {
 *         return <RealtimeProvider realtime={ realtime }>{ children }</RealtimeProvider>;
 *     }
 *
 * The page connects with no request first. Signing in or out draws the layout again, for a new user's settings, and the
 * provider connects again. It builds with Cache Components on or off, as the settings wait for the request in a
 * `<Suspense>` of their own. Your client components use the hooks of `@wordplus/realtime/react` under it, as ever.
 */
import { createElement, Suspense, type ReactElement, type ReactNode } from 'react';
import { headers } from 'next/headers';
import { RealtimeProvider as ClientProvider } from './react.js';
import type { Realtime, UserId } from './server/index.js';

export interface RealtimeProviderProps {
    /** Your server's `createRealtime()`. */
    realtime: Realtime;
    /**
     * Who the page's user is: their id, or a function that says. Your `createRealtime()`'s `user` option decides by
     * default, given a `Request` that has this request's headers and cookies.
     */
    user?: UserId | null | (() => UserId | null | undefined | Promise<UserId | null | undefined>);
    /** What shows while the settings are signed, a few milliseconds of a request: nothing by default. */
    fallback?: ReactNode;
    children?: ReactNode;
}

/** Connects the page for everything inside it, signed for the request's user. */
export function RealtimeProvider({ fallback = null, ...props }: RealtimeProviderProps): ReactElement {
    // An async component, as server components are, which the types of an older React don't know.
    return createElement(Suspense, { fallback }, createElement(Connected as unknown as (props: Omit<RealtimeProviderProps, 'fallback'>) => ReactElement, props));
}

/** The settings are signed for this user at this moment, so they wait for the request and are never prerendered. */
async function Connected({ realtime, user, children }: Omit<RealtimeProviderProps, 'fallback'>): Promise<ReactElement> {
    const request = await headers();
    const who = user === undefined ? await realtime.userOf(requestOf(request)) : typeof user === 'function' ? await user() : user;
    return createElement(ClientProvider, { options: await realtime.config(who ?? null), children });
}

/** A `Request` with this request's headers, for a `user` option written for the routes. Its address has no path: a server component has none to give. */
function requestOf(headers: Headers): Request {
    const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost';
    const protocol = headers.get('x-forwarded-proto') ?? 'https';
    return new Request(protocol.split(',')[0].trim() + '://' + host.split(',')[0].trim() + '/', { headers });
}
