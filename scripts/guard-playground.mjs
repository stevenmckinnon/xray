/**
 * Point xray at the playground and check what it found.
 *
 * The tool guarding itself, end to end: the Vite plugin stamps source locations, the
 * client resolves tokens by probing a real browser, the CLI drives Playwright and
 * writes a recording, and this asserts the recording says what a working engine would
 * say. Nothing here is reachable from a unit test — every assertion depends on a
 * cascade that only a browser can resolve.
 *
 * ## Why properties and not a baseline
 *
 * `xray record --baseline` exists and is the right tool for an application. It is the
 * wrong tool here. A committed baseline pins every value, so it fails on any change
 * whether or not the change is a regression, and — recorded on one machine, replayed
 * on another — it can fail for reasons that have nothing to do with this repository.
 *
 * These expectations instead state the properties that would be *false* if the engine
 * broke. Each names the regression it catches, and two of them have caught real bugs:
 * the padding assertions would have failed while `space` scored as a weak affinity,
 * and the nested-provider assertion depends on the axis machinery that the escaped
 * class-name bug corrupted.
 *
 * Thresholds sit below what the page currently produces, because the point is to catch
 * an engine that stopped working, not to notice that someone added a button.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.XRAY_GUARD_PORT ?? 5399);
const URL_ = `http://localhost:${PORT}`;

/** One finding, matched loosely enough to survive a theme bump. */
const has = (recording, match) =>
  recording.findings.some((finding) =>
    Object.entries(match).every(([key, want]) =>
      typeof want === 'function' ? want(finding[key]) : finding[key] === want,
    ),
  );

const EXPECTATIONS = [
  {
    name: 'the sweep reached the page',
    why: 'A CLI that silently swept nothing would satisfy every other assertion here.',
    check: (r) => {
      const ok = r.scanned.analysed >= 25 && r.scanned.locations >= 15 && !r.scanned.truncated;
      return ok || `analysed ${r.scanned.analysed}, ${r.scanned.locations} locations, truncated ${r.scanned.truncated}`;
    },
  },
  {
    name: 'the Vite plugin stamped source locations',
    why: 'Findings without a file are findings nobody can act on. This is the transform, the loader and `data-xray-src` all working.',
    check: (r) => {
      const attributed = r.findings.filter((f) => f.file === 'src/App.tsx').length;
      const orphaned = r.findings.filter((f) => f.file === null).length;
      return (attributed >= 40 && orphaned <= 6) || `${attributed} attributed, ${orphaned} unattributed`;
    },
  },
  {
    name: 'both variant axes were discovered',
    why: 'Discovery reads disagreement between stylesheets. It is the part with no adapter and no configuration, so it is the part most likely to quietly stop finding anything.',
    check: (r) => {
      const mode = r.axes.find((a) => a.name === 'mode');
      const density = r.axes.find((a) => a.name === 'density');
      const ok =
        mode?.variants.includes('dark') &&
        mode?.variants.includes('light') &&
        density?.variants.includes('high') &&
        density?.variants.includes('medium') &&
        density?.variants.includes('touch');
      return ok || `axes: ${JSON.stringify(r.axes.map((a) => `${a.name}[${a.variants}]`))}`;
    },
  },
  {
    name: 'the hand-rolled button is locked on the density axis',
    why: 'height 28px is --salt-size-base, and padding 8px is --salt-spacing-100. The padding half of this failed while `space` was scored as a weak affinity, which is the bug that made findings on every spacing value disappear.',
    check: (r) =>
      (has(r, { kind: 'variant-locked', prop: 'height', token: '--salt-size-base', axis: 'density' }) &&
        has(r, {
          kind: 'variant-locked',
          prop: (p) => p.startsWith('padding'),
          token: '--salt-spacing-100',
          axis: 'density',
        })) ||
      'no locked height/padding pair against the density tokens',
  },
  {
    name: 'the hand-rolled button is locked on the mode axis',
    why: 'A hardcoded #ffffff is --salt-container-primary-background in light and wrong in dark. Colour matching is a perceptual comparison, not string equality, so it fails differently from lengths.',
    check: (r) =>
      has(r, {
        kind: 'variant-locked',
        prop: 'background-color',
        token: '--salt-container-primary-background',
        axis: 'mode',
      }) || 'no locked background-color against the mode tokens',
  },
  {
    name: 'a nested provider changes what the same CSS resolves to',
    why: 'The second .hand-button sits inside .salt-density-high, where 28px is no longer --salt-size-base. Identical CSS, different verdict — this is the whole claim that tokens are resolved in context rather than looked up in a table.',
    check: (r) => {
      const heights = r.findings.filter((f) => f.prop === 'height' && /hand-button/.test(f.example));
      const locked = heights.filter((f) => f.kind === 'variant-locked' && f.token === '--salt-size-base');
      const loose = heights.filter((f) => f.kind === 'untokenized');
      return (
        (locked.length > 0 && loose.length > 0) ||
        `heights: ${JSON.stringify(heights.map((f) => `${f.line}:${f.kind}:${f.token}`))}`
      );
    },
  },
  {
    name: 'off-scale is told apart from locked',
    why: '.nearly is 7px and #fefefe — near a token, equal to none. Collapsing the two verdicts, or reporting `is --token` about a value that merely sits near one, is a mistake this has made before.',
    check: (r) =>
      has(r, {
        kind: 'off-scale',
        token: null,
        nearest: (n) => n !== null && n.delta > 0,
        example: (e) => /nearly/.test(e),
      }) || 'no off-scale finding with a nearest token on .nearly',
  },
  {
    name: 'a var() pointing at nothing is reported as unresolved',
    why: 'The browser drops the declaration silently, which is exactly why a tool has to say so. Depends on reading the authored value, not the computed one.',
    check: (r) =>
      has(r, {
        kind: 'unresolved',
        token: (t) => typeof t === 'string' && t.includes('1000000'),
        example: (e) => /typo/.test(e),
      }) || 'no unresolved finding for the nonexistent spacing token',
  },
  {
    name: 'shadow DOM is swept and attributed to the usage site',
    why: 'The element lives in a shadow root created in main.tsx, so its own file is not actionable. The nearest useful line is where <shadow-card> is written, and the finding has to admit the attribution is inexact.',
    check: (r) => {
      const inner = r.findings.filter((f) => f.example === 'div.inner');
      const ok = inner.length > 0 && inner.every((f) => f.file === 'src/App.tsx' && f.exact === false);
      return ok || `${inner.length} findings on div.inner: ${JSON.stringify(inner.map((f) => [f.file, f.exact]))}`;
    },
  },
  {
    name: 'a local override is resolved in place, and not called locked',
    why: '.child gets 20px from a --salt-spacing-100 override on its parent, so it renders the same at every density. It must name the overridden token — not --salt-spacing-250, which merely also holds 20px at medium — and it must not claim the element renders wrong elsewhere. It used to do both, at high severity.',
    check: (r) => {
      const finding = r.findings.find((f) => f.example === 'div.child' && f.prop === 'padding');
      if (!finding) return 'no padding finding on div.child at all';
      const ok =
        finding.token === '--salt-spacing-100' &&
        finding.kind !== 'variant-locked' &&
        finding.severity !== 'high' &&
        finding.wrongIn.length === 0;
      return ok || `${finding.severity} ${finding.kind} ${finding.token} wrongIn=${JSON.stringify(finding.wrongIn)}`;
    },
  },
];

