const NUMBER_WORDS = {
  first: 1, '1st': 1, one: 1,
  second: 2, '2nd': 2, two: 2,
  third: 3, '3rd': 3, three: 3,
  fourth: 4, '4th': 4, four: 4,
  fifth: 5, '5th': 5, five: 5,
  sixth: 6, '6th': 6, six: 6,
  seventh: 7, '7th': 7, seven: 7,
  eighth: 8, '8th': 8, eight: 8,
  ninth: 9, '9th': 9, nine: 9,
  tenth: 10, '10th': 10, ten: 10,
  eleventh: 11, '11th': 11, eleven: 11,
  twelfth: 12, '12th': 12, twelve: 12,
  thirteenth: 13, '13th': 13, thirteen: 13,
  fourteenth: 14, '14th': 14, fourteen: 14,
  fifteenth: 15, '15th': 15, fifteen: 15,
  sixteenth: 16, '16th': 16, sixteen: 16,
  seventeenth: 17, '17th': 17, seventeen: 17,
  eighteenth: 18, '18th': 18, eighteen: 18,
  nineteenth: 19, '19th': 19, nineteen: 19,
  twentieth: 20, '20th': 20, twenty: 20,
  thirtieth: 30, '30th': 30, thirty: 30,
  fortieth: 40, '40th': 40, forty: 40,
  fiftieth: 50, '50th': 50, fifty: 50,
  sixtieth: 60, '60th': 60, sixty: 60,
};

const TENS_WORDS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const UNITS_WORDS = {
  one: 1, first: 1,
  two: 2, second: 2,
  three: 3, third: 3,
  four: 4, fourth: 4,
  five: 5, fifth: 5,
  six: 6, sixth: 6,
  seven: 7, seventh: 7,
  eight: 8, eighth: 8,
  nine: 9, ninth: 9,
};

function parseSpelledNumber(phrase) {
  const normalized = phrase.toLowerCase().replace(/[-]/g, ' ').trim();
  const compoundMatch = normalized.match(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/i
  );
  if (compoundMatch) {
    const tens = TENS_WORDS[compoundMatch[1]];
    const unit = UNITS_WORDS[compoundMatch[2]];
    if (tens && unit) return tens + unit;
  }

  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(normalized)) {
      return num;
    }
  }
  return null;
}

