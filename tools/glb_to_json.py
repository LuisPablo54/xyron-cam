"""Convierto un GLB de CAD (en milímetros) al scout_v4.json que lee index.html."""

import base64
import json
import struct
import sys

MM_TO_M = 0.001
JSON_CHUNK_TYPE = b"JSON"


def scale_root_to_meters(glb_bytes):
    """Escalo el nodo raíz de milímetros a metros y devuelvo el GLB nuevo."""
    json_len = struct.unpack("<I", glb_bytes[12:16])[0]
    gltf = json.loads(glb_bytes[20:20 + json_len])
    gltf["nodes"][gltf["scenes"][0]["nodes"][0]]["scale"] = [MM_TO_M] * 3

    new_json = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    new_json += b" " * (-len(new_json) % 4)
    rest = glb_bytes[20 + json_len:]
    total = 12 + 8 + len(new_json) + len(rest)

    header = struct.pack("<4sII", b"glTF", 2, total)
    chunk_head = struct.pack("<I4s", len(new_json), JSON_CHUNK_TYPE)
    return header + chunk_head + new_json + rest


def main(glb_path, out_path):
    """Leo el GLB, lo escalo y lo guardo como arreglo JSON con el GLB en base64."""
    with open(glb_path, "rb") as source:
        glb_bytes = scale_root_to_meters(source.read())
    encoded = base64.b64encode(glb_bytes).decode("ascii")
    with open(out_path, "w") as target:
        json.dump([encoded], target)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
