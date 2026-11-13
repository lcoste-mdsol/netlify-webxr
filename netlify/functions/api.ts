import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import {
  identifyProductServerSide,
  chatServerSide,
  streamChatServerSide,
} from '../../src/server/geminiService.ts';

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// 1. ByMe Platform API proxy route
app.use('/api/byme', async (req, res) => {
  const targetUrl = `https://platform.by.me/api${req.url}`;
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

// 4. Gemini Server-Side Streaming Chat
app.post('/api/gemini/stream', async (req, res) => {
  try {
    const { prompt, systemInstruction } = req.body;
    await streamChatServerSide(prompt, res, systemInstruction);
  } catch (err) {
    console.error('API stream error:', err);
    res.status(500).json({ error: String(err) });
  }
});

export const handler = serverless(app);