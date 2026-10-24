import { Suspense } from 'react';
import { currentUserId } from '@/lib/auth';
import { nameOf, photoOf, profileOf } from '@/lib/dating';
import { ProfileForm } from './form';

export default function ProfilePage() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <MyProfile />
        </Suspense>
    );
}

async function MyProfile() {
    const me = (await currentUserId())!;
    const profile = await profileOf(me);
    return (
        <section className="mx-auto flex max-w-md flex-col gap-4">
            <h1 className="text-2xl font-semibold">{profile ? 'Your profile' : 'Make your profile'}</h1>
            {!profile && <p className="text-stone-600">This is what others see on Discover. A photo of your face gets far more likes.</p>}
            <ProfileForm profile={profile} name={(await nameOf(me)) ?? ''} photo={profile?.hasPhoto ? photoOf(me) : null} />
        </section>
    );
}
