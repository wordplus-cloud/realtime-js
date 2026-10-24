import Link from 'next/link';

export default function MemberGone() {
    return (
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-medium">This member is not available.</p>
            <p className="mt-2 text-stone-600"><Link href="/members" className="text-rose-600">Back to people</Link></p>
        </div>
    );
}
