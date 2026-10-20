#!/usr/bin/env python3
"""Render unchanged GF9 source pages for the local composition prototype."""

import argparse
import hashlib
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "public" / "reference"
PAGES = [
    ("base", 1, 300, "core-cover", "Original core cover"),
    ("ixian-tleilaxu", 1, 300, "ixian-cover", "Original Ixians and Tleilaxu cover"),
    ("choam-richese", 1, 300, "choam-cover", "Original CHOAM and Richese cover"),
    ("ecaz-moritani", 1, 300, "ecaz-cover", "Original Ecaz and Moritani cover"),
    ("base", 4, 150, "core-components", "Physical board and components"),
    ("base", 5, 150, "core-faction-components-p5", "Faction sets and component inventory"),
    ("base", 6, 150, "core-setup-p6", "Basic game objective and setup"),
    ("base", 7, 150, "core-phases-p7", "Sequence of play and storm"),
    ("base", 9, 150, "core-movement", "Revival, shipment and movement"),
    ("base", 10, 150, "core-battle", "Battle Wheel and battle resolution"),
    ("base", 17, 150, "core-faction", "Atreides faction rules"),
    ("ixian-tleilaxu", 4, 150, "ixian-tech", "Narrow expansion flow and Tech Tokens"),
    ("ecaz-moritani", 11, 150, "ecaz-module-p11", "Nexus Cards module"),
    ("ecaz-moritani", 12, 150, "ecaz-discovery", "Discovery Tokens module"),
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def measurements(pdf, page_number):
    page = PdfReader(pdf).pages[page_number - 1]
    box = [float(value) for value in page.mediabox]
    width = box[2] - box[0]
    height = box[3] - box[1]
    return {
        "pageNumber": page_number,
        "mediaBoxPoints": box,
        "pageSizeMm": [round(width * 25.4 / 72, 5), round(height * 25.4 / 72, 5)],
    }


def output_record(path):
    with Image.open(path) as image:
        return {
            "path": str(path.relative_to(ROOT)),
            "sha256": sha256(path),
            "pixels": list(image.size),
            "colorMode": image.mode,
            "bytes": path.stat().st_size,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sources = {}
    for name, *_ in PAGES:
        if name not in sources:
            pdf = args.sources / f"{name}.pdf"
            sources[name] = {"fileName": pdf.name, "sha256": sha256(pdf)}

    def render(spec):
        name, page_number, dpi, stem, purpose = spec
        pdf = args.sources / f"{name}.pdf"
        path = OUTPUT / f"{stem}.png"
        subprocess.run([
            "pdftoppm", "-f", str(page_number), "-l", str(page_number),
            "-singlefile", "-r", str(dpi), "-png", str(pdf), str(path.with_suffix("")),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        return {
            "id": stem,
            "purpose": purpose,
            "source": name,
            **measurements(pdf, page_number),
            "operation": "Full unchanged PDF page rendered with Poppler. No crop or retouch.",
            "renderDpi": dpi,
            **output_record(path),
        }

    with ThreadPoolExecutor(max_workers=4) as executor:
        assets = list(executor.map(render, PAGES))

    pdf = args.sources / "ixian-tleilaxu.pdf"
    page = PdfReader(pdf).pages[3]
    token_specs = [
        ("Im2", "axlotl-tanks", [49.5288048, 457.5118103, 126.402751, 534.3857565]),
        ("Im0", "heighliners", [138.1965179, 457.5118103, 215.0704641, 534.3857565]),
        ("Im1", "spice-production", [228.9978027, 457.5118103, 305.8717489, 534.3857565]),
    ]
    images = {image.name.split(".")[0]: image for image in page.images}
    for resource, name, bounds in token_specs:
        path = OUTPUT / f"tech-token-{name}.png"
        image = images[resource].image
        image.save(path)
        assets.append({
            "id": f"tech-token-{name}",
            "purpose": "Original Tech Token for the composition prototype",
            "source": "ixian-tleilaxu",
            **measurements(pdf, 4),
            "resourceName": resource,
            "placementBoundsPointsFromTopLeft": bounds,
            "placedSizeMm": [round((bounds[2]-bounds[0])*25.4/72, 5), round((bounds[3]-bounds[1])*25.4/72, 5)],
            "operation": "Native embedded image decoded with its original alpha mask. No enlargement or retouch.",
            **output_record(path),
        })

    manifest = {
        "status": "Prototype reference assets. Not final publication files.",
        "note": "Page renders preserve original lettering and layout. Rendering at 300 dpi preserves vector edges but does not add detail to embedded raster artwork.",
        "sourcePageNumbering": "One-based PDF page numbers",
        "sources": sources,
        "assets": assets,
    }
    (ROOT / "art-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"assets": len(assets), "manifest": str(ROOT / "art-manifest.json")}))


if __name__ == "__main__":
    main()
