#!/usr/bin/env python3
"""
Paberin Chat Dataset Generator v3.0 — Agnes-powered pipeline
============================================================
Reads the raw WhatsApp chat export zips, extracts the text-only chat
transcripts, parses them locally (no AI), segments long chats, and uses
Agnes 2.0 Flash to UNDERSTAND each segment and build a test/improvement
dataset for the Paberin AI chat assistant.

Pipeline stages:
  0. EXTRACT   — unzip only *.txt from the chat-history zips (texts only)
  1. PARSE     — local WhatsApp-export parser: messages, sender side
                 (SHOP = Paberin side, CUST = customer), media markers,
                 system-message filtering. No AI involved.
  2. SEGMENT   — split huge chats into bounded, coherent segments (the old
                 pipeline truncated at 30K chars and silently dropped the
                 rest of the chat; median chat here is 42K chars, max 2.7M).
  3. PASS 1    — Agnes reads each segment and returns structured JSON:
                 a segment summary (what happened, services, prices,
                 customer issues, missed sales opportunities) + all customer
                 inquiries with context, intent, key details, what Paberin
                 quoted, outcome, and the expected assistant behavior.
  4. PASS 2    — for each inquiry, Agnes writes the IDEAL assistant reply,
                 using the LIVE system prompt extracted from
                 src/lib/chat.ts (no drift from the deployed assistant).
  5. FINALIZE  — merge checkpoints into tests/datasets/:
                 paberin_chat_eval_dataset.json (test cases)
                 paberin_chat_analyses.json     (per-chat understanding)

Robustness:
  - Checkpointed (JSONL) — reruns skip segments/inquiries already done.
  - Small concurrency + retries with backoff; 401/403 abort fast.
  - Lenient JSON extraction from model output (fences, trailing commas).
  - Env knobs: MAX_CHATS, MAX_SEGMENTS, SEGMENT_CHARS, CONCURRENCY,
    DRY_RUN, SKIP_EXTRACT, STAGE (extract|parse|pass1|pass2|finalize|all).

Usage:
  AGNES_API_KEY=... python3 scripts/build-chat-dataset.py
  python3 scripts/build-chat-dataset.py            # reads .env.local too
  DRY_RUN=1 MAX_CHATS=2 python3 scripts/build-chat-dataset.py  # offline test
"""

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

# ─── Brand + Paths ───────────────────────────────────────────────────────
# BRAND=paberin (default) | BRAND=skyal — switches zips/chats/checkpoint/
# output paths, the PASS1 analyst prompt, and the PASS2 system-prompt source.
BRAND = os.environ.get("BRAND", "paberin").lower()
IS_SKYAL = BRAND == "skyal"

REPO_ROOT = Path(__file__).resolve().parent.parent
if IS_SKYAL:
    ZIPS_DIR = Path(os.environ.get(
        "CHAT_ZIPS_DIR",
        str(REPO_ROOT / "scripts" / "data" / "skyal_zips" / "Skyal Laser WhatsApp Chat History "),
    ))
    CHATS_DIR = REPO_ROOT / "scripts" / "data" / "chats_skyal"
    PASS1_CKPT_NAME = "skyal_pass1.jsonl"
    PASS2_CKPT_NAME = "skyal_pass2.jsonl"
    DATASET_OUT_NAME = "skyal_chat_eval_dataset.json"
    ANALYSES_OUT_NAME = "skyal_chat_analyses.json"
    ASSISTANT_DISPLAY = "Skyal"
    # Where the deployed assistant's system prompt lives (src/lib/chat.ts,
    # same as Paberin — the [SPECS] contract lives in the shared lib).
    LIVE_PROMPT_PATH = Path(os.environ.get(
        "SKYAL_PROMPT_PATH",
        str(REPO_ROOT / "src" / "lib" / "chat.ts"),
    ))
    LIVE_PROMPT_CONST = "SKYAL_SYSTEM_PROMPT"
else:
    ZIPS_DIR = Path(os.environ.get(
        "CHAT_ZIPS_DIR",
        "/home/doombuggy_/Downloads/Paberin whatsapp chat history-20260731T020121Z-1-001/Paberin whatsapp chat history",
    ))
    CHATS_DIR = REPO_ROOT / "scripts" / "data" / "chats"
    PASS1_CKPT_NAME = "pass1.jsonl"
    PASS2_CKPT_NAME = "pass2.jsonl"
    DATASET_OUT_NAME = "paberin_chat_eval_dataset.json"
    ANALYSES_OUT_NAME = "paberin_chat_analyses.json"
    ASSISTANT_DISPLAY = "Paberin"
    LIVE_PROMPT_PATH = REPO_ROOT / "src" / "lib" / "chat.ts"
    LIVE_PROMPT_CONST = "PABERIN_SYSTEM_PROMPT"

