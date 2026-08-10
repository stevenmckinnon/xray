import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";
import xray from "../dist/index";

export default defineConfig({
  plugins: [xray() as PluginOption, react()],
});
