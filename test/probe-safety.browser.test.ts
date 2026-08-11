/**
 * The invariants that make xray safe to point at a running app, checked in a real
 * browser.
 *
 * These have been verified by hand-pasting JavaScript into a console, which is a bad
 * way to guard the one property the whole tool rests on: it inserts nodes into
 * someone's live DOM and reads back computed styles. Nothing in a jsdom unit test can
 * check this, because the interesting failures are cascade and layout failures.
 *
 * The technique worth knowing about is `appendChild` interception. Probes exist for
 * microseconds inside a synchronous call, so nothing observing from outside — a
 * MutationObserver, a rendered frame — can ever see the DOM while they are in it. So
 * the hook samples the page *at the moment a probe is inserted*, which is the only
 * state where a violation is visible. After the call everything is restored, and an
 * after-the-fact check would pass no matter how badly the page had been disturbed.
 *
 * Skipped when Chromium is not installed, so a contributor who has only run
 * `pnpm install` does not get a failure they cannot act on. CI sets
 * `XRAY_REQUIRE_BROWSER=1`, which turns that skip into an error — otherwise the whole
 * file could quietly stop running and nothing would say so.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const CLIENT = fileURLToPath(new URL('../dist/client.js', import.meta.url));

const chromium = await (async () => {
  try {
    const { chromium } = await import('playwright');
    // `launch` is what actually fails when the browser was never downloaded;
    // importing the package always succeeds.
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return chromium;
  } catch (error) {
    if (process.env.XRAY_REQUIRE_BROWSER) {
      throw new Error(
        `XRAY_REQUIRE_BROWSER is set but Chromium could not launch, so the probe-safety ` +
          `invariants would have gone unchecked. Run \`pnpm exec playwright install chromium\`.\n${String(error)}`,
      );
    }
    return null;
  }
})();

/**
 * A page built to make every way of disturbing it visible.
 *
 * - `li:nth-child`, `:last-child` and `+` give every structural selector something to
 *   get wrong. The colours are what the assertions read back.
 * - `.card` is a flex container, so an in-flow child would add a gap.
 * - `.grid` is a grid container, so an in-flow child would add a track.
 * - The mode axis is declared as `html.dark`, which is the case a nested probe cannot
 *   reproduce — it forces the fallback that swaps the class on `<html>` itself, the
 *   one path that mutates something outside the element being inspected.
 * - `html` carries unrelated classes *and* is in the dark variant. Being in it is what
 *   makes the fallback run at all: with no `.dark` anywhere in the tree there is no
 *   axis owner to swap, so xray never touches an ancestor and the path this file most
 *   wants to check would go unexercised while every assertion passed. The unrelated
 *   classes catch a restore that assigns `className` instead of toggling.
 */
const FIXTURE = `<!doctype html>
<html class="js no-touch dark">
<head><style>
  /* Four tokens on the density axis, not three. The override below declares
     --space-100 as well, which is enough to stop discovery counting it towards the
     axis — and with exactly three the axis then fell under AXIS_MIN_TOKENS and vanished,
     taking the rest of this fixture's premise with it. */
  :root {
    --space-100: 8px; --space-200: 16px; --space-300: 24px; --radius-100: 4px;
    --text-primary: rgb(20, 20, 20); --surface: rgb(255, 255, 255); --border-subtle: rgb(221, 221, 221);
  }
  html.dark { --text-primary: rgb(240, 240, 240); --surface: rgb(18, 18, 18); --border-subtle: rgb(60, 60, 60); }
  [data-density='compact'] { --space-100: 4px; --space-200: 8px; --space-300: 12px; --radius-100: 2px; }
  [data-density='cosy'] { --space-100: 12px; --space-200: 24px; --space-300: 36px; --radius-100: 6px; }

  body { margin: 0; font: 16px/1.5 system-ui; background: var(--surface); color: var(--text-primary); }

  .card { display: flex; gap: var(--space-200); padding: var(--space-200); align-items: flex-start; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-100); }

  /* Structural selectors. If anything is inserted as a sibling of these, or appended
     inside their parent, the wrong element matches. */
  li { color: rgb(0, 0, 0); }
  li:nth-child(1) { color: rgb(1, 0, 0); }
  li:nth-child(2) { color: rgb(2, 0, 0); }
  li:nth-child(3) { color: rgb(3, 0, 0); }
  li:last-child { background: rgb(9, 9, 9); }
  li:nth-child(odd) { font-style: italic; }
  li + li { border-top: 1px solid rgb(7, 7, 7); }

  /* Keyed off the *subject's parent's* child count, so a probe inserted beside the
     subject rather than inside it shows up as drift and not only as a bad parent.
     Without this the blast-radius test passed a deliberately sibling-inserting build:
     a third child of .grid changes no nth-child match that anything else reads. */
  .grid > *:last-child { opacity: 0.99; }

  /* The subject: hardcoded, so it has findings to report. The colour is --text-primary's *dark*
     value, because the page is in the dark variant and a literal is only a token match
     when it equals what that token resolves to right now. Using the light value made
     the colour untokenised, which meant the dark axis was never probed and the test
     that checks the ancestor swap silently had nothing to check. */
  .subject { padding: 8px; border-radius: 4px; color: rgb(240, 240, 240); }
  .subject > span:last-child { text-decoration: underline; }

  /* The component override hook every design system ships. --space-100 is pinned to a
     literal here, so it no longer moves with density for anything in this subtree —
     which makes .pinned's hardcoded 20px correct at every density, not locked to one. */
  .override { --space-100: 20px; padding: var(--space-100); }
  .override .pinned { padding: 20px; }
</style></head>
<body>
  <div class="card">
    <div class="grid">
      <button class="subject" type="button"><span>one</span><span>two</span></button>
      <ul><li>a</li><li>b</li><li>c</li></ul>
    </div>
    <div class="override"><div class="pinned">pinned by a local override</div></div>
  </div>
</body>
</html>`;

