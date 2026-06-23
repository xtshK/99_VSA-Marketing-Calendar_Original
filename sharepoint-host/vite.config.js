import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `npm run dev:web`, Vite serves the frontend on :5173 and proxies
// /api calls to the Express backend on :3000 (run `npm run dev:api` too).
// In production everything is served by Express from the built dist/ folder.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
