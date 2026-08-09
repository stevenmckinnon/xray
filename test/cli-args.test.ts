import { describe, expect, it } from 'vitest';
import { parseArgs, UsageError } from '../src/cli/args';

/** parseArgs on a valid command, narrowed past the 'help' sentinel. */
function parse(...argv: string[]) {
  const result = parseArgs(argv);
  if (result === 'help') throw new Error('expected a command, got help');
  return result;
}

describe('parseArgs', () => {
  it('asks for help when given nothing', () => {
    expect(parseArgs([])).toBe('help');
    expect(parseArgs(['--help'])).toBe('help');
    expect(parseArgs(['-h'])).toBe('help');
  });

  it('prefers help over complaining about a bad command', () => {
    // Someone typing `xray nonsense --help` wants the usage, not a lecture.
    expect(parseArgs(['nonsense', '--help'])).toBe('help');
  });

  it('defaults to the safest useful settings', () => {
    expect(parse('record', 'http://localhost:5173')).toEqual({
      url: 'http://localhost:5173',
      baseline: null,
      out: null,
      update: false,
      failOn: 'high',
      perSource: 3,
      maxElements: 2000,
      wait: null,
      timeout: 30_000,
      full: false,
    });
  });

  it('reads every flag', () => {
    const cmd = parse(
      'record',
      'https://example.com/app',
      '--baseline',
      'xray.baseline.json',
      '--out',
      'run.json',
      '--fail-on',
      'medium',
      '--per-source',
      '5',
      '--max-elements',
      '500',
      '--wait',
      '.app-ready',
      '--timeout',
      '9000',
      '--full',
    );
    expect(cmd).toMatchObject({
      url: 'https://example.com/app',
      baseline: 'xray.baseline.json',
      out: 'run.json',
      failOn: 'medium',
      perSource: 5,
      maxElements: 500,
      wait: '.app-ready',
      timeout: 9000,
      full: true,
    });
  });

  it('rejects an unknown command', () => {
    expect(() => parseArgs(['inspect', 'http://x.test'])).toThrow(UsageError);
  });

  it('requires a url, and requires it to be one', () => {
    expect(() => parseArgs(['record'])).toThrow(/url is required/);
    expect(() => parseArgs(['record', './dist/index.html'])).toThrow(/must start with http/);
  });

  it('refuses two urls rather than silently picking one', () => {
    expect(() => parseArgs(['record', 'http://a.test', 'http://b.test'])).toThrow(/Expected one url/);
  });

  it('rejects an unknown option', () => {
    expect(() => parseArgs(['record', 'http://a.test', '--verbose'])).toThrow(/Unknown option/);
  });

  it('catches a flag whose value was swallowed by the next flag', () => {
    // `--baseline --full` would otherwise record a baseline literally named
    // "--full".
    expect(() => parseArgs(['record', 'http://a.test', '--baseline', '--full'])).toThrow(
      /--baseline needs a value/,
    );
    expect(() => parseArgs(['record', 'http://a.test', '--out'])).toThrow(/--out needs a value/);
  });

  it('only accepts severities that can fail a build', () => {
    expect(parse('record', 'http://a.test', '--fail-on', 'low').failOn).toBe('low');
    // `ok` would fail every build for ever.
    expect(() => parseArgs(['record', 'http://a.test', '--fail-on', 'ok'])).toThrow(/must be one of/);
    expect(() => parseArgs(['record', 'http://a.test', '--fail-on', 'HIGH'])).toThrow(/must be one of/);
  });

  it('rejects counts that are not positive whole numbers', () => {
    for (const bad of ['0', '-1', '2.5', 'lots', '']) {
      expect(() => parseArgs(['record', 'http://a.test', '--per-source', bad])).toThrow(UsageError);
    }
  });

  it('will not write a baseline without being told where', () => {
    expect(() => parseArgs(['record', 'http://a.test', '--update-baseline'])).toThrow(
      /needs --baseline/,
    );
  });

  it('accepts --update-baseline with a path', () => {
    const cmd = parse('record', 'http://a.test', '--baseline', 'b.json', '--update-baseline');
    expect(cmd).toMatchObject({ update: true, baseline: 'b.json' });
  });
});
