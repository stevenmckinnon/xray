import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono, Newsreader } from 'next/font/google';
import Script from 'next/script';

import './globals.css';

/**
 * Restores the saved theme and density before the body is parsed, so the page is already
 * correct at the first paint.
 *
 * Written out here as a literal rather than imported, for two reasons. It has to run
 * before anything else, and every `next/script` strategy runs after the first paint. And
 * this is a server component: Next refuses to pull any module importing
 * `useSyncExternalStore` into the server graph, which `@/lib/appearance` does.
 *
 * `data-booting` is the part that matters for how this feels. `body` transitions
 * background-color and color over 260ms, and changing the attribute here counts as a
 * change — so without suppressing it the restored theme *animates* into place on load,
 * which reads as a flash. The flag is dropped after two frames, by which point the
 * restored colours have been painted, and normal switching animates as before.
 *
 * The valid values are duplicated from `@/lib/appearance`, which is the source of truth.
 * A drift here means a saved choice silently fails to restore, not a broken page.
 */
const RESTORE_SCRIPT = `
(function () {
  try {
    var root = document.documentElement;
    var saved = JSON.parse(localStorage.getItem('xray-appearance') || '{}');
    var changed = false;
    if (['blueprint', 'paper'].indexOf(saved.theme) !== -1 && root.dataset.theme !== saved.theme) {
      root.dataset.theme = saved.theme;
      changed = true;
    }
    if (['tight', 'regular', 'loose'].indexOf(saved.density) !== -1 && root.dataset.density !== saved.density) {
      root.dataset.density = saved.density;
      changed = true;
    }
    if (changed) {
      root.dataset.booting = '';
      var clear = function () { delete root.dataset.booting; };
      // Two frames is the accurate signal — by then the restored colours are painted.
      // The timeout is the safety net: rAF does not run in a background tab, so a page
      // opened in one would otherwise keep every transition suppressed until it was
      // looked at. Whichever fires first wins; clearing twice is harmless.
      requestAnimationFrame(function () { requestAnimationFrame(clear); });
      setTimeout(clear, 300);
    }
  } catch (e) {}
})();
`.trim();

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
      // Fumadocs' provider on /docs uses next-themes, which sets `color-scheme`
      // on this element from the client. Two theme systems own <html> — this
      // page's `data-theme` axis and that one — so the first client render
      // legitimately differs from the server's, and React needs telling.
      suppressHydrationWarning
    >
      <body>
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