export function parseStartupIndex(text) {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  // Strip dimension tokens like "3D" or "2D" so "Load 3D model" never parses 3 as an index
  const sanitized = lower.replace(/\b\d+d\b/gi, ' ');

  const digitPatterns = [
    /(?:startup|item|project|entry|product)\s+(?:number\s+|no\.?\s+|#\s*)?\b(\d+)\b/i,
    /(?:select|choose|open|show|pick|view|go to|load)\s+(?:the\s+)?(?:startup\s+|item\s+|project\s+|product\s+)?(?:number\s+|no\.?\s+|#\s*)?\b(\d+)\b/i,
    /(?:number|no\.?|#)\s*(\d+)\b/i,
    /^\s*(\d+)\s*$/,
  ];

  for (const pat of digitPatterns) {
    const match = sanitized.match(pat);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) return num;
    }
  }

  const contextMatch =
    sanitized.match(/(?:startup|item|project|number|select|choose|open|pick|view|go to)\s+(?:the\s+)?(?:number\s+)?([a-z\s-]+)$/i) ||
    sanitized.match(/^([a-z\s-]+?)\s+(?:startup|item|project)\b/i);

  if (contextMatch && contextMatch[1]) {
    const num = parseSpelledNumber(contextMatch[1]);
    if (num !== null) return num;
  }

  if (/^[a-z0-9\s-]+$/i.test(sanitized) && sanitized.split(/\s+/).length <= 2) {
    const exactNum = parseSpelledNumber(sanitized);
    if (exactNum !== null && !/\b(?:one|1st)\s+(?:of|is)\b/.test(sanitized)) {
      return exactNum;
    }
  }

  return null;
}

export function parseVoiceIntent(text, startups = []) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. Dismiss / Remove / Hide / Close 3D Model (MUST run before Load 3D Model)
  if (
    /\b(?:dismiss|remove|delete|hide|close|unload|clear|take down)\b.*?\b(?:3d|virtual\s+twin|twin|model|mesh|cad|hologram|overlay)\b/i.test(lower) ||
    /\bdismiss\b/i.test(lower)
  ) {
    return { intent: 'dismiss_model', rawText: text };
  }

  // 2. Close / Stop / Hide / Remove Video (MUST run before Load Video)
  if (
    /\b(?:close|stop|hide|remove|dismiss|exit|quit)\b.*?\b(?:video|movie|player)\b/i.test(lower)
  ) {
    return { intent: 'close_video', rawText: text };
  }

  // 3. Load / Play / Watch Video
  if (
    /\b(?:load|play|watch|show|open|start|resume)\b.*?\b(?:video|movie)\b/i.test(lower) ||
    /^\s*(?:video|movie)\s*$/i.test(lower)
  ) {
    return { intent: 'load_video', rawText: text };
  }

  // 4. Load 3D Model / Virtual Twin (MUST run before index lookup so "Load 3D model" never selects startup #3)
  if (
    /\b(?:load|show|display|open|view|spawn|bring up|overlay|render|put|enable|activate)\b.*?\b(?:3d\s+model|3d\s+twin|virtual\s+twin|twin|model|mesh|cad|hologram)\b/i.test(lower) ||
    /\b(?:load|show|display|open|view|spawn)\s+(?:the\s+|in\s+)?3d\b/i.test(lower) ||
    /\b(?:3d\s*model|virtual\s+twin|ar\s+model|overlay\s+model|load\s+twin|3d\s+twin|view\s+in\s+3d)\b/i.test(lower)
  ) {
    return { intent: 'load_3d_model', rawText: text };
  }

  // 5. Startup selection by index
  const startupIndex = parseStartupIndex(trimmed);
  if (startupIndex !== null) {
    return { intent: 'goto_index', gotoIndex: startupIndex, rawText: text };
  }

  // 6. Product detection trigger
  if (
    /\b(?:recognize|identify|detect|scan|analyze)\b/i.test(lower) ||
    lower.includes('what product') ||
    lower.includes('what is this') ||
    lower.includes('what am i looking at') ||
    lower.includes('who made this') ||
    lower.includes('check product')
  ) {
    return { intent: 'detect_product', rawText: text };
  }

  // 7. VR / AR Modes (AR checked first so "exit VR" switches back to AR)
  if (
    /\b(?:ar\s*mode|enter\s+ar|switch\s+(?:to\s+)?ar|back\s+to\s+ar|exit\s+vr|leave\s+vr|passthrough|augmented\s+reality|real\s+world)\b/i.test(lower) ||
    /^\s*ar\s*$/i.test(lower)
  ) {
    return { intent: 'switch_ar', rawText: text };
  }
  if (
    /\b(?:vr\s*mode|enter\s+vr|switch\s+(?:to\s+)?vr|go\s+to\s+vr|start\s+vr|virtual\s+reality|vr\s+dome|vr\s+environment)\b/i.test(lower) ||
    /^\s*vr\s*$/i.test(lower)
  ) {
    return { intent: 'enter_vr', rawText: text };
  }

  // 8. Scale controls
  if (
    lower.includes('scale up') ||
    lower.includes('make bigger') ||
    lower.includes('enlarge') ||
    lower.includes('increase size') ||
    lower.includes('zoom in') ||
    /\b(?:bigger|larger)\b/i.test(lower)
  ) {
    return { intent: 'increase_size', scaleFactor: 1.25, rawText: text };
  }
  if (
    lower.includes('scale down') ||
    lower.includes('make smaller') ||
    lower.includes('shrink') ||
    lower.includes('decrease size') ||
    lower.includes('reduce size') ||
    lower.includes('zoom out') ||
    /\bsmaller\b/i.test(lower)
  ) {
    return { intent: 'decrease_size', scaleFactor: 0.8, rawText: text };
  }

  // 9. Elevation controls
  if (lower.includes('move up') || /\b(?:raise|lift|higher|go up)\b/i.test(lower)) {
    return { intent: 'move_up', factor: 0.1, rawText: text };
  }
  if (lower.includes('move down') || /\b(?:lower|drop|go down)\b/i.test(lower)) {
    return { intent: 'move_down', factor: -0.1, rawText: text };
  }

  // 10. Animation controls
  if (
    /\b(?:animate|spin|spinning|rotate|toggle animation|start animation|stop animation|pause animation|resume animation|pause|freeze)\b/i.test(lower)
  ) {
    return { intent: 'toggle_animation', rawText: text };
  }

  // 11. Navigation (Next / Previous / Overview / All)
  if (
    lower.includes('next page') ||
    lower.includes('next startup') ||
    lower.includes('next item') ||
    lower.includes('next project') ||
    /\bnext\b/i.test(lower)
  ) {
    return { intent: 'next_page', rawText: text };
  }
  if (
    lower.includes('previous page') ||
    lower.includes('prev page') ||
    lower.includes('previous startup') ||
    lower.includes('previous item') ||
    lower.includes('previous project') ||
    lower.includes('go back') ||
    /\b(?:previous|back)\b/i.test(lower)
  ) {
    return { intent: 'previous_page', rawText: text };
  }
  if (/\b(?:overview|show\s+grid|grid|catalogue|catalog)\b/i.test(lower)) {
    return { intent: 'show_overview', rawText: text };
  }
  if (
    lower.includes('all projects') ||
    lower.includes('all categories') ||
    lower.includes('all startups') ||
    lower.includes('show all') ||
    lower.includes('filter all') ||
    lower.includes('reset filter') ||
    lower.includes('clear filter') ||
    lower.includes('show everything')
  ) {
    return { intent: 'show_all', rawText: text };
  }

  // 12. Category filtering
  if (/\blife\b/i.test(lower)) {
    return { intent: 'filter_category', categoryName: '172', categoryTitle: 'Life', rawText: text };
  }
  if (/\bnature\b/i.test(lower)) {
    return { intent: 'filter_category', categoryName: '27', categoryTitle: 'Nature', rawText: text };
  }
  if (/\bproducts?\b/i.test(lower)) {
    return { intent: 'filter_category', categoryName: '376', categoryTitle: 'Product', rawText: text };
  }

  // 13. Direct match by Startup name in catalogue
  if (startups && startups.length > 0) {
    const cleanedQuery = lower
      .replace(/\b(?:select|choose|open|show|describe|tell me about|about|the|startup|project|item)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedQuery.length >= 3 || lower.length >= 3) {
      const found = startups.find((s) => {
        const sName = s.name.toLowerCase();
        return (
          lower.includes(sName) ||
          (cleanedQuery.length >= 3 && (cleanedQuery.includes(sName) || sName.includes(cleanedQuery)))
        );
      });
      if (found) {
        return { intent: 'goto_name', gotoName: found.name, startup: found, rawText: text };
      }
    }
  }

  // 14. Help
  if (/\b(?:help|commands|instructions)\b/i.test(lower) || lower.includes('what can i say')) {
    return { intent: 'help', rawText: text };
  }

  return { intent: 'unknown', rawText: text };
}

