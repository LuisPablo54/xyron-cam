"""Renderizo un giro de 360° de la Scout en estudio (fondo transparente) para el visor realista de la web."""

import math
import sys

import bpy
from mathutils import Vector

FRAMES = 48
WIDTH = 1000
HEIGHT = 800
SAMPLES = 32
CAMERA_DISTANCE = 0.92
CAMERA_ELEVATION_DEG = 16
TARGET_HEIGHT = 0.12
START_AZIMUTH_DEG = 35
TILT_REST = -0.14
EXPOSURE = -2.75

# Colores en espacio lineal (sRGB de la web convertido).
FINISHES = {
    'blanco': None,
    'arena': {'ASA blanco': (0.672, 0.591, 0.468), 'ASA grafito': (0.109, 0.089, 0.069)},
}


def clean_scene(scene):
    """Dejo solo la Scout: quito el entorno, el sol y la cámara original."""
    for obj in list(bpy.data.collections['Entorno'].all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for name in ('Sol', 'Cam'):
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    root = bpy.data.objects['XYRON_Scout']
    root.location = (0, 0, 0)
    bpy.data.objects['PAN'].rotation_euler = (0, 0, 0)
    bpy.data.objects['TILT'].rotation_euler = (TILT_REST, 0, 0)
    world = scene.world
    background = world.node_tree.nodes.get('Background') or world.node_tree.nodes.new('ShaderNodeBackground')
    for link in list(background.inputs['Color'].links):
        world.node_tree.links.remove(link)
    background.inputs['Color'].default_value = (0.78, 0.8, 0.83, 1)
    background.inputs['Strength'].default_value = 0.2
    output = world.node_tree.nodes.get('World Output')
    world.node_tree.links.new(background.outputs['Background'], output.inputs['Surface'])


def add_area(name, location, size, energy, reflects=True, target=(0, 0, TARGET_HEIGHT)):
    """Agrego una luz de área (softbox) que apunta a la Scout."""
    light = bpy.data.lights.new(name, 'AREA')
    light.size = size
    light.energy = energy
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    obj.visible_glossy = reflects
    return obj


def build_studio(scene):
    """Armo piso que solo recibe sombra, softboxes y una cámara que gira alrededor de la Scout."""
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.is_shadow_catcher = True
    add_area('Key', (-0.9, 1.1, 1.3), 1.2, 190)
    add_area('Fill', (1.3, 0.6, 0.7), 1.5, 60, reflects=False)
    add_area('Rim', (0.2, -1.4, 1.0), 1.0, 120)
    add_area('Top', (0, 0, 1.9), 1.6, 70, reflects=False)
    pivot = bpy.data.objects.new('Orbit', None)
    scene.collection.objects.link(pivot)
    camera_data = bpy.data.cameras.new('TurntableCam')
    camera_data.lens = 55
    camera = bpy.data.objects.new('TurntableCam', camera_data)
    scene.collection.objects.link(camera)
    elevation = math.radians(CAMERA_ELEVATION_DEG)
    camera.location = (0, CAMERA_DISTANCE * math.cos(elevation), TARGET_HEIGHT + CAMERA_DISTANCE * math.sin(elevation))
    camera.rotation_euler = (Vector((0, 0, TARGET_HEIGHT)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.parent = pivot
    scene.camera = camera
    for frame in range(FRAMES):
        pivot.rotation_euler = (0, 0, math.radians(START_AZIMUTH_DEG) + 2 * math.pi * frame / FRAMES)
        pivot.keyframe_insert('rotation_euler', frame=frame + 1)


def apply_finish(name):
    """Cambio el color base de los materiales ASA según el acabado pedido."""
    colors = FINISHES[name]
    if not colors:
        return
    for material_name, rgb in colors.items():
        bsdf = bpy.data.materials[material_name].node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)


def configure_render(scene, out_dir, finish):
    """Fondo transparente, pocas muestras con limpieza de ruido y semilla fija para que no parpadee."""
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.seed = 3
    scene.cycles.use_animated_seed = False
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = EXPOSURE
    scene.render.use_persistent_data = True
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = f'{out_dir}/{finish}_##'
    scene.frame_start = 1
    scene.frame_end = FRAMES


def main():
    """Abro la escena sin ejecutar sus scripts, armo el estudio y renderizo el acabado pedido."""
    args = sys.argv[sys.argv.index('--') + 1:]
    blend_path, out_dir, finish = args[0], args[1], args[2]
    first, last = (int(args[3]), int(args[4])) if len(args) > 4 else (1, FRAMES)
    bpy.ops.wm.open_mainfile(filepath=blend_path, load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    clean_scene(scene)
    build_studio(scene)
    apply_finish(finish)
    configure_render(scene, out_dir, finish)
    scene.frame_start = first
    scene.frame_end = last
    bpy.ops.render.render(animation=True)


if __name__ == '__main__':
    main()
