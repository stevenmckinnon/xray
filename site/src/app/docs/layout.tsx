import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import './docs.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ options: { type: 'static' } }}>
      <DocsLayout tree={source.pageTree} nav={{ title: 'xray' }}>
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
