import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Dos páginas: el Escenario (lo sirve el celular en :8001, "/") y la Consola del banco
// (la sirve el banco en :8000, "/consola/"). base relativa para que ambas encuentren sus assets.
const PHONE = "http://127.0.0.1:8001";
const BANK = "http://127.0.0.1:8000";
const bankPaths = ["/mechanisms", "/bank", "/audit", "/events", "/telemetry", "/lab", "/results", "/docs", "/openapi.json", "/zkp"];

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        escenario: resolve(__dirname, "escenario.html"),
        consola: resolve(__dirname, "consola.html"),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": PHONE,
      ...Object.fromEntries(bankPaths.map((path) => [path, BANK])),
    },
  },
  test: { environment: "node" },
});
