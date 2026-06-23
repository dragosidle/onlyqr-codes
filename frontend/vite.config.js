import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api to the FastAPI backend so there's no CORS in dev and the fetch path
// is identical to production (nginx proxies /api/ on the VPS).
//   - Bare-metal local dev:  defaults to http://localhost:8000
//   - Docker dev (compose):  VITE_PROXY_TARGET=http://api:8000 (the api service)
const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:8000";

// Docker bind mounts on macOS/Windows don't emit native FS events, so HMR needs
// polling inside the container. Off by default to keep bare-metal dev snappy.
const usePolling = process.env.VITE_USE_POLLING === "true";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so the container is reachable from the host
    port: 5173,
    proxy: {
      "/api": proxyTarget,
    },
    watch: usePolling ? { usePolling: true } : undefined,
  },
});
