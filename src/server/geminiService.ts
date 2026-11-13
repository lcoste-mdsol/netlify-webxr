import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

// Shared server-side GoogleGenAI client
let aiClient: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }
  return aiClient;
}

export interface VisionIdentifyRequest {
  imageBase64: string;
  mimeType?: string;
  userHint?: string;
  catalogueContext: Array<{
    index: number;
    name: string;
    category: string;
    has3DModel: boolean;
    description: string;
    physicalFeatures: string[];
  }>;
}

export interface VisionIdentifyResponse {
  matchedStartupName: string;
  confidence: number;
  reasoning: string;
  matchedVisualFeatures: string[];
  voiceResponse: string;
  source?: 'gemini' | 'fallback';
  model?: string;
  fallbackReason?: string;
  latencyMs?: number;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  return Promise.race([
    promise.then((val) => {
      clearTimeout(timer);
      return val;
    }),
    timeoutPromise,
  ]);
}

function parseJsonObject(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeImageInput(rawBase64: string, providedMimeType?: string): { mimeType: string; data: string } {
  const trimmed = (rawBase64 || '').trim();
  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
  if (dataUrlMatch) {
    return {
      mimeType: providedMimeType || dataUrlMatch[1],
      data: dataUrlMatch[2],
    };
  }
  return {
    mimeType: providedMimeType && providedMimeType.startsWith('image/') ? providedMimeType : 'image/jpeg',
    data: trimmed,
  };
}

/**
 * Handles multimodal product identification using Gemini 4 Flash (gemini-4-hydrogen) server-side.
 */
export async function identifyProductServerSide(
  data: VisionIdentifyRequest
): Promise<VisionIdentifyResponse> {
  const ai = getAiClient();
  const { imageBase64, mimeType: rawMimeType, userHint, catalogueContext } = data;
  const modelName = 'gemini-4-hydrogen';
  const startedAt = Date.now();

  const { mimeType, data: cleanBase64 } = normalizeImageInput(imageBase64, rawMimeType);

  const compactCatalogue = (catalogueContext || []).map((item) => ({
    index: item.index,
    name: item.name,
    category: item.category,
    has3DModel: item.has3DModel,
    description: (item.description || '').replace(/\s+/g, ' ').slice(0, 160),
    physicalFeatures: (item.physicalFeatures || []).slice(0, 3),
  }));

  const promptText = `
You are the AI Computer Vision engine for the Galaxy XR Startup Showroom application.
The user is viewing physical showroom hardware or prototypes with their camera (or uploaded a test product photo).
Each product belongs to one of the following startups in our portfolio:

SHOWROOM STARTUPS PORTFOLIO & 3D CAD MODEL SPECIFICATIONS:
${JSON.stringify(compactCatalogue)}

TASK:
1. Carefully examine the provided image (and optional user hint: "${userHint || 'none'}").
2. Identify the physical object/device shown in the image by comparing its visual shape, components, environment, and purpose against every startup in the portfolio above.
3. Explain clearly what visual details you see in the image and why they match that startup's product and 3D CAD model. Do NOT default to the first catalog entry unless the image actually depicts a tidal marine membrane / energy generator.
4. In voiceResponse, write 2-3 clear sentences describing the matched startup and invite the user to say "Load 3D model" or "Load video".
`;

  let fallbackReason = 'GEMINI_API_KEY is not configured on the server.';

  if (ai) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const call = ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: promptText,
              },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              'You are an expert computer vision analyst identifying physical hardware prototypes in a showroom. Base your decision strictly on the visual content of the image and optional user hint.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              required: [
                'matchedStartupName',
                'confidence',
                'reasoning',
                'matchedVisualFeatures',
                'voiceResponse',
              ],
              properties: {
                matchedStartupName: {
                  type: Type.STRING,
                  description: 'Exact startup name from the provided portfolio.',
                },
                confidence: {
                  type: Type.NUMBER,
                  description: 'Match confidence between 0.0 and 0.99.',
                },
                reasoning: {
                  type: Type.STRING,
                  description: 'What is visible in the image and how it matches the startup hardware.',
                },
                matchedVisualFeatures: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Key visual features observed in the image.',
                },
                voiceResponse: {
                  type: Type.STRING,
                  description: 'Concise 2-3 sentence spoken description of the matched startup.',
                },
              },
            },
          },
        });

        const response = await withTimeout(call, 25000, null);
        const latencyMs = Date.now() - startedAt;
        if (response && response.text) {
          const parsed = parseJsonObject(response.text);
          if (parsed && parsed.matchedStartupName) {
            return {
              matchedStartupName: parsed.matchedStartupName,
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
              reasoning:
                parsed.reasoning || `Detected visual alignment with ${parsed.matchedStartupName} physical prototype.`,
              matchedVisualFeatures: parsed.matchedVisualFeatures || ['Visual correspondence with startup hardware'],
              voiceResponse:
                parsed.voiceResponse ||
                `I identified ${parsed.matchedStartupName}. Say "Load 3D model" to overlay the virtual twin.`,
              source: 'gemini',
              model: modelName,
              latencyMs,
            };
          }
          fallbackReason = 'Gemini response did not contain valid JSON startup match.';
          break;
        } else {
          fallbackReason = `Gemini vision request timed out or returned empty response after ${latencyMs}ms.`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fallbackReason = msg;
        const isTransient = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|timeout|fetch/i.test(msg);
        if (isTransient && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 700 * attempt));
          continue;
        }
        console.warn('Server-side Gemini Vision call failed, using catalog heuristic fallback:', err);
        break;
      }
    }
  }

  // Graceful fallback if no API key or network error
  let selected = catalogueContext[0];
  if (userHint) {
    const hintLower = userHint.toLowerCase();
    const found = catalogueContext.find(
      (c) =>
        hintLower.includes(c.name.toLowerCase()) ||
        c.description.toLowerCase().includes(hintLower) ||
        c.category.toLowerCase().includes(hintLower)
    );
    if (found) selected = found;
  }

  return {
    matchedStartupName: selected.name,
    confidence: 0.72,
    reasoning: `[Fallback mode: ${fallbackReason}] Matched using catalog context for ${selected.name}.`,
    matchedVisualFeatures: selected.physicalFeatures || [
      'Catalog fallback (live camera/model unavailable)',
    ],
    voiceResponse: `Using catalog fallback, I selected ${selected.name}. ${selected.description.slice(0, 140)}... Say "Load 3D model" to overlay the virtual twin.`,
    source: 'fallback',
    model: modelName,
    fallbackReason,
    latencyMs: Date.now() - startedAt,
  };
}

