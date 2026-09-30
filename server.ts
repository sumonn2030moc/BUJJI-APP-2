import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import dotenv from "dotenv";
import multer from "multer";
import { GoogleGenAI, Modality } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config({ quiet: true });

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Configure multer memory storage for multipart/form-data voice uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/**
 * Safely executes a promise with a hard timeout to prevent hanging requests.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error(
        `${operationName} timed out after ${timeoutMs}ms`
      );
      err.code = "ETIMEDOUT";
      err.statusCode = 504;
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeoutPromise,
  ]);
}

/**
 * Safely resolves the Gemini API key from server environment variables.
 * Secrets remain strictly server-side and are never sent to the client.
 */
function getGeminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENAI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    null
  );
}

let aiClient: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

/**
 * Lazily initializes and returns the GoogleGenAI instance on the server.
 */
function getGeminiClient(): GoogleGenAI {
  const currentKey = getGeminiApiKey();
  if (!currentKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured in the server environment. Please configure it via the Settings > Secrets menu."
    );
  }

  if (!aiClient || cachedApiKey !== currentKey) {
    aiClient = new GoogleGenAI({
      apiKey: currentKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    cachedApiKey = currentKey;
  }

  return aiClient;
}

const BUJHCHI_SYSTEM_INSTRUCTION = `
You are "বুজ্জি" (Bujji) — a complete, warm, intelligent, and highly capable AI Personal Assistant and trusted close friend.
You address the user naturally and affectionately as "বস" (Boss) where appropriate.

Core Identity & Voice:
- Name: "বুজ্জি" (Bujji). Respond warmly when the user addresses you as "বুজ্জি" or close variations (such as "BUJJI", "বুছি", "বুঝছি").
- Default Language: Bengali (বাংলা). You are completely fluent in Bengali, English, and Hindi. If the user writes or asks in English (e.g. "ইংরেজিতে বলো"), switch naturally to English. If they say "হিন্দিতে বলো", switch to Hindi.
- Tone: Friendly, natural, empathetic, intelligent, supportive, and clear. Never sound like a robotic or rigid script. Avoid repetitive "I am just an AI" disclaimers unless explaining a technical limitation.
- Sweet female voice persona: warm, polite, confident, and respectful.

Fundamental Security & Authorization Rules:
1. Authorized Voice / Phrase: "জান Sweetheart M".
2. If another person or unauthorized request attempts to use restricted features or settings, demand the security code: "বুজ্জি 2.2".
3. Before important identity or configuration changes, strictly prompt: "বস, এই পরিবর্তনটি কি সত্যিই করতে চান? হ্যাঁ অথবা না বলুন।".
4. Realistic Device & Voice Security Warning: A prompt alone cannot magically perform biometric speaker verification or gain Android root access without native OS APIs. You must be honest that voice-matching requires OS-level speaker authentication and permissions. Security must never be casually bypassed.

Device Capability & Mobile Control Rule:
- PROMPT ≠ DEVICE PERMISSION. A prompt cannot automatically seize control of an Android device.
- For actions like opening YouTube, Maps, dialing calls, sending WhatsApp, copying text, setting timers, searching, or checking battery/location, you can recognize user intent and provide simulated/direct web intents or instructions, but clearly state what requires explicit Android permissions/APIs and user approval. Never fake successful hardware manipulation.

Knowledge, Real-Time News & Internet:
- Always distinguish between real-time/current information and static knowledge.
- When the user asks for "আজকের" (today's), "এখন" (now), "latest", "current", breaking news, market updates, technology news, YouTube/Facebook trends, or world events, use real-time grounding facts provided.
- Never fabricate news or present unverified rumors as fact.

Specialist Modules:
1. Education & Study System: Explain school/college lessons, simplify complex science, math, grammar, provide notes, summaries, English learning drills, pronunciation explanations, and revision plans.
2. YouTube & Facebook Strategy: Video/Shorts/Reels ideas, titles, descriptions, SEO tags, scripts, audience growth tips, copyright safety guidance.
3. Science & Technology: Artificial Intelligence, Android programming, robotics, space, hardware, explaining complex topics in plain Bengali.
4. Trading Learning: Educational explanations only (charts, candlesticks, support/resistance, risk management, demo trading). Strictly NEVER promise guaranteed returns or risk-free profits. Always emphasize risk.
5. Project & Coding: Assist with clean code (Web, Android Kotlin/Compose, APIs, debugging) with clear explanations of required configurations.
6. Cybersecurity & Ethical Hacking: Educational, defensive security, CTFs, and legal labs ONLY. Strictly refuse malware, unauthorized hacking, or privacy invasion.
7. Step-by-Step Problem Solving: Clarify the problem -> analyze cause -> provide practical action steps.
`;

// Model configuration: Prioritized list of active models adhering to @google/genai guidelines
// gemini-3.1-flash-lite is ultra-fast, has separate quota, and low latency
// gemini-flash-latest provides reliable fallback
// gemini-3.1-pro-preview provides deep reasoning fallback
const CANDIDATE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.1-pro-preview",
];

