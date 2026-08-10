import { withXray } from '@stevenmckinnon/xray/next';

/**
 * The whole point of this file: `withXray` is exercised here exactly as a consumer
 * writes it, through the package's export map rather than a relative path into
 * `../src`.
 *
 * No `outputFileTracingRoot`. It was pinned to this directory while the fixture had
 * its own lockfile, and pinning it here as a workspace member breaks the build:
 * Turbopack takes the tracing root as its own, refuses to compile anything above it,
 * and `next` resolves through a symlink into the repo root's store — so the app
 * failed with "Could not find the Next.js package". Left alone, Next infers the root
 * from the nearest lockfile, which is the workspace root, which is correct.
 */
export default withXray({});