/**
 * Handles standard chat completion from Gemini 4 Flash (gemini-4-hydrogen).
 */
export async function chatServerSide(prompt: string, systemInstruction?: string): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    return 'The Galaxy XR showroom voice assistant is operating in local context mode.';
  }

  try {
    const call = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          systemInstruction ||
          'You are the spatial voice AI assistant for the Galaxy XR Startup Showroom. Answer concisely.',
      },
    });

    const response = await withTimeout(call, 15000, null);
    if (response && response.text) {
      return response.text;
    }
    return 'The Galaxy XR Showroom showcases innovative startups in Life Sciences, Sustainable Nature, and Advanced Products.';
  } catch (err) {
    console.warn('Gemini chat API error:', err);
    return 'The Galaxy XR Showroom showcases innovative startups in Life Sciences, Sustainable Nature, and Advanced Products.';
  }
}

/**
 * Handles streaming responses from Gemini 4 Flash (gemini-4-hydrogen) via Server-Sent Events (SSE).
 */
export async function streamChatServerSide(
  prompt: string,
  res: ServerResponse,
  systemInstruction?: string
): Promise<void> {
  const ai = getAiClient();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  if (!ai) {
    res.write(`data: ${JSON.stringify({ text: 'Gemini server is running in local context mode.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  try {
    const streamPromise = ai.models.generateContentStream({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          systemInstruction ||
          'You are the spatial voice AI assistant for the Galaxy XR Startup Showroom.',
      },
    });

    const responseStream = await withTimeout(streamPromise, 12000, null);

    if (responseStream) {
      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }
    } else {
      res.write(
        `data: ${JSON.stringify({
          text: 'The Galaxy XR Showroom showcases innovative startups in Life Sciences, Sustainable Nature, and Advanced Products.',
        })}\n\n`
      );
    }
  } catch (err) {
    console.error('Streaming chat error:', err);
    res.write(
      `data: ${JSON.stringify({
        text: 'The Galaxy XR Showroom showcases innovative startups in Life Sciences, Sustainable Nature, and Advanced Products.',
      })}\n\n`
    );
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

/**
 * Attaches a WebSocket server for Gemini Live API real-time bidirectional audio/video streaming.
 */
export function setupLiveApiWebSocket(wss: WebSocketServer): void {
  wss.on('connection', async (clientWs: WebSocket) => {
    const ai = getAiClient();

    if (!ai) {
      clientWs.send(
        JSON.stringify({
          status: 'ready_offline',
          message: 'Gemini Live server ready. (API key not detected, operating in speech simulation mode)',
        })
      );
      clientWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.text) {
            clientWs.send(JSON.stringify({ text: `Echo response: "${msg.text}"` }));
          }
        } catch {
          // ignore
        }
      });
      return;
    }

    try {
      const session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction:
            'You are the real-time spatial conversational voice assistant for the Galaxy XR Startup Showroom. Speak concisely and guide users on showroom prototypes.',
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
              if (part.text) {
                clientWs.send(JSON.stringify({ text: part.text }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err) => {
            console.warn('Gemini Live session error:', err);
            clientWs.send(JSON.stringify({ error: 'Gemini Live error' }));
          },
          onclose: () => {
            clientWs.send(JSON.stringify({ status: 'closed' }));
          },
        },
      });

      clientWs.send(JSON.stringify({ status: 'connected', model: 'gemini-3.8-live' }));

      clientWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.audio) {
            session.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          }
          if (msg.video) {
            session.sendRealtimeInput({
              video: { data: msg.video, mimeType: 'image/jpeg' },
            });
          }
          if (msg.text) {
            session.sendRealtimeInput({
              text: msg.text,
            });
          }
        } catch (e) {
          console.warn('Live API client message parse error:', e);
        }
      });

      clientWs.on('close', () => {
        try {
          session.close();
        } catch {
          // ignore
        }
      });
    } catch (err) {
      console.warn('Failed to start direct Gemini Live session, enabling server fallback mode:', err);
      clientWs.send(
        JSON.stringify({
          status: 'connected_fallback',
          message: 'Connected to Galaxy XR Showroom Voice Assistant (Server Chat mode)',
        })
      );
      clientWs.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.text) {
            const reply = await chatServerSide(msg.text);
            clientWs.send(JSON.stringify({ outputTranscript: reply, text: reply }));
          }
        } catch (e) {
          console.warn('WebSocket fallback error:', e);
        }
      });
    }
  });
}