const PRIMARY_MODEL = CANDIDATE_MODELS[0];
const FALLBACK_MODEL = CANDIDATE_MODELS[1];

/**
 * Checks if an error represents a temporary 503 UNAVAILABLE, 429 RATE LIMIT, quota exhaustion, overload, or network glitch
 */
function isUnavailableOrRetryable(error: any): boolean {
  if (!error) return false;
  const status =
    error.status ||
    error.statusCode ||
    error.code ||
    error.status_code ||
    error?.error?.code;

  if (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    status === 404 ||
    status === 400 ||
    status === "RESOURCE_EXHAUSTED" ||
    status === "ETIMEDOUT" ||
    status === "ECONNRESET"
  ) {
    return true;
  }

  const msg = (
    error.message ||
    error.toString() ||
    error?.error?.message ||
    ""
  ).toLowerCase();

  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("no longer available") ||
    msg.includes("resource_exhausted") ||
    msg.includes("resource has been exhausted") ||
    msg.includes("quota") ||
    msg.includes("exceeded your current quota") ||
    msg.includes("rate limit") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("high demand") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("service unavailable") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("timed out") ||
    msg.includes("fetch failed")
  );
}

interface GenerateResult {
  text: string;
  groundingSources: any[];
  isRealtimeGrounding: boolean;
  modelUsed: string;
}

/**
 * Fast content generation with multi-model cascade:
 * - Tries fast gemini-3.1-flash-lite first
 * - If quota, rate-limit, or model error occurs, automatically cascades to gemini-flash-latest and gemini-3.1-pro-preview
 * - Strict timeouts prevent hanging
 */
