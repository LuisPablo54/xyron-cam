"""Armo el rig de la Scout (PAN, TILT y explosionado) a partir del GLB exportado de CAD."""

import json
import math
import struct
import sys

MM_TO_M = 0.001
CAD_TO_YUP = [-math.sqrt(0.5), 0.0, 0.0, math.sqrt(0.5)]
TILT_PIVOT_MM = (0.0, 0.0, 172.0)
LED_EMISSIVE = [0.36, 0.84, 1.0]

PAN_PARTS = {
    "05_torreta_aro", "06_eje_torreta", "07_retenedor", "08_acople_servo_pan",
    "10_tapa_servo", "10_tapa_servo_logo", "11_tapa_pivote", "11_tapa_pivote_logo",
    "12_inserto_servo", "13_inserto_pivote", "C03_servo_tilt_MG995", "C15_tornillos_orejas",
}
TILT_PARTS = {
    "14_esfera_banda", "15_frente_ventana", "16_bisel_ventana", "17_cuna_camara",
    "C01_ventana_PC", "C02_lente_16mm", "C02_lente_vidrio", "C02_lente_interior",
    "C02_camara_hq_montura", "C02_camara_hq_pcb", "C02_camara_hq_tripode", "C06_rodamiento_623",
}

# Desplazamiento del explosionado en mm, en ejes de CAD (Z arriba, frente en -Y).
EXPLODE_BY_PREFIX = [
    ("02_base_brida", (0, 0, -95)), ("03_junta_base", (0, 0, -70)), ("C14_", (0, 0, -120)),
    ("C07_", (0, 0, -55)), ("C16_", (0, 0, -55)), ("C09_", (-150, 0, -10)), ("C08_", (0, -115, 0)),
    ("09_soporte_servo_pan", (150, 0, 10)), ("C04_", (150, 0, 10)),
    ("C10_", (0, 75, 0)), ("C11_", (0, 75, 0)), ("C12_", (0, 75, 0)), ("C13_", (0, 95, 10)),
    ("04_anillo_laberinto", (0, 0, 25)), ("07_retenedor", (0, 0, 12)), ("C05_", (0, 0, 32)),
    ("08_acople_servo_pan", (0, 0, 20)), ("06_eje_torreta", (0, 0, 42)),
    ("05_torreta_aro", (0, 0, 62)), ("C15_", (0, 0, 78)),
    ("10_", (75, 0, 120)), ("12_", (75, 0, 120)), ("C03_", (75, 0, 120)),
    ("11_", (-75, 0, 120)), ("13_", (-60, 0, 120)), ("C06_", (-30, 0, 120)),
    ("14_esfera_banda", (0, 95, 120)), ("17_cuna_camara", (0, 10, 120)),
    ("C02_camara", (0, -5, 120)), ("C02_lente", (0, -45, 120)),
    ("15_frente_ventana", (0, -80, 120)), ("C01_", (0, -105, 120)), ("16_bisel_ventana", (0, -125, 120)),
]


def read_glb(path):
    """Leo el GLB y regreso el JSON y el bloque binario."""
    with open(path, "rb") as source:
        data = source.read()
    json_len = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20:20 + json_len])
    return gltf, data[20 + json_len:]


def write_glb(path, gltf, bin_chunk):
    """Escribo el GLB respetando el relleno de 4 bytes del bloque JSON."""
    raw = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    raw += b" " * (-len(raw) % 4)
    header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(raw) + len(bin_chunk))
    with open(path, "wb") as target:
        target.write(header + struct.pack("<I4s", len(raw), b"JSON") + raw + bin_chunk)


def explode_for(name):
    """Busco el desplazamiento de explosionado de una pieza por su prefijo."""
    for prefix, offset in EXPLODE_BY_PREFIX:
        if name.startswith(prefix):
            return list(offset)
    return [0, 0, 0]


def to_yup_m(point_mm):
    """Paso un punto de CAD (mm, Z arriba) a three.js (m, Y arriba)."""
    x, y, z = point_mm
    return [x * MM_TO_M, z * MM_TO_M, -y * MM_TO_M]


def build_rig(gltf):
    """Reacomodo los nodos: raíz fija, PAN con giro vertical y TILT dentro de PAN."""
    nodes = gltf["nodes"]
    root_index = gltf["scenes"][0]["nodes"][0]
    part_indices = nodes[root_index]["children"]
    tilt_pivot = to_yup_m(TILT_PIVOT_MM)

    pan_index, tilt_index = len(nodes), len(nodes) + 1
    nodes.append({"name": "PAN", "children": []})
    nodes.append({"name": "TILT", "translation": tilt_pivot, "children": []})
    nodes[pan_index]["children"].append(tilt_index)

    fixed_children = [pan_index]
    for index in part_indices:
        part = nodes[index]
        part["rotation"] = CAD_TO_YUP
        part["scale"] = [MM_TO_M] * 3
        part["extras"] = {"ex": explode_for(part["name"])}
        if part["name"] in TILT_PARTS:
            part["translation"] = [-value for value in tilt_pivot]
            nodes[tilt_index]["children"].append(index)
        elif part["name"] in PAN_PARTS:
            nodes[pan_index]["children"].append(index)
        else:
            fixed_children.append(index)

    root = nodes[root_index]
    root.pop("rotation", None)
    root.pop("scale", None)
    root["children"] = fixed_children


def light_up_led(gltf):
    """Le doy color emisivo al material de la barra LED para que brille."""
    for node in gltf["nodes"]:
        if node.get("name", "").startswith("01c_led") and "mesh" in node:
            for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
                material = dict(gltf["materials"][primitive["material"]])
                material["emissiveFactor"] = LED_EMISSIVE
                material["name"] = "led_estado"
                gltf["materials"].append(material)
                primitive["material"] = len(gltf["materials"]) - 1


def main(source_path, target_path):
    """Armo el rig y guardo el GLB nuevo."""
    gltf, bin_chunk = read_glb(source_path)
    build_rig(gltf)
    light_up_led(gltf)
    write_glb(target_path, gltf, bin_chunk)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
