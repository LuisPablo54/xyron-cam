"""Exporto la Scout de la escena de Blender a GLB para la web, con rig PAN/TILT y explosionado."""

import sys
from pathlib import Path

import bpy
from mathutils import Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_model import explode_for

MM_TO_M = 0.001
ROOT_NAME = 'XYRON_Scout'


def to_meters(root):
    """Paso todo el árbol de la Scout a metros y dejo la raíz en el origen, mirando al frente."""
    scale = Matrix.Scale(MM_TO_M, 4)
    seen = set()
    for obj in root.children_recursive:
        obj.location = obj.location * MM_TO_M
        data = obj.data
        if data is not None and data not in seen and hasattr(data, 'transform'):
            data.transform(scale)
            if obj.type == 'CURVE':
                data.bevel_depth *= MM_TO_M
            seen.add(data)
    root.location = (0, 0, 0)
    root.rotation_euler = (0, 0, 0)
    root.scale = (1, 1, 1)
    for name in ('PAN', 'TILT'):
        bpy.data.objects[name].rotation_euler = (0, 0, 0)


def flatten_group(name):
    """Dejo un nodo de agrupación sin rotación ni matriz inversa y paso su orientación a cada pieza hija."""
    group = bpy.data.objects[name]
    bpy.context.view_layer.update()
    children = [(child, child.matrix_world.copy()) for child in group.children]
    group.matrix_parent_inverse = Matrix.Identity(4)
    group.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for child, world in children:
        child.matrix_parent_inverse = Matrix.Identity(4)
        child.matrix_world = world
    bpy.context.view_layer.update()


def tag_explode(root):
    """Guardo el desplazamiento de explosionado de cada pieza como propiedad (sale como extras.ex)."""
    for obj in root.children_recursive:
        if obj.type in {'MESH', 'CURVE'}:
            obj['ex'] = explode_for(obj.name)


def export(root, target):
    """Selecciono solo la Scout y exporto GLB con Y hacia arriba."""
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=target, export_format='GLB', use_selection=True, export_extras=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
    )


def main():
    """Abro la escena sin ejecutar sus scripts y exporto la Scout."""
    args = sys.argv[sys.argv.index('--') + 1:]
    bpy.ops.wm.open_mainfile(filepath=args[0], load_ui=False, use_scripts=False)
    root = bpy.data.objects[ROOT_NAME]
    to_meters(root)
    flatten_group('XYRON_CAM_Scout_v4')
    tag_explode(root)
    export(root, args[1])


if __name__ == '__main__':
    main()
