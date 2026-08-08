'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Keycaps.
 *
 * Shaped like the shadcn component it replaces (same `data-slot` hooks, same
 * `className` passthrough) so it stays swappable, but the visual language comes
 * from this project's token layer instead of shadcn's.
 *
 * The version this replaces referenced `bg-muted` and `text-muted-foreground`.
 * Neither token exists here, so it rendered as invisible text on a same-coloured
 * block: `bg-muted` resolved to a *text* grey, and the undefined foreground left
 * the glyphs inheriting the identical grey from the surrounding paragraph. That is
 * the `unresolved` finding xray exists to catch, in miniature.
 */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return <kbd data-slot="kbd" className={cn('kbd', className)} {...props} />;
}

function KbdGroup({ className, ...props }: React.ComponentProps<'kbd'>) {
  return <kbd data-slot="kbd-group" className={cn('kbd-group', className)} {...props} />;
}

/** Cmd is the primary modifier on Apple platforms, Ctrl everywhere else. */
function isApple(): boolean {
  return /mac|iphone|ipad|ipod/i.test(
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.userAgent,
  );
}

const APPLE_KEYS = ['⇧', '⌘', 'X'];
const APPLE_LABEL = 'Shift Command X';
const OTHER_KEYS = ['Ctrl', 'Shift', 'X'];
const OTHER_LABEL = 'Control Shift X';

/**
 * The toggle binding, spelled the way the reader's own platform spells it.
 *
 * xray's default is `mod+shift+x`, which is Cmd on Apple and Ctrl everywhere else.
 * Hardcoding one of them onto a page about values that are only correct in one
 * context would be an unusually poor joke, so this corrects itself after mount.
 * Server output is the Apple form, and the swap happens in a post-hydration render
 * rather than during hydration, so there is no mismatch to warn about.
 */
function Shortcut({ className }: { className?: string }) {
  const [apple, setApple] = useState(true);

  useEffect(() => {
    setApple(isApple());
  }, []);

  const keys = apple ? APPLE_KEYS : OTHER_KEYS;

  return (
    <KbdGroup className={className} aria-label={apple ? APPLE_LABEL : OTHER_LABEL}>
      {keys.map((key) => (
        // The glyphs are decoration; the group carries the readable name.
        <Kbd key={key} aria-hidden="true" data-glyph={key.length === 1 || undefined}>
          {key}
        </Kbd>
      ))}
    </KbdGroup>
  );
}

export { Kbd, KbdGroup, Shortcut };
