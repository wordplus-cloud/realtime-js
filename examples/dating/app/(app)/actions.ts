'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { block, chatBetween, roomOf, saveProfile, type Gender, type Seeking } from '@/lib/dating';
import { realtime } from '@/lib/realtime';

async function me(): Promise<string> {
    const id = await currentUserId();
    if (!id) redirect('/signin');
    return id;
}

type How = 'block' | 'report';

/** Block, or report with a reason: their chat closes on both sides at once, and neither sees the other again. */
export async function blockMember(them: string, how: How, form: FormData) {
    const id = await me();
    const reason = how === 'report' ? String(form.get('reason')) : null;
    await block(id, them, reason);

    const room = roomOf(await chatBetween(id, them));
    await realtime.in(room).kick(them); // out of the chat now: the rule says no from here on
    await realtime.toUser([id, them]).emit('closed', { room });
    redirect('/members');
}

export type ProfileState = { error?: string; saved?: boolean } | null;

export async function saveMyProfile(_state: ProfileState, form: FormData): Promise<ProfileState> {
    const id = await me();
    const name = String(form.get('name') ?? '').trim();
    const birthday = String(form.get('birthday') ?? '');
    const gender = String(form.get('gender')) as Gender;
    const seeking = String(form.get('seeking')) as Seeking;
    if (!name) return { error: 'Your first name, please.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || !adult(birthday)) return { error: 'You need to be 18 or older.' };
    if (!['woman', 'man', 'nonbinary'].includes(gender) || !['women', 'men', 'everyone'].includes(seeking)) return { error: 'Choose who you are and who you are looking for.' };

    const file = form.get('photo');
    let photo: Buffer | null = null;
    if (file instanceof File && file.size > 0) {
        if (file.type !== 'image/jpeg' || file.size > 800_000) return { error: 'That photo did not work. Try another one.' };
        photo = Buffer.from(await file.arrayBuffer());
    }

    const first = form.get('first') === '1';
    await saveProfile(id, name, {
        birthday,
        gender,
        seeking,
        city: String(form.get('city') ?? '').trim().slice(0, 80),
        about: String(form.get('about') ?? '').trim().slice(0, 500),
        hideOnline: form.get('hideOnline') === 'on',
    }, photo);
    if (first) redirect('/members');
    refresh();
    return { saved: true };
}

function adult(birthday: string): boolean {
    const [year, month, day] = birthday.split('-').map(Number);
    const eighteenth = new Date(year + 18, month - 1, day);
    return eighteenth <= new Date();
}
