import { MobileActionIntent } from '../types';

/**
 * Android Intent & Browser Device Bridge:
 * strictly adheres to the rule that "A prompt alone cannot grant Android OS permissions;
 * actual device actions require standard Web/Android APIs, Intents, and user consent."
 */

export function executeMobileIntent(intent: MobileActionIntent): {
  success: boolean;
  message: string;
} {
  try {
    switch (intent.type) {
      case 'dial': {
        const phone = intent.data?.phone || '999';
        window.location.href = `tel:${phone}`;
        return {
          success: true,
          message: `বস, ফোন ডায়ালার অ্যাপে '${phone}' নম্বর পাঠানো হয়েছে।`,
        };
      }
      case 'youtube': {
        const query = (intent.data?.query || '').trim();
        const url = query
          ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
          : 'https://youtube.com';
        window.open(url, '_blank');
        return {
          success: true,
          message: query
            ? `বস, ইউটিউবে '${query}' সার্চ ওপেন করা হয়েছে।`
            : `বস, ইউটিউব (https://youtube.com) ওপেন করা হয়েছে।`,
        };
      }
      case 'facebook': {
        const url = intent.data?.url || 'https://facebook.com';
        window.open(url, '_blank');
        return {
          success: true,
          message: `বস, ফেসবুক (https://facebook.com) ওপেন করা হয়েছে।`,
        };
      }
      case 'maps': {
        const query = encodeURIComponent(intent.data?.query || 'nearby');
        const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
        window.open(url, '_blank');
        return {
          success: true,
          message: `বস, গুগল ম্যাপস অ্যাপ্লিকেশন/ওয়েবসাইটে লোকেশন দেখানো হয়েছে।`,
        };
      }
      case 'whatsapp': {
        const text = encodeURIComponent(intent.data?.text || '');
        const phone = intent.data?.phone || '';
        const url = phone
          ? `https://wa.me/${phone}?text=${text}`
          : `https://api.whatsapp.com/send?text=${text}`;
        window.open(url, '_blank');
        return {
          success: true,
          message: `বস, হোয়াটসঅ্যাপ ইন্টেন্টে বার্তা পাঠানো হয়েছে।`,
        };
      }
      case 'search': {
        const rawQuery = (intent.data?.query || '').trim();
        const url = rawQuery
          ? `https://www.google.com/search?q=${encodeURIComponent(rawQuery)}`
          : 'https://www.google.com';
        window.open(url, '_blank');
        return {
          success: true,
          message: rawQuery
            ? `বস, গুগলে '${rawQuery}' সার্চ ফলাফল নতুন ট্যাবে ওপেন করা হয়েছে।`
            : `বস, গুগল সার্চ (https://www.google.com) ওপেন করা হয়েছে।`,
        };
      }
      case 'weather': {
        const loc = (intent.data?.location || intent.data?.query || '').trim();
        const query = loc ? `weather ${loc}` : 'weather today';
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        window.open(url, '_blank');
        return {
          success: true,
          message: loc
            ? `বস, '${loc}'-এর আবহাওয়ার তথ্য ও পূর্বাভাস গুগলে ওপেন করা হয়েছে।`
            : `বস, আজকের আবহাওয়ার তথ্য ও পূর্বাভাস গুগলে ওপেন করা হয়েছে।`,
        };
      }
      case 'copy': {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(intent.data?.text || '');
          return {
            success: true,
            message: `বস, টেক্সটটি সফলভাবে ক্লিপবোর্ডে কপি করা হয়েছে।`,
          };
        }
        return {
          success: false,
          message: `ক্লিপবোর্ড অ্যাক্সেস পারমিশন প্রয়োজন।`,
        };
      }
      case 'timer': {
        // Direct to web timer / android clock
        window.open('https://www.google.com/search?q=timer', '_blank');
        return {
          success: true,
          message: `বস, টাইমার পেজ ওপেন করা হয়েছে।`,
        };
      }
      case 'files': {
        const input = document.createElement('input');
        input.type = 'file';
        input.click();
        return {
          success: true,
          message: `বস, ডিভাইস ফাইল ম্যানেজার/পিকার ওপেন করা হয়েছে।`,
        };
      }
      case 'battery': {
        return {
          success: true,
          message: `ডিভাইস ব্যাটারি স্ট্যাটাস চেক করা হচ্ছে...`,
        };
      }
      case 'location': {
        return {
          success: true,
          message: `বস, আপনার বর্তমান জিপিএস লোকেশন নেওয়া হচ্ছে...`,
        };
      }
      default:
        return {
          success: false,
          message: `অ্যাকশনটি সরাসরি ব্রাউজার বা ডিভাইসে সমর্থিত নয়।`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `ইন্টেন্ট এক্সিকিউট করতে ব্যর্থ: ${err?.message || 'অননুমোদিত'}`,
    };
  }
}

/**
 * Detects device intent patterns in user Bengali / English prompts
 */
