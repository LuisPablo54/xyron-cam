# XYRON CAM · xyroncam.com

Sitio estático de XYRON CAM Scout. Se publica con GitHub Pages; no necesita servidor.

| Ruta | Qué es |
|---|---|
| `index.html` | Página: portada en video, simulador, visor, videos, demo de la app, cobertura, especificaciones, contacto |
| `css/site.css` | Estilos |
| `js/config.js` | **Enlace del formulario de contacto** y límites del equipo |
| `js/main.js` | Acordeones, pestañas, videos, contacto y carga diferida de cada sección |
| `js/scout-model.js` | Carga del GLB, materiales, rig (PAN/TILT), explosionado y colores |
| `js/studio.js` | Visor del estudio: foto 360° renderizada (por defecto) |
| `js/studio-3d.js` | Visor 3D interactivo (se carga solo si se elige) |
| `js/simulator.js` | Simulador de detección (radio → IA → alerta) |
| `js/coverage.js` | Calculadora de cobertura |
| `js/app-demo.js` | Demo navegable de la app (usa `screens/`) |
| `js/city.js` | Fraccionamiento, dron y ave procedurales |
| `models/scout_v4.glb` | Scout exportada de la escena de Blender, con rig y comprimida con meshopt (2.1 MB) |
| `videos/`, `img/` | Video de portada, videos de incidentes, pósters e imagen para redes |
| `tools/export_scout.py` | Exporta la Scout de la escena de Blender para la web |
| `tools/build_model.py` | Tabla de explosionado; también arma el rig desde un GLB de CAD |
| `tools/render_hero.py`, `tools/overlay_hero.py` | Render del video de portada desde la escena de Blender |
| `tools/render_turntable.py` | Render del giro 360° en estudio (`img/360/`) |
| `prototipo-app.html` | Prototipo de la app a pantalla completa |

## Formulario de contacto

1. Crea el formulario en Google Forms y copia el enlace de **Enviar → enlace**.
2. Pégalo en `js/config.js`, en `CONTACT_FORM_URL`.

Mientras esté vacío, el botón muestra "El formulario estará disponible muy pronto".

## Regenerar el modelo 3D

El modelo de la web sale de la escena de Blender `XYRON_Scout_v4_escena.blend` (no está en el repo), que ya trae los pivotes `PAN` y `TILT` y los materiales finales. `tools/export_scout.py` exporta solo la Scout: la pasa a metros, la deja en el origen mirando al frente, endereza el grupo de piezas fijas y agrega los vectores de explosionado (`extras.ex`, definidos en `tools/build_model.py`). Después se comprime:

```bash
blender -b -P tools/export_scout.py -- XYRON_Scout_v4_escena.blend scout_blend.glb
npx @gltf-transform/cli meshopt scout_blend.glb models/scout_v4.glb
```

El primer comando exporta la Scout desde Blender y el segundo la comprime con meshopt (8.3 MB → 2.1 MB). `tools/build_model.py` también sirve para armar el rig desde un GLB de CAD sin articulaciones.

## Regenerar el video de portada

La portada usa un video en bucle (`videos/hero.mp4`, 8 s) renderizado con Cycles desde la escena de Blender `XYRON_Scout_v4_escena.blend` (no está en el repo). `tools/render_hero.py` abre la escena, agrega un dron con una trayectoria periódica, hace que los pivotes `PAN` y `TILT` de la Scout lo sigan y renderiza los 192 cuadros; `tools/overlay_hero.py` dibuja el recuadro de seguimiento.

```bash
blender -b XYRON_Scout_v4_escena.blend -P tools/render_hero.py -- XYRON_Scout_v4_escena.blend cuadros
python tools/overlay_hero.py cuadros cuadros/final
ffmpeg -framerate 24 -i cuadros/final/o%04d.png -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart videos/hero.mp4
```

El primer comando renderiza (unos 30 s por cuadro en CPU de 4 núcleos), el segundo agrega el recuadro y el tercero une los cuadros en el video. La trayectoria del dron se repite exactamente cada 192 cuadros, así que el video no tiene salto.

## Regenerar la foto 360° del visor

`tools/render_turntable.py` deja solo la Scout de la escena, arma un estudio (softboxes, piso que solo recibe sombra, fondo transparente) y renderiza 48 cuadros alrededor de ella por cada acabado (`blanco`, `arena`):

```bash
blender -b -P tools/render_turntable.py -- XYRON_Scout_v4_escena.blend cuadros360 blanco
blender -b -P tools/render_turntable.py -- XYRON_Scout_v4_escena.blend cuadros360 arena
```

Después se convierten a WebP con transparencia en `img/360/` (`blanco_01.webp` … `arena_48.webp`).

## Probar en local

```bash
python3 -m http.server 8000
```

Abre http://localhost:8000. Los módulos de JavaScript no funcionan abriendo el archivo con doble clic; necesitan un servidor.
