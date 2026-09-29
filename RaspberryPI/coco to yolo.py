import torch
from ultralytics import YOLO

def main():
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Using device: {device}")
    model = YOLO("yolo11n.pt")
    dataset_yaml_path = r"D:\\dataset\\study_car\\dataset.yaml"
    results = model.train(data=dataset_yaml_path, epochs=250, patience=40, imgsz=640, batch=16, device=device, workers=4, save=True, project="yolo11_custom", name="study_car_exp")
    print("학습이 완료되었습니다!")

if __name__ == '__main__':
    import multiprocessing
    multiprocessing.freeze_support()
    main()