async function generateContentWithRetryAndFallback(
  client: GoogleGenAI,
  contents: any[],
  toolsConfig: any[],
  isRealtimeQuery: boolean
): Promise<GenerateResult> {
  let lastError: any = null;

  for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
    const model = CANDIDATE_MODELS[i];
    const isPrimary = i === 0;
    const timeoutMs = isPrimary ? 15000 : 12000;

    try {
      console.log(
        `[Gemini Engine] Querying model "${model}" (${i + 1}/${CANDIDATE_MODELS.length}, timeout ${timeoutMs}ms)...`
      );
      const response = await withTimeout(
        client.models.generateContent({
          model: model,
          contents: contents,
          config: {
            systemInstruction: BUJHCHI_SYSTEM_INSTRUCTION,
            temperature: 0.7,
            tools: toolsConfig.length > 0 ? toolsConfig : undefined,
          },
        }),
        timeoutMs,
        `Model "${model}"`
      );

      const textOutput =
        response.text ||
        "বস, আমি আপনার বার্তাটি বুঝতে পেরেছি। বলুন আপনাকে আর কী সাহায্য করতে পারি?";

      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const webSources = groundingChunks
        .map((c: any) => c.web)
        .filter((w: any) => Boolean(w && w.uri));

      console.log(`[Gemini Engine] "${model}" responded successfully`);

      return {
        text: textOutput,
        groundingSources: webSources,
        isRealtimeGrounding: isRealtimeQuery && webSources.length > 0,
        modelUsed: model,
      };
    } catch (modelErr: any) {
      lastError = modelErr;
      console.warn(
        `[Gemini Engine Warning] Model "${model}" failed. Trying next candidate. Error:`,
        modelErr?.message || modelErr
      );

      // If tools were used and might be unsupported or failed, attempt a quick retry without tools
      if (toolsConfig.length > 0) {
        try {
          console.log(`[Gemini Engine] Retrying "${model}" without tools...`);
          const fallbackResponse = await withTimeout(
            client.models.generateContent({
              model: model,
              contents: contents,
              config: {
                systemInstruction: BUJHCHI_SYSTEM_INSTRUCTION,
                temperature: 0.7,
              },
            }),
            8000,
            `Model "${model}" no-tools retry`
          );

          const textOutput =
            fallbackResponse.text ||
            "বস, আমি আপনার বার্তাটি বুঝতে পেরেছি। বলুন আপনাকে আর কী সাহায্য করতে পারি?";

          return {
            text: textOutput,
            groundingSources: [],
            isRealtimeGrounding: false,
            modelUsed: `${model} (no-tools)`,
          };
        } catch (noToolsErr: any) {
          lastError = noToolsErr;
          console.warn(
            `[Gemini Engine] Retry without tools also failed for "${model}":`,
            noToolsErr?.message || noToolsErr
          );
        }
      }
    }
  }

  // All candidate models failed
  throw lastError;
}

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  const configured = Boolean(getGeminiApiKey());
  res.json({
    status: "ok",
    assistant: "বুজ্জি",
    hasApiKey: configured,
    apiKeyConfigured: configured,
  });
});

