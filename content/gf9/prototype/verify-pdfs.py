#!/usr/bin/env python3
"""Measure and render the actual prototype PDFs for visual review."""
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "output"
RENDERS = OUTPUT / "pdf-renders"
RENDERS.mkdir(parents=True, exist_ok=True)
records = []


def verify(spec):
    key, filename, expected_count = spec
    source = OUTPUT / "pdf" / filename
    reader = PdfReader(source)
    assert len(reader.pages) == expected_count, (filename, len(reader.pages))
    pages = []
    for index, page in enumerate(reader.pages):
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        if key == "comparison":
            expected = (760 * 72 / 25.4, 335 * 72 / 25.4)
        else:
            expected = (374.4 if index in (1, 2, 3) or index >= expected_count - 3 else 720, 720)
        assert abs(width - expected[0]) < 0.05 and abs(height - expected[1]) < 0.05, (filename, index, width, height, expected)
        text = " ".join(page.extract_text().split())
        if key != "comparison" and index >= 4:
            assert "BASIC GAME" in text or "OPTIONAL MODULE" in text, (filename, index, text[:200])
            assert "Sources" not in text and "FAQ" not in text
        pages.append({"page": index + 1, "points": [width, height], "mm": [round(width * 25.4 / 72, 3), round(height * 25.4 / 72, 3)], "textCharacters": len(text)})
    subprocess.run(["pdftoppm", "-scale-to", "1200", "-png", str(source), str(RENDERS / key)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    images = sorted(RENDERS.glob(key + "-*.png"))
    columns = 2 if key == "comparison" else 3
    cell_width, cell_height = (760, 375) if key == "comparison" else (400, 425)
    sheet = Image.new("RGB", (columns * cell_width, ((len(images) + columns - 1) // columns) * cell_height), "#dce0e2")
    draw = ImageDraw.Draw(sheet)
    for index, image_path in enumerate(images):
        image = Image.open(image_path).convert("RGB")
        image.thumbnail((cell_width - 16, cell_height - 35))
        x, y = (index % columns) * cell_width, (index // columns) * cell_height
        sheet.paste(image, (x + (cell_width - image.width) // 2, y + 27))
        draw.text((x + 12, y + 8), f"{key.upper()} / PDF page {index + 1}", fill="#18212a")
    sheet.save(OUTPUT / f"pdf-contact-{key}.jpg", quality=92)
    return {"key": key, "file": filename, "pages": pages, "status": "Measured and rendered. Contact sheets require human visual inspection."}


specs = [(key, f"gf9-composition-{key.lower()}-prototype.pdf", count) for key, count in [("A", 11), ("B", 12), ("C", 11)]]
specs.append(("comparison", "gf9-original-current-proposed-comparison.pdf", 11))
with ThreadPoolExecutor(max_workers=4) as executor:
    records = list(executor.map(verify, specs))
(OUTPUT / "pdf-review.json").write_text(json.dumps(records, indent=2) + "\n")
print(json.dumps([{ "key": record["key"], "pages": len(record["pages"]), "sizesMm": sorted({tuple(page["mm"]) for page in record["pages"]})} for record in records], indent=2))
