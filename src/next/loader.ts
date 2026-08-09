/**
 * Webpack loader that stamps `data-xray-src` onto JSX.
 *
 * Next.js has no transform hook in its config, so the same source transform the
 * Vite plugin runs as `transform()` is packaged as a loader here. The transform
 * itself is shared, so both integrations attribute findings identically.
 */

import { injectSource } from '../plugin/source-transform.js';

/**
 * The slice of webpack's loader context this needs.
 *
 * Typed structurally rather than imported, so the package does not need webpack
 * as a dependency to compile.
 */
interface LoaderContext {
  resourcePath: string;
  rootContext: string;
  callback(error: Error | null, content?: string, sourceMap?: object | string): void;
  cacheable?(flag: boolean): void;
}

export default function xrayLoader(this: LoaderContext, source: string): void {
  this.cacheable?.(true);

  // Nothing here depends on anything but the file's own text, so a failure to
  // transform must never fail the build: the overlay still works without source
  // links, and a dev tool that breaks compilation gets removed.
  let result: ReturnType<typeof injectSource> = null;
  try {
    result = injectSource(source, this.resourcePath, this.rootContext);
  } catch {
    result = null;
  }

  if (!result) {
    this.callback(null, source);
    return;
  }
  this.callback(null, result.code, result.map);
}