CKPT_DIR = REPO_ROOT / "tests" / "datasets" / "checkpoints"
OUTPUT_DIR = REPO_ROOT / "tests" / "datasets"
CKPT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─── Agnes config ────────────────────────────────────────────────────────
AGNES_API_URL = "https://apihub.agnes-ai.com/v1/chat/completions"
MODEL = "agnes-2.0-flash"
MAX_RETRIES = 3
MAX_ATTEMPTS = 3  # checkpoint attempts before a segment/inquiry is abandoned
REQUEST_TIMEOUT = 150
CONCURRENCY = int(os.environ.get("CONCURRENCY", "6"))
SEGMENT_CHARS = int(os.environ.get("SEGMENT_CHARS", "6000"))
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"
STAGE = os.environ.get("STAGE", "all")

MAX_CHATS = int(os.environ.get("MAX_CHATS", "0")) or None
MAX_SEGMENTS = int(os.environ.get("MAX_SEGMENTS", "0")) or None


def load_agnes_key() -> str:
    """Load AGNES_API_KEY from env or .env.local/.env."""
    key = os.environ.get("AGNES_API_KEY", "")
    if key:
        return key
    for env_file in (REPO_ROOT / ".env.local", REPO_ROOT / ".env"):
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("AGNES_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


AGNES_API_KEY = load_agnes_key()


# ─── Helpers ─────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    print(msg, flush=True)


# Optional stuck-run diagnostics: dump all thread stacks every 60s
if os.environ.get("DEBUG_STUCK") == "1":
    import faulthandler

    faulthandler.dump_traceback_later(60, repeat=True)


def sha_id(*parts: str) -> str:
    return hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()[:12]


# ═══════════════════════════════════════════════════════════════════════
# STAGE 0+1+2 — EXTRACT, PARSE, SEGMENT (local, deterministic, no AI)
# ═══════════════════════════════════════════════════════════════════════

# The SHOP side is the account owner. WhatsApp contact names of CUSTOMERS
# often contain "Paberin" too (e.g. "Dainty Affairs, Paberin Creations
# Client"), so match only senders that START with the shop name.
SHOP_NAME_RE = re.compile(r"^(?:paberin|paberine|pabrin|sky\s?al|skyal)", re.IGNORECASE)

# Message-line formats seen in WhatsApp exports:
#   "4/14/21, 11:18 AM - Sender: content"          (older)
#   "[4/14/21, 11:18:22 AM] Sender: content"       (bracketed variant)
MSG_RE = re.compile(
    r"^(?:\[)?(\d{1,2}/\d{1,2}/\d{2,4}, \d{1,2}:\d{2}(?::\d{2})?(?: [AP]M)?)(?:\])?\s*(?:-\s*)?(.*)$"
)

MEDIA_EXT_RE = re.compile(
    r"\.(jpe?g|png|gif|webp|heic|mp4|avi|mov|mkv|3gp|opus|mp3|m4a|aac|wav|amr|pdf|docx?|xlsx?|pptx?|zip)\b",
    re.IGNORECASE,
)


def media_marker(text: str) -> Optional[str]:
    """Map a media placeholder line to a compact marker, or None."""
    lower = text.lower().strip()
    ext_match = MEDIA_EXT_RE.search(lower)
    if ext_match:
        ext = ext_match.group(1).lower()
        if ext in ("jpg", "jpeg", "png", "gif", "webp", "heic"):
            return "[media:image]"
        if ext in ("mp4", "avi", "mov", "mkv", "3gp"):
            return "[media:video]"
        if ext in ("opus", "mp3", "m4a", "aac", "wav", "amr"):
            return "[media:audio]"
        return "[media:document]"
    if "omitted" in lower or "(file attached)" in lower or "<attached:" in lower:
        if "image" in lower or "photo" in lower:
            return "[media:image]"
        if "video" in lower:
            return "[media:video]"
        if "audio" in lower or "voice" in lower or "ptt" in lower:
            return "[media:audio]"
        if "sticker" in lower:
            return "[media:sticker]"
        if "gif" in lower:
            return "[media:gif]"
        if "contact" in lower:
            return "[media:contact]"
        return "[media]"
    return None


def parse_date(mdy: str) -> Optional[str]:
    """'4/14/21' -> '2021-04-14' (2-digit years: 21→2021, 99→1999)."""
    try:
        m, d, y = mdy.split("/")
        y = int(y)
        if y < 100:
            y += 2000 if y < 70 else 1900
        return f"{y:04d}-{int(m):02d}-{int(d):02d}"
    except Exception:
        return None


def parse_whatsapp(text: str) -> list[dict]:
    """Parse a WhatsApp export into messages: {date, time, sender, side, text}."""
    # WhatsApp exports use U+202F (narrow no-break space) before AM/PM —
    # normalize it or the time-of-day bleeds into the sender name.
    text = text.replace("\u202f", " ").replace("\u00a0", " ")
    text = text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    messages: list[dict] = []
    pending: Optional[dict] = None

    for raw_line in text.split("\n"):
        line = raw_line.rstrip()
        m = MSG_RE.match(line)
        if m:
            # New message line
            ts, rest = m.group(1), m.group(2)
            date_part, time_part = ts.split(",", 1)
            date = parse_date(date_part.strip())
            rest = rest.strip()
            # Split "Sender: content" at the FIRST ": "
            if ": " in rest:
                sender, content = rest.split(": ", 1)
            elif rest.endswith(":"):
                sender, content = rest[:-1], ""
            else:
                # No sender → system notice ("Messages and calls are…",
                # "Your security code … changed", …) — drop these.
                pending = None
                continue
            content = content.strip()
            if not content:
                pending = None
                continue
            marker = media_marker(content)
            if marker:
                content = marker
            is_shop = bool(SHOP_NAME_RE.search(sender))
            pending = {
                "date": date,
                "time": time_part.strip(),
                "sender": sender.strip(),
                "side": "SHOP" if is_shop else "CUST",
                "text": content,
            }
            messages.append(pending)
        elif pending is not None and line.strip():
            # Continuation line of the previous message
            cont = line.strip()
            marker = media_marker(cont)
            if marker:
                cont = marker
            pending["text"] += "\n" + cont

    return messages


def hours_between(a: dict, b: dict) -> float:
    try:
        d0 = datetime.strptime(a["date"], "%Y-%m-%d")
        d1 = datetime.strptime(b["date"], "%Y-%m-%d")
        return (d1 - d0).total_seconds() / 3600
    except Exception:
        return 0.0


def segment_messages(chat_name: str, messages: list[dict], max_chars: int) -> list[dict]:
    """Split messages into bounded segments.

    Strategy: grow a window up to `max_chars`, then cut at the LAST gap of
    >= 2 hours inside the window (so distinct conversations are separated
    when possible), otherwise cut at the size boundary. This keeps segments
    near the target size instead of fragmenting sporadic chats into tiny
    pieces the way a strict gap rule would.
    """
    segments: list[dict] = []
    start = 0
    n = len(messages)

    def build(start: int, end: int, seg_idx: int) -> None:
        lines = []
        for m in messages[start:end]:
            stamp = f"{m['date']} {m['time']}" if m.get("date") else m.get("time", "")
            lines.append(f"[{stamp}] [{m['side']}] {m['text']}")
        segments.append({
            "chat": chat_name,
            "index": seg_idx,
            "start": messages[start].get("date"),
            "end": messages[end - 1].get("date"),
            "text": "\n".join(lines),
        })

    seg_idx = 0
    while start < n:
        # Grow the window up to max_chars
        end = start
        chars = 0
        while end < n:
            add = len(messages[end]["text"]) + 12
            if chars + add > max_chars and end > start:
                break
            chars += add
            end += 1
        if end >= n:
            build(start, n, seg_idx)
            break
        # Prefer cutting at the last >=2h gap that is not too close to `start`
        cut = end
        for i in range(end - 1, start, -1):
            if hours_between(messages[i - 1], messages[i]) >= 2 and (i - start) >= (end - start) // 3:
                cut = i
                break
        build(start, cut, seg_idx)
        start = cut
        seg_idx += 1

    return segments


def extract_and_prepare() -> list[Path]:
    """Unzip *.txt from all zips (idempotent) and return the chat files."""
    if not ZIPS_DIR.exists():
        log(f"ERROR: zips dir not found: {ZIPS_DIR}")
        sys.exit(1)
    CHATS_DIR.mkdir(parents=True, exist_ok=True)
    zips = sorted(ZIPS_DIR.glob("*.zip"))
    log(f"📦 {len(zips)} zips in {ZIPS_DIR}")
    for zp in zips:
        out = CHATS_DIR / (zp.stem + ".txt")
        if out.exists():
            continue
        try:
            z = zipfile.ZipFile(zp)
        except zipfile.BadZipFile as e:
            log(f"  ⚠️ bad zip {zp.name}: {e}")
            continue
        txts = [n for n in z.namelist() if n.lower().endswith(".txt") and not n.startswith("__MACOSX")]
        if not txts:
            log(f"  ⚠️ no .txt in {zp.name}")
            continue
        data = z.read(txts[0])
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text = data.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        out.write_text(text, encoding="utf-8")
    return sorted(CHATS_DIR.glob("*.txt"))


def parse_and_segment(chat_file: Path) -> list[dict]:
    messages = parse_whatsapp(chat_file.read_text(encoding="utf-8"))
    return segment_messages(chat_file.stem, messages, SEGMENT_CHARS)


# ═══════════════════════════════════════════════════════════════════════
# Agnes API helper
# ═══════════════════════════════════════════════════════════════════════

def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text


def parse_json_any(content: str) -> Optional[Any]:
    """Lenient JSON extraction: fences, trailing commas, first {...} object."""
    content = _strip_fences(content)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", content)
    if m:
        candidate = m.group(0).replace(",}", "}").replace(",]", "]")
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass
    # SALVAGE: the output may be truncated mid-JSON (the API sometimes cuts
    # long responses). Extract every complete top-level JSON object and keep
    # those that parse — typically individual inquiry objects.
    salvaged = []
    i = 0
    while True:
        start = content.find("{", i)
        if start == -1:
            break
        depth = 0
        in_str = False
        esc = False
        end = -1
        for j in range(start, len(content)):
            ch = content[j]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = j
                    break
        if end == -1:
            break
        chunk = content[start : end + 1]
        try:
            obj = json.loads(chunk.replace(",}", "}").replace(",]", "]"))
        except json.JSONDecodeError:
            chunk = chunk[: max(0, chunk.rfind("}")) + 1]
            try:
                obj = json.loads(chunk.replace(",}", "}").replace(",]", "]"))
            except json.JSONDecodeError:
                i = end + 1
                continue
        if isinstance(obj, dict):
            salvaged.append(obj)
        i = end + 1
    if salvaged:
        # Prefer a single top-level object (the whole response); otherwise
        # rebuild {"inquiries": [...]} from salvaged inquiry objects.
        if len(salvaged) == 1 and ("inquiries" in salvaged[0] or "segment_summary" in salvaged[0]):
            return salvaged[0]
        inquiries = [o for o in salvaged if "customer_messages" in o]
        if inquiries:
            return {"segment_summary": {}, "inquiries": inquiries}
    return None


def call_agnes(system_prompt: str, user_content: str, temperature: float = 0.2,
               max_tokens: int = 8192, max_retries: int = MAX_RETRIES) -> Optional[Any]:
    """Call Agnes 2.0 Flash, return parsed JSON.

    Retries with a PERTURBED prompt: the API caches empty/failed responses
    keyed on the exact prompt, so identical retries return the same failure
    instantly. Appending a variation to the user content busts the cache.
    """
    if DRY_RUN:
        return None
    retry_suffixes = [
        "",
        "\n\n(Second attempt — output the JSON now. Do not skip any customer inquiry.)",
        "\n\n(Third attempt — you MUST output valid JSON. Be concise so the output fits.)",
    ]
    for attempt in range(max_retries):
        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content + retry_suffixes[attempt]},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        try:
            req = urllib.request.Request(
                AGNES_API_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {AGNES_API_KEY}"},
            )
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            if not content or not content.strip():
                if attempt < max_retries - 1:
                    time.sleep(2 + attempt)
                    continue
                log("  ⚠️ Agnes returned empty content")
                return None
            parsed = parse_json_any(content)
            if parsed is None:
                if attempt < max_retries - 1:
                    time.sleep(2 + attempt)
                    continue
                log("  ⚠️ Agnes output was not valid JSON (salvage failed)")
                return None
            return parsed
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                log(f"  ❌ Agnes auth error ({e.code}) — check AGNES_API_KEY")
                sys.exit(1)
            if e.code == 429 or e.code >= 500:
                if attempt < max_retries - 1:
                    # Rate limits need longer, jittered backoff
                    time.sleep((5 * (2 ** attempt)) + 2 * attempt)
                    continue
            log(f"  ⚠️ Agnes HTTP {e.code}: {e.reason}")
            return None
        except (urllib.error.URLError, TimeoutError, ConnectionError,
                json.JSONDecodeError, KeyError) as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt * 1.5 + attempt)
                continue
            log(f"  ⚠️ Agnes call failed: {type(e).__name__}: {e}")
            return None
    return None


