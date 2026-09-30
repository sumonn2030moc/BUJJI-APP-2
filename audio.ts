/**
 * Audio helpers for "বুজ্জি" AI Personal Assistant:
 * - 24kHz PCM playback for Gemini Flash TTS
 * - Web SpeechSynthesis female voice fallback
 * - Robust Web SpeechRecognition lifecycle management for Android Chrome
 * - Bengali (bn-BD / bn-IN) language & dialect support
 * - Wake-word ("বুজ্জি") detection and conflict-free transition
 */

import { BengaliDialect, SupportedLanguage } from '../types';

let activeAudioCtx: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;

/**
 * Play PCM audio from Base64 string at 24000Hz (Gemini TTS format)
 */
export async function playPcmAudio(base64Data: string): Promise<void> {
  stopAllAudio();

  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Convert 16-bit PCM little-endian to Float32
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('Web Audio API not supported');
    }

    activeAudioCtx = new AudioContextClass({ sampleRate: 24000 });
    const buffer = activeAudioCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    return new Promise((resolve) => {
      if (!activeAudioCtx) {
        resolve();
        return;
      }
      currentSourceNode = activeAudioCtx.createBufferSource();
      currentSourceNode.buffer = buffer;
      currentSourceNode.connect(activeAudioCtx.destination);
      currentSourceNode.onended = () => {
        resolve();
      };
      currentSourceNode.start(0);
    });
  } catch (err) {
    console.warn('PCM audio playback error:', err);
    throw err;
  }
}

/**
 * Stop any active audio playing (TTS or SpeechSynthesis)
 */
export function stopAllAudio(): void {
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
    } catch {}
    currentSourceNode = null;
  }
  if (activeAudioCtx && activeAudioCtx.state !== 'closed') {
    try {
      activeAudioCtx.close();
    } catch {}
    activeAudioCtx = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Play a gentle harmonic chime for wake-word or listening transitions
 */
export function playChimeSound(type: 'wake' | 'listen' | 'stop' = 'wake'): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;

    if (type === 'wake') {
      // Pleasant double chime: 587Hz (D5) -> 880Hz (A5)
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.12);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (type === 'listen') {
      // Gentle confirmation note
      osc.frequency.setValueAtTime(659.25, now); // E5
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } else {
      // Soft exit note
      osc.frequency.setValueAtTime(440.0, now);
      osc.frequency.exponentialRampToValueAtTime(330.0, now + 0.15);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    }

    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, 500);
  } catch {}
}

/**
 * Native Web SpeechSynthesis fallback with sweet female tone
 */
export function speakTextNative(
  text: string,
  lang: string = 'bn',
  pitch: number = 1.15,
  rate: number = 0.95
): Promise<void> {
  stopAllAudio();

  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    const cleanText = text
      .replace(/[#*`_~]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .slice(0, 500);

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Choose appropriate language code
    if (lang === 'en') {
      utterance.lang = 'en-US';
    } else if (lang === 'hi') {
      utterance.lang = 'hi-IN';
    } else {
      utterance.lang = 'bn-BD';
    }

    utterance.pitch = pitch;
    utterance.rate = rate;

    // Pick female voice if available
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice =
      voices.find(
        (v) =>
          v.lang.startsWith(utterance.lang.slice(0, 2)) &&
          (v.name.toLowerCase().includes('female') ||
            v.name.toLowerCase().includes('woman') ||
            v.name.toLowerCase().includes('kore') ||
            v.name.toLowerCase().includes('zira') ||
            v.name.toLowerCase().includes('samantha'))
      ) ||
      voices.find((v) => v.lang.startsWith(utterance.lang.slice(0, 2))) ||
      voices.find((v) => v.name.toLowerCase().includes('female'));

    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Check if Speech Recognition is supported in the browser
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}

/**
 * Get the native SpeechRecognition constructor
 */
export function getSpeechRecognitionClass(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/**
 * Explicitly requests microphone permission from Android Chrome/Browser.
 * Automatically releases audio stream tracks immediately so SpeechRecognition can access hardware.
 */
export async function requestMicrophonePermission(): Promise<{ granted: boolean; error?: string }> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    // If getUserMedia is not supported, check SpeechRecognition directly
    if (isSpeechRecognitionSupported()) {
      return { granted: true };
    }
    return { granted: false, error: 'Browser does not support microphone audio APIs' };
  }

  try {
    console.log('[Audio] Requesting microphone permission via getUserMedia...');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Successfully granted! Cleanly stop all tracks immediately so SpeechRecognition has exclusive mic access
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    console.log('[Audio] Microphone permission granted and hardware released.');
    return { granted: true };
  } catch (err: any) {
    console.error('[Audio] Microphone permission error:', err);
    const errName = err.name || 'PermissionError';
    let errorMessage = 'মাইক্রোফোন ব্যবহারের অনুমতি পাওয়া যায়নি।';
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
      errorMessage = 'মাইক্রোফোন পারমিশন বাতিল (Denied) করা হয়েছে। ব্রাউজার সেটিংসে গিয়ে পারমিশন Allow করুন।';
    } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      errorMessage = 'কোনো মাইক্রোফোন ডিভাইস খুঁজে পাওয়া যায়নি।';
    }
    return { granted: false, error: `${errName}: ${errorMessage}` };
  }
}

