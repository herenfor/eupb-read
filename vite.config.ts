import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // 注意：1420 曾被 Hyper-V 保留段占用；后改 5517，但 2025-08 电脑重启后
    // 5470-5569 也落入 Windows 保留段（EADDRINUSE），现改用 5173
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
