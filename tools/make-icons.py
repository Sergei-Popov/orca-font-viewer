"""Draws the plugin's "Aa" icons from real glyph outlines, so the SVGs need no font to render.

    PYTHONPATH=<fontTools> python3 tools/make-icons.py STIXGeneral.otf STIXGeneralBol.otf \
        && tools/rasterize-icons.sh

The outlines come from STIXGeneral (SIL Open Font License 1.1, shipped with macOS in
/System/Library/Fonts/Supplemental). Writes images/icon.svg (plugin icon, regular) and
icons/font.svg (editor tab icon, bold, so it survives 16 px); tools/rasterize-icons.sh turns them
into PNG.
"""

import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
GAP = 0.04  # of the em


def path(font_path, size, inset):
    """One SVG path of "Aa", centred in a size×size square with `inset` margins."""
    font = TTFont(font_path)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    names = [cmap[ord("A")], cmap[ord("a")]]
    em = font["head"].unitsPerEm
    boxes = []
    for name in names:
        pen = BoundsPen(glyphs)
        glyphs[name].draw(pen)
        boxes.append(pen.bounds)
    widths = [b[2] - b[0] for b in boxes]
    total = widths[0] + widths[1] + GAP * em
    top = max(b[3] for b in boxes)
    bottom = min(b[1] for b in boxes)
    scale = (size - 2 * inset) / max(total, top - bottom)
    x0 = (size - total * scale) / 2
    y0 = (size + (top - bottom) * scale) / 2  # baseline of the lowest point
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    x = x0
    for name, box, width in zip(names, boxes, widths):
        # Flip y: font units go up, SVG goes down.
        transform = (scale, 0, 0, -scale, x - box[0] * scale, y0 + bottom * scale)
        glyphs[name].draw(TransformPen(pen, transform))
        x += (width + GAP * em) * scale
    return pen.getCommands()


def svg(font_path, size, radius, inset, gradient_id, full=False):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
        f'<defs><linearGradient id="{gradient_id}" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#5FD3C4"/><stop offset=".55" stop-color="#2F7FD8"/>'
        '<stop offset="1" stop-color="#3A2D7A"/></linearGradient></defs>'
        + (
            f'<rect width="{size}" height="{size}" rx="{radius:g}" fill="url(#{gradient_id})"/>'
            if full
            else f'<rect x="{size * 0.0625:g}" y="{size * 0.0625:g}" width="{size * 0.875:g}" '
            f'height="{size * 0.875:g}" rx="{radius:g}" fill="url(#{gradient_id})"/>'
        )
        + f'<path d="{path(font_path, size, inset)}" fill="#fff"/></svg>\n'
    )


regular, bold = sys.argv[1], sys.argv[2]
(ROOT / "images" / "icon.svg").write_text(svg(regular, 256, 52, 56, "fv-icon", full=True))
(ROOT / "icons" / "font.svg").write_text(svg(bold, 256, 32, 36, "fv-font"))
print("wrote icons/font.svg and images/icon.svg")
