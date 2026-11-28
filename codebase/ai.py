"""Nối model — chỗ DUY NHẤT trong bản chạy thử gọi model AI.

Hợp đồng (giữ nguyên để khung đo được token):
    call_model(system: str, user: str) -> dict với 4 khoá
        "text":       str   chữ model trả về
        "model":      str   tên model đã gọi (để tra giá ở bảng giá model)
        "tokens_in":  int   số token vào, lấy từ trường usage trong phản hồi API — KHÔNG ước lượng
        "tokens_out": int   số token ra, gồm cả token suy luận / suy nghĩ nếu API tính riêng
    @model_call (từ tracing.py) tự ghi mỗi lần gọi vào trace; agent.py gọi call_model bao nhiêu lần
    cũng được, khung tự cộng token.
    Lỗi gọi model (hết lượt, sai key, mất mạng): để exception bay ra — khung ghi lỗi vào cột error.
    Riêng HTTP 429 / 5xx được thử lại tối đa MAX_RETRY lần (nghỉ tăng dần) trước khi báo lỗi.

Chế độ giả (mặc định khi .env chưa có MODEL_PROVIDER, hoặc MODEL_PROVIDER=fake):
    trả một câu giả cố định, model "fake", token 0. Lượt `run.py eval` / `run.py simulate` chạy bằng model giả
    KHÔNG được tính. agent.py nhận ra câu giả (không phải JSON) và chạy luật dự phòng bằng code.

Nhà cung cấp hỗ trợ (đặt trong .env, xem docs/connect-model.md):
    MODEL_PROVIDER=openai     MODEL_NAME=gpt-4o-mini …     (MODEL_BASE_URL để dùng API kiểu OpenAI khác, vd DeepSeek)
    MODEL_PROVIDER=anthropic  MODEL_NAME=claude-haiku-5-5 …
    MODEL_PROVIDER=gemini     MODEL_NAME=gemini-2.5-flash …
    MODEL_PROVIDER=ollama     MODEL_NAME=qwen2.5:7b …      (không cần key; MODEL_BASE_URL nếu Ollama không ở localhost)
Chỉ dùng thư viện chuẩn (urllib) — không cần pip install. Không dán API key vào file này.
"""
import json
import os
import time
import urllib.error
import urllib.request