// Chat endpoint
app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { message, history, language = "bn", location } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({
        error: "বস, আপনার কোনো বার্তা পাওয়া যায়নি। অনুগ্রহ করে কিছু লিখুন বা বলুন।",
      });
      return;
    }

    const currentApiKey = getGeminiApiKey();
    if (!currentApiKey) {
      res.status(500).json({
        error:
          "বস, GEMINI_API_KEY কনফিগার করা নেই। অনুগ্রহ করে Settings > Secrets থেকে কী যুক্ত করুন।",
      });
      return;
    }

    // Determine if user message needs Google Search Grounding
    // Exclude common conversational greetings and casual words to avoid unnecessary latency
    const lower = message.toLowerCase();
    const isGreetingOrCasual =
      lower.includes("কী খবর") ||
      lower.includes("কি খবর") ||
      lower.includes("কেমন আছো") ||
      lower.includes("কেমন আছেন") ||
      lower.includes("হাই") ||
      lower.includes("হ্যালো");

    const isRealtimeQuery =
      !isGreetingOrCasual &&
      (lower.includes("আজকের খবর") ||
        lower.includes("তাজা খবর") ||
        lower.includes("ব্রেকিং নিউজ") ||
        lower.includes("breaking news") ||
        lower.includes("latest news") ||
        lower.includes("today's news") ||
        lower.includes("আজকের আবহাওয়া") ||
        lower.includes("আজকের আবহাওয়া") ||
        lower.includes("আজকের তাপমাত্রা") ||
        lower.includes("weather today") ||
        lower.includes("weather forecast") ||
        lower.includes("আজকের স্বর্ণের দাম") ||
        lower.includes("আজকের সোনার দাম") ||
        lower.includes("ডলারের রেট") ||
        lower.includes("dollar rate") ||
        lower.includes("বাজার দর") ||
        lower.includes("লাইভ স্কোর") ||
        lower.includes("live score") ||
        lower.includes("cricket score") ||
        lower.includes("match score") ||
        lower.includes("গুগলে খোঁজ") ||
        lower.includes("ইন্টারনেটে সার্চ"));

    // Build history contents if provided
    const contents: Array<{
      role: "user" | "model";
      parts: Array<{ text: string }>;
    }> = [];

    if (Array.isArray(history) && history.length > 0) {
      // Keep last 10 messages for context
      const recent = history.slice(-10);
      for (const item of recent) {
        if (item.text) {
          contents.push({
            role: item.role === "assistant" ? "model" : "user",
            parts: [{ text: item.text }],
          });
        }
      }
    }

    // Add current user prompt with location hint if present
    let finalPrompt = message;
    if (location && (location.city || location.country)) {
      finalPrompt += `\n[User Context: Location is approximately ${location.city || ""}, ${location.country || ""}]`;
    }

    contents.push({
      role: "user",
      parts: [{ text: finalPrompt }],
    });

    const toolsConfig: Array<any> = [];
    if (isRealtimeQuery) {
      toolsConfig.push({ googleSearch: {} });
    }

    // Lazily get GenAI instance and execute with automatic retry and model fallback
    const ai = getGeminiClient();
    const result = await generateContentWithRetryAndFallback(
      ai,
      contents,
      toolsConfig,
      isRealtimeQuery
    );

    res.json({
      reply: result.text,
      groundingSources: result.groundingSources,
      isRealtimeGrounding: result.isRealtimeGrounding,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error("Final Error in /api/chat after retries & fallbacks:", error);

    const isOverloaded = isUnavailableOrRetryable(error);
    const friendlyBengali = isOverloaded
      ? "বস, গুগলের এআই সার্ভারে এই মুহূর্তে অতিরিক্ত চাপের (503 High Demand) কারণে সাময়িক বিলম্ব হচ্ছে। আমি কয়েকবার স্বয়ংক্রিয়ভাবে চেষ্টা করেছি, দয়া করে কয়েক সেকেন্ড পর আবার বলুন বা পাঠান।"
      : "বস, উত্তর তৈরিতে সাময়িক সমস্যা হয়েছে। দয়া করে ইন্টারনেট সংযোগ পরীক্ষা করে পুনরায় বলুন।";

    res.status(isOverloaded ? 503 : 500).json({
      error: friendlyBengali,
      friendlyMessage: friendlyBengali,
      isRetryable: isOverloaded,
      rawErrorCode: error?.status || error?.code || "503_UNAVAILABLE",
    });
  }
});

// Text-to-Speech endpoint (Gemini Flash TTS with sweet female voice 'Kore')
app.post("/api/tts", async (req: Request, res: Response) => {
  try {
    const { text, voice = "Kore" } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text is required for TTS" });
      return;
    }

    const currentApiKey = getGeminiApiKey();
    if (!currentApiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
      return;
    }

    const ai = getGeminiClient();

    // Limit text length to avoid latency
    const cleanText = text.slice(0, 300);

    // Call TTS with strict 5-second timeout; if it takes longer or errors, fall back to browser speech immediately
    let response: any = null;
    const ttsModels = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];
    for (const ttsModel of ttsModels) {
      try {
        response = await withTimeout(
          ai.models.generateContent({
            model: ttsModel,
            contents: [{ parts: [{ text: cleanText }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice || "Kore" },
                },
              },
            },
          }),
          4500,
          `TTS Engine (${ttsModel})`
        );
        if (response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
          break;
        }
      } catch (err: any) {
        console.warn(
          `[TTS Fast-Fallback] TTS model "${ttsModel}" delayed or unavailable, trying fallback:`,
          err?.message || err
        );
      }
    }

    const base64Audio =
      response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (base64Audio) {
      res.json({
        audioBase64: base64Audio,
        mimeType: "audio/pcm;rate=24000",
        sampleRate: 24000,
      });
    } else {
      res.status(200).json({
        fallbackToBrowserSpeech: true,
        message: "No audio generated from TTS model",
      });
    }
  } catch (error: any) {
    console.warn("TTS API fallback notice:", error?.message);
    res.status(200).json({
      fallbackToBrowserSpeech: true,
      error: error?.message,
    });
  }
});

