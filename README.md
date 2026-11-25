# XYRON CAM · xyroncam.com

Sitio estático de XYRON CAM Scout. Se publica con GitHub Pages; no necesita servidor.

| Ruta | Qué es |
|---|---|
| `index.html` | Página: video de portada, simulador, funciones, visor 3D, videos, demo de la app, cobertura, especificaciones, contacto |
| `css/site.css` | Estilos: gris claro, tinta y líneas finas; Inter Tight para texto y DM Mono para datos |
| `js/config.js` | **Enlace del formulario de contacto** y límites del equipo |
| `js/main.js` | Acordeones, pestañas, videos, contacto y carga diferida de cada sección |
| `js/scout-model.js` | Carga del GLB, materiales, rig (PAN/TILT), explosionado y colores |
| `js/studio.js` | Visor del estudio: colores y botones; carga el 3D al acercarse a la sección |
| `js/studio-3d.js` | Escena 3D del visor: vistas, giro automático y explosionado |
| `js/simulator.js` | Simulador de detección (radio → IA → alerta) |
| `js/coverage.js` | Calculadora de cobertura |
| `js/app-demo.js` | Demo navegable de la app (usa `screens/`) |
| `js/city.js` | Fraccionamiento, dron y ave procedurales |
| `models/scout_v4.glb` | Scout exportada de la escena de Blender, con rig y comprimida con meshopt (2.1 MB) |
| `videos/`, `img/` | Video de portada, videos de incidentes, pósters e imagen para redes |
| `tools/export_scout.py` | Exporta la Scout de la escena de Blender para la web |
| `tools/build_model.py` | Tabla de explosionado; también arma el rig desde un GLB de CAD |
| `tools/render_hero.py`, `tools/overlay_hero.py` | Render del video en bucle que usaba la portada anterior |
| `tools/render_turntable.py` | Render del giro 360° en estudio (`img/360/`, ya no se usa en la página) |
| `tools/restyle_screens.py` | Aplica la paleta, fuentes y esquinas del sitio a las pantallas exportadas de la app (`screens/`) |
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

## Video de portada

La portada muestra el video promocional `videos/hero.mp4` (45 s, 832 × 464, con audio). Arranca sin sonido porque los navegadores no permiten reproducir con sonido automáticamente; el botón "Activar sonido" lo enciende. Para cambiarlo por otro video:

```bash
ffmpeg -i nuevo.mp4 -map 0 -c copy -map_metadata -1 -movflags +faststart videos/hero.mp4
```

Reacomoda el archivo para que empiece a reproducirse mientras descarga, sin recomprimirlo.

```bash
ffmpeg -i videos/hero.mp4 -vf "select=eq(n\,15)" -fps_mode vfr -frames:v 1 -q:v 3 img/hero-poster.jpg
```

Saca el póster (lo que se ve mientras carga) del cuadro 15, cuando ya terminó el fundido de entrada.

`tools/render_hero.py` y `tools/overlay_hero.py` generan el video en bucle de 8 s que usaba la portada anterior (Scout siguiendo un dron, renderizado con Cycles desde `XYRON_Scout_v4_escena.blend`).

## Regenerar la foto 360° del visor

El visor de la página ahora es solo 3D; estos cuadros quedaron como material de apoyo.

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