from tracing import model_call

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env(path=os.path.join(ROOT, ".env")):
    """Đọc file .env (KEY=VALUE mỗi dòng) vào biến môi trường, không ghi đè biến đã có. Khung — không cần sửa."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
MODEL_PROVIDER = (os.environ.get("MODEL_PROVIDER") or "fake").strip().lower()
MODEL_NAME = (os.environ.get("MODEL_NAME") or "").strip()
API_KEY = (os.environ.get("API_KEY") or "").strip()
BASE_URL = (os.environ.get("MODEL_BASE_URL") or "").strip().rstrip("/")

MAX_TOKENS = 1200      # đủ cho JSON xếp hạng 3 sản phẩm + lý do; tăng nếu câu trả lời bị cụt
TEMPERATURE = 0        # chạy lại cùng input ra gần cùng output → dễ so lượt 1 / lượt 2
TIMEOUT = 90
MAX_RETRY = 2
RETRIES = 0            # tổng số lần đã thử lại kể từ khi nạp module (429 / 5xx / mất mạng tạm thời)
SHOW_RAW = False       # True: in nguyên phản hồi API (tìm tên trường khi nối nhà cung cấp mới)


def post_json(url, headers, body, timeout=TIMEOUT):
    """POST JSON, trả JSON phản hồi. Thử lại khi 429 / 5xx / mất mạng tạm thời; lỗi khác báo ngay (không lộ key)."""
    data = json.dumps(body).encode("utf-8")
    last = None
    for attempt in range(MAX_RETRY + 1):
        req = urllib.request.Request(url, data=data, method="POST",
                                     headers=dict({"Content-Type": "application/json"}, **headers))
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                out = json.loads(r.read().decode("utf-8"))
            if SHOW_RAW:
                print(json.dumps(out, ensure_ascii=False, indent=2)[:3000])
            return out
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:300]
            last = RuntimeError("HTTP %d từ %s: %s" % (e.code, url.split("?")[0], msg))
            if e.code != 429 and e.code < 500:
                raise last
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = RuntimeError("Không gọi được %s: %s" % (url.split("?")[0], e))
        if attempt < MAX_RETRY:
            global RETRIES
            RETRIES += 1  # agent.py đọc số này để ghi retry_count vào trace (UC-10)
            time.sleep(2 * (attempt + 1))
    raise last


def _need_key():
    if not API_KEY:
        raise RuntimeError("Thiếu API_KEY trong .env cho MODEL_PROVIDER=%s" % MODEL_PROVIDER)
    if not MODEL_NAME:
        raise RuntimeError("Thiếu MODEL_NAME trong .env")


# ---------- từng nhà cung cấp: trả {"text", "tokens_in", "tokens_out"} ----------

def call_openai(system, user):
    _need_key()
    url = (BASE_URL or "https://api.openai.com/v1") + "/chat/completions"
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": user}]
    body = {"model": MODEL_NAME, "messages": messages, "max_tokens": MAX_TOKENS, "temperature": TEMPERATURE}
    if MODEL_NAME.startswith(("o1", "o3", "o4", "gpt-5")):   # model suy luận: không nhận temperature / max_tokens
        body.pop("temperature")
        body["max_completion_tokens"] = body.pop("max_tokens") * 4
    data = post_json(url, {"Authorization": "Bearer " + API_KEY}, body)
    u = data.get("usage") or {}
    return {"text": data["choices"][0]["message"].get("content") or "",
            "tokens_in": u.get("prompt_tokens", 0), "tokens_out": u.get("completion_tokens", 0)}


def call_claude(system, user):
    _need_key()
    data = post_json((BASE_URL or "https://api.anthropic.com") + "/v1/messages",
                     {"x-api-key": API_KEY, "anthropic-version": "2023-06-01"},
                     {"model": MODEL_NAME, "max_tokens": MAX_TOKENS, "temperature": TEMPERATURE,
                      "system": system or "", "messages": [{"role": "user", "content": user}]})
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    u = data.get("usage") or {}
    return {"text": text, "tokens_in": u.get("input_tokens", 0), "tokens_out": u.get("output_tokens", 0)}


def call_gemini(system, user):
    _need_key()
    url = (BASE_URL or "https://generativelanguage.googleapis.com/v1beta") + "/models/%s:generateContent" % MODEL_NAME
    body = {"contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": TEMPERATURE, "maxOutputTokens": MAX_TOKENS}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    data = post_json(url, {"x-goog-api-key": API_KEY}, body)
    parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    u = data.get("usageMetadata") or {}
    return {"text": "".join(p.get("text", "") for p in parts),
            "tokens_in": u.get("promptTokenCount", 0),
            "tokens_out": u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)}


def call_ollama(system, user):
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": user}]
    data = post_json((BASE_URL or "http://localhost:11434") + "/api/chat", {},
                     {"model": MODEL_NAME, "messages": messages, "stream": False,
                      "options": {"temperature": TEMPERATURE}}, timeout=300)
    return {"text": data["message"]["content"],
            "tokens_in": data.get("prompt_eval_count", 0), "tokens_out": data.get("eval_count", 0)}


PROVIDERS = {"openai": call_openai, "deepseek": call_openai, "anthropic": call_claude, "claude": call_claude,
             "gemini": call_gemini, "google": call_gemini, "ollama": call_ollama}


@model_call
def call_model(system: str, user: str) -> dict:
    if MODEL_PROVIDER == "fake":
        last = (user.strip().splitlines() or [""])[-1]
        return {"text": "[câu trả lời giả — chưa nối model] " + last[:60], "model": "fake", "tokens_in": 0, "tokens_out": 0}
    fn = PROVIDERS.get(MODEL_PROVIDER)
    if fn is None:
        raise NotImplementedError(
            "chưa hỗ trợ MODEL_PROVIDER=%s trong codebase/ai.py (có: %s) — xem docs/connect-model.md"
            % (MODEL_PROVIDER, ", ".join(sorted(PROVIDERS))))
    r = fn(system, user)
    return {"text": r["text"], "model": MODEL_NAME,
            "tokens_in": int(r["tokens_in"] or 0), "tokens_out": int(r["tokens_out"] or 0)}
