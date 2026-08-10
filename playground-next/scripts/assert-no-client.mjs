/**
 * Fail if a production build contains the xray client.
 *
 * This exists because the property is invisible: the client was being emitted as a
 * lazy chunk that no page ever fetched, so every observable thing about the app was
 * correct and the only symptom was 48kB of dead weight in someone else's `.next`.
 * Nothing but a build output check catches that.
 *
 * It is also easy to lose by accident. Two separate properties of the guard in
 * `src/next/client.ts` are required — a condition free of runtime values, and the
 * `import()` inside the branch rather than after an early return — and the bundlers
 * disagree about which one they need. Adding one prop to that condition puts the
 * client back in every consumer's build.
 *
 * Usage: node scripts/assert-no-client.mjs <dir>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Strings that appear in `dist/client.mjs` and nowhere else in a build. Deliberately
 * prose rather than identifiers: a minifier renames `tokensInScope` in some contexts
 * but never rewrites a string literal, so these survive whatever the bundler does.
 */
const MARKERS = ['tokensInScope', 'unreadableStylesheets', 'matches no colour token'];

const root = process.argv[2] ?? '.next';

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    // `.map` files are excluded: they legitimately quote source that the code itself
    // does not contain, and they are not served to anyone.
    else if (path.endsWith('.js') || path.endsWith('.mjs')) files.push(path);
  }
};

try {
  walk(root);
} catch {
  console.error(`[assert-no-client] ${root} does not exist — run the build first.`);
  process.exit(2);
}

const guilty = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const found = MARKERS.filter((marker) => source.includes(marker));
  if (found.length) guilty.push({ file, found, bytes: statSync(file).size });
}

if (guilty.length === 0) {
  console.log(`[assert-no-client] clean — ${files.length} files in ${root}, none contain the client`);
  process.exit(0);
}

console.error(`[assert-no-client] the xray client is in this production build:\n`);
for (const { file, found, bytes } of guilty) {
  console.error(`  ${file}  (${bytes} bytes)  matched ${found.join(', ')}`);
}
console.error(`
This means <Xray /> now ships the overlay to every consumer of the package. The
cause is almost always the guard in src/next/client.ts. It must contain nothing
the bundler cannot fold at build time, and the import() must sit inside the
branch — not after an early return, which webpack walks anyway.`);
process.exit(1);
