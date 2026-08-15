import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // 注意：1420 在本机被 Hyper-V 保留段占用（EADDRINUSE），改用 5517
    port: 5517,
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