export class VoiceAssistant {
  constructor(startups, callbacks = {}) {
    this.startups = startups || [];
    this.callbacks = callbacks;
    this.isListening = false;
    this.recognition = null;
    this.isSpeaking = false;
    this.restartTimeout = null;
    this.initSpeechRecognition();
  }

  setStartups(startups) {
    this.startups = startups;
  }

  initSpeechRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

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
        this.callbacks.onStatusChange?.('Listening... Say "Select startup number 4" or "Load 3D model"');
      };

      this.recognition.onresult = (event) => {
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

      this.recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          this.callbacks.onStatusChange?.(`Mic status: ${event.error}`);
        }
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.isListening && this.recognition) {
              try {
                this.recognition.start();
              } catch {
                // In some browsers, already started
              }
            }
          }, 300);
        } else {
          this.callbacks.onStatusChange?.('Voice Assistant ready');
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
      this.callbacks.onStatusChange?.('Listening... Say "Select startup number 4" or "Load 3D model"');
    } catch (err) {
      console.warn('Start recognition error:', err);
    }
  }

  stop() {
    this.isListening = false;
    clearTimeout(this.restartTimeout);
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    this.callbacks.onStatusChange?.('Voice Assistant paused');
  }

  processTextCommand(text) {
    if (!text || typeof text !== 'string') return;
    this.callbacks.onTranscript?.(text);
    this.handleTranscript(text);
  }

  handleTranscript(text) {
    const trimmed = text.trim();
    const intent = parseVoiceIntent(trimmed, this.startups);
    this.callbacks.onIntent?.(intent);

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
      this.liveWs = new WebSocket(wsUrl);

      this.liveWs.onopen = () => {
        this.callbacks.onStatusChange?.('Gemini Live API connected (Server-Side)');
      };

      this.liveWs.onmessage = (event) => {
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

  speak(text) {
    this.callbacks.onResponse?.(text);

    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha'))
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

  stopAll() {
    this.stop();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
}
