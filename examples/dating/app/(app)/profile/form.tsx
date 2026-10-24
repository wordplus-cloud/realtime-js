'use client';

import { useActionState, useState } from 'react';
import type { Profile } from '@/lib/dating';
import { saveMyProfile } from '../actions';

const field = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-rose-500';

export function ProfileForm({ profile, name, photo }: { profile: Profile | null; name: string; photo: string | null }) {
    const [state, action, pending] = useActionState(saveMyProfile, null);
    return (
        <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="first" value={profile ? '0' : '1'} />
            <PhotoInput current={photo} />
            <label className="flex flex-col gap-1">First name<input name="name" defaultValue={name} required className={field} /></label>
            <label className="flex flex-col gap-1">Birthday<input name="birthday" type="date" defaultValue={profile?.birthday} required className={field} /></label>
            <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">I am
                    <select name="gender" defaultValue={profile?.gender ?? 'woman'} className={field}>
                        <option value="woman">A woman</option>
                        <option value="man">A man</option>
                        <option value="nonbinary">Nonbinary</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1">Show me
                    <select name="seeking" defaultValue={profile?.seeking ?? 'everyone'} className={field}>
                        <option value="women">Women</option>
                        <option value="men">Men</option>
                        <option value="everyone">Everyone</option>
                    </select>
                </label>
            </div>
            <label className="flex flex-col gap-1">City<input name="city" defaultValue={profile?.city} className={field} /></label>
            <label className="flex flex-col gap-1">About you<textarea name="about" defaultValue={profile?.about} rows={4} maxLength={500} className={field} /></label>
            <label className="flex items-center gap-2"><input name="hideOnline" type="checkbox" defaultChecked={profile?.hideOnline} /> Hide when I am online</label>
            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            {state?.saved && <p className="text-sm text-emerald-700">Saved.</p>}
            <button disabled={pending} className="rounded-full bg-rose-600 py-3 font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                {profile ? 'Save' : 'Start meeting people'}
            </button>
        </form>
    );
}

/** The photo, made smaller in the browser before it is sent: a 720 by 900 JPEG, cut from the middle of the picture. */
function PhotoInput({ current }: { current: string | null }) {
    const [preview, setPreview] = useState(current);

    async function choose(e: React.ChangeEvent<HTMLInputElement>) {
        const input = e.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        const image = await createImageBitmap(file);
        const scale = Math.max(720 / image.width, 900 / image.height);
        const canvas = Object.assign(document.createElement('canvas'), { width: 720, height: 900 });
        canvas.getContext('2d')!.drawImage(image, (720 - image.width * scale) / 2, (900 - image.height * scale) / 2, image.width * scale, image.height * scale);
        const jpeg = await new Promise<Blob>((done) => canvas.toBlob((blob) => done(blob!), 'image/jpeg', 0.85));
        const files = new DataTransfer();
        files.items.add(new File([jpeg], 'photo.jpg', { type: 'image/jpeg' }));
        input.files = files.files;
        setPreview(URL.createObjectURL(jpeg));
    }

    return (
        <label className="flex cursor-pointer items-center gap-4">
            {preview
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="h-30 w-24 rounded-2xl object-cover" />
                : <span className="flex h-30 w-24 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">Photo</span>}
            <span className="text-rose-600">{preview ? 'Change your photo' : 'Add a photo'}</span>
            <input name="photo" type="file" accept="image/*" onChange={choose} className="sr-only" />
        </label>
    );
}
