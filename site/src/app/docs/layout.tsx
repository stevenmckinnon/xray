import { Instruments } from '@/components/Instruments';
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import './docs.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      search={{ options: { type: 'static' } }}
      // Off, because this site already has a theme system. The colours here come
      // from `[data-theme]` via docs.css, so next-themes had nothing left to
      // decide — it was only adding a second control that disagreed with the one
      // in the nav, and a `.dark` class on <html> that the landing page's own axis
      // discovery then reported as a variant axis.
      theme={{ enabled: false }}
    >
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: (
            <span className="site-mark">
              xray<span>.</span>
            </span>
          ),
          // Back to the landing page: the wordmark is the only way out.
          url: '/',
        }}
        // The light/dark switch renders independently of the theme provider, so
        // turning the provider off left a control that did nothing. The switches
        // in the sidebar footer are the real ones.
        themeSwitch={{ enabled: false }}
        sidebar={{
          // The page's real theme and density switches, not a light/dark toggle.
          // They write `[data-theme]` and `[data-density]` onto <html>, which is
          // what these docs take their colours from — so the docs are themeable by
          // the same control that themes the demo, and it is the same component,
          // not a copy of it. It mirrors the DOM through a MutationObserver, so
          // this instance and the landing page's stay in agreement.
          footer: (
            <div className="docs-instruments">
              <Instruments />
            </div>
          ),
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
