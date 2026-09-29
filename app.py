from flask import Flask, render_template, Response, request, jsonify
from pathlib import Path
import threading
import time

import cv2
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "mini-project-site" / "html"),
    static_folder=str(BASE_DIR / "mini-project-site"),
    static_url_path="/static",
)

CAMERAS = ("cam1", "cam2")
frame_lock = threading.Lock()
latest_frames = {cam: None for cam in CAMERAS}
last_seen = {cam: None for cam in CAMERAS}


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
    return jsonify({"status": "ok"})


@app.route("/upload_frame", methods=["POST"])
def upload_frame():
    cam_id = request.args.get("cam_id", "cam1")
    if cam_id not in CAMERAS:
        return jsonify({"ok": False, "error": "unknown camera"}), 400

    data = request.get_data()
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return jsonify({"ok": False, "error": "invalid jpeg"}), 400

    with frame_lock:
        latest_frames[cam_id] = image
        last_seen[cam_id] = time.time()

    return jsonify({"ok": True, "cam_id": cam_id})


def mjpeg(cam_id):
    while True:
        with frame_lock:
            frame = None if latest_frames[cam_id] is None else latest_frames[cam_id].copy()

        if frame is None:
            blank = np.zeros((240, 320, 3), dtype=np.uint8)
            cv2.putText(blank, "WAITING FOR CAMERA", (35, 120),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
            frame = blank

        ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if ok:
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" +
                   encoded.tobytes() + b"\r\n")
        time.sleep(0.04)


@app.route("/video_feed")
def video_feed():
    cam_id = request.args.get("cam_id", "cam1")
    if cam_id not in CAMERAS:
        return "unknown camera", 404
    return Response(mjpeg(cam_id), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/camera_status")
def camera_status():
    now = time.time()
    result = {}
    with frame_lock:
        for cam in CAMERAS:
            seen = last_seen[cam]
            result[cam] = {
                "connected": seen is not None and now - seen < 5,
                "last_seen_seconds": None if seen is None else round(now - seen, 2),
            }
    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True, debug=True)
