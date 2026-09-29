from flask import Flask, render_template, Response, request, jsonify
from pathlib import Path
import os
import requests

BASE_DIR = Path(__file__).resolve().parent

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "mini-project-site" / "html"),
    static_folder=str(BASE_DIR / "mini-project-site"),
    static_url_path="/static",
)

CAMERAS = ("cam1", "cam2")
AI_SERVER_BASE = os.environ.get("AI_SERVER_BASE", "http://192.168.2.100:5000").rstrip("/")
HTTP_TIMEOUT = 3


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/control")
def control():
    return render_template("control.html")


@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "ai_server": AI_SERVER_BASE,
    })


def _valid_camera(cam_id):
    return cam_id in CAMERAS


@app.route("/video_feed")
def video_feed():
    """Proxy the processed MJPEG stream from the remote Traffic AI server."""
    cam_id = request.args.get("cam_id", "cam1")
    if not _valid_camera(cam_id):
        return "unknown camera", 404

    upstream_url = f"{AI_SERVER_BASE}/video_feed"
    try:
        upstream = requests.get(
            upstream_url,
            params={"cam_id": cam_id},
            stream=True,
            timeout=(HTTP_TIMEOUT, None),
        )
        upstream.raise_for_status()
    except requests.RequestException as exc:
        return f"AI camera server unavailable: {exc}", 502

    content_type = upstream.headers.get(
        "Content-Type",
        "multipart/x-mixed-replace; boundary=frame",
    )

    def generate():
        try:
            for chunk in upstream.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return Response(
        generate(),
        content_type=content_type,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@app.route("/camera_status")
def camera_status():
    """Translate the remote AI server debug status into dashboard camera state."""
    try:
        response = requests.get(f"{AI_SERVER_BASE}/debug_status", timeout=HTTP_TIMEOUT)
        response.raise_for_status()
        remote = response.json()
    except (requests.RequestException, ValueError):
        return jsonify({
            cam: {"connected": False, "last_seen_seconds": None}
            for cam in CAMERAS
        }), 200

    result = {}
    for cam in CAMERAS:
        info = remote.get(cam, {}) if isinstance(remote, dict) else {}
        # The AI server reports frame shapes after receiving/processing a frame.
        connected = bool(info.get("raw_shape") or info.get("normalized_shape"))
        result[cam] = {
            "connected": connected,
            "last_seen_seconds": None,
            "detections": info.get("detections", 0),
            "tracked": info.get("tracked", 0),
            "last_error": info.get("last_error", ""),
        }
    return jsonify(result)


@app.route("/stream_alerts")
def stream_alerts():
    """Proxy real-time SSE alerts from the remote Traffic AI server."""
    try:
        upstream = requests.get(
            f"{AI_SERVER_BASE}/stream_alerts",
            stream=True,
            timeout=(HTTP_TIMEOUT, None),
            headers={"Accept": "text/event-stream"},
        )
        upstream.raise_for_status()
    except requests.RequestException as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502

    def generate():
        try:
            for line in upstream.iter_lines(decode_unicode=True):
                if line is not None:
                    yield line + "\n"
        finally:
            upstream.close()

    return Response(
        generate(),
        content_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/ai_status")
def ai_status():
    """Expose the remote debug payload for dashboard diagnostics."""
    try:
        response = requests.get(f"{AI_SERVER_BASE}/debug_status", timeout=HTTP_TIMEOUT)
        response.raise_for_status()
        return Response(
            response.content,
            status=response.status_code,
            content_type=response.headers.get("Content-Type", "application/json"),
        )
    except requests.RequestException as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


if __name__ == "__main__":
    print(f"Dashboard -> Traffic AI server: {AI_SERVER_BASE}")
    app.run(host="0.0.0.0", port=5000, threaded=True, debug=True)
