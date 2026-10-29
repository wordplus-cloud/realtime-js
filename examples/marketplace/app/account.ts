'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APIError } from 'better-auth/api';
import demo from '@/db/people.json';
import { auth } from '@/lib/auth';
import { WORLDS, inWorld, visitorWorld } from '@/lib/worlds';

export type FormState = { error: string } | null;

export async function signUp(_state: FormState, form: FormData): Promise<FormState> {
    try {
        await auth.api.signUpEmail({
            body: { name: String(form.get('name')).trim(), email: String(form.get('email')), password: String(form.get('password')) },
        });
    } catch (e) {
        if (e instanceof APIError) return { error: e.message };
        throw e;
    }
    redirect('/market');
}

export async function signIn(_state: FormState, form: FormData): Promise<FormState> {
    try {
        await auth.api.signInEmail({ body: { email: String(form.get('email')), password: String(form.get('password')) } });
    } catch (e) {
        if (e instanceof APIError) return { error: e.message };
        throw e;
    }
    redirect('/market');
}

/** One of the ready-made neighbours of db/people.json, in one click, while MARKET_DEMO=1. */
export async function signInAs(key: string) {
    if (process.env.MARKET_DEMO !== '1' || !demo.people.some((person) => person.key === key)) return;
    const signIn = () => auth.api.signInEmail({ body: { email: `${key}@people.marketplace.test`, password: demo.password } });
    // On the public demo, in the visitor's own world (lib/worlds.ts).
    await (WORLDS ? inWorld(await visitorWorld(), signIn) : signIn());
    redirect('/market');
}

export async function signOut() {
    await auth.api.signOut({ headers: await headers() });
    redirect('/');
}
