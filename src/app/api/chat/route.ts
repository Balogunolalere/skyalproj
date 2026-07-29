import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SYSTEM = `You are the Skyal AI assistant. Skyal is a precision laser-cutting service in Lagos, Nigeria, cutting fabrics, leather, wood, acrylic, paper and foam for fashion designers, hobbyists and small businesses.

Help customers with: quotes, order tracking, material questions, turnaround times, delivery options, and file formats. Keep answers short, specific and practical — a couple of sentences, sometimes a short list. Use plain language. If you don't know something (like a specific order's status), say so and point them to the Track page or to human support (06:00–22:00 WAT, skyalservices@gmail.com, 0803 500 3068).

Key facts:
- Turnaround: standard ~72 hrs, express ~48 hrs.
- 40+ materials, each with a tuned power/speed/frequency profile.
- Tolerance ±1mm. 99.2% on-time. Quality guarantee: recut free if not right.
- Delivery: studio pickup (Ogba, Ikeja), Lagos delivery, nationwide waybill.
- Quotes returned within 4 hours during operating hours.
- Prices in NGN. Payment via Paystack or pay-on-delivery.

Be warm but not wordy. Never invent order numbers or statuses.`;

// Rate limiting configuration - increased for better performance
const MAX_REQUESTS_PER_WINDOW = 15; // Max requests per client per window (below free tier limit of 20 RPM)
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window

// In-memory store for rate limiting (use Redis in production)
const requestStore = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: NextRequest): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  return "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const key = `rate:${ip}`;
  const entry = requestStore.get(key);

  if (!entry) {
    requestStore.set(key, { count: 1, windowStart: now });
    return false;
  }

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestStore.set(key, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  entry.count++;
  return false;
}

// Query caching - cache identical responses for 60 seconds to avoid redundant API calls
// Using a simple LRU-like cache with size limit to prevent memory bloat
const cacheStore = new Map<string, { reply: string; timestamp: number }>();
const CACHE_TTL_MS = 60000;
const MAX_CACHE_SIZE = 100;

function getCacheKey(messages: Array<{ role: string; content: string }>): string {
  // Only cache based on user messages (exclude system message which is static)
  const userMessages = messages.filter(m => m.role !== "system");
  return userMessages
    .map(m => `${m.role}:${m.content}`)
    .join("|");
}

function getFromCache(key: string): string | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cacheStore.delete(key);
    return null;
  }
  return entry.reply;
}

function setCache(key: string, reply: string) {
  // Evict oldest entries if cache is full
  if (cacheStore.size >= MAX_CACHE_SIZE) {
    const keysIterator = cacheStore.keys();
    const firstEntry = keysIterator.next();
    if (!firstEntry.done && typeof firstEntry.value === 'string') {
      cacheStore.delete(firstEntry.value);
    }
  }
  cacheStore.set(key, { reply, timestamp: Date.now() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    // Check rate limit before processing
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          rateLimit: true,
        },
        { status: 429 },
      );
    }

    const AGNES_API_KEY = process.env.AGNES_API_KEY;
    if (!AGNES_API_KEY) {
      return NextResponse.json(
        {
          reply: "AI service is not configured. Please contact support.",
          error: true,
        },
        { status: 500 },
      );
    }

    // Prepare messages for Agnes API (OpenAI-compatible format)
    // Agnes expects system messages with role "system", not "assistant"
    const agnesMessages = [
      { role: "system", content: SYSTEM },
      ...messages.map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content, // Content is already a string - no unnecessary array wrapping
      })),
    ];

    // Check cache for identical query before making API call
    const cacheKey = getCacheKey(agnesMessages);
    const cachedReply = getFromCache(cacheKey);
    if (cachedReply) {
      return NextResponse.json({ reply: cachedReply });
    }

    // Add timeout to fetch to prevent hanging - set to 60 seconds to accommodate Agnes API variability
    const timeoutMs = 60000; // 60 seconds timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AGNES_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "agnes-2.0-flash",
        messages: agnesMessages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Agnes API error: ${response.status}`);
    }

    const reply = data.choices[0]?.message?.content?.trim() || "";
    
    // Cache the response for identical future queries
    if (cacheKey) {
      setCache(cacheKey, reply);
    }
    
    return NextResponse.json({ reply });
  } catch (error) {
    // Timeout/abort errors - don't log as errors since they're expected for slow responses
    if (error instanceof AggregateError) {
      // Check the underlying errors for the abort reason
      for (const err of error.errors) {
        if (err.name === 'AbortError') {
          console.log("Agnes API request timed out after 60s");
          return NextResponse.json(
            {
              reply: "The AI service is taking longer than usual. Please try again.",
              error: true,
            },
            { status: 504 },
          );
        }
      }
    } else if (error instanceof Error && error.name === 'AbortError') {
      // Handle direct AbortError (not wrapped in AggregateError)
      console.log("Agnes API request timed out after 60s");
      return NextResponse.json(
        {
          reply: "The AI service is taking longer than usual. Please try again.",
          error: true,
        },
        { status: 504 },
      );
    }

    // Other API errors
    console.error("Agnes API error:", error);
    let reply = "I couldn't reach the AI just now. Try again in a moment, or call us on 0803 500 3068.";
    let status = 200;

    return NextResponse.json(
      {
        reply,
        error: true,
      },
      { status },
    );
  }
}
