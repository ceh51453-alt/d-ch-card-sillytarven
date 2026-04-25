import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // ─── CORS Proxy ───
    // These proxies let the browser call /api-proxy/openai/... etc.
    // and Vite forwards them server-side, bypassing CORS entirely.
    proxy: {
      '/api-proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy\/openai/, ''),
        secure: true,
      },
      '/api-proxy/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy\/anthropic/, ''),
        secure: true,
      },
      '/api-proxy/google': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy\/google/, ''),
        secure: true,
      },
      // Generic passthrough proxy for any custom URL
      // Usage: /api-proxy/custom/<base64-encoded-target-origin>/rest/of/path
      '/api-proxy/custom': {
        target: 'http://localhost', // placeholder, overridden by router
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Extract the real target from the URL
            // Format: /api-proxy/custom/<base64url-encoded-origin>/rest/of/path
            const match = req.url?.match(/^\/api-proxy\/custom\/([A-Za-z0-9_-]+)\/(.*)/);
            if (match) {
              try {
                const targetOrigin = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
                const targetUrl = new URL(`/${match[2]}`, targetOrigin);
                proxyReq.setHeader('host', targetUrl.host);
                proxyReq.path = targetUrl.pathname + targetUrl.search;
              } catch {
                // fallback — let it fail naturally
              }
            }
          });
        },
        router: (req) => {
          const match = req.url?.match(/^\/api-proxy\/custom\/([A-Za-z0-9_-]+)/);
          if (match) {
            try {
              return atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
            } catch {
              return 'http://localhost';
            }
          }
          return 'http://localhost';
        },
        rewrite: (path) => {
          const match = path.match(/^\/api-proxy\/custom\/[A-Za-z0-9_-]+\/(.*)/);
          return match ? `/${match[1]}` : path;
        },
      },
    },
  },
})