export function detectIntentFromPrompt(prompt: string): MobileActionIntent | null {
  const p = prompt.toLowerCase().trim();

  // 1. Match explicit Google search commands (e.g. 'গুগলে সার্চ করো আজকের খবর', 'গুগলে খুঁজুন ...', 'গুগল সার্চ ...')
  const isGoogleSearchCommand =
    p.includes('গুগলে সার্চ') ||
    p.includes('গুগল সার্চ') ||
    p.includes('গুগলে খোঁজ') ||
    p.includes('গুগলে খুঁজুন') ||
    p.includes('গুগলে খুঁজো') ||
    p.includes('গুগলে দেখো') ||
    p.includes('গুগলে দেখাও') ||
    p.startsWith('সার্চ করো') ||
    p.startsWith('সার্চ কর') ||
    p.startsWith('সার্চ করুন') ||
    p.includes('google search') ||
    p.startsWith('search google') ||
    p.startsWith('search on google');

  if (isGoogleSearchCommand) {
    const cleanQuery = prompt
      .replace(/গুগলে\s*সার্চ\s*(করো|কর|করুন|করা|করে দাও)?/gi, '')
      .replace(/গুগল\s*সার্চ\s*(করো|কর|করুন|করা|করে দাও)?/gi, '')
      .replace(/গুগলে\s*(খুঁজুন|খোঁজ|খুঁজো|দেখুন|দেখো|দেখান|দেখাও)/gi, '')
      .replace(/সার্চ\s*(করো|কর|করুন|করা|করে দাও)/gi, '')
      .replace(/google\s*search\s*(for)?/gi, '')
      .replace(/search\s*(on|in)?\s*google\s*(for)?/gi, '')
      .replace(/^[\s,:-]+|[\s,:-]+$/g, '')
      .trim();

    const searchUrl = cleanQuery
      ? `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`
      : 'https://www.google.com';

    return {
      type: 'search',
      title: cleanQuery ? `'${cleanQuery}' গুগলে সার্চ করুন` : 'গুগল সার্চ ওপেন করুন',
      details: cleanQuery ? `'${cleanQuery}' এর গুগল সার্চ রেজাল্ট` : 'https://www.google.com ওপেন হবে',
      actionUrl: searchUrl,
      autoExecute: true,
      data: {
        query: cleanQuery,
        url: searchUrl,
      },
    };
  }

  // 2. Match Weather commands (e.g. 'আজকের আবহাওয়া কেমন', 'আবহাওয়ার খবর', 'weather info')
  const isWeatherCommand =
    p.includes('আবহাওয়া') ||
    p.includes('আবহাওয়া') ||
    p.includes('weather') ||
    p.includes('তাপমাত্রা কেমন') ||
    p.includes('আজকের তাপমাত্রা') ||
    p.includes('বৃষ্টি হবে কি') ||
    p.includes('বৃষ্টি হবে কিনা') ||
    p.includes('বৃষ্টির সম্ভাবনা');

  if (isWeatherCommand) {
    // Extract location if present (e.g. "ঢাকার আবহাওয়া", "চিটাগং আবহাওয়া", "London weather")
    let location = '';
    const cityPatterns = [
      /ঢাকা|dhaka/i,
      /চট্টগ্রাম|chittagong|ctg/i,
      /সিলেট|sylhet/i,
      /রাজশাহী|rajshahi/i,
      /খুলনা|khulna/i,
      /বরিশাল|barisal/i,
      /রংপুর|rangpur/i,
      /ময়মনসিংহ|ময়মনসিংহ|mymensingh/i,
      /কুমিল্লা|comilla/i,
      /কক্সবাজার|cox'?s bazar/i,
      /গাজীপুর|gazipur/i,
      /নারায়ণগঞ্জ|narayanganj/i,
      /কলকাতা|kolkata|calcutta/i,
      /দিল্লি|delhi/i,
      /লন্ডন|london/i,
      /নিউ ইয়র্ক|new york/i,
    ];

    for (const pattern of cityPatterns) {
      const match = prompt.match(pattern);
      if (match) {
        location = match[0];
        break;
      }
    }

    const weatherQuery = location ? `weather in ${location}` : 'weather today';
    const weatherUrl = `https://www.google.com/search?q=${encodeURIComponent(weatherQuery)}`;

    return {
      type: 'weather',
      title: location ? `'${location}'-এর আবহাওয়ার খবর` : 'আজকের আবহাওয়ার খবর ও পূর্বাভাস',
      details: 'গুগল ওয়েদার পেজ ওপেন হবে',
      actionUrl: weatherUrl,
      autoExecute: true,
      data: {
        location: location || '',
        query: weatherQuery,
        url: weatherUrl,
      },
    };
  }

  // If prompt is an informational question (e.g. "ইউটিউব কী?", "ফেসবুক কে তৈরি করেছেন?"),
  // treat as conversation for AI, not as device command
  const isInformationalQuestion =
    p.includes('কী?') ||
    p.includes('কি?') ||
    p.endsWith('কী') ||
    p.endsWith('কি') ||
    p.includes('কেন') ||
    p.includes('কেমন') ||
    p.includes('কীভাবে') ||
    p.includes('কিভাবে') ||
    p.includes('কার তৈরি') ||
    p.includes('প্রতিষ্ঠাতা') ||
    p.includes('what is') ||
    p.includes('who is') ||
    p.includes('how to');

  if (isInformationalQuestion) {
    return null;
  }

  // Match YouTube commands (e.g. 'ইউটিউব চালু করো', 'ইউটিউব ওপেন করো', 'youtube', etc.)
  if (p.includes('ইউটিউব') || p.includes('youtube')) {
    const isOpenCommand =
      p.includes('চালু করো') ||
      p.includes('চালু কর') ||
      p.includes('চালু করুন') ||
      p.includes('চালাও') ||
      p.includes('চালিয়ে দাও') ||
      p.includes('খোলো') ||
      p.includes('খোল') ||
      p.includes('খুলুন') ||
      p.includes('ওপেন করো') ||
      p.includes('ওপেন কর') ||
      p.includes('ওপেন করুন') ||
      p.includes('ওপেন') ||
      p.includes('open') ||
      p.includes('launch') ||
      p.includes('start') ||
      p === 'ইউটিউব' ||
      p === 'youtube';

    // Clean query to check if there is an explicit search term
    const cleanQuery = prompt
      .replace(/ইউটিউবে|ইউটিউব|youtube/gi, '')
      .replace(/চালু করো|চালু কর|চালু করুন|চালাও|চালিয়ে দাও|খোলো|খোল|খুলুন|ওপেন করো|ওপেন কর|ওপেন করুন|ওপেন|open|launch|প্লে করো|start/gi, '')
      .replace(/সার্চ করো|সার্চ কর|সার্চ|search|খোঁজো|খুঁজে দাও|দেখাও/gi, '')
      .trim();

    const isDirectOpen = isOpenCommand || !cleanQuery;

    return {
      type: 'youtube',
      title: isDirectOpen ? 'ইউটিউব চালু করুন' : `'${cleanQuery}' ইউটিউবে সার্চ করুন`,
      details: isDirectOpen ? 'https://youtube.com ওপেন হবে' : `'${cleanQuery}' সার্চ ওপেন হবে`,
      actionUrl: isDirectOpen ? 'https://youtube.com' : `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`,
      autoExecute: true,
      data: {
        query: isDirectOpen ? '' : cleanQuery,
        url: isDirectOpen ? 'https://youtube.com' : `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`,
      },
    };
  }

  // Match Facebook commands (e.g. 'ফেসবুক চালু করো', 'ফেসবুক ওপেন করো', 'facebook', 'fb', etc.)
  if (p.includes('ফেসবুক') || p.includes('facebook') || p.includes('ফেসবুকে') || p === 'fb') {
    return {
      type: 'facebook',
      title: 'ফেসবুক চালু করুন',
      details: 'https://facebook.com ওপেন হবে',
      actionUrl: 'https://facebook.com',
      autoExecute: true,
      data: {
        url: 'https://facebook.com',
      },
    };
  }

  if (p.includes('ম্যাপ') || p.includes('লোকেশন') || p.includes('maps') || p.includes('কাছের')) {
    const query = prompt
      .replace(/ম্যাপে|ম্যাপ|maps|লোকেশন|দেখাও|খুঁজে দাও/gi, '')
      .trim();
    return {
      type: 'maps',
      title: 'গুগল ম্যাপস ওপেন করুন',
      details: query ? `'${query}' এর লোকেশন খুঁজুন` : 'ম্যাপস খুলুন',
      data: { query: query || 'nearby' },
    };
  }

  if (p.includes('কল করো') || p.includes('ফোন করো') || p.includes('dial') || p.includes('call')) {
    const numbers = prompt.match(/\d{3,}/);
    const phone = numbers ? numbers[0] : '999';
    return {
      type: 'dial',
      title: `ফোন কল ডায়াল (${phone})`,
      details: 'অ্যান্ড্রয়েড ফোন ডায়ালার ওপেন হবে',
      data: { phone },
    };
  }

  if (p.includes('হোয়াটসঅ্যাপ') || p.includes('whatsapp')) {
    return {
      type: 'whatsapp',
      title: 'হোয়াটসঅ্যাপে পাঠান',
      details: 'হোয়াটসঅ্যাপ মেসেঞ্জার ইন্টেন্ট ওপেন হবে',
      data: { text: prompt },
    };
  }

  if (p.includes('কপি করো') || p.includes('copy to clipboard')) {
    return {
      type: 'copy',
      title: 'ক্লিপবোর্ডে কপি করুন',
      details: 'সরাসরি টেক্সট কপি করার অনুমতি',
      data: { text: prompt },
    };
  }

  if (p.includes('টাইমার') || p.includes('timer') || p.includes('অ্যালার্ম')) {
    return {
      type: 'timer',
      title: 'টাইমার সেট করুন',
      details: 'ক্লক / টাইমার ইন্টেন্ট ওপেন হবে',
      data: {},
    };
  }

  return null;
}
