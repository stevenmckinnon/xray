'use client';

import { useRef } from 'react';

import { DENSITIES, THEMES, setDensity, setTheme, useDensity, useTheme } from '@/lib/appearance';

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
 * These write `data-theme` / `data-density` onto `<html>`, the same mechanism a real
 * design system uses, and the same mechanism xray discovers. Flip density and the page
 * genuinely re-measures; nothing here is a mock.
 *
 * State lives in `@/lib/appearance`, not here, because there is more than one of these
 * on the page and more than one page in the app — and because xray's own overlay writes
 * the same attributes. Every copy reads the DOM, so they cannot disagree, and mounting a
 * new copy no longer resets what the last one chose.
 */
export function Instruments() {
  const theme = useTheme();
  const density = useDensity();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup label="theme" options={THEMES} value={theme} onChange={setTheme} />
      <ToggleGroup label="density" options={DENSITIES} value={density} onChange={setDensity} />
    </div>
  );
}
