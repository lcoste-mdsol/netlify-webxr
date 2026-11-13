export interface Startup {
  id: string;
  name: string;
  category: string;
  typeID: number;
  commercialDescription: string;
  highQualityURL?: string;
  largeResolutionURL?: string;
  videoURL?: string;
  productSheetUrl?: string;
  physicalFeatures?: string[];
}

export interface RecognitionResult {
  startup: Startup;
  confidence: number;
  reasoning: string;
  matchedVisualFeatures: string[];
  suggestedAction: string;
  voiceResponse?: string;
  source?: 'gemini' | 'fallback';
  captureSource?: 'uploaded_photo' | 'webcam' | 'xr_camera' | 'xr_canvas' | 'placeholder';
  model?: string;
  fallbackReason?: string;
  latencyMs?: number;
  timestamp: number;
}

export type VoiceIntentType =
  | 'detect_product'
  | 'load_3d_model'
  | 'dismiss_model'
  | 'describe_startup'
  | 'goto_index'
  | 'scale_up'
  | 'scale_down'
  | 'move_up'
  | 'move_down'
  | 'toggle_animation'
  | 'load_video'
  | 'close_video'
  | 'enter_vr'
  | 'switch_ar'
  | 'next_item'
  | 'previous_item'
  | 'filter_category'
  | 'show_all'
  | 'show_overview'
  | 'help'
  | 'unknown';

export interface VoiceIntent {
  intent: VoiceIntentType;
  startupName?: string;
  category?: string;
  categoryTitle?: string;
  gotoIndex?: number;
  factor?: number;
  rawText: string;
}
