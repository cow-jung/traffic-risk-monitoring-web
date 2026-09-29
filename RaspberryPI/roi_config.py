from __future__ import annotations

import copy
import json
import os
import threading
from pathlib import Path

import numpy as np

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "traffic_roi_config.json"
FRAME_WIDTH = 320
FRAME_HEIGHT = 240

DEFAULT_CONFIG = {
    "version": 1,
    "frame_size": [FRAME_WIDTH, FRAME_HEIGHT],
    "cameras": {
        "cam1": {
            "parking_rois": [
                [[5, 80], [35, 80], [35, 235], [5, 235]],
                [[220, 85], [315, 100], [315, 235], [200, 235]],
            ],
            "main_road_roi": [[40, 80], [210, 85], [195, 235], [40, 235]],
            "wrong_way": {
                "start_line": [[50, 95], [195, 95]],
                "end_line": [[42, 205], [188, 205]],
            },
        },
        "cam2": {
            "parking_rois": [
                [[10, 80], [310, 75], [310, 105], [10, 105]],
            ],
            "main_road_roi": [[10, 105], [310, 105], [310, 235], [10, 235]],
            "wrong_way": {
                "start_line": [[160, 90], [280, 85]],
                "end_line": [[40, 195], [180, 185]],
            },
        },
    },
}

_lock = threading.RLock()
_cache: dict | None = None
_cache_mtime_ns: int | None = None

def _point(value):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValueError(f"잘못된 좌표 형식: {value!r}")
    x = int(round(float(value[0])))
    y = int(round(float(value[1])))
    if not (0 <= x < FRAME_WIDTH and 0 <= y < FRAME_HEIGHT):
        raise ValueError(f"좌표가 {FRAME_WIDTH}x{FRAME_HEIGHT} 범위를 벗어났습니다: {(x, y)}")
    return [x, y]

def _polygon(value, name):
    if not isinstance(value, list) or len(value) < 3:
        raise ValueError(f"{name}: 폴리곤은 최소 3점이 필요합니다.")
    return [_point(p) for p in value]

def _line(value, name):
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError(f"{name}: 선은 정확히 2점이 필요합니다.")
    return [_point(value[0]), _point(value[1])]

def validate_config(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("ROI 설정 최상위 값은 객체여야 합니다.")
    cameras = data.get("cameras")
    if not isinstance(cameras, dict):
        raise ValueError("cameras 설정이 없습니다.")
    normalized = {"version": int(data.get("version", 1)), "frame_size": [FRAME_WIDTH, FRAME_HEIGHT], "cameras": {}}
    for cam_id in ("cam1", "cam2"):
        cam = cameras.get(cam_id)
        if not isinstance(cam, dict):
            raise ValueError(f"{cam_id} 설정이 없습니다.")
        parking = cam.get("parking_rois", [])
        if not isinstance(parking, list):
            raise ValueError(f"{cam_id}.parking_rois는 배열이어야 합니다.")
        parking_rois = [_polygon(poly, f"{cam_id}.parking_rois[{idx}]") for idx, poly in enumerate(parking)]
        if not parking_rois:
            raise ValueError(f"{cam_id}: parking ROI가 최소 1개 필요합니다.")
        main_road = _polygon(cam.get("main_road_roi"), f"{cam_id}.main_road_roi")
        wrong = cam.get("wrong_way")
        if not isinstance(wrong, dict):
            raise ValueError(f"{cam_id}.wrong_way 설정이 없습니다.")
        start_line = _line(wrong.get("start_line"), f"{cam_id}.wrong_way.start_line")
        end_line = _line(wrong.get("end_line"), f"{cam_id}.wrong_way.end_line")
        normalized["cameras"][cam_id] = {"parking_rois": parking_rois, "main_road_roi": main_road, "wrong_way": {"start_line": start_line, "end_line": end_line}}
    if "updated_at" in data:
        normalized["updated_at"] = str(data["updated_at"])
    return normalized

def save_config(data: dict, path: Path = CONFIG_PATH) -> dict:
    normalized = validate_config(data)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(json.dumps(normalized, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(temp_path, path)
    return normalized

def ensure_config(path: Path = CONFIG_PATH) -> None:
    path = Path(path)
    if not path.exists():
        save_config(copy.deepcopy(DEFAULT_CONFIG), path)

def load_config(path: Path = CONFIG_PATH, force: bool = False) -> dict:
    global _cache, _cache_mtime_ns
    path = Path(path)
    with _lock:
        ensure_config(path)
        mtime_ns = path.stat().st_mtime_ns
        if not force and _cache is not None and _cache_mtime_ns == mtime_ns:
            return copy.deepcopy(_cache)
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            normalized = validate_config(raw)
        except Exception as exc:
            if _cache is not None:
                print(f"[ROI CONFIG] 새 설정 로드 실패. 마지막 정상 설정 유지: {exc}")
                return copy.deepcopy(_cache)
            raise
        _cache = normalized
        _cache_mtime_ns = mtime_ns
        return copy.deepcopy(_cache)

def get_camera_geometry(cam_id: str, path: Path = CONFIG_PATH):
    config = load_config(path)
    if cam_id not in config["cameras"]:
        raise KeyError(f"등록되지 않은 카메라: {cam_id}")
    cam = config["cameras"][cam_id]
    parking_rois = [np.asarray(poly, dtype=np.int32) for poly in cam["parking_rois"]]
    main_road_roi = np.asarray(cam["main_road_roi"], dtype=np.int32)
    start_line = tuple(tuple(map(int, p)) for p in cam["wrong_way"]["start_line"])
    end_line = tuple(tuple(map(int, p)) for p in cam["wrong_way"]["end_line"])
    return parking_rois, main_road_roi, start_line, end_line

if __name__ == "__main__":
    ensure_config()
    print(f"ROI 설정 파일: {CONFIG_PATH}")
    print(json.dumps(load_config(force=True), indent=2, ensure_ascii=False))
