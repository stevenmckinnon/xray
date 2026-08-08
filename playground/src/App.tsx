import { useState } from 'react';

type Density = 'high' | 'medium' | 'low' | 'touch';

export function App() {
  const [density, setDensity] = useState<Density>('medium');
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  return (
    <div className={`salt-theme salt-density-${density}`} data-mode={mode}>
      <div className="page">
        <h1>xray playground</h1>

        <div className="row">
          <label>
            density{' '}
            <select value={density} onChange={(e) => setDensity(e.target.value as Density)}>
              {(['high', 'medium', 'low', 'touch'] as const).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            mode{' '}
            <select value={mode} onChange={(e) => setMode(e.target.value as 'light' | 'dark')}>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </label>
        </div>

        <div className="card">
          <div className="row">
            <button className="hand-button" type="button">
              Hand-rolled
            </button>
            <button className="salt-button" type="button">
              Tokenised
            </button>
            <button className="hand-button nearly" type="button">
              Nearly
            </button>
            <button className="hand-button novel" type="button">
              Novel
            </button>
            <span className="typo">Typo</span>
          </div>
        </div>

        <div style={{ padding: 8, border: '1px solid #dcdcdc' }}>
          Inline styles are checked too.
        </div>

        <div className="flexy">
          <span>first</span>
          <span>second</span>
          <span>last</span>
        </div>

        {/* Local token override: --salt-spacing-100 is 20px inside here. */}
        <div className="override">
          <div className="child">padding: 20px, which is the overridden token</div>
        </div>

        {/* A nested density provider: high inside medium. */}
        <div className="salt-density-high">
          <button className="hand-button" type="button">
            Nested high density
          </button>
        </div>

        <shadow-card></shadow-card>
      </div>
    </div>
  );
}