# ═══════════════════════════════════════════════════════════════════════
# PASS 1 — understand each segment
# ═══════════════════════════════════════════════════════════════════════

# PASS1 analyst prompt: brand-aware. The rules + JSON schema body is shared;
# only the intro (business, scope, transcript tags) differs per brand.
PASS1_BODY = """Read the ENTIRE segment and do two things:
1. Summarize the segment (what happened, services discussed, prices mentioned, issues, missed opportunities).
2. Extract EVERY distinct customer inquiry — a customer message or exchange where the customer asks about products, pricing, orders, materials, delivery, lead time, or any business transaction. Group back-and-forth about ONE topic into ONE inquiry (e.g. price → size → delivery = one inquiry). A segment may contain several inquiries. Ignore purely social chatter with no business content.

Rules:
- customer_messages: the EXACT customer text messages for this inquiry, verbatim, in order, as a list of strings. Never paraphrase. Drop media placeholders like "[media:image]" from this list (the image is context only). If the inquiry was mostly images, keep the surrounding text messages and note it in context_summary.
- If the customer asked something and Paberin never replied, still extract it (outcome: "no_response").
- If Paberin quoted a price, record the exact amount and the exact price text.
- intent: one of quote_request|order_placement|material_inquiry|delivery_inquiry|lead_time|design_inquiry|general_info|complaint|other.
- expected_behavior: what the %(assistant)s AI ASSISTANT should do when a customer sends this inquiry: "quote" (enough detail to quote now), "clarify" (missing info — ask questions first), "redirect" (off-topic/not a service), "confirm" (confirm/close an order or booking), "other".
- missing_info: list of details missing for a complete quote (e.g. ["quantity","size/dimensions","material"]).
- key_details.service_type: fabric_cutting|engraving|sheet_cutting|cake_topper|tags_labels|other|null. material: fabric|leather|wood|acrylic|metal|other|null.
- what_paberin_quoted.price_quoted: a NUMBER (naira) or null. was_order_placed: true only if the customer clearly placed/confirmed an order.
- conversation_quality_note: one short phrase or empty string (e.g. "slow reply", "unclear pricing", "no follow-up", "price change mid-negotiation").
- Keep the whole output COMPACT — terse summaries, no fluff. Output length is limited, so if a segment is inquiry-heavy, keep per-inquiry text short while preserving the EXACT customer messages.

Return ONLY valid JSON (no markdown, no extra text) with this exact shape:
{
  "segment_summary": {
    "date_range": "YYYY-MM-DD to YYYY-MM-DD",
    "summary": "2-3 sentence summary of what happened in this segment",
    "services_discussed": ["..."],
    "prices_mentioned": [{"amount": 20000, "item": "what it was for"}],
    "customer_issues": ["complaints, confusion, friction points"],
    "sales_opportunities_missed": ["customer interest that got no follow-up or no answer"]
  },
  "inquiries": [
    {
      "customer_messages": ["exact message 1", "exact message 2"],
      "date_range": "YYYY-MM-DD to YYYY-MM-DD",
      "context_summary": "what led to this inquiry",
      "what_customer_wants": "clear description",
      "intent": "...",
      "expected_behavior": "...",
      "missing_info": ["..."],
      "key_details": {"service_type": "...", "material": "...", "quantity_mentioned": 1, "sla_mentioned": "Standard|Express|null", "delivery_mentioned": "pickup|local_delivery|nationwide|null"},
      "what_paberin_quoted": {"price_quoted": 20000, "price_text": "exact text or null", "lead_time_quoted": "text or null", "was_order_placed": false},
      "outcome": "order_placed|quote_given_only|no_response|follow_up_needed|declined|other",
      "conversation_quality_note": "note or empty string"
    }
  ]
}

If the segment contains NO customer business inquiries, return {"segment_summary": {...}, "inquiries": []}."""
PASS1_BODY = PASS1_BODY % {"assistant": ASSISTANT_DISPLAY}

