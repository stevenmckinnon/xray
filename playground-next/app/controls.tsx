'use client';

import { useState } from 'react';

/**
 * Nothing here is under test — the axes are discovered from the stylesheet, not
 * from the DOM, so xray finds them whether or not anything ever toggles. These
 * exist so a human can watch a locked value change while the panel is open, which
 * is the one thing a screenshot cannot show.
 *
 * It writes to `<html>` in an effect-free event handler rather than holding the
 * value in a provider, because that is where this fixture's axes are anchored and
 * a mismatch between the two is exactly the class of bug the panel reports.
 */
const DENSITIES = ['default', 'compact', 'cosy'] as const;

export function Controls() {
  const [dark, setDark] = useState(false);
  const [density, setDensity] = useState<(typeof DENSITIES)[number]>('default');

  const toggleMode = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  const cycleDensity = () => {
    const next = DENSITIES[(DENSITIES.indexOf(density) + 1) % DENSITIES.length];
    setDensity(next);
    if (next === 'default') document.documentElement.removeAttribute('data-density');
    else document.documentElement.dataset.density = next;
  };

  return (
    <div className="controls">
      <button onClick={toggleMode} type="button">
        mode: {dark ? 'dark' : 'light'}
      </button>
      <button onClick={cycleDensity} type="button">
        density: {density}
      </button>
    </div>
  );
}
