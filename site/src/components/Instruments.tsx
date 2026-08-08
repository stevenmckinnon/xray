'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const THEMES = ['blueprint', 'paper'] as const;
const DENSITIES = ['tight', 'regular', 'loose'] as const;

type Theme = (typeof THEMES)[number];
type Density = (typeof DENSITIES)[number];

/**
 * A single-choice control, so it is a radio group.
 *
 * The first version was a row of `aria-pressed` buttons, which announces as three
 * independent toggles and gives no arrow-key movement. Mutually exclusive options
 * are radios: one tab stop for the group, arrows to move between options, and the
 * selection state announced as such.
 */
function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next]!);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(index, -1);
        break;
      case 'Home':
        event.preventDefault();
        move(-1, 1);
        break;
      case 'End':
        event.preventDefault();
        move(0, -1);
        break;
    }
  };

  return (
    <div className="instrument" role="radiogroup" aria-label={label}>
      <span className="instrument-label" aria-hidden="true">
        {label}
      </span>
      {options.map((option, index) => {
        const selected = option === value;
        return (
          <button
            key={option}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            // Roving tabindex: the group is one tab stop, arrows move within it.
            tabIndex={selected ? 0 : -1}
            className="switch"
            onClick={() => onChange(option)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The page's own theme and density switches.
 *
 * These write `data-theme` / `data-density` onto `<html>`, the same mechanism a
 * real design system uses, and the same mechanism xray discovers. Flip density
 * and the page genuinely re-measures; nothing here is a mock.
 */
export function Instruments() {
  const [theme, setTheme] = useState<Theme>('blueprint');
  const [density, setDensity] = useState<Density>('regular');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  // The overlay writes these attributes too when you use its own chips, and there
  // are two copies of this control on the page. Mirror the DOM so they agree.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const nextTheme = root.dataset.theme as Theme | undefined;
      const nextDensity = root.dataset.density as Density | undefined;
      if (nextTheme && THEMES.includes(nextTheme)) setTheme(nextTheme);
      if (nextDensity && DENSITIES.includes(nextDensity)) setDensity(nextDensity);
    });
    observer.observe(root, { attributeFilter: ['data-theme', 'data-density'] });
    return () => observer.disconnect();
  }, []);

  const changeTheme = useCallback((next: Theme) => setTheme(next), []);
  const changeDensity = useCallback((next: Density) => setDensity(next), []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup label="theme" options={THEMES} value={theme} onChange={changeTheme} />
      <ToggleGroup label="density" options={DENSITIES} value={density} onChange={changeDensity} />
    </div>
  );
}
