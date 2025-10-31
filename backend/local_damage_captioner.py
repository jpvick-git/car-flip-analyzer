import os
from tqdm import tqdm
from ultralytics import YOLO
from transformers import BlipProcessor, BlipForConditionalGeneration
from PIL import Image
import torch

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
IMAGE_EXTS = (".jpg", ".jpeg", ".png")
BASE_DIR = os.path.join(os.getcwd(), "downloads")  # or your image base folder
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Load YOLOv8 model (object/damage detection)
yolo_model = YOLO("yolov8x.pt")  # pre-trained COCO weights

# Load BLIP-2 model (caption generation)
blip_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-large")
blip_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-large").to(DEVICE)

# --------------------------------------------------
# HELPERS
# --------------------------------------------------
def detect_objects(image_path):
    """Run YOLOv8 detection and return summary labels."""
    results = yolo_model.predict(image_path, verbose=False)
    detections = []
    for r in results:
        for box in r.boxes:
            cls_name = r.names[int(box.cls)]
            detections.append(cls_name)
    # Deduplicate
    unique = sorted(set(detections))
    return ", ".join(unique) if unique else "no obvious objects detected"


def generate_caption(image_path):
    """Run BLIP captioning and return one-sentence description."""
    raw_image = Image.open(image_path).convert("RGB")
    inputs = blip_processor(raw_image, return_tensors="pt").to(DEVICE)
    out = blip_model.generate(**inputs, max_new_tokens=50)
    caption = blip_processor.decode(out[0], skip_special_tokens=True)
    return caption.strip()


def analyze_folder(folder_path):
    image_files = [f for f in os.listdir(folder_path) if f.lower().endswith(IMAGE_EXTS)]
    if not image_files:
        return "No images found."

    summaries = []
    for f in tqdm(image_files, desc=os.path.basename(folder_path)):
        img_path = os.path.join(folder_path, f)
        try:
            objs = detect_objects(img_path)
            caption = generate_caption(img_path)
            # format neatly
            summaries.append(f"{caption}. (detected: {objs})")
        except Exception as e:
            summaries.append(f"{f}: error processing image ({e})")

    # join with spaces and limit length
    combined = " ".join(summaries)
    short_summary = combined[:800]
    save_summary(folder_path, short_summary)
    return short_summary


def summarize_text(text):
    """Make short human-readable summary from multiple captions."""
    # simple heuristic collapse; you can later replace this with GPT-mini summarization if you want
    lines = [l.split(":")[1].strip() for l in text.split("\n") if ":" in l]
    combined = " ".join(lines)
    return combined[:800]  # limit length


def save_summary(folder_path, summary):
    """Save result to file."""
    output_path = os.path.join(folder_path, "damage_summary.txt")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(summary)
    print(f"💾 Saved summary: {output_path}\n")


# --------------------------------------------------
# MAIN LOOP
# --------------------------------------------------
if __name__ == "__main__":
    for lot_folder in os.listdir(BASE_DIR):
        folder_path = os.path.join(BASE_DIR, lot_folder)
        if not os.path.isdir(folder_path):
            continue
        print(f"🚗 Analyzing {lot_folder}...")
        summary = analyze_folder(folder_path)
        print(f"✅ {lot_folder} summary:\n{summary[:300]}...\n")
