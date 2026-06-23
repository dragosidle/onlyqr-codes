import segno
import xml.etree.ElementTree as ET
import tkinter as tk
from tkinter import messagebox
from typing import Any
from shapely.geometry import box, Point
from shapely.ops import unary_union
import re
from urllib.parse import urlparse

HOLE_RATIOS = {"small": 0.15, "medium": 0.22, "large": 0.30}
SCALE = 10


def make_filename(text):
    """Derive a safe filename from a URL or plain text input."""
    parsed = urlparse(text if "://" in text else "https://" + text)
    if parsed.netloc:
        hostname = re.sub(r"^www\.", "", parsed.netloc.lower())
        parts = hostname.split(".")
        # Drop TLD (last segment), keep the rest
        name = ".".join(parts[:-1]) if len(parts) > 1 else hostname
    else:
        name = text.strip()
    # Sanitize to filesystem-safe characters
    name = re.sub(r"[^\w\-]", "_", name)
    return name[:80] or "qr"

def matrix_to_merged_geom(matrix, hole_geom=None):
    """Union all dark module squares, dropping any that touch the hole shape."""
    squares = []
    for y, row in enumerate(matrix):
        for x, dark in enumerate(row):
            if not dark:
                continue
            module = box(x * SCALE, y * SCALE, (x + 1) * SCALE, (y + 1) * SCALE)
            if hole_geom is not None and module.intersects(hole_geom):
                continue
            squares.append(module)
    return unary_union(squares)


def geom_to_path_d(geom):
    def ring_to_d(coords):
        coords = list(coords)
        parts = [f"M {coords[0][0]:.2f},{coords[0][1]:.2f}"]
        for x, y in coords[1:-1]:
            parts.append(f"L {x:.2f},{y:.2f}")
        parts.append("Z")
        return " ".join(parts)

    def polygon_to_d(poly):
        d = ring_to_d(poly.exterior.coords)
        for interior in poly.interiors:
            d += " " + ring_to_d(interior.coords)
        return d

    if geom.geom_type == "Polygon":
        return polygon_to_d(geom)
    elif geom.geom_type == "MultiPolygon":
        return " ".join(polygon_to_d(p) for p in geom.geoms)
    return ""

def ask_url_and_hole():
    result: dict[str, Any] = {"url": None, "hole": None, "shape": "square"}

    win = tk.Toplevel(root_tk)
    win.title("QR Code Generator")
    win.resizable(False, False)

    tk.Label(win, text="Enter the URL or text for your QR code:", pady=8).pack(padx=20)

    entry = tk.Entry(win, width=40)
    entry.pack(padx=20)
    entry.focus_set()

    want_hole = tk.BooleanVar(value=False)

    hole_section = tk.Frame(win)

    tk.Label(hole_section, text="Hole shape:").pack(pady=(6, 2))

    shape_var = tk.StringVar(value="square")
    shape_frame = tk.Frame(hole_section)
    shape_frame.pack()
    tk.Radiobutton(shape_frame, text="Square", variable=shape_var, value="square").pack(side=tk.LEFT, padx=10)
    tk.Radiobutton(shape_frame, text="Circle", variable=shape_var, value="circle").pack(side=tk.LEFT, padx=10)

    tk.Label(hole_section, text="Hole size:").pack(pady=(8, 2))

    btn_frame = tk.Frame(hole_section)
    btn_frame.pack(pady=(0, 4))

    def choose(size):
        url_val = entry.get().strip()
        if not url_val:
            messagebox.showwarning("Cancelled", "No input provided.", parent=win)
            return
        result["url"] = url_val
        result["hole"] = HOLE_RATIOS[size]
        result["shape"] = shape_var.get()
        win.destroy()

    for label, key in [("Small", "small"), ("Medium", "medium"), ("Large", "large")]:
        tk.Button(btn_frame, text=label, width=10, command=lambda k=key: choose(k)).pack(side=tk.LEFT, padx=6)

    def generate_no_hole():
        url_val = entry.get().strip()
        if not url_val:
            messagebox.showwarning("Cancelled", "No input provided.", parent=win)
            return
        result["url"] = url_val
        result["hole"] = None
        win.destroy()

    generate_btn = tk.Button(win, text="Generate", width=12, command=generate_no_hole)

    def toggle_hole():
        if want_hole.get():
            generate_btn.pack_forget()
            hole_section.pack(pady=(6, 0))
        else:
            hole_section.pack_forget()
            generate_btn.pack(pady=(10, 16))

    tk.Checkbutton(win, text="Add punch hole", variable=want_hole, command=toggle_hole).pack(pady=(10, 0))

    generate_btn.pack(pady=(10, 16))

    win.grab_set()
    root_tk.wait_window(win)
    return result["url"], result["hole"], result["shape"]

root_tk = tk.Tk()
root_tk.withdraw()

url, hole_ratio, hole_shape = ask_url_and_hole()

if not url:
    exit()

ET.register_namespace("", "http://www.w3.org/2000/svg")

qr = segno.make(url, error="h")
matrix = qr.matrix
rows = len(matrix)
cols = len(matrix[0])
w = cols * SCALE
h = rows * SCALE

import os

if hole_ratio is not None:
    cx, cy = w / 2, h / 2
    hole_size = w * hole_ratio
    if hole_shape == "circle":
        hole_geom = Point(cx, cy).buffer(hole_size / 2, resolution=64)
    else:
        hole_geom = box(cx - hole_size / 2, cy - hole_size / 2, cx + hole_size / 2, cy + hole_size / 2)
    out_file = f"qr-{make_filename(url)}.svg"
else:
    hole_geom = None
    out_file = f"qr-{make_filename(url)}.svg"

geom = matrix_to_merged_geom(matrix, hole_geom=hole_geom)

path_d = geom_to_path_d(geom)

ns = "http://www.w3.org/2000/svg"
svg_root = ET.Element(f"{{{ns}}}svg", attrib={
    "width": str(w),
    "height": str(h),
    "viewBox": f"0 0 {w} {h}",
    "fill": "none",
})

ET.SubElement(svg_root, f"{{{ns}}}path", attrib={
    "d": path_d, "fill": "#363636", "fill-rule": "evenodd"
})

ET.ElementTree(svg_root).write(out_file, xml_declaration=True, encoding="unicode")
messagebox.showinfo("Done!", f"{out_file} saved.")