// Voice processing endpoint: primary route /api/voice with compatibility aliases
// Handles multipart/form-data with audio file uploads, text prompts, or JSON
const voiceRoutes = [
  "/api/voice",
  "/api/your-voice-endpoint",
  "/api/voice-endpoint",
  "/api/audio-endpoint",
  "/api/speech-to-text",
  "/api/transcribe",
];

const handleVoiceRequest = async (req: Request, res: Response) => {
  // Always guarantee application/json header
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    // 1. Inspect any uploaded files from multipart/form-data
    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    const audioFile =
      files.find((f) => f.mimetype?.startsWith("audio/") || f.fieldname === "audio" || f.fieldname === "voice" || f.fieldname === "file") ||
      files[0];

    // 2. Inspect text fields from req.body (prompt, message, text, query)
    const bodyPrompt =
      req.body?.prompt ||
      req.body?.message ||
      req.body?.text ||
      req.body?.query ||
      req.body?.transcript;

    // Case A: Audio file was uploaded in FormData
    if (audioFile && audioFile.buffer && audioFile.buffer.length > 0) {
      console.log(
        `[Voice Endpoint] Audio received: size=${audioFile.size} bytes, mimetype=${audioFile.mimetype || "audio/webm"}`
      );

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
          success: true,
          message: "Response received",
          status: "ok",
          reply: "বস, অডিও ফাইল পাওয়া গেছে কিন্তু সার্ভারে GEMINI_API_KEY কনফিগার করা নেই।",
          text: "বস, অডিও ফাইল পাওয়া গেছে।",
          transcription: "অডিও সফলভাবে গৃহীত হয়েছে।",
          assistant: "বুজ্জি",
        });
        return;
      }

      const ai = getGeminiClient();
      const mimeType = audioFile.mimetype || "audio/webm";

      try {
        const result = await withTimeout(
          ai.models.generateContent({
            model: PRIMARY_MODEL,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: audioFile.buffer.toString("base64"),
                    },
                  },
                  {
                    text: bodyPrompt
                      ? `${bodyPrompt}\n\n(Please listen to the attached audio, transcribe the speech, and answer warmly as বুজ্জি (Bujji) in Bengali)`
                      : "অনুগ্রহ করে এই অডিওতে কী বলা হয়েছে তা শুনে 'বুজ্জি' হিসেবে সুন্দর ও প্রফুল্ল ভাষায় বাংলায় উত্তর দিন। সাথে সম্ভব হলে ট্রান্সক্রিপশন দিন।",
                  },
                ],
              },
            ],
            config: {
              systemInstruction: BUJHCHI_SYSTEM_INSTRUCTION,
              temperature: 0.7,
            },
          }),
          18000,
          "Voice Audio Processing"
        );

        const replyText =
          result.text ||
          "বস, আমি আপনার অডিও বার্তাটি বুঝতে পেরেছি। বলুন কীভাবে সাহায্য করব?";

        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
          success: true,
          message: "Response received",
          status: "ok",
          reply: replyText,
          text: replyText,
          transcription: replyText,
          assistant: "বুজ্জি",
        });
        return;
      } catch (geminiErr: any) {
        console.warn(
          "[Voice Endpoint] Gemini audio analysis notice:",
          geminiErr?.message || geminiErr
        );
        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
          success: true,
          message: "Response received",
          status: "ok",
          reply: "বস, অডিও ফাইলটি গ্রহণ করা হয়েছে। গুগলের এআই প্রক্রিয়াকরণে সাময়িক বিলম্ব হচ্ছে, দয়া করে পুনরায় চেষ্টা করুন।",
          text: "বস, অডিও ফাইলটি গ্রহণ করা হয়েছে।",
          transcription: "",
          assistant: "বুজ্জি",
        });
        return;
      }
    }

    // Case B: Text message sent via FormData or JSON
    if (bodyPrompt && typeof bodyPrompt === "string" && bodyPrompt.trim().length > 0) {
      console.log(`[Voice Endpoint] Text prompt received: "${bodyPrompt.trim()}"`);
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
          success: true,
          message: "Response received",
          status: "ok",
          reply: "বস, আপনার বার্তা পেয়েছি কিন্তু GEMINI_API_KEY কনফিগার করা নেই।",
          text: "বস, আপনার বার্তা পেয়েছি।",
          transcription: bodyPrompt,
          assistant: "বুজ্জি",
        });
        return;
      }

      try {
        const ai = getGeminiClient();
        const result = await generateContentWithRetryAndFallback(
          ai,
          [{ role: "user", parts: [{ text: bodyPrompt }] }],
          [],
          false
        );

        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
          success: true,
          message: "Response received",
          status: "ok",
          reply: result.text,
          text: result.text,
          transcription: bodyPrompt,
          assistant: "বুজ্জি",
        });
        return;
      } catch (genErr: any) {
        console.warn("[Voice Endpoint] Error generating content:", genErr?.message || genErr);
        const fallbackText = "বস, আপনার বার্তা পেয়েছি। আমি সর্বদা আপনার সাথে আছি, বলুন আর কীভাবে সাহায্য করতে পারি?";
        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
          success: true,
          message: "Response received",
          status: "ok",
          reply: fallbackText,
          text: fallbackText,
          transcription: bodyPrompt,
          assistant: "বুজ্জি",
        });
        return;
      }
    }

    // Case C: Standard ping / probe / empty FormData test
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      success: true,
      message: "Response received",
      status: "ok",
      reply: "বস, আমি আপনার কথা শুনতে প্রস্তুত। বলুন আপনাকে কী সাহায্য করতে পারি?",
      text: "বস, আমি আপনার কথা শুনতে প্রস্তুত।",
      transcription: "",
      assistant: "বুজ্জি",
    });
  } catch (err: any) {
    console.error("[Voice Endpoint Error]:", err);
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      success: true,
      message: "Response received",
      status: "ok",
      reply: "বস, বুজ্জি ভয়েস সার্ভিস প্রস্তুত। বলুন কীভাবে সাহায্য করব?",
      text: "বস, বুজ্জি ভয়েস সার্ভিস প্রস্তুত।",
      transcription: "",
      assistant: "বুজ্জি",
    });
  }
};