if IS_SKYAL:
    PASS1_SYSTEM_PROMPT = """You are a conversation analyst for Skyal Laser Services, a precision laser-cutting business in Ogba, Ikeja, Lagos, Nigeria (fabric cutting incl. buba/wrapper/sleeves/boubou, engraving incl. phone/jewelry/leather/wood/badges/necklace, sheet cutting incl. 4x4/8x4/custom, acrylic sticks, cake toppers & signage, metal cutting via external partner; sister brand of Paberin Creations).

You will receive ONE segment of a WhatsApp chat transcript between Skyal's staff and a customer. In the transcript:
- [SHOP] = Skyal Laser Services staff (the business side)
- [CUST] = the customer (may be an individual, a tailor, an event planner, a signage buyer, etc.)

The customer side may discuss: fabric laser cutting (buba, wrapper, sleeves, boubou, aso-ebi etc.), engraving (phone back, jewelry, leather, wood, badges, necklace), sheet cutting (acrylic, wood, 4x4/8x4/custom), acrylic sticks, cake toppers & signage, tags/labels, delivery (pickup in Ogba Ikeja Lagos, local Lagos delivery, nationwide waybill), payment (full payment before production, no VAT), lead times (standard 5 working days, express 48h at +50%, engraving minimum 48h, metal via external partner 10 working days).

""" + PASS1_BODY
else:
    PASS1_SYSTEM_PROMPT = """You are a conversation analyst for Paberin Creations, a precision laser-cutting business in Ogba, Ikeja, Lagos, Nigeria (fabric/garment cutting, engraving, sheet cutting, cake toppers; sister brand of Skyal Laser Services).

You will receive ONE segment of a WhatsApp chat transcript between Paberin's staff and a customer. In the transcript:
- [SHOP] = Paberin Creations staff (the business side)
- [CUST] = the customer (may be an individual, a bakery, a tailor, an event planner, etc.)

The customer side may discuss: fabric laser cutting (buba, wrapper, sleeves, boubou, aso-ebi etc.), engraving (phone back, jewelry, leather, wood, badges), sheet cutting (acrylic, wood), cake toppers, tags/labels, delivery (pickup in Ogba Ikeja Lagos, local Lagos delivery, nationwide waybill), payment (full payment before production, no VAT), lead times (standard 5 working days, express 48h at +50%, engraving minimum 48h, metal via external partner 10 working days).

""" + PASS1_BODY