const waitForServer = async (log) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(URL_, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // Not up yet. A failed connection here is the normal case, not an error.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The playground never answered on ${URL_}.\n${log()}`);
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });

const scratch = mkdtempSync(join(tmpdir(), 'xray-guard-'));
let server;
let output = '';

try {
  // `pnpm exec`, not `npx`: npx will reach for the network when it cannot resolve a
  // binary, which turns a missing dependency into a slow, confusing success.
  server = spawn(
    'pnpm',
    ['exec', 'vite', '--port', String(PORT), '--strictPort', '--config', 'playground/vite.config.ts', 'playground'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.on('data', (chunk) => (output += chunk));
  server.stderr.on('data', (chunk) => (output += chunk));
  server.on('exit', (code) => {
    if (code) output += `\nvite exited with ${code}`;
  });

  await waitForServer(() => output);

  const recordingPath = join(scratch, 'recording.json');
  // --wait, because a sweep that races the first render reports a page that was never
  // shown to anyone.
  const code = await run(process.execPath, [
    'dist/cli/main.js',
    'record',
    URL_,
    '--wait',
    '.hand-button',
    '--out',
    recordingPath,
  ]);

  // 2 is "could not run" — a broken CLI rather than a page with findings in it.
  if (code === 2) {
    console.error('\n[guard] xray record could not run. Nothing below was checked.');
    process.exit(1);
  }

  const recording = JSON.parse(readFileSync(recordingPath, 'utf8'));

  console.log('\n─── what the recording has to say ───\n');
  let failed = 0;
  for (const expectation of EXPECTATIONS) {
    const result = expectation.check(recording);
    if (result === true) {
      console.log(`  ok    ${expectation.name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${expectation.name}`);
      console.log(`        ${expectation.why}`);
      console.log(`        got: ${result}`);
    }
  }

  if (failed) {
    console.error(
      `\n[guard] ${failed} of ${EXPECTATIONS.length} expectations failed.\n` +
        `These describe what a working engine reports about a page built to be got wrong.\n` +
        `A failure here is either a real regression or a deliberate change of verdict — if it\n` +
        `is the latter, change the expectation in scripts/guard-playground.mjs and say why.`,
    );
    process.exit(1);
  }

  console.log(
    `\n[guard] all ${EXPECTATIONS.length} expectations hold — ` +
      `${recording.findings.length} findings over ${recording.scanned.analysed} elements.`,
  );
} finally {
  server?.kill('SIGTERM');
  rmSync(scratch, { recursive: true, force: true });
}
