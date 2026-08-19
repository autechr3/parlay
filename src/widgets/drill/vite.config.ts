import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  plugins: [react(), viteSingleFile()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: { outDir: path.resolve(__dirname, "../dist"), emptyOutDir: true },
});