def pass1_segment(seg: dict) -> dict:
    user_content = (
        f"Chat file: {seg['chat']}.txt\nSegment {seg['index'] + 1} "
        f"({seg['start']} → {seg['end']})\n\n"
        f"--- CHAT TRANSCRIPT ---\n{seg['text']}\n--- END TRANSCRIPT ---\n\n"
        f"Analyze this segment and return the JSON described in your instructions."
    )
    result = call_agnes(PASS1_SYSTEM_PROMPT, user_content, temperature=0.2, max_tokens=8192)
    if result is None:
        return {"seg_id": seg["id"], "ok": False, "error": "Agnes call failed"}
    summary = result.get("segment_summary", {})
    inquiries = result.get("inquiries", [])
    if not isinstance(inquiries, list):
        inquiries = []
    for inq in inquiries:
        if not isinstance(inq, dict):
            continue
        msgs = inq.get("customer_messages", [])
        inq["customer_query_text"] = "\n".join(
            m for m in (msgs if isinstance(msgs, list) else [msgs]) if isinstance(m, str)
        ).strip()
        inq["needs_clarification"] = inq.get("expected_behavior") == "clarify"
        inq["id"] = sha_id(seg["chat"], str(seg["index"]), inq["customer_query_text"] or json.dumps(msgs, ensure_ascii=False))
        inq["source_file"] = seg["chat"] + ".txt"
        inq["segment_id"] = seg["id"]
        if not inq.get("date_range") and seg.get("start"):
            inq["date_range"] = f"{seg['start']} to {seg['end']}"
    return {
        "seg_id": seg["id"],
        "chat": seg["chat"],
        "segment_index": seg["index"],
        "segment_summary": summary if isinstance(summary, dict) else {},
        "inquiries": inquiries,
        "ok": True,
    }


