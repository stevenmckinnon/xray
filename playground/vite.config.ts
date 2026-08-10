import xray from "@stevenmckinnon/xray";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * No cast, and no reaching into `../dist`.
 *
 * The playground depends on the root package through the workspace, so it resolves
 * the same copy of Vite the plugin was compiled against. Two copies used to make
 * `xray()` unassignable to `PluginOption` — Vite's `EnvironmentPluginContainer`
 * carries a private member, and TypeScript compares types with private members by
 * declaration identity rather than shape.
 *
 * Importing by package name also means this file exercises the export map, the way
 * a consumer does.
 */
export default defineConfig({
  plugins: [xray(), react()],
});
