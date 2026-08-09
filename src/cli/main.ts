#!/usr/bin/env node
/**
 * `xray record <url>` — sweep a page in a real browser and compare against a
 * baseline.
 *
 * The analysis needs a resolved cascade, so it has to run in a browser; there is
 * no headless shortcut. Playwright is an optional peer rather than a dependency,
 * because a design system that wants this in CI almost certainly has it already,
 * and one that does not should not be made to install a browser to use the Vite
 * plugin.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  collapse,
  diffFails,
  diffRecordings,
  formatDiff,
  formatRecording,
  RECORDING_VERSION,
  type Recording,
} from '../shared/recording.js';
import { parseArgs, UsageError, USAGE, type RecordCommand } from './args.js';

/** Exit codes are part of the contract: 1 means "found something", 2 means "could not look". */
const FOUND = 1;
const BROKEN = 2;

interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

interface PageLike {
  goto(url: string, options: { waitUntil: 'load'; timeout: number }): Promise<unknown>;
  waitForSelector(selector: string, options: { timeout: number }): Promise<unknown>;
  addScriptTag(options: { path: string }): Promise<unknown>;
  evaluate<T>(fn: string): Promise<T>;
  on(event: 'pageerror', handler: (error: Error) => void): void;
}

async function launch(): Promise<BrowserLike> {
  let playwright: { chromium: { launch(options: { headless: boolean }): Promise<BrowserLike> } };
  try {
    // The specifier is assembled at runtime so this file compiles and ships
    // without Playwright installed, which is the normal case: it is an optional
    // peer, needed only by the people who run this command.
    const specifier = 'playwright';
    playwright = (await import(specifier)) as never;
  } catch {
    throw new Error(
      'This command needs Playwright, which is not installed.\n' +
        '  pnpm add -D playwright && pnpm exec playwright install chromium',
    );
  }
  return playwright.chromium.launch({ headless: true });
}

/** The client bundle sits beside the compiled CLI in `dist`. */
function clientBundlePath(): string {
  return fileURLToPath(new URL('../client.js', import.meta.url));
}

function readBaseline(path: string): Recording {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Could not read the baseline at ${path}. Create it with --update-baseline.`);
  }

  let parsed: Recording;
  try {
    parsed = JSON.parse(raw) as Recording;
  } catch {
    throw new Error(`The baseline at ${path} is not valid JSON.`);
  }
  if (parsed.version !== RECORDING_VERSION) {
    throw new Error(
      `The baseline at ${path} was written by an incompatible version ` +
        `(${parsed.version}, this build reads ${RECORDING_VERSION}). Re-record it with --update-baseline.`,
    );
  }
  return parsed;
}

async function sweep(command: RecordCommand): Promise<Recording> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(command.url, { waitUntil: 'load', timeout: command.timeout });
    if (command.wait) {
      await page.waitForSelector(command.wait, { timeout: command.timeout });
    }

    // A dev server running the Vite plugin has already booted a client; anything
    // else — a preview build, a static page, a Storybook — needs the bundle
    // injected. Reusing the page's own client keeps the two paths reporting
    // identically rather than subtly diverging by version.
    const alreadyLoaded = await page.evaluate<boolean>('!!window.__xray');
    if (!alreadyLoaded) {
      await page.addScriptTag({ path: clientBundlePath() });
      await page.evaluate<void>('window.__xrayClient.start({})');
    }

    const recording = await page.evaluate<Recording>(
      `window.__xray.record(${JSON.stringify({
        perSource: command.perSource,
        maxElements: command.maxElements,
      })})`,
    );

    // The page throwing is not our failure, but it does mean the DOM may be half
    // rendered, and a sweep of half a page makes a misleading baseline.
    if (pageErrors.length) {
      recording.warnings.push(
        `The page threw ${pageErrors.length} error${pageErrors.length > 1 ? 's' : ''} while loading: ${pageErrors[0]}`,
      );
    }
    return recording;
  } finally {
    await browser.close();
  }
}

async function run(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed === 'help') {
    console.log(USAGE);
    return 0;
  }

  const recording = await sweep(parsed);

  if (parsed.out) {
    writeFileSync(parsed.out, `${JSON.stringify(recording, null, 2)}\n`);
  }

  if (parsed.update) {
    writeFileSync(parsed.baseline!, `${JSON.stringify(recording, null, 2)}\n`);
    console.log(formatRecording(recording));
    // Both numbers, because they differ and the difference is otherwise baffling:
    // the same mistake on four lines is four rows to fix but one thing to watch.
    const tracked = collapse(recording.findings).size;
    console.log(
      `\nWrote ${parsed.baseline} — ${recording.findings.length} findings, ` +
        `${tracked} tracked for comparison.`,
    );
    return 0;
  }

  if (!parsed.baseline) {
    console.log(formatRecording(recording));
    return 0;
  }

  const diff = diffRecordings(readBaseline(parsed.baseline), recording);
  if (parsed.full) {
    console.log(formatRecording(recording));
    console.log('');
  }
  console.log(formatDiff(diff));

  if (diffFails(diff, parsed.failOn)) {
    const one = diff.added.length === 1;
    console.log(
      `\nFailing: ${diff.added.length} new finding${one ? '' : 's'}. ` +
        `Fix ${one ? 'it' : 'them'}, or re-record with --update-baseline.`,
    );
    return FOUND;
  }
  return 0;
}

run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`xray: ${message}`);
    if (error instanceof UsageError) console.error(`\n${USAGE}`);
    process.exit(BROKEN);
  },
);
