import './globals.css';
import Link from 'next/link';

export const metadata = { title: 'Kargo hiring', description: 'Internal hiring dashboard' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <header className="bar">
          <Link href="/dashboard" className="brand">Kargo hiring</Link>
          <nav>
            <Link href="/">Upload CVs</Link>
            <Link href="/dashboard">Candidates</Link>
            <Link href="/rubric">Rubric</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
