"""Aplica el estilo C (precisión industrial) a las pantallas exportadas de la app en screens/.

Las pantallas son paquetes con la plantilla HTML dentro de un JSON. El script cambia la paleta,
las fuentes, los pesos y los radios en los estilos en línea sin tocar la lógica.

    python3 tools/restyle_screens.py screens/*.html
"""
import base64
import gzip
import json
import re
import sys

FONTS_IMPORT = ('<style>@import url("https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500'
                '&family=Inter+Tight:wght@400;500;600&display=swap");</style>')

PALETTE = {
    # neutros pizarra -> grafito
    '#0F172A': '#0E1011', '#1E293B': '#1F2326', '#1F2937': '#1F2326', '#334155': '#3A3F44',
    '#475569': '#4F555B', '#4B5563': '#4F555B', '#64748B': '#5F656B', '#94A3B8': '#9AA0A6',
    '#CBD5E1': '#C8CDD1', '#CFD8E0': '#C8CDD1', '#D5DCE3': '#D3D7DA', '#E2E8F0': '#DCDFE2',
    '#E8EDF1': '#E4E7E9', '#EEF1F3': '#ECEEEF', '#EEF2F4': '#ECEEEF', '#F1F5F9': '#EEF0F1',
    '#F5F7F8': '#F1F2F3', '#F8FAFB': '#F7F8F8',
    # turquesa de marca -> LED y tinta
    '#14B8A6': '#19B8EC', '#2DD4BF': '#5CCBF0', '#0F766E': '#0E1011', '#115E59': '#0E1011',
    '#134E4A': '#0E1011', '#CCFBF1': '#E4E7E9', '#F0FDFA': '#F7F8F8',
    '#E0E7FF': '#E4E7E9', '#3730A3': '#0E1011',
    # estados: se conservan los tonos, sin pastel
    '#16A34A': '#2F7D52', '#15803D': '#2A6E49', '#F0FDF4': '#F7F8F8', '#BBF7D0': '#D3DAD5', '#DCFCE7': '#E5ECE7',
    '#F59E0B': '#D99A1E', '#B45309': '#9A6410', '#92400E': '#7A4E0C', '#FFFBEB': '#F7F8F8',
    '#FDE68A': '#E2D3AE', '#FEF3C7': '#F2ECDD',
    '#DC2626': '#D5372E', '#EF4444': '#D5372E', '#B91C1C': '#AE2A22', '#FEF2F2': '#F7F8F8',
    '#FECACA': '#E8CBC8', '#FEE2E2': '#F4E4E2',
    '#0D9488': '#1495C4', '#5EEAD4': '#8FDBF5', '#99F6E4': '#BDEBFA', '#4ADE80': '#4CC38A',
}
RGBA = {'20,184,166': '25,184,236', '94,234,212': '92,203,240', '15,23,42': '14,16,17', '220,38,38': '213,55,46'}
WEIGHTS = {'800': '600', '700': '600'}
FONT_LINK = ('family=Manrope:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@500;600',
             'family=Inter+Tight:wght@400;500;600&amp;family=DM+Mono:wght@400;500')

STYLE_ATTR = re.compile(r'style="([^"]*)"')
PX = lambda name: re.compile(r'(?<![-\w])' + name + r':\s*(\d+(?:\.\d+)?)px')


def radius_for(style):
    """Esquinas casi rectas; solo se conservan los círculos muy chicos (puntos) o grandes (avatares)."""
    match = re.search(r'border-radius:\s*([^;]+)', style)
    if not match:
        return style
    value = match.group(1).strip()
    if value == '24px 24px 0 0':
        new = '8px 8px 0 0'
    elif re.fullmatch(r'\d+(\.\d+)?px', value):
        r = float(value[:-2])
        w, h = PX('width').search(style), PX('height').search(style)
        size = float(w.group(1)) if w and h and w.group(1) == h.group(1) else None
        if size and r >= size / 2 - 1 and (size <= 12 or size >= 60):
            return style
        new = '4px' if r >= 8 else '3px' if r >= 5 else value
    else:
        return style
    return style[:match.start(1)] + new + style[match.end(1):]


def primary_button(style):
    """El botón principal pasa de turquesa a tinta con texto blanco y sin sombra de color."""
    if re.search(r'background:\s*#19B8EC', style) and re.search(r'(?<![-\w])color:\s*#0E1011', style):
        style = re.sub(r'background:\s*#19B8EC', 'background: #0E1011', style)
        style = re.sub(r'(?<![-\w])color:\s*#0E1011', 'color: #FFFFFF', style)
        style = re.sub(r'box-shadow:\s*[^;]*rgba\(25,184,236,[^)]*\)', 'box-shadow: none', style)
    return style


def restyle(template):
    if FONTS_IMPORT not in template:
        template = template.replace('<helmet>', '<helmet>\n' + FONTS_IMPORT, 1)
    template = template.replace(*FONT_LINK)
    template = template.replace("'Manrope'", "'Inter Tight'").replace("'JetBrains Mono'", "'DM Mono'")
    template = re.sub(r'#[0-9A-Fa-f]{6}\b', lambda m: PALETTE.get(m.group(0).upper(), m.group(0)), template)
    template = re.sub(r'rgba\((\d+,\d+,\d+),', lambda m: 'rgba(' + RGBA.get(m.group(1), m.group(1)) + ',', template)
    template = re.sub(r'font-weight:\s*(\d00)', lambda m: 'font-weight: ' + WEIGHTS.get(m.group(1), m.group(1)), template)
    return STYLE_ATTR.sub(lambda m: 'style="' + primary_button(radius_for(m.group(1))) + '"', template)


def restyle_nested_pages(source):
    """Algunas pantallas traen otra página comprimida en el manifiesto (la de inicio, de fondo)."""
    pattern = re.compile(r'(<script type="__bundler/manifest">)(.*?)(</script>)', re.S)
    match = pattern.search(source)
    manifest = json.loads(match.group(2))
    changed = False
    for entry in manifest.values():
        if entry.get('mime') == 'text/html' and entry.get('compressed'):
            page = gzip.decompress(base64.b64decode(entry['data'])).decode('utf-8')
            entry['data'] = base64.b64encode(gzip.compress(restyle(page).encode('utf-8'), mtime=0)).decode('ascii')
            changed = True
    if not changed:
        return source
    return source[:match.start(2)] + json.dumps(manifest, separators=(',', ':')).replace('</', '<\\/') + source[match.end(2):]


def encode(template):
    return json.dumps(template).replace('</', '<\\/')


def main(paths):
    pattern = re.compile(r'(<script type="__bundler/template">)(.*?)(</script>)', re.S)
    for path in paths:
        source = open(path, encoding='utf-8').read()
        match = pattern.search(source)
        raw = match.group(2)
        template = json.loads(raw)
        if encode(template) != raw:
            sys.exit(f'{path}: la plantilla no se reconstruye igual; no se modificó')
        source = source[:match.start(2)] + encode(restyle(template)) + source[match.end(2):]
        source = restyle_nested_pages(source)
        source = source.replace('background: #faf9f5', 'background: #ffffff')
        open(path, 'w', encoding='utf-8').write(source)
        print('ok', path)


if __name__ == '__main__':
    main(sys.argv[1:])
