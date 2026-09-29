from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

from roi_config import CONFIG_PATH, FRAME_HEIGHT, FRAME_WIDTH, load_config, save_config

DISPLAY_SCALE = 3
PANEL_WIDTH = 420

COLORS = {
    "parking": (255, 255, 0),
    "main": (0, 255, 255),
    "start": (255, 0, 0),
    "end": (0, 0, 255),
    "draft": (255, 255, 255),
}


def fetch_snapshot(server: str, cam_id: str) -> np.ndarray:
    url = f"{server.rstrip('/')}/roi_snapshot?cam_id={cam_id}"
    try:
        with urllib.request.urlopen(url, timeout=4) as response:
            data = response.read()
    except urllib.error.URLError as exc:
        raise RuntimeError(f"서버에서 {cam_id} 화면을 가져오지 못했습니다.\n서버 URL: {url}\n먼저 메인 서버와 라즈베리파이 카메라가 연결되어 있어야 합니다.\n{exc}") from exc
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None: raise RuntimeError("서버 응답을 이미지로 복원하지 못했습니다.")
    return cv2.resize(image, (FRAME_WIDTH, FRAME_HEIGHT))


def load_local_image(path: str) -> np.ndarray:
    image = cv2.imread(path)
    if image is None: raise FileNotFoundError(path)
    return cv2.resize(image, (FRAME_WIDTH, FRAME_HEIGHT))


def as_points(value): return [tuple(map(int, p)) for p in value]


def draw_geometry(frame, cam_cfg, selected=None):
    out = frame.copy()
    for idx, poly in enumerate(cam_cfg.get("parking_rois", [])):
        pts = np.asarray(poly, np.int32)
        if len(pts) >= 3:
            cv2.polylines(out, [pts], True, COLORS["parking"], 2)
            x, y = pts[0]; cv2.putText(out, f"P{idx + 1}", (int(x), max(12, int(y) - 4)), cv2.FONT_HERSHEY_SIMPLEX, .42, COLORS["parking"], 1, cv2.LINE_AA)
    main = np.asarray(cam_cfg.get("main_road_roi", []), np.int32)
    if len(main) >= 3:
        cv2.polylines(out, [main], True, COLORS["main"], 2)
        x, y = main[0]; cv2.putText(out, "MAIN", (int(x), max(12, int(y) - 4)), cv2.FONT_HERSHEY_SIMPLEX, .42, COLORS["main"], 1, cv2.LINE_AA)
    wrong = cam_cfg.get("wrong_way", {}); start = as_points(wrong.get("start_line", [])); end = as_points(wrong.get("end_line", []))
    if len(start) == 2:
        cv2.line(out, start[0], start[1], COLORS["start"], 2); cv2.putText(out, "START", start[0], cv2.FONT_HERSHEY_SIMPLEX, .42, COLORS["start"], 1, cv2.LINE_AA)
    if len(end) == 2:
        cv2.line(out, end[0], end[1], COLORS["end"], 2); cv2.putText(out, "END", end[0], cv2.FONT_HERSHEY_SIMPLEX, .42, COLORS["end"], 1, cv2.LINE_AA)
    return out


def choose_camera(cli_cam: str | None) -> str:
    if cli_cam in ("cam1", "cam2"): return cli_cam
    while True:
        value = input("카메라 선택 [1=cam1, 2=cam2]: ").strip().lower()
        if value in ("1", "cam1"): return "cam1"
        if value in ("2", "cam2"): return "cam2"
        print("1 또는 2를 입력하세요.")