/**
 * Safely stops and aborts a speech recognition instance,
 * waiting for onend to ensure audio capture hardware is released.
 */
export function stopRecognizerAsync(recognizer: any): Promise<void> {
  if (!recognizer) return Promise.resolve();

  return new Promise((resolve) => {
    let resolved = false;

    const cleanupAndResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    // Safety timeout in case onend never fires
    const timer = setTimeout(() => {
      cleanupAndResolve();
    }, 400);

    try {
      recognizer.onend = () => {
        clearTimeout(timer);
        cleanupAndResolve();
      };
      // Calling abort immediately releases the mic hardware on Android Chrome
      if (typeof recognizer.abort === 'function') {
        recognizer.abort();
      } else if (typeof recognizer.stop === 'function') {
        recognizer.stop();
      } else {
        cleanupAndResolve();
      }
    } catch {
      clearTimeout(timer);
      cleanupAndResolve();
    }
  });
}

export interface CreateRecognizerOptions {
  language?: SupportedLanguage;
  bengaliDialect?: BengaliDialect;
  continuous?: boolean;
  interimResults?: boolean;
}

/**
 * Create a speech recognition instance with robust Android Chrome configuration
 */
export function createSpeechRecognizer(options: CreateRecognizerOptions = {}): any {
  const SpeechClass = getSpeechRecognitionClass();
  if (!SpeechClass) return null;

  const {
    language = 'bn',
    bengaliDialect = 'bn-BD',
    continuous = false,
    interimResults = true,
  } = options;

  const recognizer = new SpeechClass();
  recognizer.continuous = continuous;
  recognizer.interimResults = interimResults;
  recognizer.maxAlternatives = 1;

  // Language mapping
  if (language === 'en') {
    recognizer.lang = 'en-US';
  } else if (language === 'hi') {
    recognizer.lang = 'hi-IN';
  } else {
    // Bengali: use selected dialect (bn-BD or bn-IN)
    recognizer.lang = bengaliDialect === 'bn-IN' ? 'bn-IN' : 'bn-BD';
  }

  return recognizer;
}

/**
 * Format speech recognition error codes into clear messages for UI and debug logs
 */
export function formatSpeechRecognitionError(
  errorCode: string,
  currentLang?: string
): { code: string; messageBn: string; canRetry: boolean; isSilence: boolean } {
  switch (errorCode) {
    case 'no-speech':
      return {
        code: errorCode,
        messageBn: 'কোনো কথা শোনা যায়নি (No Speech Detected)',
        canRetry: true,
        isSilence: true,
      };
    case 'audio-capture':
      return {
        code: errorCode,
        messageBn: 'অডিও ক্যাপচার ব্যর্থ — মাইক্রোফোন অন্য অ্যাপ বা সেশন ব্যবহার করছে (Audio Capture Failed)',
        canRetry: true,
        isSilence: false,
      };
    case 'not-allowed':
      return {
        code: errorCode,
        messageBn: 'মাইক্রোফোন ব্যবহারের অনুমতি নেই — ব্রাউজার সেটিংসে Permission Allow করুন (Not Allowed)',
        canRetry: false,
        isSilence: false,
      };
    case 'network':
      return {
        code: errorCode,
        messageBn: 'স্পিচ সার্ভিস নেটওয়ার্ক সংযোগ বিচ্ছিন্ন (Speech Network Error)',
        canRetry: true,
        isSilence: false,
      };
    case 'language-not-supported':
      return {
        code: errorCode,
        messageBn: `নির্বাচিত ভাষা (${currentLang || 'bn'}) ডিভাইসে সমর্থিত নয় (Language Not Supported)`,
        canRetry: true,
        isSilence: false,
      };
    case 'aborted':
      return {
        code: errorCode,
        messageBn: 'রিকগনিশন সাময়িকভাবে বাতিল করা হয়েছে (Recognition Aborted)',
        canRetry: true,
        isSilence: false,
      };
    case 'service-not-allowed':
      return {
        code: errorCode,
        messageBn: 'স্পিচ সার্ভিস ব্যবহারের অনুমতি নেই (Service Not Allowed)',
        canRetry: false,
        isSilence: false,
      };
    default:
      return {
        code: errorCode,
        messageBn: `স্পিচ রিকগনিশন ত্রুটি [${errorCode}]`,
        canRetry: true,
        isSilence: false,
      };
  }
}

/**
 * Test if a transcript contains the wake word "বুজ্জি" and variations
 */
export function matchesWakeWord(transcript: string): boolean {
  if (!transcript) return false;
  const t = transcript.toLowerCase().trim();
  return (
    t.includes('বুজ্জি') ||
    t.includes('bujji') ||
    t.includes('বুজি') ||
    t.includes('বুজজি') ||
    t.includes('বুজি') ||
    t.includes('বুছি') ||
    t.includes('বুঝছি') ||
    t.includes('বুজছি') ||
    t.includes('বুঝতে পেরেছি') ||
    t.includes('বুঝতে পারছি') ||
    t.includes('বুঝলাম') ||
    t.includes('buchi') ||
    t.includes('busi') ||
    t.includes('bujhchi') ||
    t.includes('bujhsi') ||
    t.includes('bujchi') ||
    t.includes('bujhechi') ||
    t.includes('bujhte parchi') ||
    t.includes('bujhlam')
  );
}
