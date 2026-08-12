import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono, Newsreader } from 'next/font/google';
import Script from 'next/script';

import { DEFAULT_DENSITY, DEFAULT_THEME, RESTORE_SCRIPT } from '@/lib/appearance';
import './globals.css';

/** Industrial signage grotesque, variable width — the spec-sheet voice. */
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

/** A serif body face, because this is a document, not a dashboard. */
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'swap',
});

/** Drafting-table mono for every measured value. */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

const description =
  'A dev-time overlay that maps an element’s computed styles back to your design tokens, and flags every value that only works in the theme you happen to be looking at.';

export const metadata: Metadata = {
  title: 'xray: see your design tokens in the running app',
  description,
  openGraph: {
    title: 'xray: see your design tokens in the running app',
    description,
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0d12',
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      data-density={DEFAULT_DENSITY}
      className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable}`}
      // Fumadocs' provider on /docs uses next-themes, which sets `color-scheme`
      // on this element from the client. Two theme systems own <html> — this
      // page's `data-theme` axis and that one — so the first client render
      // legitimately differs from the server's, and React needs telling.
      suppressHydrationWarning
    >
      <body>
        {/*
          Restores the visitor's theme and density before the body is parsed, so the
          first paint is already correct. The attributes above are the server's default
          and this overwrites them; `suppressHydrationWarning` on <html> covers the
          difference, and `useSyncExternalStore` in the controls handles the rest.

          Not a <Script>: every strategy Next offers runs after the first paint, which is
          precisely too late.
        */}
        <script dangerouslySetInnerHTML={{ __html: RESTORE_SCRIPT }} />
        {children}
        {/*
          The real client bundle, copied from ../dist/client.js at build time.
          The page is instrumented with the same engine the plugin injects — the
          demo cannot drift from the tool because it *is* the tool.
        */}
        <Script src="/xray-client.js" strategy="afterInteractive" />
        <Script id="xray-boot" strategy="afterInteractive">
          {`
            (function boot(tries) {
              if (window.__xrayClient) {
                window.__xrayClient.start({ hotkeys: ['mod+shift+x', 'shift shift'] });
                return;
              }
              if (tries > 40) return;
              setTimeout(function () { boot(tries + 1); }, 50);
            })(0);
          `}
        </Script>
      </body>
    </html>
  );
}
