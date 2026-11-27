"""Giao diện web SmartBuy — server chỉ dùng thư viện chuẩn Python (không cần pip install).

Chạy:
    python codebase/web.py                 → mở http://127.0.0.1:8000
    python codebase/web.py --port 8765     (đổi cổng)
    python codebase/web.py --open          (tự mở trình duyệt)

Phục vụ thư mục frontend/ (HTML/CSS/JS tĩnh, không cần build) và các API:
    GET  /api/health                  model đang dùng (KHÔNG lộ key) + catalog đang dùng
    GET  /api/catalog?category=…      duyệt / tìm / lọc / sắp xếp — không gọi AI (UC-02)
    GET  /api/products/<id>           chi tiết + bằng chứng review (UC-03)
    GET  /api/products?ids=a,b        nhiều sản phẩm một lần (báo cáo, so sánh)
    GET  /api/compare?ids=a,b,c       kiểm tra luật so sánh + tiêu chí theo danh mục (UC-06)
    POST /api/agent                   gọi answer() trong codebase/agent.py, kèm trace thật (UC-04/05/07/08, UC-10)
    GET  /api/trace/<run_id>          sự kiện trace của một lượt gọi agent từ web

Hợp đồng với agent (không đổi hợp đồng của khung):
    - answer(text) -> {"output": str} như cũ. Eval / simulate không bị ảnh hưởng.
    - Muốn giao diện vẽ Top 3, điểm F/Q/E, bằng chứng, trạng thái…: trả thêm khoá "smartbuy" (dict) — xem
      frontend/README.md mục "Hợp đồng agent → giao diện". Eval chỉ đọc "output", khoá thêm được bỏ qua.
    - Muốn nhận ngữ cảnh từ web (bộ lọc, danh sách so sánh, nhu cầu hiện tại): khai báo answer(text, context=None).
      Server tự nhận ra và truyền context; eval vẫn gọi answer(text).

Lượt gọi từ web chỉ giữ trong bộ nhớ — KHÔNG ghi vào eval/ hay traces/ (những file đó chỉ do run.py tạo).
"""
import argparse
import datetime
import inspect
import json
import os
import sys
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FRONTEND = os.path.realpath(os.path.join(ROOT, "frontend"))
sys.path.insert(0, HERE)

import catalog  # noqa: E402  (cần sys.path ở trên)

MAX_BODY = 64 * 1024
TRACE_KEEP = 60
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".md": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}

_agent_lock = threading.Lock()   # tracing.py giữ trạng thái toàn cục → mỗi lúc chỉ một lượt gọi agent
_traces = {}
_trace_order = []
_mods = {}


def _load_codebase():
    """Nạp tracing / ai / agent khi cần. Lỗi nạp (vd lỗi cú pháp trong agent.py) không làm sập server."""
    if _mods.get("agent"):
        return _mods
    import tracing  # noqa: WPS433
    import ai       # noqa: WPS433
    import agent    # noqa: WPS433
    _mods.update(tracing=tracing, ai=ai, agent=agent)
    return _mods


def _model_info():
    try:
        ai = _load_codebase()["ai"]
        provider = getattr(ai, "MODEL_PROVIDER", "fake") or "fake"
        return {"provider": provider, "name": getattr(ai, "MODEL_NAME", "") or "", "fake": provider == "fake",
                "loaded": True, "error": None}
    except Exception as e:  # lỗi nạp codebase
        return {"provider": "?", "name": "", "fake": True, "loaded": False, "error": "%s: %s" % (type(e).__name__, e)}


def _accepts_context(fn):
    try:
        params = inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return False
    return "context" in params or any(p.kind == p.VAR_KEYWORD for p in params.values())


def _structured(res, output):
    """Lấy phần có cấu trúc cho giao diện: khoá "smartbuy" của answer(), hoặc output là JSON có khoá "state"."""
    if isinstance(res, dict) and isinstance(res.get("smartbuy"), dict):
        return res["smartbuy"]
    text = (output or "").strip()
    if text.startswith("{") and text.endswith("}"):
        try:
            obj = json.loads(text)
        except ValueError:
            return None
        if isinstance(obj, dict) and ("state" in obj or "recommendations" in obj):
            return obj
    return None


