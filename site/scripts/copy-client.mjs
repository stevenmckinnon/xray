/**
 * Copy the real xray client into the site's public assets.
 *
 * The landing page runs the actual engine on itself, so there is nothing to keep
 * in sync by hand — and no chance of the demo drifting from the tool.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../../dist/client.js');
const to = resolve(here, '../public/xray-client.js');

if (!existsSync(from)) {
  console.error(`\n  Missing ${from}\n  Run \`pnpm build\` in the xray root first.\n`);
  process.exit(1);
}
copyFileSync(from, to);
console.log(`copied xray client → public/xray-client.js`);
