'use client';

import { useEffect, useState } from 'react';
import { Shortcut } from './Kbd';

declare global {
  interface Window {
    __xray?: { start(): void; active: boolean };
  }
}

/**
 * The way into the live demo.
 *
 * A keyboard shortcut alone is a poor front door: it excludes anyone who does not
 * reach for the keyboard, and it says nothing to a reader who does not parse ⌘. So
 * the label is a real button and the keycaps are demoted to what they are, a hint
 * that a shortcut also exists.
 *
 * Two things are deliberately gated:
 *
 * The button only appears once the client bundle has actually loaded, so we never
 * offer a control that does nothing.
 *
 * On a device without hover the overlay cannot work at all, because inspection
 * follows the pointer. Rather than hand a phone a button that appears to do
 * nothing, say so.
 */
export function InspectTrigger() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.__xray) {
      setReady(true);
      return;
    }
    // The client is injected with `afterInteractive`, so it may not be here yet.
    let tries = 0;
    const timer = setInterval(() => {
      if (window.__xray) {
        setReady(true);
        clearInterval(timer);
      } else if (++tries > 30) {
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {ready ? (
        <button
          type="button"
          className="hint-action"
          onClick={() => window.__xray?.start()}
          aria-label="Inspect this page with xray"
        >
          <span className="hint-action-label">Inspect this page</span>
          <Shortcut />
        </button>
      ) : (
        <p className="hint">
          Press <Shortcut /> to inspect this page with xray.
        </p>
      )}

      <p className="hint hint-no-hover">
        Inspection follows the pointer, so the live demo wants a mouse. The rest of the page reads fine here.
      </p>
    </>
  );
}
