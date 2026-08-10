import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";
import xray from "../dist/index";

/**
 * The cast is this fixture's problem, not the plugin's.
 *
 * A real consumer writes `plugins: [xray()]` with no cast and it type-checks —
 * verified by installing the packed tarball into a scratch project alongside its
 * own Vite.
 *
 * Here there are two physical copies of Vite 7.3.6: the repo root's, which
 * `../dist/index.d.ts` refers to, and this directory's own npm install. Vite's
 * `EnvironmentPluginContainer` carries a private `_pluginContextMap`, and
 * TypeScript compares types with private members nominally — so two separate
 * declarations are never assignable, however identical they look. No amount of
 * typing on the plugin's side can fix that.
 *
 * The real fix is one copy of Vite, which means folding the root, this playground
 * and the site into a pnpm workspace.
 */
export default defineConfig({
  plugins: [xray() as PluginOption, react()],
});
