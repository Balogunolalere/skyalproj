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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

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
      ...messages.map(
        (m: { role: string; content: string; image?: string }) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }],
        }),
      ),
    ];

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
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Agnes API error: ${response.status}`);
    }

    const reply = data.choices[0]?.message?.content?.trim() || "";
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Agnes API error:", error);
    return NextResponse.json(
      {
        reply:
          "I couldn't reach the AI just now. Try again in a moment, or call us on 0803 500 3068.",
        error: true,
      },
      { status: 200 },
    );
  }
}
