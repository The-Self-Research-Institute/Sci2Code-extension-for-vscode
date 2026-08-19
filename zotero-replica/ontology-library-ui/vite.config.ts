import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Config injection pattern: VITE_DATASERVER_URL is baked in at build time and
// read back via src/config/deploymentConfig.ts. The dataserver is talked to
// directly (CORS-enabled there) - no gateway/reverse-proxy involved.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const prodSafe = (v?: string) =>
    mode === 'production' && v && /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(v) ? '' : v || '';

  return {
    // Relative base for VS Code webview builds (assets loaded from a rewritten
    // webview-resource:// URI), absolute base for standalone web/production builds.
    base: mode === 'production' ? '/' : './',
    server: {
      port: 3010,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      __ZOTERO_REPLICA_CONFIG__: JSON.stringify({
        DATASERVER_URL: prodSafe(env.VITE_DATASERVER_URL),
      }),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      sourcemap: mode !== 'production',
      outDir: 'dist',
      rollupOptions: {
        // VS Code webviews load the entry script from a rewritten webview-resource
        // URI; code-split chunks resolved at runtime against that origin have
        // 404'd in the sibling webview-src app for the same reason. Inlining
        // removes runtime chunk loading entirely - see that app's vite.config.ts.
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  };
});