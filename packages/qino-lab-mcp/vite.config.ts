import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  root: "src/ui",
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  server: {
    port: 3020,
    proxy: {
      "/api/": {
        target: "http://localhost:4020",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
  },
});