# ═══════════════════════════════════════════════════════════════════════
# PASS 2 — ideal assistant responses (using the LIVE system prompt)
# ═══════════════════════════════════════════════════════════════════════

def load_live_system_prompt() -> str:
    """Extract the deployed assistant's system prompt so ideal responses are
    generated under the SAME instructions the assistant uses. Both brands
    keep their prompt exported from src/lib/chat.ts."""
    text = LIVE_PROMPT_PATH.read_text(encoding="utf-8")
    m = re.search(r"export const %s = `([\s\S]*?)`;" % LIVE_PROMPT_CONST, text)
    if not m:
        log("WARNING: could not extract system prompt from %s" % LIVE_PROMPT_PATH)
        return ""
    return m.group(1)


def build_pass2_prompt() -> str:
    live = load_live_system_prompt()
    return f"""You are generating the IDEAL response that %(brand)s's AI assistant should produce for a given customer inquiry.

The assistant operates under EXACTLY this system prompt (its full knowledge of services, tone, and the [SPECS] extraction contract — the AI NEVER prices; the system computes exact prices via the pricing engine):

<assistant-system-prompt>
{live}
</assistant-system-prompt>

Your job: given a real customer inquiry from %(brand)s's WhatsApp history, write the response the IDEAL assistant would give in that situation — following the assistant's system prompt rules precisely (extract the structured [SPECS] block when the request is complete, ask clarifying questions when details are missing, NEVER invent prices in the response text, Nigerian-friendly tone with "ma"/"sir").

Return ONLY valid JSON: {{"ideal_response": "your full response text here"}}"""


def pass2_ideal_response(inquiry: dict, system_prompt: str) -> Optional[str]:
    msgs = inquiry.get("customer_messages", [])
    if isinstance(msgs, list):
        combined = "\n".join(f'- "{m}"' for m in msgs if isinstance(m, str))
    else:
        combined = str(msgs)
    user_content = (
        f"Customer inquiry (id {inquiry.get('id', '?')}):\n\n"
        f"Customer message(s):\n{combined}\n\n"
        f"What the customer wants: {inquiry.get('what_customer_wants', '')}\n"
        f"Context: {inquiry.get('context_summary', '')}\n"
        f"Intent: {inquiry.get('intent', 'unknown')}\n"
        f"Expected behavior: {inquiry.get('expected_behavior', 'other')}\n"
        f"Missing info: {json.dumps(inquiry.get('missing_info', []))}\n"
        f"Key details: {json.dumps(inquiry.get('key_details', {}))}\n"
        f"What %(brand)s actually quoted in the chat: {json.dumps(inquiry.get('what_paberin_quoted', {}))}\n\n"
        f"Write the ideal assistant response (JSON with 'ideal_response')."
    )
    result = call_agnes(system_prompt, user_content, temperature=0.4, max_tokens=4096)
    if isinstance(result, dict) and result.get("ideal_response"):
        return result["ideal_response"]
    return None


# ═══════════════════════════════════════════════════════════════════════
# Checkpointed runners
# ═══════════════════════════════════════════════════════════════════════

def load_ckpt(path: Path, retry_failures: bool = True) -> dict:
    """Load checkpoint records. Failed records (ok: False) are skipped when
    retry_failures is set so a rerun naturally retries them; records are
    dropped for good after MAX_ATTEMPTS tries."""
    done: dict = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            key = rec.get("id")
            if not key:
                continue
            attempts = int(rec.get("attempts", 0) or 0)
            if rec.get("ok"):
                done[key] = rec
            elif retry_failures and attempts < MAX_ATTEMPTS:
                done[key] = rec  # remembered so it gets retried below
    return done


