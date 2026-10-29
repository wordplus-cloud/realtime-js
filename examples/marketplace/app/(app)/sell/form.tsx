'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const CATEGORIES = ['Home', 'Music', 'Photo', 'Sports', 'Garden', 'Clothes', 'Books', 'Other'];
const input = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 outline-none focus:border-blue-600';

/**
 * The item and its photos, sent as a form to /api/listings: photos from a phone are larger than a server action takes.
 * Then its page.
 */
export function SellForm() {
    const router = useRouter();
    const [photos, setPhotos] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);

    // The photos as this page shows them, let go with the page.
    useEffect(() => {
        const urls = photos.map((file) => URL.createObjectURL(file));
        setPreviews(urls);
        return () => urls.forEach((url) => URL.revokeObjectURL(url));
    }, [photos]);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setSending(true);
        const form = new FormData(event.currentTarget);
        form.delete('photos');
        for (const file of photos) form.append('photos', file);
        const answer = await fetch('/api/listings', { method: 'POST', body: form });
        const sent = await answer.json().catch(() => null);
        if (!answer.ok) {
            setError(sent?.error ?? 'That did not go up. Try again.');
            setSending(false);
            return;
        }
        router.push(`/listings/${sent.id}`);
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm" id="sell">
            <input name="title" required maxLength={100} placeholder="What is it?" className={input} />
            <div className="flex gap-3">
                <label className="flex w-40 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus-within:border-blue-600">
                    <span className="text-stone-500">$</span>
                    <input name="price" required inputMode="numeric" pattern="\d+" placeholder="Price" aria-label="Price" className="w-full outline-none" />
                </label>
                <select name="category" required defaultValue="" aria-label="Category" className={`${input} invalid:text-stone-400`}>
                    <option value="" disabled>Category</option>
                    {CATEGORIES.map((one) => <option key={one}>{one}</option>)}
                </select>
            </div>
            <textarea name="about" rows={4} maxLength={2000} placeholder="Its condition, its size, why you sell it" className={input} />
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                    {previews.map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={url} src={url} alt={`Photo ${i + 1}`} className="size-24 rounded-xl object-cover" />
                    ))}
                    {photos.length < 4 && (
                        <label className="grid size-24 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-stone-300 text-sm text-stone-500 hover:border-blue-500 hover:text-blue-700">
                            Add photo
                            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
                                   onChange={(e) => setPhotos((list) => [...list, ...Array.from(e.target.files ?? [])].slice(0, 4))} />
                        </label>
                    )}
                </div>
                <p className="text-xs text-stone-500">Up to four photos, the first one shown in the market.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button disabled={sending || photos.length === 0} className="self-start rounded-full bg-blue-700 px-6 py-2.5 font-medium text-white hover:bg-blue-800 disabled:opacity-40">
                {sending ? 'Putting it up…' : 'Put it up'}
            </button>
        </form>
    );
}
