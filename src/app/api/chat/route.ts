import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

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

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM },
        ...messages.map(
          (m: { role: string; content: string }) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          }),
        ),
      ],
      thinking: { type: "disabled" },
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      {
        reply:
          "I couldn't reach the model just now. Try again in a moment, or call us on 0803 500 3068.",
        error: true,
      },
      { status: 200 },
    );
  }
}
