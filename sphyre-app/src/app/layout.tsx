import './globals.css'
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    title: "Sphyre App",
    description: "Decentralized Identity",
    manifest: "/manifest.json",
    icons: {
        icon: [
            { url: '/assets/sphyre-logo.svg', sizes: 'any' },
            { url: '/icons/icons192', sizes: '16x16', type: 'image/png' },
            { url: '/icons/icons512', sizes: '32x32', type: 'image/png' },
        ],
        apple: {
            url: '/assets/sphyre-logo.svg',
            sizes: '180x180',
            type: 'image/svg',
        },
    },
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode
}) {
    return (
    <html lang="en">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    </head>
    <body className={inter.className}>
        <main className="relative max-w-md mx-auto h-screen overflow-y-auto">
        {children}
        </main>

        {/* Portal div untuk scan popup */}
        <div id="portal-root" className="fixed inset-0 z-[9999] pointer-events-none" />
    </body>
    </html>
    );
}
