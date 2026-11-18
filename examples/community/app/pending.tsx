'use client';

import Link, { useLinkStatus } from 'next/link';
import { useFormStatus } from 'react-dom';

// A link to another page and a form's server action show nothing in the browser while the server answers, so a slow
// answer looks like none. These two say they are on their way.

/** A link that turns a spinner beside its text while the page it opens loads. */
export function PendingLink({ href, className, children }: { href: string; className: string; children: React.ReactNode }) {
    return (
        <Link href={href} className={`inline-flex items-center gap-2 ${className}`}>
            {children}
            <LinkSpinner />
        </Link>
    );
}

function LinkSpinner() {
    const { pending } = useLinkStatus();
    return pending ? <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null;
}

/** A ready-made person's button: while signing in as them runs, a ring turns around their photo. */
export function PersonButton({ className, children }: { className: string; children: React.ReactNode }) {
    const { pending } = useFormStatus();
    return (
        <button disabled={pending} aria-busy={pending} className={`relative ${className}`}>
            {children}
            {pending && <span aria-hidden className="absolute top-0.5 left-1/2 size-16 -translate-x-1/2 animate-spin rounded-full border-2 border-orange-700 border-t-transparent" />}
        </button>
    );
}
