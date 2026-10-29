import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Consultations",
  description: "Private video sessions with a doctor, a lawyer, a tutor and more, booked in a minute.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* wplus-messages-light: the messages and the visit stay light, as the site is */}
      <body className="min-h-full flex flex-col wplus-messages-light">{children}</body>
    </html>
  );
}
