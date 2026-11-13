import { defineConfig, type Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import {
  identifyProductServerSide,
  chatServerSide,
  streamChatServerSide,
  setupLiveApiWebSocket,
} from './src/server/geminiService.ts';

function geminiServerPlugin(): Plugin {
  return {
    name: 'gemini-server-plugin',
    configureServer(server) {
      // 1. Attach Gemini Live API WebSocket Server without interfering with Vite HMR upgrades
      if (server.httpServer) {
        const wss = new WebSocketServer({ noServer: true });
        setupLiveApiWebSocket(wss);
        server.httpServer.on('upgrade', (request, socket, head) => {
          if (request.url?.startsWith('/api/live')) {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit('connection', ws, request);
            });
          }
        });
      }

      // 2. Attach server-side API endpoints
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        // POST /api/vision/identify
        if (req.method === 'POST' && url.startsWith('/api/vision/identify')) {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const result = await identifyProductServerSide(data);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // POST /api/gemini/chat
        if (req.method === 'POST' && url.startsWith('/api/gemini/chat')) {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { prompt, systemInstruction } = JSON.parse(body || '{}');
              const text = await chatServerSide(prompt, systemInstruction);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ text }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // POST /api/gemini/stream
        if (req.method === 'POST' && url.startsWith('/api/gemini/stream')) {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { prompt, systemInstruction } = JSON.parse(body || '{}');
              await streamChatServerSide(prompt, res, systemInstruction);
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [geminiServerPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api/byme': {
        target: 'https://platform.by.me/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/byme/, ''),
      },
    },
  },
});