/**
 * Every element in the page, keyed by a stable path rather than by a selector.
 *
 * Sampling everything rather than a hand-picked list is what makes the assertion
 * meaningful: the claim is about the blast radius, so the test has to be able to see an
 * element I did not think to name. `[data-xray]` nodes are skipped — they are the
 * probes themselves, and they are supposed to be there.
 */
const SAMPLE = `() => {
  const path = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      parts.unshift(n.tagName.toLowerCase() + ':' + [...n.parentElement.children].indexOf(n));
    }
    return parts.join('>') || 'html';
  };
  const read = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return [
      cs.color, cs.backgroundColor, cs.fontStyle, cs.fontWeight, cs.borderTopWidth,
      cs.textDecorationLine, cs.gap, cs.gridTemplateColumns, cs.padding, cs.margin,
      cs.display, cs.visibility, cs.opacity,
      Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
    ].join('|');
  };
  const out = {};
  for (const el of document.querySelectorAll('*')) {
    if (el.closest('[data-xray]')) continue;
    out[path(el)] = read(el);
  }
  out['__htmlClass'] = document.documentElement.className;
  out['__htmlDensity'] = document.documentElement.getAttribute('data-density') ?? '';
  out['__scrollHeight'] = String(document.documentElement.scrollHeight);
  return out;
}`;

