import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const shared = {
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  target: 'es2022',
  platform: 'browser',
  // Left unminified on purpose: this runs inside someone else's dev server, and a
  // stack trace you can read is worth more than the bytes.
  minify: false,
  sourcemap: false,
  legalComments: 'none',
};

/** For a script tag: Vite's virtual module, and the site's copied bundle. */
const iifeOptions = {
  ...shared,
  outfile: 'dist/client.js',
  format: 'iife',
  globalName: '__xrayClient',
};

/**
 * For an import.
 *
 * Next.js has no hook for injecting a script into the document, so its
 * integration is a component that imports the client instead. That needs a real
 * module with a real export, not a global assigned by an IIFE.
 */
const esmOptions = {
  ...shared,
  outfile: 'dist/client.mjs',
  format: 'esm',
};

function buildNode() {
  const result = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (watch) {
  for (const options of [iifeOptions, esmOptions]) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  }
  const tsc = spawnSync('npx', ['tsc', '-p', 'tsconfig.json', '--watch'], { stdio: 'inherit' });
  process.exitCode = tsc.status ?? 0;
} else {
  await esbuild.build(iifeOptions);
  await esbuild.build(esmOptions);
  buildNode();
  console.log('built dist/client.js + dist/client.mjs + dist/index.js');
}