def run_agent(text, context):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    run_id = "web-%s-%s" % (stamp, uuid.uuid4().hex[:4])
    model = _model_info()
    out = {"run_id": run_id, "output": "", "smartbuy": None, "model": model, "trace": None, "events": [],
           "error": None, "context_passed": False}
    try:
        mods = _load_codebase()
    except Exception as e:
        out["error"] = {"type": "LOAD_ERROR", "message": "Không nạp được codebase/: %s: %s" % (type(e).__name__, e)}
        return out
    tracing, answer = mods["tracing"], mods["agent"].answer
    with _agent_lock:
        tracing.begin(run_id)
        t0 = time.perf_counter()
        res = None
        try:
            if _accepts_context(answer):
                out["context_passed"] = True
                res = answer(text, context=context)
            else:
                res = answer(text)
        except NotImplementedError as e:
            out["error"] = {"type": "NOT_CONNECTED", "message": str(e)}
        except Exception as e:  # lỗi gọi model / công cụ: báo đúng là lỗi, không giả làm "không có kết quả"
            out["error"] = {"type": "AGENT_ERROR", "message": "%s: %s" % (type(e).__name__, e),
                            "where": traceback.extract_tb(e.__traceback__)[-1].filename.replace(ROOT, "")
                            if e.__traceback__ else ""}
        latency_ms = int((time.perf_counter() - t0) * 1000)
        summary, events = tracing.end()
    if res is not None:
        if isinstance(res, dict) and isinstance(res.get("output"), str):
            out["output"] = res["output"]
        elif isinstance(res, str):
            out["output"] = res
        else:
            out["error"] = {"type": "CONTRACT", "message": "answer() phải trả dict có khoá \"output\" là chuỗi"}
        out["smartbuy"] = _structured(res, out["output"])
    summary = dict(summary)
    summary["latency_ms"] = latency_ms
    out["trace"] = summary
    out["events"] = events
    _traces[run_id] = {"run_id": run_id, "text": text, "context": context, "summary": summary, "events": events,
                       "output": out["output"], "error": out["error"], "model": model,
                       "at": datetime.datetime.now().isoformat(timespec="seconds")}
    _trace_order.append(run_id)
    while len(_trace_order) > TRACE_KEEP:
        _traces.pop(_trace_order.pop(0), None)
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "SmartBuyWeb/1.0"

    # ---------- tiện ích ----------
    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _error(self, code, message, kind="BAD_REQUEST"):
        self._send(code, {"error": {"type": kind, "message": message}})

    def log_message(self, fmt, *args):  # gọn hơn mặc định, bỏ log file tĩnh
        path = getattr(self, "path", "")
        if path.startswith("/api/"):
            sys.stdout.write("  %s %s\n" % (self.command, path[:120]))

    # ---------- GET ----------
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        url = urlparse(self.path)
        path = unquote(url.path)
        qs = {k: v if len(v) > 1 else v[0] for k, v in parse_qs(url.query).items()}
        try:
            if path == "/api/health":
                return self._send(200, {"ok": True, "model": _model_info(), "catalog": catalog.meta()})
            if path == "/api/catalog":
                return self._send(200, catalog.search(qs))
            if path == "/api/products":
                items, missing = catalog.details(catalog._list(qs.get("ids")))
                return self._send(200, {"items": items, "missing": missing})
            if path.startswith("/api/products/"):
                pid = path.rsplit("/", 1)[-1]
                d = catalog.detail(pid, raw=True)
                if not d:
                    return self._error(404, "Không có sản phẩm %s trong catalog đã công bố" % pid, "NOT_FOUND")
                return self._send(200, d)
            if path == "/api/compare":
                return self._send(200, catalog.compare(qs.get("ids")))
            if path.startswith("/api/trace/"):
                t = _traces.get(path.rsplit("/", 1)[-1])
                return self._send(200, t) if t else self._error(404, "Không còn trace này (server chỉ giữ %d lượt gần nhất)" % TRACE_KEEP, "NOT_FOUND")
            if path.startswith("/api/"):
                return self._error(404, "Không có API %s" % path, "NOT_FOUND")
        except catalog.CatalogError as e:
            return self._error(400, str(e), "INVALID_INPUT")
        except Exception as e:  # lỗi truy xuất catalog: báo lỗi, KHÔNG giả làm danh sách rỗng (EF-03)
            traceback.print_exc()
            return self._error(500, "Lỗi truy xuất catalog: %s: %s" % (type(e).__name__, e), "TOOL_ERROR")
        return self._static(path)

    def _static(self, path):
        rel = path.lstrip("/") or "index.html"
        full = os.path.realpath(os.path.join(FRONTEND, rel))
        if not (full == FRONTEND or full.startswith(FRONTEND + os.sep)):
            return self._error(403, "Không được truy cập ngoài frontend/", "FORBIDDEN")
        if os.path.isdir(full):
            full = os.path.join(full, "index.html")
        if not os.path.isfile(full):
            return self._error(404, "Không có file %s" % rel, "NOT_FOUND")
        with open(full, "rb") as f:
            data = f.read()
        ext = os.path.splitext(full)[1].lower()
        self._send(200, data, MIME.get(ext, "application/octet-stream"))

    # ---------- POST ----------
    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/agent":
            return self._error(404, "Không có API %s" % path, "NOT_FOUND")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self._error(413 if length > MAX_BODY else 400, "Nội dung gửi lên rỗng hoặc quá lớn")
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._error(400, "Nội dung không phải JSON hợp lệ")
        text = (body.get("text") or "").strip() if isinstance(body, dict) else ""
        if not text:
            return self._error(400, "Thiếu nội dung câu hỏi")
        if len(text) > 2000:
            return self._error(400, "Câu hỏi quá dài (tối đa 2000 ký tự)")
        context = body.get("context") if isinstance(body.get("context"), dict) else {}
        self._send(200, run_agent(text, context))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Giao diện web SmartBuy (thư viện chuẩn Python)")
    ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    ap.add_argument("--open", action="store_true", help="tự mở trình duyệt")
    args = ap.parse_args(argv)
    try:
        httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as e:
        print("Không mở được cổng %d (%s). Thử: python codebase/web.py --port %d" % (args.port, e, args.port + 1))
        return 1
    url = "http://%s:%d" % ("127.0.0.1" if args.host in ("0.0.0.0", "") else args.host, args.port)
    m, c = _model_info(), catalog.meta()
    print("SmartBuy web → %s" % url)
    print("  catalog: %s (%s · %d sản phẩm đã duyệt%s)" % (c["source"], c["version"], c["published"],
                                                         " · DỮ LIỆU MINH HỌA" if c["synthetic"] else ""))
    print("  model:   %s%s" % (m["provider"], (" · " + m["name"]) if m["name"] else "")
          + ("  (chế độ giả — chưa nối model)" if m["fake"] else ""))
    if m.get("error"):
        print("  ⚠ không nạp được codebase/: %s" % m["error"])
    print("  Dừng: Ctrl+C")
    if args.open:
        import webbrowser
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