def append_ckpt(path: Path, rec: dict) -> None:
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def run_pass1(segments: list[dict]) -> None:
    ckpt = CKPT_DIR / PASS1_CKPT_NAME
    done = load_ckpt(ckpt)
    todo = [s for s in segments if s["id"] not in done or not done[s["id"]].get("ok")]
    log(f"🔍 PASS 1: {len(segments)} segments ({len([d for d in done.values() if d.get('ok')])} ok, {len(todo)} to process)")

    def work(seg: dict) -> None:
        rec = pass1_segment(seg)
        rec["id"] = seg["id"]
        prev = done.get(seg["id"])
        rec["attempts"] = (int(prev.get("attempts", 0) or 0) if prev else 0) + 1
        append_ckpt(ckpt, rec)
        n = len(rec.get("inquiries", [])) if rec.get("ok") else 0
        log(f"    [{seg['chat'][:40]}] seg {seg['index']+1}: {'✅ ' + str(n) + ' inquiries' if rec.get('ok') else '❌ ' + rec.get('error', 'failed')} (attempt {rec['attempts']})")

    if DRY_RUN:
        log("  (DRY_RUN — no API calls, skipping)")
        return
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = [ex.submit(work, s) for s in todo]
        for f in as_completed(futures):
            f.result()


def run_pass2(inquiries: list[dict]) -> None:
    ckpt = CKPT_DIR / PASS2_CKPT_NAME
    done = load_ckpt(ckpt)
    system_prompt = build_pass2_prompt()
    todo = [i for i in inquiries if i["id"] not in done or not done[i["id"]].get("ok")]
    log(f"✍️  PASS 2: {len(inquiries)} inquiries ({len([d for d in done.values() if d.get('ok')])} done, {len(todo)} to process)")

    def work(inq: dict) -> None:
        ideal = pass2_ideal_response(inq, system_prompt)
        rec = {"id": inq["id"], "ok": ideal is not None, "ideal_response": ideal}
        prev = done.get(inq["id"])
        rec["attempts"] = (int(prev.get("attempts", 0) or 0) if prev else 0) + 1
        append_ckpt(ckpt, rec)
        log(f"    {inq['id']}: {'✅ ideal response' if ideal else '❌ failed'} (attempt {rec['attempts']})")

    if DRY_RUN:
        log("  (DRY_RUN — no API calls, skipping)")
        return
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = [ex.submit(work, i) for i in todo]
        for f in as_completed(futures):
            f.result()


# ═══════════════════════════════════════════════════════════════════════
# FINALIZE
# ═══════════════════════════════════════════════════════════════════════

MEDIA_MARKER_RE = re.compile(r"^\[media[^\]]*\]$")

def clean_inquiry(inq: dict) -> dict:
    """Normalize an extracted inquiry: drop media markers from the message
    list and rebuild the plain-text query from what remains."""
    inq = dict(inq)
    msgs = inq.get("customer_messages", [])
    if isinstance(msgs, list):
        cleaned = [m for m in msgs if isinstance(m, str) and not MEDIA_MARKER_RE.match(m.strip())]
        inq["customer_messages"] = cleaned
        inq["customer_query_text"] = "\n".join(cleaned).strip()
    return inq


