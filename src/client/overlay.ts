/** The overlay: a highlight box, a findings panel, and a way to flip variants. */

import type { ElementReport, Finding, Severity } from './analyse.js';
import { activeVariant, type TokenResolver } from './tokens.js';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'locked',
  medium: 'off-scale',
  low: 'drift',
  ok: 'ok',
};

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.box {
  position: fixed;
  pointer-events: none;
  z-index: 2147483646;
  border: 1px solid #7dd3fc;
  background: rgba(125, 211, 252, 0.12);
  border-radius: 2px;
  transition: all 60ms linear;
}
.panel {
  position: fixed;
  z-index: 2147483647;
  width: 420px;
  max-height: 70vh;
  overflow: auto;
  background: #0b0e14;
  color: #d7dae0;
  border: 1px solid #262c38;
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  font-size: 11px;
  line-height: 1.5;
}
.panel[hidden] { display: none; }
header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-bottom: 1px solid #1c222c;
  position: sticky; top: 0; background: #0b0e14;
}
header .tag { color: #7dd3fc; font-weight: 600; }
header .spacer { flex: 1; }
header .hint { color: #5b6472; font-size: 10px; }
.src {
  display: block; padding: 6px 10px; border-bottom: 1px solid #1c222c;
  color: #9aa4b2; text-decoration: none; cursor: pointer; font-size: 10px;
}
.src:hover { color: #7dd3fc; background: #11151d; }
.axes { padding: 6px 10px; border-bottom: 1px solid #1c222c; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.axes .label { color: #5b6472; font-size: 10px; margin-right: 2px; }
.chip {
  border: 1px solid #262c38; background: #11151d; color: #9aa4b2;
  border-radius: 999px; padding: 1px 7px; font-size: 10px; cursor: pointer;
  font-family: inherit;
}
.chip:hover { border-color: #7dd3fc; color: #d7dae0; }
.chip[aria-pressed='true'] { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
.finding { padding: 8px 10px; border-bottom: 1px solid #141922; }
.finding:last-child { border-bottom: 0; }
.row { display: flex; align-items: baseline; gap: 6px; }
.prop { color: #d7dae0; }
.val { color: #e5c07b; }
.badge {
  margin-left: auto; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
  padding: 1px 5px; border-radius: 3px; flex: none;
}
.badge.high { background: #7f1d1d; color: #fecaca; }
.badge.medium { background: #78350f; color: #fed7aa; }
.badge.low { background: #1e3a5f; color: #bfdbfe; }
.badge.ok { background: #14311f; color: #a7f3d0; }
.msg { color: #9aa4b2; margin-top: 3px; }
.tokens { color: #86efac; margin-top: 2px; word-break: break-all; }
.where { color: #4b5563; margin-top: 2px; font-size: 10px; word-break: break-all; }
table { border-collapse: collapse; margin-top: 5px; width: 100%; }
td { padding: 1px 6px 1px 0; color: #9aa4b2; }
td.v { color: #d7dae0; text-align: right; width: 1%; white-space: nowrap; }
tr.active td { color: #7dd3fc; }
tr.wrong td.v { color: #fca5a5; }
tr.unset td.v { color: #4b5563; font-style: italic; }
.empty { padding: 14px 10px; color: #5b6472; }
.warn {
  padding: 6px 10px; border-bottom: 1px solid #1c222c;
  background: #201a0c; color: #fed7aa; font-size: 10px;
}
.error { padding: 12px 10px; color: #fca5a5; }
.error .label { color: #9aa4b2; display: block; margin-bottom: 4px; }
.counts { display: flex; gap: 4px; }
.counts span { font-size: 9px; padding: 0 4px; border-radius: 3px; }
`;

export interface OverlayHost {
  show(report: ElementReport, rect: DOMRect, el: Element): void;
  /** Something went wrong analysing this element; say so instead of vanishing. */
  showError(message: string, rect: DOMRect): void;
  hide(): void;
  destroy(): void;
  readonly root: ShadowRoot;
}

export function createOverlay(resolver: TokenResolver, onFlip: () => void): OverlayHost {
  const host = document.createElement('div');
  host.setAttribute('data-xray', 'overlay');
  host.style.cssText = 'all:initial;position:static';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const box = document.createElement('div');
  box.className = 'box';
  box.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;
  root.append(style, box, panel);
  document.body.appendChild(host);

  /**
   * Dock to whichever edge the inspected element uses least, rather than sitting
   * beside it. Beside-the-element placement covers the thing you are looking at
   * as soon as the element is wide, which is most of the time.
   */
  const place = (rect: DOMRect) => {
    const margin = 12;
    const width = 420;
    const centre = rect.left + rect.width / 2;
    const dockRight = centre < window.innerWidth / 2;
    panel.style.left = dockRight ? `${window.innerWidth - width - margin}px` : `${margin}px`;
    panel.style.top = `${Math.min(Math.max(margin, rect.top), Math.max(margin, window.innerHeight - 260))}px`;
  };

  return {
    root,
    show(report, rect, el) {
      box.hidden = false;
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      panel.hidden = false;
      panel.innerHTML = render(report, resolver, el);
      place(rect);
      wireAxes(panel, resolver, el, onFlip);
      wireSource(panel);
    },
    showError(message, rect) {
      box.hidden = false;
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      panel.hidden = false;
      panel.innerHTML = `<header><span class="tag">xray</span></header><div class="error"><span class="label">Could not analyse this element. The page is unaffected.</span>${esc(
        message,
      )}</div>`;
      place(rect);
    },
    hide() {
      box.hidden = true;
      panel.hidden = true;
    },
    destroy() {
      host.remove();
    },
  };
}

function render(report: ElementReport, resolver: TokenResolver, el: Element): string {
  const counts = report.counts;
  const badges = (['high', 'medium', 'low'] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => `<span class="badge ${s}">${counts[s]} ${SEVERITY_LABEL[s]}</span>`)
    .join('');

  const source = report.source
    ? `<a class="src" data-src="${esc(report.source)}">${esc(report.source)}</a>`
    : '';

  const relevant = resolver.axes.filter((axis) => resolver.axisOwner(el, axis));
  const axes = relevant
    .map((axis) => {
      const active = activeVariant(el, axis);
      const chips = axis.variants
        .map(
          (v) =>
            `<button class="chip" data-axis="${esc(axis.name)}" data-variant="${esc(v.raw)}" aria-pressed="${
              v.raw === active?.raw
            }">${esc(v.label)}</button>`,
        )
        .join('');
      return `<div class="axes"><span class="label">${esc(axis.name)}</span>${chips}</div>`;
    })
    .join('');

  const warnings = report.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join('');

  const body = report.findings.length
    ? report.findings.map(renderFinding).join('')
    : `<div class="empty">No authored spacing or colour on this element — try a child.</div>`;

  return `
    <header>
      <span class="tag">${esc(report.tag)}</span>
      <span class="spacer"></span>
      <span class="counts">${badges}</span>
    </header>
    ${source}
    ${warnings}
    ${axes}
    ${body}
  `;
}

function renderFinding(f: Finding): string {
  const where = f.specified
    ? f.specified.origin === 'inline'
      ? 'inline style'
      : `${f.specified.selector ?? ''}${f.specified.sheetHref ? ` · ${basename(f.specified.sheetHref)}` : ''}`
    : '';

  const table = f.variants
    ? `<table>${f.variants.values
        .map((v) => {
          const cls = [v.active ? 'active' : '', v.wrong ? 'wrong' : '', v.unset ? 'unset' : '']
            .filter(Boolean)
            .join(' ');
          const shown = v.unset ? 'not set' : v.value;
          return `<tr class="${cls}"><td>${esc(v.label)}${v.active ? ' ·' : ''}</td><td class="v">${esc(shown)}</td></tr>`;
        })
        .join('')}</table>`
    : '';

  const tokens = f.tokens.length
    ? `<div class="tokens">${esc(f.tokens.slice(0, 4).join('  '))}${f.tokens.length > 4 ? ` +${f.tokens.length - 4}` : ''}</div>`
    : '';

  return `
    <div class="finding">
      <div class="row">
        <span class="prop">${esc(f.prop)}</span>
        <span class="val">${esc(f.specified?.value ?? f.computed)}</span>
        <span class="badge ${f.severity}">${SEVERITY_LABEL[f.severity]}</span>
      </div>
      ${f.message ? `<div class="msg">${esc(f.message)}</div>` : ''}
      ${tokens}
      ${table}
      ${where ? `<div class="where">${esc(where)}</div>` : ''}
    </div>
  `;
}

const basename = (href: string) => href.split('/').pop() ?? href;

function wireAxes(panel: HTMLElement, resolver: TokenResolver, el: Element, onFlip: () => void): void {
  for (const button of panel.querySelectorAll<HTMLButtonElement>('.chip[data-axis]')) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const axis = resolver.axes.find((a) => a.name === button.dataset.axis);
      const variant = axis?.variants.find((v) => v.raw === button.dataset.variant);
      if (!axis || !variant) return;
      if (resolver.flip(el, axis, variant)) onFlip();
    });
  }
}

/**
 * Vite's dev server exposes `/__open-in-editor`, which is how the React DevTools
 * "open in editor" button works. We reuse it rather than inventing a protocol.
 */
function wireSource(panel: HTMLElement): void {
  const link = panel.querySelector<HTMLElement>('.src[data-src]');
  link?.addEventListener('click', (event) => {
    event.stopPropagation();
    const file = link.dataset.src!;
    fetch(`/__open-in-editor?file=${encodeURIComponent(file)}`).catch(() => {
      navigator.clipboard?.writeText(file);
    });
  });
}
