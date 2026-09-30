export type Role = 'user' | 'assistant';

export type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export type SupportedLanguage = 'bn' | 'en' | 'hi';
export type BengaliDialect = 'bn-BD' | 'bn-IN';

export interface GroundingSource {
  title?: string;
  uri?: string;
}

export interface ToastItem {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export interface MobileActionIntent {
  type: 'search' | 'weather' | 'youtube' | 'facebook' | 'maps' | 'dial' | 'whatsapp' | 'copy' | 'timer' | 'battery' | 'files' | 'location';
  title: string;
  details?: string;
  actionUrl?: string;
  autoExecute?: boolean;
  data?: any;
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
  groundingSources?: GroundingSource[];
  isRealtime?: boolean;
  intentAction?: MobileActionIntent;
  audioBase64?: string;
  isError?: boolean;
}

export interface SecuritySettings {
  authorizedPhrase: string; // "জান Sweetheart M"
  securityCode: string; // "বুজ্জি 2.2"
  isOwnerAuthenticated: boolean;
  requireConfirmationPrompt: boolean; // "বস, এই পরিবর্তনটি কি সত্যিই করতে চান? হ্যাঁ অথবা না বলুন।"
  pendingConfirmationAction?: string | null;
}

export interface AppSettings {
  language: SupportedLanguage;
  bengaliDialect: BengaliDialect;
  voiceModel: 'gemini-tts' | 'browser-tts';
  speechPitch: number;
  speechRate: number;
  wakeWordEnabled: boolean; // "বুজ্জি"
  autoPlayVoice: boolean;
  userTitle: string; // "বস"
  locationPermission: 'prompt' | 'granted' | 'denied';
  microphonePermission: 'prompt' | 'granted' | 'denied';
}

export interface QuickPromptItem {
  id: string;
  category: 'study' | 'news' | 'youtube' | 'trading' | 'coding' | 'mobile' | 'security';
  label: string;
  prompt: string;
}
