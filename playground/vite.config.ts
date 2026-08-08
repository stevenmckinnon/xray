import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import xray from "../dist/index";

export default defineConfig({
  plugins: [xray(), react()],
});
