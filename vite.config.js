import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// This import must be added
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    esbuildOptions: {
      // Node.js global to browser global
      define: {
        global: 'globalThis',
      },
      // Enable esbuild polyfill plugins
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
        }),
      ],
    },
    include: ["buffer"],
  },
  resolve: {
    alias: {
      buffer: "buffer/",
      // If you want, you can add more polyfills here
      // util: 'rollup-plugin-node-polyfills/polyfills/util',
      // process: 'rollup-plugin-node-polyfills/polyfills/process-es6',
    },
  },
  define: {
    global: 'globalThis',
  },
  build: {
    rollupOptions: {
      // optionally add rollup polyfills plugin if needed
    },
  },
});
