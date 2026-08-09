/**
 * Argument parsing, kept separate from the browser driving so it can be tested
 * without one.
 *
 * Hand-rolled rather than pulled from a dependency: the whole surface is one
 * command and eight flags, and a CLI that a design system installs should not
 * drag an argument parser into everyone's lockfile.
 */

import { SEVERITY_ORDER, type Severity } from '../shared/types.js';

export interface RecordCommand {
  url: string;
  /** Compare against this file instead of just printing. */
  baseline: string | null;
  /** Write the sweep to this file. Implied by `--update-baseline`. */
  out: string | null;
  /** Overwrite the baseline with this run and exit 0. */
  update: boolean;
  /** Lowest severity of *new* finding that fails the run. */
  failOn: Severity;
  perSource: number;
  maxElements: number;
  /** Wait for this selector before sweeping. */
  wait: string | null;
  timeout: number;
  /** Print the whole report, not just the diff. */
  full: boolean;
}

export class UsageError extends Error {}

export const USAGE = `
xray record <url> [options]

  Sweep a page and report which computed values are locked to one theme,
  density or mode.

Options
  --baseline <file>     Compare against a recorded baseline and fail on new findings
  --update-baseline     Write the baseline from this run and exit successfully
  --out <file>          Write the recording as JSON
  --fail-on <severity>  high | medium | low. Default high
  --per-source <n>      Elements to analyse per source location. Default 3
  --max-elements <n>    Cap on elements swept. Default 2000
  --wait <selector>     Wait for this selector before sweeping
  --timeout <ms>        How long to wait for the page. Default 30000
  --full                Print the whole report as well as the diff
  -h, --help            Show this

Exit codes
  0  no new findings
  1  new findings at or above --fail-on
  2  could not run
`.trimStart();

function requireValue(flag: string, value: string | undefined): string {
  if (value === undefined || value.startsWith('-')) {
    throw new UsageError(`${flag} needs a value.`);
  }
  return value;
}

function positiveInt(flag: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new UsageError(`${flag} needs a positive whole number, got "${raw}".`);
  }
  return n;
}

function severity(raw: string): Severity {
  // `ok` is deliberately not offered: a threshold that includes findings we
  // consider fine would fail every build for ever.
  const allowed = SEVERITY_ORDER.filter((s) => s !== 'ok');
  if (!(allowed as string[]).includes(raw)) {
    throw new UsageError(`--fail-on must be one of ${allowed.join(', ')}, got "${raw}".`);
  }
  return raw as Severity;
}

export function parseArgs(argv: string[]): RecordCommand | 'help' {
  if (!argv.length || argv.includes('-h') || argv.includes('--help')) return 'help';

  const [command, ...rest] = argv;
  if (command !== 'record') {
    throw new UsageError(`Unknown command "${command}". The only command is \`record\`.`);
  }

  let url: string | null = null;
  const out: RecordCommand = {
    url: '',
    baseline: null,
    out: null,
    update: false,
    failOn: 'high',
    perSource: 3,
    maxElements: 2000,
    wait: null,
    timeout: 30_000,
    full: false,
  };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    switch (arg) {
      case '--baseline':
        out.baseline = requireValue(arg, rest[++i]);
        break;
      case '--out':
        out.out = requireValue(arg, rest[++i]);
        break;
      case '--update-baseline':
        out.update = true;
        break;
      case '--fail-on':
        out.failOn = severity(requireValue(arg, rest[++i]));
        break;
      case '--per-source':
        out.perSource = positiveInt(arg, requireValue(arg, rest[++i]));
        break;
      case '--max-elements':
        out.maxElements = positiveInt(arg, requireValue(arg, rest[++i]));
        break;
      case '--wait':
        out.wait = requireValue(arg, rest[++i]);
        break;
      case '--timeout':
        out.timeout = positiveInt(arg, requireValue(arg, rest[++i]));
        break;
      case '--full':
        out.full = true;
        break;
      default:
        if (arg.startsWith('-')) throw new UsageError(`Unknown option "${arg}".`);
        if (url !== null) throw new UsageError(`Expected one url, got "${url}" and "${arg}".`);
        url = arg;
    }
  }

  if (url === null) throw new UsageError('A url is required, e.g. `xray record http://localhost:5173`.');
  if (!/^https?:\/\//.test(url)) {
    throw new UsageError(`The url must start with http:// or https://, got "${url}".`);
  }
  if (out.update && !out.baseline) {
    throw new UsageError('--update-baseline needs --baseline <file> to say which file to write.');
  }

  out.url = url;
  return out;
}
