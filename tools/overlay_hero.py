"""Dibujo el recuadro "Dron · seguimiento" sobre los cuadros renderizados del video de portada."""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

LED = (92, 214, 255)
GRAPHITE = (29, 33, 38)
LABEL = 'Dron · seguimiento'
MIN_BOX = 0.045
PADDING = 0.6
CORNER = 0.3
FONT_CANDIDATES = ['DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']


def load_font(size):
    """Busco una fuente sans en negritas; si no hay, uso la de Pillow."""
    for name in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_box(image, box, font):
    """Dibujo esquinas tipo mira alrededor del dron y la etiqueta encima."""
    width, height = image.size
    cx = (box['x0'] + box['x1']) / 2 * width
    cy = (box['y0'] + box['y1']) / 2 * height
    side = max((box['x1'] - box['x0']) * width, (box['y1'] - box['y0']) * height, MIN_BOX * width) * (1 + PADDING)
    x0, y0, x1, y1 = cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2
    arm = side * CORNER
    line = max(2, round(width / 800))
    draw = ImageDraw.Draw(image)
    for px, py, dx, dy in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        draw.line([(px, py), (px + dx * arm, py)], fill=LED, width=line)
        draw.line([(px, py), (px, py + dy * arm)], fill=LED, width=line)
    text_box = draw.textbbox((0, 0), LABEL, font=font)
    pad = line * 3
    tw, th = text_box[2] - text_box[0], text_box[3] - text_box[1]
    lx, ly = x0, y0 - th - pad * 2 - line * 3
    draw.rounded_rectangle([lx, ly, lx + tw + pad * 2, ly + th + pad * 2], radius=line * 2, fill=GRAPHITE)
    draw.text((lx + pad - text_box[0], ly + pad - text_box[1]), LABEL, font=font, fill=(255, 255, 255))


def main(frames_dir, out_dir):
    """Recorro los cuadros en orden y guardo copias con el recuadro."""
    frames = sorted(Path(frames_dir).glob('f*.png'))
    boxes = json.loads((Path(frames_dir) / 'boxes.json').read_text())
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    font = None
    for index, path in enumerate(frames):
        image = Image.open(path).convert('RGB')
        font = font or load_font(round(image.size[0] / 110))
        draw_box(image, boxes[index], font)
        image.save(Path(out_dir) / f'o{index:04d}.png')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
