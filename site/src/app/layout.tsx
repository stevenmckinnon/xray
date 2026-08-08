import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono, Newsreader } from 'next/font/google';
import Script from 'next/script';
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
      data-theme="blueprint"
      data-density="regular"
      className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable}`}
    >
      <body>
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
