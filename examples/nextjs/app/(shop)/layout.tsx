// The signed-in part of the shop. One connection for every page under it, kept across client navigations, with the
// user settings (keys and identity included) rendered in, so it connects with no request first. The call screen
// rings on every page here.
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { DEMO } from '@/lib/demo';
import { realtime } from '@/lib/realtime';
import { currentToken, currentUserId } from '@/lib/session';
import { Screens } from './screens';

export default async function ShopLayout({ children }: { children: ReactNode }) {
    const user = await currentUserId();
    if (user === null) redirect(DEMO ? '/demo' : '/login');

    const options = await realtime.config(user);
    // A demo window is its own person, whatever the browser cookie: its requests to the realtime routes say who.
    if (DEMO) {
        const authorization = { Authorization: `Bearer ${await currentToken()}` };
        for (const route of [options.auth, options.calls, options.keys]) route.headers = { ...route.headers, ...authorization };
    }

    return (
        <RealtimeProvider options={options}>
            <Screens />
            {children}
        </RealtimeProvider>
    );
}