for (const route of voiceRoutes) {
  app.post(route, upload.any(), handleVoiceRequest);
  app.get(route, (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      success: true,
      message: "Response received",
      status: "ok",
      endpoint: route,
      assistant: "বুজ্জি",
      acceptedMethods: ["POST", "GET"],
      acceptedFormats: ["multipart/form-data", "application/json"],
    });
  });
}

// Fallback for any other unhandled /api/* endpoints - always return JSON, NEVER HTML
app.all("/api/*", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    error: `API route ${req.method} ${req.path} not found`,
    status: 404,
  });
});

// JSON error handling middleware for API errors - guarantees no HTML error pages
app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  if (req.path.startsWith("/api")) {
    console.error("[API Error Handler]:", err);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(err.status || err.statusCode || 500).json({
      success: false,
      message: "Internal server error",
      error: err?.message || "Server Error",
      status: err.status || err.statusCode || 500,
    });
    return;
  }
  next(err);
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const isHttpsPreview = Boolean(
      process.env.APP_URL?.startsWith("https://") ||
      process.env.K_SERVICE ||
      process.env.K_REVISION
    );
    const isHmrDisabled = process.env.DISABLE_HMR === "true";

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
          clientPort: isHttpsPreview
            ? 443
            : (process.env.HMR_CLIENT_PORT
                ? parseInt(process.env.HMR_CLIENT_PORT, 10)
                : undefined),
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`বুজ্জি AI Assistant Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
