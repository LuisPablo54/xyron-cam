# XYRON CAM · xyroncam.com

Sitio estático de XYRON CAM Scout. Se publica con GitHub Pages.

| Archivo | Qué es |
|---|---|
| `index.html` | Página de producto (portada 3D, visor, especificaciones, preguntas) |
| `scout_v4.json` | Modelo 3D de la Scout (GLB en base64, ya escalado a metros) |
| `tools/glb_to_json.py` | Genera `scout_v4.json` desde un GLB exportado de CAD |
| `CNAME` | Dominio personalizado para GitHub Pages |
| `prototipo-app.html` y `screens/` | Prototipo anterior de la app móvil |

## Regenerar el modelo

```bash
python3 tools/glb_to_json.py xyron_cam_scout_v4.glb scout_v4.json
```

El GLB de CAD viene en milímetros; el script lo escala a metros, que es lo que espera la página.

## Pendiente del modelo

El GLB actual no trae los nodos `PAN` y `TILT` ni los datos `userData.ex`. Por eso la Scout aparece quieta (no sigue al dron), el control "Explosionado" no mueve piezas y la vista "Por dentro" no se abre. Con un GLB que los incluya, basta con regenerar `scout_v4.json`.

## Formulario

La lista de espera todavía no guarda nada: valida el correo y muestra el mensaje, pero el registro no se envía a ningún lado.
