/**
 * Copy the xray client bundle into the site's public assets.
 *
 * The bundle comes from the *published* package, not from a sibling build, so
 * the live demo on the page runs exactly what a user installing xray would get.
 * That also means the site has no build-time relationship with the repo it lives
 * in, which is what lets a plain static host build it with no configuration.
 *
 * The package exposes only its root export, so the client is found by resolving
 * that and looking beside it rather than by deep-importing a path the export map
 * does not publish.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let from;
try {
  from = join(dirname(require.resolve('@stevenmckinnon/xray')), 'client.js');
} catch {
  console.error('\n  @stevenmckinnon/xray is not installed. Run `pnpm install`.\n');
  process.exit(1);
}

if (!existsSync(from)) {
  console.error(`\n  The installed xray package has no client bundle at ${from}.\n`);
  process.exit(1);
}

const to = resolve(here, '../public/xray-client.js');

// public/ holds nothing but this generated file, so git does not track the
// directory and a fresh checkout does not have it.
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);

// Read it off disk: the package's export map does not publish ./package.json,
// which is the usual reason a `require` of it fails.
const manifest = join(dirname(from), '../package.json');
const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
console.log(`copied xray client ${version} → public/xray-client.js`);
