import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const clientOptions = {
  entryPoints: ['src/client/index.ts'],
  outfile: 'dist/client.js',
  bundle: true,
  format: 'iife',
  globalName: '__xrayClient',
  target: 'es2022',
  platform: 'browser',
  // Left unminified on purpose: this runs inside someone else's dev server, and a
  // stack trace you can read is worth more than the bytes.
  minify: false,
  sourcemap: false,
  legalComments: 'none',
};

function buildNode() {
  const result = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (watch) {
  const ctx = await esbuild.context(clientOptions);
  await ctx.watch();
  const tsc = spawnSync('npx', ['tsc', '-p', 'tsconfig.json', '--watch'], { stdio: 'inherit' });
  process.exitCode = tsc.status ?? 0;
} else {
  await esbuild.build(clientOptions);
  buildNode();
  console.log('built dist/client.js + dist/index.js');
}
