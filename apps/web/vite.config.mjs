import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const proxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": proxyTarget,
      "/health": proxyTarget
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": proxyTarget,
      "/health": proxyTarget
    }
  }
});
