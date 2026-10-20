import type { ReactNode } from 'react';
import './shop.css';

export const metadata = { title: 'API demo' };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
