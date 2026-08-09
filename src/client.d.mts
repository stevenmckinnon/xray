/**
 * Types for `dist/client.mjs`, which esbuild produces from `src/client/` rather
 * than tsc.
 *
 * The Next.js component imports that bundle at runtime, so the compiler needs to
 * know its shape without compiling the client sources — they are typed against
 * the DOM under their own tsconfig, and pulling them into the node build would
 * mean typechecking browser code with node's lib.
 */

import type { ClientConfig } from './shared/types.js';

export function start(config?: ClientConfig): unknown;
