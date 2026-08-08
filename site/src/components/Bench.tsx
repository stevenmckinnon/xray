'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The side-by-side that ends arguments.
 *
 * Two buttons: one built from the page's tokens, one forked with literals that
 * happen to equal those tokens at `regular` density. Change the density and only
 * one of them moves — and the disputed pixels get a dimension line, because a
 * measured 8px is an argument and a described 8px is an opinion.
 *
 * Laid out as a grid so the bracket lands on the button tops exactly rather than
 * being nudged into place. Every number is read off the DOM; nothing is
 * hardcoded to agree.
 */
export function Bench() {
  const tokenised = useRef<HTMLButtonElement>(null);
  const forked = useRef<HTMLButtonElement>(null);
  const [sizes, setSizes] = useState({ tokenised: 0, forked: 0 });

  useEffect(() => {
    const measure = () => {
      setSizes({
        tokenised: Math.round(tokenised.current?.getBoundingClientRect().height ?? 0),
        forked: Math.round(forked.current?.getBoundingClientRect().height ?? 0),
      });
    };
    measure();

    const observer = new ResizeObserver(measure);
    if (tokenised.current) observer.observe(tokenised.current);
    if (forked.current) observer.observe(forked.current);
    return () => observer.disconnect();
  }, []);

  const delta = sizes.tokenised - sizes.forked;
  const drifted = delta !== 0 && sizes.tokenised > 0;

  return (
    <div className="bench">
      <button className="btn-tokenised" type="button" ref={tokenised} style={{ gridArea: 'left' }}>
        Tokenised
      </button>

      <div className="delta" style={{ gridArea: 'delta', height: Math.max(sizes.tokenised, sizes.forked) || 36 }}>
        <span className="delta-bracket" data-drifted={drifted} style={{ height: Math.abs(delta) }} aria-hidden="true" />
      </div>

      <button className="btn-forked" type="button" ref={forked} style={{ gridArea: 'right' }}>
        Forked
      </button>

      <div className="specimen-caption" style={{ gridArea: 'left-label' }}>
        <p className="specimen-code">height: var(--control-height)</p>
        <p className="specimen-label">follows the density axis</p>
      </div>

      <p className="delta-label" data-drifted={drifted} style={{ gridArea: 'delta-label' }}>
        {drifted ? `Δ ${Math.abs(delta)}px` : 'Δ 0px'}
      </p>

      <div className="specimen-caption" style={{ gridArea: 'right-label' }}>
        <p className="specimen-code" data-drifted={drifted}>
          height: 36px
        </p>
        <p className="specimen-label">
          {drifted ? 'wrong at this density' : 'correct at regular, and nowhere else'}
        </p>
      </div>
    </div>
  );
}