def finalize() -> None:
    from collections import defaultdict

    pass1 = load_ckpt(CKPT_DIR / PASS1_CKPT_NAME)
    pass2 = load_ckpt(CKPT_DIR / PASS2_CKPT_NAME)

    inquiries = []
    chat_analyses: dict[str, dict] = {}
    for rec in pass1.values():
        if not rec.get("ok"):
            continue
        chat = rec.get("chat", "?")
        analysis = chat_analyses.setdefault(chat, {
            "source_file": chat + ".txt",
            "segments": [],
        })
        analysis["segments"].append({
            "segment_id": rec["seg_id"],
            "segment_index": rec.get("segment_index"),
            "date_range": rec.get("segment_summary", {}).get("date_range"),
            "summary": rec.get("segment_summary", {}).get("summary"),
            "services_discussed": rec.get("segment_summary", {}).get("services_discussed", []),
            "prices_mentioned": rec.get("segment_summary", {}).get("prices_mentioned", []),
            "customer_issues": rec.get("segment_summary", {}).get("customer_issues", []),
            "sales_opportunities_missed": rec.get("segment_summary", {}).get("sales_opportunities_missed", []),
        })
        for inq in rec.get("inquiries", []):
            if not isinstance(inq, dict):
                continue
            inq = clean_inquiry(inq)
            p2 = pass2.get(inq["id"], {})
            entry = {
                "id": inq.get("id"),
                "source_file": inq.get("source_file"),
                "segment_id": inq.get("segment_id"),
                "date_range": inq.get("date_range"),
                "customer_messages": inq.get("customer_messages", []),
                "customer_query_text": inq.get("customer_query_text", ""),
                "context_summary": inq.get("context_summary", ""),
                "what_customer_wants": inq.get("what_customer_wants", ""),
                "intent": inq.get("intent", "other"),
                "expected_behavior": inq.get("expected_behavior", "other"),
                "needs_clarification": bool(inq.get("needs_clarification")),
                "missing_info": inq.get("missing_info", []),
                "key_details": inq.get("key_details", {}),
                "what_paberin_quoted": inq.get("what_paberin_quoted", {}),
                "actual_outcome": inq.get("outcome", "unknown"),
                "ideal_response": p2.get("ideal_response"),
                "conversation_quality_note": inq.get("conversation_quality_note", ""),
            }
            inquiries.append(entry)

    # sort analyses by segment index; sort inquiries by source then segment
    for a in chat_analyses.values():
        a["segments"].sort(key=lambda s: s.get("segment_index") or 0)
    inquiries.sort(key=lambda i: (i.get("source_file") or "", str(i.get("segment_id") or "")))

    intent_counts = defaultdict(int)
    for i in inquiries:
        intent_counts[i.get("intent", "other")] += 1
    behavior_counts = defaultdict(int)
    for i in inquiries:
        behavior_counts[i.get("expected_behavior", "other")] += 1

    dataset = {
        "meta": {
            "generated_at": datetime.now().isoformat(),
            "pipeline_version": "3.0",
            "model_used": MODEL,
            "total_cases": len(inquiries),
            "with_ideal_responses": sum(1 for i in inquiries if i.get("ideal_response")),
            "intent_distribution": dict(intent_counts),
            "expected_behavior_distribution": dict(behavior_counts),
            "chats_analyzed": len(chat_analyses),
            "source": "WhatsApp chat exports analyzed by Agnes 2.0 Flash",
            "brand": "%(brand)s",
            "pricing_note": "All amounts in ₦ Naira. NO VAT. Full payment before production.",
            "service_catalog_version": "June 2026",
        },
        "test_cases": inquiries,
    }
    out = OUTPUT_DIR / DATASET_OUT_NAME
    out.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")

    analyses_out = OUTPUT_DIR / ANALYSES_OUT_NAME
    analyses_out.write_text(json.dumps({
        "meta": {
            "generated_at": datetime.now().isoformat(),
            "pipeline_version": "3.0",
            "model_used": MODEL,
            "chats_analyzed": len(chat_analyses),
            "source": "WhatsApp chat exports analyzed by Agnes 2.0 Flash",
        },
        "chats": [chat_analyses[k] for k in sorted(chat_analyses)],
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    log(f"\n💾 Dataset: {out}")
    log(f"   {len(inquiries)} test cases, {sum(1 for i in inquiries if i.get('ideal_response'))} with ideal responses, {len(chat_analyses)} chats analyzed")
    log(f"💾 Analyses: {analyses_out}")
    log("\n📊 Intent distribution:")
    for k, v in sorted(intent_counts.items(), key=lambda x: -x[1]):
        log(f"  {k:20s} {v:5d}")
    log("\n📊 Expected behavior distribution:")
    for k, v in sorted(behavior_counts.items(), key=lambda x: -x[1]):
        log(f"  {k:20s} {v:5d}")


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main() -> None:
    log("=" * 72)
    log("%s CHAT DATASET GENERATOR v3.0 — Agnes-powered pipeline" % BRAND.upper())
    log("=" * 72)
    if not AGNES_API_KEY:
        log("ERROR: AGNES_API_KEY not found in env or .env.local")
        sys.exit(1)
    log(f"Model: {MODEL} | concurrency: {CONCURRENCY} | segment chars: {SEGMENT_CHARS}"
        + (" | DRY_RUN" if DRY_RUN else ""))

    log(f"Brand: {BRAND} | pass1: {PASS1_CKPT_NAME} | pass2: {PASS2_CKPT_NAME} | zips: {ZIPS_DIR}")
    chat_files = extract_and_prepare()
    log(f"📄 {len(chat_files)} chat transcripts ready in {CHATS_DIR}")

    segments = []
    processed_chats = 0
    for fp in chat_files[:MAX_CHATS] if MAX_CHATS else chat_files:
        segs = parse_and_segment(fp)
        for s in segs:
            s["id"] = sha_id(s["chat"], str(s["index"]))
        segments.extend(segs)
        processed_chats += 1
    if MAX_SEGMENTS:
        segments = segments[:MAX_SEGMENTS]
    total_chars = sum(len(s["text"]) for s in segments)
    log(f"🧩 {len(segments)} segments from {processed_chats} chats "
        f"({total_chars:,} chars of transcript)")

    if STAGE in ("all", "pass1"):
        run_pass1(segments)
    if STAGE in ("all", "pass2"):
        # Load inquiries from pass1 checkpoint
        pass1 = load_ckpt(CKPT_DIR / PASS1_CKPT_NAME)
        inquiries = []
        for rec in pass1.values():
            if rec.get("ok"):
                inquiries.extend(i for i in rec.get("inquiries", []) if isinstance(i, dict) and i.get("id"))
        run_pass2(inquiries)
    if STAGE in ("all", "finalize"):
        finalize()


if __name__ == "__main__":
    main()
