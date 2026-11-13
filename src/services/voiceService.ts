import { Startup, VoiceIntent } from '../types.ts';
import { parseVoiceIntent } from './voiceIntentParser.ts';

export interface VoiceAssistantCallbacks {
  onStatusChange?: (status: string) => void;
  onTranscript?: (transcript: string) => void;
  onResponse?: (response: string) => void;
  onIntent?: (intent: VoiceIntent) => void;
}

export class VoiceAssistant {
  private startups: Startup[];
  private callbacks: VoiceAssistantCallbacks;
  public isListening = false;
  private recognition: any = null;
  private isSpeaking = false;

  constructor(startups: Startup[], callbacks: VoiceAssistantCallbacks) {
    this.startups = startups;
    this.callbacks = callbacks;
    this.initSpeechRecognition();
  }

  setStartups(startups: Startup[]) {
    this.startups = startups;
  }

  private initSpeechRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available in this browser environment.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.callbacks.onStatusChange?.('Listening for voice commands...');
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
          this.callbacks.onTranscript?.(currentText);
        }

        if (finalTranscript) {
          this.handleTranscript(finalTranscript.trim());
        }
      };

      this.recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          this.callbacks.onStatusChange?.(`Mic: ${event.error}`);
        }
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch {
            this.isListening = false;
            this.callbacks.onStatusChange?.('Voice Assistant ready');
          }
        } else {
          this.callbacks.onStatusChange?.('Voice Assistant standby');
        }
      };
    } catch (e) {
      console.warn('Failed to initialize SpeechRecognition:', e);
    }
  }

  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    if (!this.recognition) {
      this.callbacks.onStatusChange?.('Speech recognition not supported in this browser.');
      return;
    }

    try {
      this.isListening = true;
      this.recognition.start();
      this.callbacks.onStatusChange?.('Listening... Ask "Recognize this product" or "Load 3D model"');
    } catch (err) {
      console.warn('Start recognition error:', err);
    }
  }

  stop() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    this.callbacks.onStatusChange?.('Voice Assistant paused');
  }

  processTextCommand(text: string) {
    if (!text || typeof text !== 'string') return;
    this.callbacks.onTranscript?.(text);
    this.handleTranscript(text);
  }

  /**
   * Parses natural speech and emits structured intents
   */
  handleTranscript(text: string) {
    const trimmed = text.trim();
    const intent = parseVoiceIntent(trimmed, this.startups);
    this.callbacks.onIntent?.(intent);

    // Query server-side Gemini chat if intent is unknown and query is conversational
    if (intent.intent === 'unknown' && trimmed.length > 3) {
      fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `User is in the Galaxy XR Startup Showroom asking: "${trimmed}". Answer concisely in 1-2 sentences.`,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.text) {
            this.speak(data.text);
          }
        })
        .catch(() => {});
    }
  }

  connectLiveApi() {
    if (typeof window === 'undefined') return;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.callbacks.onStatusChange?.('Gemini Live API connected (Server-Side)');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.inputTranscript) {
            this.callbacks.onTranscript?.(data.inputTranscript);
          }
          if (data.text || data.outputTranscript) {
            const reply = data.text || data.outputTranscript;
            this.callbacks.onResponse?.(reply);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
  }

  /**
   * Speaks the response with natural speech synthesis
   */
  speak(text: string) {
    this.callbacks.onResponse?.(text);

    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      // Pick a clean english voice if available
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha'))
      );
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        this.isSpeaking = true;
      };
      utterance.onend = () => {
        this.isSpeaking = false;
      };
      utterance.onerror = () => {
        this.isSpeaking = false;
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  dispose() {
    this.stop();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
}
