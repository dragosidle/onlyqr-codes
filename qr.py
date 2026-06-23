"""OnlyQR core — pure SVG QR generation, no GUI, no file I/O.

Refactored out of segno-qr-code.py so it can be imported by the web API
(and tested standalone). build_svg() returns the SVG as a string.
"""

import re
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

import segno
from shapely.geometry import box, Point
from shapely.ops import unary_union

HOLE_RATIOS = {"small": 0.15, "medium": 0.22, "large": 0.30}
SCALE = 10

SVG_NS = "http://www.w3.org/2000/svg"
# Emit the SVG namespace with no prefix (default xmlns) instead of ns0:.
ET.register_namespace("", SVG_NS)


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


def build_svg(text: str, hole_ratio: float | None, hole_shape: str = "square") -> str:
    """Generate a clean single-<path> SVG QR code for ``text``.

    hole_ratio: fraction of width for the centre hole (e.g. 0.22), or None for no hole.
    hole_shape: "square" or "circle".
    Returns the SVG document as a string.
    """
    qr = segno.make(text, error="h")
    matrix = qr.matrix
    rows = len(matrix)
    cols = len(matrix[0])
    w = cols * SCALE
    h = rows * SCALE

    if hole_ratio is not None:
        cx, cy = w / 2, h / 2
        hole_size = w * hole_ratio
        if hole_shape == "circle":
            hole_geom = Point(cx, cy).buffer(hole_size / 2, resolution=64)
        else:
            hole_geom = box(
                cx - hole_size / 2, cy - hole_size / 2,
                cx + hole_size / 2, cy + hole_size / 2,
            )
    else:
        hole_geom = None

    geom = matrix_to_merged_geom(matrix, hole_geom=hole_geom)
    path_d = geom_to_path_d(geom)

    svg_root = ET.Element(f"{{{SVG_NS}}}svg", attrib={
        "width": str(w),
        "height": str(h),
        "viewBox": f"0 0 {w} {h}",
        "fill": "none",
    })
    ET.SubElement(svg_root, f"{{{SVG_NS}}}path", attrib={
        "d": path_d, "fill": "#363636", "fill-rule": "evenodd",
    })

    return ET.tostring(svg_root, encoding="unicode")
