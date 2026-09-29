from __future__ import annotations

import argparse
import time
import cv2
import requests


def main():
    parser = argparse.ArgumentParser(description="Raspberry Pi camera -> Flask frame uploader")
    parser.add_argument("--server", default="http://192.168.2.76:5000", help="Flask server URL")
    parser.add_argument("--cam", default="cam1", choices=["cam1", "cam2"], help="camera id")
    parser.add_argument("--device", type=int, default=0, help="OpenCV camera device number")
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=480)
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--fps", type=float, default=10.0)
    args = parser.parse_args()

    url = f"{args.server.rstrip('/')}/upload_frame?cam_id={args.cam}"
    cap = cv2.VideoCapture(args.device)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    if not cap.isOpened():
        raise RuntimeError(f"카메라를 열 수 없습니다. device={args.device}")

    interval = 1.0 / max(args.fps, 1.0)
    print(f"[START] {args.cam} -> {url}")
    print("종료: Ctrl+C")

    try:
        while True:
            started = time.perf_counter()
            ok, frame = cap.read()
            if not ok:
                print("[WARN] 카메라 프레임 읽기 실패")
                time.sleep(0.2)
                continue

            ok, encoded = cv2.imencode(
                ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), args.quality]
            )
            if not ok:
                continue

            try:
                response = requests.post(
                    url,
                    data=encoded.tobytes(),
                    headers={"Content-Type": "image/jpeg"},
                    timeout=3,
                )
                if response.ok:
                    print(f"\r[OK] {args.cam} frame sent ({len(encoded)} bytes)   ", end="", flush=True)
                else:
                    print(f"\n[HTTP {response.status_code}] {response.text}")
            except requests.RequestException as exc:
                print(f"\n[ERROR] 서버 연결 실패: {exc}")
                time.sleep(1)

            elapsed = time.perf_counter() - started
            if elapsed < interval:
                time.sleep(interval - elapsed)
    except KeyboardInterrupt:
        print("\n[STOP]")
    finally:
        cap.release()


if __name__ == "__main__":
    main()
