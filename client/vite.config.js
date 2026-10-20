import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // API_PROXY_TARGET has no VITE_ prefix, so it is only used here and never
  // reaches the browser bundle.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // In development the browser talks only to the Vite server, which
      // forwards /api to Express. Same origin means the session cookie just works.
      proxy: {
        "/api": { target: env.API_PROXY_TARGET || "http://localhost:5000" },
      },
    },
  };
});
