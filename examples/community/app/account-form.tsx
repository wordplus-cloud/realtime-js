'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, signUp } from './account';

const input = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-orange-600';

type Props = {
    mode: 'signup' | 'signin';
    // The public demo asks nobody for an email and a password: it offers its ready-made members alone (lib/worlds.ts).
    peopleOnly?: boolean;
    children?: React.ReactNode;
};

export function AccountForm({ mode, peopleOnly, children }: Props) {
    const [state, action, pending] = useActionState(mode === 'signup' ? signUp : signIn, null);
    if (peopleOnly) {
        return (
            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-16">
                <Link href="/" className="text-2xl font-bold text-orange-700">Community</Link>
                <h1 className="text-2xl font-semibold">Try the community</h1>
                <p className="text-sm text-stone-600">
                    Pick a member to be: a host goes live with the club&apos;s events and looks after the lounges. Mia&apos;s portfolio review starts now. The club is yours alone for a day. To be a second member, open this page in a private window and pick another.
                </p>
                {children}
            </main>
        );
    }
    return (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16">
            <Link href="/" className="text-2xl font-bold text-orange-700">Community</Link>
            <h1 className="text-2xl font-semibold">{mode === 'signup' ? 'Join the club' : 'Welcome back'}</h1>
            <form action={action} className="flex flex-col gap-3">
                {mode === 'signup' && <input name="name" placeholder="First name" required className={input} />}
                <input name="email" type="email" placeholder="Email" required className={input} />
                <input name="password" type="password" placeholder="Password" required minLength={8} className={input} />
                {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
                <button disabled={pending} className="rounded-full bg-orange-700 px-6 py-3 font-medium text-white hover:bg-orange-800 disabled:opacity-60">
                    {mode === 'signup' ? 'Join' : 'Sign in'}
                </button>
            </form>
            <p className="text-sm text-stone-600">
                {mode === 'signup'
                    ? <>A member already? <Link href="/signin" className="text-orange-700">Sign in</Link></>
                    : <>New here? <Link href="/signup" className="text-orange-700">Join the club</Link></>}
            </p>
            {children}
        </main>
    );
}
