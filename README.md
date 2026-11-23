# XYRON CAM · xyroncam.com

Sitio estático de XYRON CAM Scout. Se publica con GitHub Pages; no necesita servidor.

| Ruta | Qué es |
|---|---|
| `index.html` | Página: portada en video, simulador, visor, videos, demo de la app, cobertura, especificaciones, contacto |
| `css/site.css` | Estilos |
| `js/config.js` | **Enlace del formulario de contacto** y límites del equipo |
| `js/main.js` | Acordeones, pestañas, videos, contacto y carga diferida de cada sección |
| `js/scout-model.js` | Carga del GLB, materiales, rig (PAN/TILT), explosionado y colores |
| `js/studio.js` | Visor de estudio |
| `js/simulator.js` | Simulador de detección (radio → IA → alerta) |
| `js/coverage.js` | Calculadora de cobertura |
| `js/app-demo.js` | Demo navegable de la app (usa `screens/`) |
| `js/city.js` | Fraccionamiento, dron y ave procedurales |
| `models/scout_v4.glb` | Modelo con rig, comprimido con meshopt (2.7 MB) |
| `videos/`, `img/` | Video de portada, videos de incidentes, pósters e imagen para redes |
| `tools/build_model.py` | Arma el rig a partir del GLB exportado de CAD |
| `tools/hero-capture.html` | Escena de la portada con tiempo controlado, para grabar `videos/hero.mp4` |
| `prototipo-app.html` | Prototipo de la app a pantalla completa |

## Formulario de contacto

1. Crea el formulario en Google Forms y copia el enlace de **Enviar → enlace**.
2. Pégalo en `js/config.js`, en `CONTACT_FORM_URL`.

Mientras esté vacío, el botón muestra "El formulario estará disponible muy pronto".

## Regenerar el modelo 3D

El GLB de CAD viene en milímetros, con Z hacia arriba y sin articulaciones. El script agrupa las piezas en `PAN` y `TILT`, convierte a metros con Y hacia arriba y agrega los vectores de explosionado (`extras.ex`). Después se comprime:

```bash
python3 tools/build_model.py xyron_cam_scout_v4.glb scout_rig.glb
npx @gltf-transform/cli meshopt scout_rig.glb models/scout_v4.glb
```

Si cambian los nombres de las piezas en CAD, actualiza `PAN_PARTS`, `TILT_PARTS` y `EXPLODE_BY_PREFIX` en el script.

## Regenerar el video de portada

La portada usa un video en bucle (`videos/hero.mp4`, 24 s) en lugar de 3D en vivo, para que no se trabe en equipos lentos. Se graba desde `tools/hero-capture.html`: la página expone `window.renderAt(t, fps)`; `tools/capture-hero.js` (Playwright) pide los cuadros en orden (t = 0 … 24 s), toma una captura de cada uno y ffmpeg los une. Con el sitio servido en el puerto 8000:

```bash
node tools/capture-hero.js frames
```

Después, dentro de `frames/`:

```bash
ffmpeg -framerate 30 -i f%04d.jpg -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -movflags +faststart ../videos/hero.mp4
```

Todos los movimientos de la escena completan ciclos exactos en 24 s, así que el video se repite sin salto.

## Probar en local

```bash
python3 -m http.server 8000
```

Abre http://localhost:8000. Los módulos de JavaScript no funcionan abriendo el archivo con doble clic; necesitan un servidor.
