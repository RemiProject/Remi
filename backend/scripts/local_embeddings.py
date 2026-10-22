"""Local OpenAI-compatible embedding endpoint backed by FastEmbed."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os

from fastembed import TextEmbedding
from fastembed.common.model_description import ModelSource, PoolingType


MODEL = os.environ.get(
    "LOCAL_EMBEDDING_MODEL",
    "intfloat/multilingual-e5-small",
)
HOST = os.environ.get("LOCAL_EMBEDDING_HOST", "127.0.0.1")
PORT = int(os.environ.get("LOCAL_EMBEDDING_PORT", "8088"))
CACHE = os.environ.get("LOCAL_EMBEDDING_CACHE", ".local-models")

print(f"Loading local embedding model: {MODEL}", flush=True)
TextEmbedding.add_custom_model(
    model=MODEL,
    pooling=PoolingType.MEAN,
    normalization=True,
    sources=ModelSource(hf=MODEL),
    dim=384,
    model_file="onnx/model_O4.onnx",
    description="Multilingual E5 small embedding model",
    license="mit",
    size_in_gb=0.24,
    additional_files=["tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"],
)
embedder = TextEmbedding(model_name=MODEL, cache_dir=CACHE, threads=2)
print(f"Embedding endpoint ready on http://{HOST}:{PORT}/v1/embeddings", flush=True)


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"status": "ok", "model": MODEL, "dimensions": 384})
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/v1/embeddings":
            self.send_json(404, {"error": "not found"})
            return
        try:
            size = int(self.headers.get("content-length", "0"))
            if size <= 0 or size > 1_000_000:
                self.send_json(413, {"error": "request size is invalid"})
                return
            request = json.loads(self.rfile.read(size))
            if request.get("model") != MODEL:
                self.send_json(400, {"error": "requested model does not match configured model"})
                return
            inputs = request.get("input")
            texts = [inputs] if isinstance(inputs, str) else inputs
            if not isinstance(texts, list) or not texts or not all(isinstance(text, str) for text in texts):
                self.send_json(400, {"error": "input must be a string or a non-empty string array"})
                return
            vectors = list(embedder.embed(texts, batch_size=32))
            data = [{"object": "embedding", "index": i, "embedding": vector.tolist()} for i, vector in enumerate(vectors)]
            if any(len(item["embedding"]) != 384 for item in data):
                self.send_json(500, {"error": "model returned unexpected dimensions"})
                return
            self.send_json(200, {"object": "list", "data": data, "model": MODEL})
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_json(400, {"error": "invalid request"})
        except Exception:
            self.send_json(500, {"error": "embedding failed"})

    def log_message(self, _format: str, *_args: object) -> None:
        return


ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