def run_editor(cam_id: str, frame: np.ndarray, config: dict, server: str | None):
    cam_cfg = config["cameras"][cam_id]; selected = None; draft = []; message = "키를 눌러 편집할 영역을 선택하세요."; window = f"ROI EDITOR - {cam_id.upper()}"
    def begin(kind, index=0):
        nonlocal selected, draft, message
        selected=(kind,index); draft=[]; message={"parking":f"P{index+1} 새 폴리곤: 좌클릭으로 점 추가 -> ENTER 확정","main":"MAIN ROAD 새 폴리곤: 좌클릭으로 점 추가 -> ENTER 확정","start":"START LINE: 좌클릭 2점 -> ENTER 확정","end":"END LINE: 좌클릭 2점 -> ENTER 확정"}[kind]
    def commit():
        nonlocal selected,draft,message
        if selected is None:return
        kind,index=selected
        if kind in ("parking","main") and len(draft)<3: message="폴리곤은 최소 3점이 필요합니다."; return
        if kind in ("start","end") and len(draft)!=2: message="선은 정확히 2점이 필요합니다."; return
        points=[[int(x),int(y)] for x,y in draft]
        if kind=="parking":
            while len(cam_cfg["parking_rois"])<=index: cam_cfg["parking_rois"].append([[0,0],[1,0],[1,1]])
            cam_cfg["parking_rois"][index]=points
        elif kind=="main": cam_cfg["main_road_roi"]=points
        elif kind=="start": cam_cfg["wrong_way"]["start_line"]=points
        elif kind=="end": cam_cfg["wrong_way"]["end_line"]=points
        selected=None; draft=[]; message="현재 도형에 반영했습니다. W를 눌러 JSON에 저장하세요."
    def mouse(event,x,y,flags,param):
        nonlocal message
        if event!=cv2.EVENT_LBUTTONDOWN or selected is None:return
        if x>=FRAME_WIDTH*DISPLAY_SCALE:return
        px=int(np.clip(round(x/DISPLAY_SCALE),0,FRAME_WIDTH-1)); py=int(np.clip(round(y/DISPLAY_SCALE),0,FRAME_HEIGHT-1)); kind,_=selected
        if kind in ("start","end") and len(draft)>=2: message="선은 2점만 사용합니다. Backspace로 수정하거나 ENTER로 확정하세요."; return
        draft.append((px,py))
    cv2.namedWindow(window,cv2.WINDOW_AUTOSIZE); cv2.setMouseCallback(window,mouse)
    while True:
        base=draw_geometry(frame,cam_cfg,selected); scaled=cv2.resize(base,(FRAME_WIDTH*DISPLAY_SCALE,FRAME_HEIGHT*DISPLAY_SCALE),interpolation=cv2.INTER_NEAREST)
        if draft:
            pts=np.asarray([(x*DISPLAY_SCALE,y*DISPLAY_SCALE) for x,y in draft],np.int32)
            for p in pts: cv2.circle(scaled,tuple(p),6,COLORS["draft"],-1)
            if len(pts)>=2: cv2.polylines(scaled,[pts],False,COLORS["draft"],2)
        canvas=np.zeros((FRAME_HEIGHT*DISPLAY_SCALE,FRAME_WIDTH*DISPLAY_SCALE+PANEL_WIDTH,3),np.uint8); canvas[:,:FRAME_WIDTH*DISPLAY_SCALE]=scaled; x0=FRAME_WIDTH*DISPLAY_SCALE+18
        lines=[f"CAMERA: {cam_id.upper()}   320x240","","[1] Parking ROI 1","[2] Parking ROI 2","[3] Parking ROI 3","[M] Main-road ROI","[S] Wrong-way START line","[E] Wrong-way END line","","Left click : add point","Enter       : commit current shape","Backspace   : undo point","Esc         : cancel current draft","F           : refresh camera snapshot","W           : save JSON","Q           : quit","",f"CONFIG: {CONFIG_PATH.name}"]
        y=32
        for line in lines: cv2.putText(canvas,line,(x0,y),cv2.FONT_HERSHEY_SIMPLEX,.52,(220,220,220),1,cv2.LINE_AA); y+=31
        cv2.putText(canvas,"STATUS:",(x0,585),cv2.FONT_HERSHEY_SIMPLEX,.52,(0,255,255),1,cv2.LINE_AA); yy=616
        for line in ([message[i:i+42] for i in range(0,len(message),42)] or [""])[:3]: cv2.putText(canvas,line,(x0,yy),cv2.FONT_HERSHEY_SIMPLEX,.48,(255,255,255),1,cv2.LINE_AA); yy+=27
        cv2.imshow(window,canvas); key=cv2.waitKey(30)&0xFF
        if key==ord('1'):begin("parking",0)
        elif key==ord('2'):begin("parking",1)
        elif key==ord('3'):begin("parking",2)
        elif key in (ord('m'),ord('M')):begin("main",0)
        elif key in (ord('s'),ord('S')):begin("start",0)
        elif key in (ord('e'),ord('E')):begin("end",0)
        elif key in (13,10):commit()
        elif key==8 and draft: draft.pop(); message="마지막 점을 취소했습니다."
        elif key==27: selected=None; draft=[]; message="현재 편집을 취소했습니다."
        elif key in (ord('w'),ord('W')):
            try: config["updated_at"]=datetime.now().isoformat(timespec="seconds"); save_config(config); message="저장 완료. 메인 서버가 다음 프레임부터 자동 재로딩합니다."; print(f"[SAVED] {CONFIG_PATH}")
            except Exception as exc: message=f"저장 실패: {exc}"; print(message)
        elif key in (ord('f'),ord('F')):
            if server is None: message="--image 모드에서는 실시간 새로고침을 사용할 수 없습니다."
            else:
                try: frame[:]=fetch_snapshot(server,cam_id); message="카메라 스냅샷을 새로 불러왔습니다."
                except Exception as exc: message=f"새로고침 실패: {exc}"
        elif key in (ord('q'),ord('Q')):break
        try:
            if cv2.getWindowProperty(window,cv2.WND_PROP_VISIBLE)<1:break
        except cv2.error:break
    cv2.destroyAllWindows()


def main():
    parser=argparse.ArgumentParser(description="교통 감시 ROI/가상선 전용 편집기"); parser.add_argument("--cam",choices=["cam1","cam2"],help="편집할 카메라"); parser.add_argument("--server",default="http://127.0.0.1:5000",help="메인 Flask 서버 주소"); parser.add_argument("--image",help="서버 대신 사용할 로컬 캡처 이미지"); args=parser.parse_args(); cam_id=choose_camera(args.cam); config=load_config(force=True)
    try:
        if args.image: frame=load_local_image(args.image); server=None
        else: frame=fetch_snapshot(args.server,cam_id); server=args.server
    except Exception as exc: print(exc); raise SystemExit(1)
    run_editor(cam_id,frame,config,server)

if __name__=="__main__": main()
