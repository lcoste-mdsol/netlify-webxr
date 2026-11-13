import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import {
  identifyProductServerSide,
  chatServerSide,
  streamChatServerSide,
  setupLiveApiWebSocket,
} from './src/server/geminiService.ts';

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// 1. ByMe Platform API proxy route
app.get('/api/byme/*', async (req, res) => {
  const targetPath = req.url.replace('/api/byme', '');
  const targetUrl = `https://platform.by.me/api${targetPath}`;
  try {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'X-Byme-Entity-ID': '333',
    };
    if (req.headers['timestamp']) headers['timestamp'] = String(req.headers['timestamp']);
    if (req.headers['token']) headers['token'] = String(req.headers['token']);

    const response = await fetch(targetUrl, { headers });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'ByMe proxy error', details: String(err) });
  }
});

// 2. Gemini Server-Side Multimodal Product Identification
app.post('/api/vision/identify', async (req, res) => {
  try {
    const result = await identifyProductServerSide(req.body);
    res.json(result);
  } catch (err) {
    console.error('API vision error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// 3. Gemini Server-Side Chat
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { prompt, systemInstruction } = req.body;
    const text = await chatServerSide(prompt, systemInstruction);
    res.json({ text });
  } catch (err) {
    console.error('API chat error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// 4. Gemini Server-Side Streaming Chat (SSE)
app.post('/api/gemini/stream', async (req, res) => {
  try {
    const { prompt, systemInstruction } = req.body;
    await streamChatServerSide(prompt, res, systemInstruction);
  } catch (err) {
    console.error('API stream error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// 5. Attach Live API WebSocket server
const wss = new WebSocketServer({ server, path: '/api/live' });
setupLiveApiWebSocket(wss);

// 6. Integrate Vite in middleware mode for seamless development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
