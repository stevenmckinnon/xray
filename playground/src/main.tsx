import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salt-ds/theme/css/theme.css';
import './app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/** A web component with its own shadow stylesheet, hardcoding the medium-density scale. */
class ShadowCard extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .inner {
        padding: 8px;
        height: 28px;
        border: 1px solid #dcdcdc;
        color: #161616;
        font-size: 12px;
      }
    `;
    const inner = document.createElement('div');
    inner.className = 'inner';
    inner.textContent = 'inside a shadow root';
    root.append(style, inner);
  }
}
if (!customElements.get('shadow-card')) customElements.define('shadow-card', ShadowCard);

/**
 * Marketing-asset hook: `?xray-demo=<selector>` opens the overlay on that element
 * once the app has mounted, so a real screenshot can be captured headlessly.
 *
 * This exists so the landing page can ship an actual photograph of the tool
 * rather than a div-based recreation of one.
 */
const demoSelector = new URLSearchParams(location.search).get('xray-demo');
if (demoSelector) {
  const open = (tries = 0) => {
    const target = document.querySelector(demoSelector);
    const xray = (window as unknown as { __xray?: { start(): void } }).__xray;
    if (!target || !xray) {
      if (tries < 40) setTimeout(() => open(tries + 1), 100);
      return;
    }
    xray.start();
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));
  };
  setTimeout(() => open(), 400);
}

/**
 * Fixture export: `?xray-dump=<selector>` renders the real report for that element
 * as JSON into the DOM, so `chrome --headless --dump-dom` can lift it out.
 *
 * The landing page renders its panel from this file rather than from hand-typed
 * strings, which is what makes "real output" a checkable claim instead of a
 * promise.
 */
const dumpSelector = new URLSearchParams(location.search).get('xray-dump');
if (dumpSelector) {
  const dump = (tries = 0) => {
    const target = document.querySelector(dumpSelector);
    const xray = (window as unknown as { __xray?: { inspect(el: Element): unknown } }).__xray;
    if (!target || !xray) {
      if (tries < 40) setTimeout(() => dump(tries + 1), 100);
      return;
    }
    const pre = document.createElement('pre');
    pre.id = 'xray-dump';
    pre.textContent = JSON.stringify(xray.inspect(target));
    document.body.appendChild(pre);
  };
  setTimeout(() => dump(), 400);
}