describe.skipIf(!chromium)('probe safety, in a real browser', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium!.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  /**
   * A fresh page per test, not a shared one.
   *
   * The resolver memoises what a token resolves to under each variant, so on a shared
   * page the second test to ask a question gets the answer without probing — and a test
   * that counts probe insertions or class swaps then sees zero and reports it as a
   * violation. Sharing was also a way for one test's leaked mutation to fail the next,
   * which reads as a bug in the wrong place.
   */
  beforeEach(async () => {
    page = await browser.newPage();
    // A real origin. `about:blank` and `data:` URLs give stylesheets an opaque origin,
    // and reading `cssRules` off one throws — which is the exact condition xray reports
    // as an unreadable stylesheet, so the fixture would test the degraded path instead
    // of the one it means to.
    await page.route('http://xray.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }),
    );
    await page.goto('http://xray.test/');
    await page.addScriptTag({ content: readFileSync(CLIENT, 'utf8') });
    // No hotkeys: this drives the API directly and a global key listener would only
    // add a way for the test to interfere with itself.
    await page.evaluate(() => (window as never as { __xrayClient: { start(c: unknown): void } }).__xrayClient.start({ hotkeys: [] }));
  }, 60_000);

  afterEach(async () => {
    await page?.close();
  });

  it('sees the fixture as xray is meant to: two axes, readable stylesheets', async () => {
    const diagnosis = await page.evaluate(() => (window as never as { __xray: { diagnose(): unknown } }).__xray.diagnose());
    expect(diagnosis).toMatchObject({
      enumeratesCustomProperties: true,
      unreadableStylesheets: [],
    });
    const axes = (diagnosis as { axes: { name: string }[] }).axes.map((a) => a.name).sort();
    expect(axes).toEqual(['dark', 'density']);
  });

  it('inserts probes only inside the element being inspected', async () => {
    const violations = await page.evaluate(() => {
      const seen: { parent: string; insideSubject: boolean }[] = [];
      const subject = document.querySelector('.subject')!;
      const originalAppend = Element.prototype.appendChild;

      Element.prototype.appendChild = function <T extends Node>(this: Element, node: T): T {
        const result = originalAppend.call(this, node) as T;
        if (node instanceof Element && node.getAttribute('data-xray') === 'probe') {
          seen.push({
            parent: this.tagName.toLowerCase() + '.' + this.className,
            // The point of the whole design: a probe is a descendant of the subject,
            // never a sibling of it, so no selector matching around the subject can
            // see a changed tree.
            insideSubject: this === subject || subject.contains(this),
          });
        }
        return result;
      };

      try {
        (window as never as { __xray: { inspect(el: Element): unknown } }).__xray.inspect(subject);
      } finally {
        Element.prototype.appendChild = originalAppend;
      }

      return { total: seen.length, outside: seen.filter((s) => !s.insideSubject) };
    });

    expect(violations.total).toBeGreaterThan(0);
    expect(violations.outside).toEqual([]);
  });

  /**
   * The blast radius, stated as a set rather than as a list of properties.
   *
   * There are exactly two windows in which the page is not itself, and both are
   * deliberate:
   *
   * 1. **A probe is inside the subject.** A probe is an element child, and there is no
   *    way to add one without changing what `:last-child`, `:nth-last-child` and
   *    `:only-child` match among the subject's *own* children. That is the price of
   *    going inside the element rather than beside it, and it is the right way round:
   *    beside it would change those same pseudo-classes for the subject, which is the
   *    element whose values are being read.
   * 2. **A variant class is off an ancestor.** For a token declared `html.dark`, the
   *    only way to read the other variant is to swap the class on `<html>`, which puts
   *    the whole page in that variant for the duration. Synchronous, so no frame is
   *    ever painted in it.
   *
   * The test tells them apart by checking `<html>`'s class at sample time, and holds
   * window 1 to the tight claim: nothing outside the subject's own children moves. A
   * test that lumped them together would have to accept page-wide drift always, which
   * is the thing actually worth catching.
   */
  it('perturbs nothing outside the inspected element while probes are in the DOM', async () => {
    const result = await page.evaluate(
      ([sampleSource]) => {
        const sample = new Function('return ' + sampleSource)() as () => Record<string, string>;
        const subject = document.querySelector('.subject')!;
        const childPaths = new Set(
          [...subject.children].map((child) => {
            const parts: string[] = [];
            for (let n: Element | null = child; n && n !== document.documentElement; n = n.parentElement) {
              parts.unshift(n.tagName.toLowerCase() + ':' + [...n.parentElement!.children].indexOf(n));
            }
            return parts.join('>');
          }),
        );

        const before = sample();
        const originalClass = document.documentElement.className;
        const probeOnly: string[][] = [];
        const midSwap: string[][] = [];
        const structuralEscapes: string[] = [];
        const originalAppend = Element.prototype.appendChild;

        Element.prototype.appendChild = function <T extends Node>(this: Element, node: T): T {
          const result = originalAppend.call(this, node) as T;
          // Sampled here, with the probe in the tree. Reading computed style forces
          // style resolution, so this is the real cascade result — and it is the only
          // moment a violation exists to be seen, because everything is unwound before
          // the synchronous call returns.
          if (node instanceof Element && node.getAttribute('data-xray') === 'probe') {
            // Checked in both windows. Style drift is excused mid-swap, and a probe
            // inserted as a sibling of the subject *during* a swap would otherwise be
            // excused with it — which is exactly the violation this file exists for.
            if (this !== subject && !subject.contains(this)) {
              structuralEscapes.push(this.tagName.toLowerCase() + '.' + this.className);
            }
            const now = sample();
            const drift = Object.keys(before).filter((k) => before[k] !== now[k]);
            (document.documentElement.className === originalClass ? probeOnly : midSwap).push(drift);
          }
          return result;
        };

        try {
          (window as never as { __xray: { inspect(el: Element): unknown } }).__xray.inspect(subject);
        } finally {
          Element.prototype.appendChild = originalAppend;
        }

        const after = sample();
        return {
          probeSamples: probeOnly.length,
          swapSamples: midSwap.length,
          structuralEscapes: [...new Set(structuralEscapes)],
          // Window 1: anything that moved and is not one of the subject's own children.
          escaped: [...new Set(probeOnly.flat())].filter((key) => !childPaths.has(key)),
          // What did move, so the documented cost is visible in the test output rather
          // than only in prose.
          withinSubject: [...new Set(probeOnly.flat())].filter((key) => childPaths.has(key)),
          afterDrift: Object.keys(before).filter((k) => before[k] !== after[k]),
          leftovers: document.querySelectorAll('[data-xray="probe"]').length,
        };
      },
      [SAMPLE],
    );

    expect(result.probeSamples).toBeGreaterThan(0);
    expect(result.structuralEscapes).toEqual([]);
    expect(result.escaped).toEqual([]);
    expect(result.afterDrift).toEqual([]);
    expect(result.leftovers).toBe(0);
    // Window 2 has to have happened, or the fixture stopped exercising the swap and
    // window 1's assertion got easier without anyone noticing.
    expect(result.swapSamples).toBeGreaterThan(0);
  });

  it('restores an ancestor it had to mutate, including classes it did not set', async () => {
    // `html.dark` can only be probed by swapping the class on <html>. That is the one
    // place xray touches something it was not asked about, so it is the one place a
    // throw or a sloppy restore is visible to the user.
    const result = await page.evaluate(() => {
      const html = document.documentElement;
      const before = { class: html.className, density: html.getAttribute('data-density') };
      // `takeRecords`, not the callback. The callback is a microtask, and everything
      // here happens inside one synchronous call — which is the property being tested,
      // so waiting for a microtask would report zero mutations and call that a pass.
      const observer = new MutationObserver(() => {});
      observer.observe(html, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class', 'data-density'],
      });

      const report = (window as never as { __xray: { inspect(el: Element): { findings: unknown[] } } }).__xray.inspect(
        document.querySelector('.subject')!,
      );

      const records = observer.takeRecords();
      observer.disconnect();
      return {
        findings: report.findings.length,
        // Every intermediate state <html> passed through. It has to have been at least
        // one — a dark axis declared as `html.dark` cannot be probed any other way, so
        // zero would mean the fallback silently stopped running and the variant values
        // were coming from somewhere unearned.
        swaps: records.map((r) => `${r.attributeName}: ${r.oldValue} → ${(r.target as Element).getAttribute(r.attributeName!)}`),
        // Restored synchronously, so by the time the caller gets control the page is
        // back — no frame is ever painted in the wrong variant.
        classAfter: html.className,
        densityAfter: html.getAttribute('data-density'),
        before,
      };
    });

    expect(result.findings).toBeGreaterThan(0);
    expect(result.swaps.length).toBeGreaterThan(0);
    expect(result.classAfter).toBe(result.before.class);
    expect(result.densityAfter).toBe(result.before.density);
  });

  /**
   * The verdict this tool exists to produce, and the one it must not get wrong.
   *
   * `.pinned` hardcodes 20px inside a container that pins `--space-100` to 20px. Every
   * density renders the same, so the value is drift — it will not follow the token —
   * and it is emphatically not "locked to one density, renders wrong at the others".
   *
   * It used to say exactly that, at high severity, because the finding named the
   * overridden token while taking its variant table from `--space-200`, which merely
   * also holds 20px at the base density.
   */
  it('does not call a value locked when a local override pins its token', async () => {
    const finding = await page.evaluate(() => {
      const report = (
        window as never as {
          __xray: {
            inspect(el: Element): {
              findings: { prop: string; kind: string; tokens: string[]; severity: string; message: string }[];
            };
          };
        }
      ).__xray.inspect(document.querySelector('.pinned')!);
      return report.findings.find((f) => f.prop.startsWith('padding')) ?? null;
    });

    expect(finding).not.toBeNull();
    expect(finding!.tokens[0]).toBe('--space-100');
    expect(finding!.kind).not.toBe('variant-locked');
    expect(finding!.severity).not.toBe('high');
    expect(finding!.message).not.toMatch(/renders wrong|locked to one/);
  });

  it('reports the hardcoded values as locked, on both axes', async () => {
    const report = await page.evaluate(() =>
      (window as never as { __xray: { report(): string } }).__xray.report(),
    );
    // padding and border-radius move with density; color moves with dark. All three are
    // hardcoded on `.subject`, so all three are locked — this is what the invariants
    // above are protecting, and a page that reported nothing would satisfy them all.
    expect(report).toMatch(/LOCKED/);
    expect(report).toMatch(/--space-100/);
    expect(report).toMatch(/--radius-100/);
    expect(report).toMatch(/--text-primary/);
  });
});
