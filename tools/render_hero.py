"""Renderizo el video de portada con Cycles: la Scout de la escena de Blender sigue a un dron en un bucle."""

import json
import math
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

LOOP_FRAMES = 192
FPS = 24
WIDTH = 1600
HEIGHT = 900
SAMPLES = 16
CAMERA_SHIFT_X = -0.15
DRONE_DEPTH = 14.0
DRONE_SCALE = 1.0


def material(name, color, roughness=0.5, metallic=0.0, emission=None, alpha=1.0):
    """Creo un material Principled sencillo."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Alpha'].default_value = alpha
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 6.0
    return mat


def add_part(kind, parent, location, scale, mat, rotation=(0, 0, 0)):
    """Agrego una pieza primitiva emparentada al dron."""
    if kind == 'cube':
        bpy.ops.mesh.primitive_cube_add(size=1)
    elif kind == 'cylinder':
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.5, depth=1)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.5)
    part = bpy.context.active_object
    part.location = location
    part.scale = scale
    part.rotation_euler = rotation
    part.data.materials.append(mat)
    part.parent = parent
    bpy.ops.object.shade_smooth()
    return part


def build_drone():
    """Armo un dron cuadricóptero de ~35 cm con hélices como discos de movimiento."""
    root = bpy.data.objects.new('Dron', None)
    bpy.context.scene.collection.objects.link(root)
    shell = material('Dron carcasa', (0.82, 0.83, 0.85), 0.35)
    dark = material('Dron gris', (0.05, 0.055, 0.06), 0.45, 0.3)
    blur = material('Dron hélice', (0.02, 0.02, 0.02), 0.6, alpha=0.28)
    red = material('Dron LED rojo', (1, 0.1, 0.1), emission=(1, 0.1, 0.08))
    green = material('Dron LED verde', (0.1, 1, 0.3), emission=(0.1, 1, 0.3))
    add_part('cube', root, (0, 0, 0), (0.09, 0.16, 0.045), shell)
    add_part('cube', root, (0, 0.01, 0.03), (0.07, 0.11, 0.025), dark)
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        arm = add_part('cube', root, (sx * 0.075, sy * 0.07, 0), (0.17, 0.018, 0.014), dark)
        arm.rotation_euler = (0, 0, math.atan2(sy * 0.07, sx * 0.075))
        add_part('cylinder', root, (sx * 0.15, sy * 0.14, 0.012), (0.034, 0.034, 0.03), dark)
        add_part('cylinder', root, (sx * 0.15, sy * 0.14, 0.032), (0.2, 0.2, 0.002), blur)
        add_part('sphere', root, (sx * 0.15, sy * 0.14, -0.01), (0.012, 0.012, 0.012), green if sy > 0 else red)
    add_part('sphere', root, (0, 0.085, -0.035), (0.04, 0.04, 0.04), dark)
    root.scale = (DRONE_SCALE,) * 3
    return root


def camera_point(camera, scene, u, v, depth):
    """Convierto una posición en pantalla (u, v de 0 a 1) y una profundidad en metros a coordenadas del mundo."""
    frame = [Vector(c) for c in camera.data.view_frame(scene=scene)]
    top_right, bottom_right, bottom_left, top_left = frame
    point = bottom_left + (bottom_right - bottom_left) * u + (top_left - bottom_left) * v
    point *= depth / -point.z
    return camera.matrix_world @ point


def drone_path(frame):
    """Trayectoria periódica en pantalla: un ocho suave en el cielo, a la izquierda de la Scout."""
    theta = 2 * math.pi * frame / LOOP_FRAMES
    u = 0.37 + 0.18 * math.sin(theta)
    v = 0.74 + 0.07 * math.sin(2 * theta)
    depth = DRONE_DEPTH + 3.0 * math.cos(theta)
    return u, v, depth


def track(obj, target, lock_axis):
    """Hago que un pivote de la Scout gire solo sobre su eje para apuntar el frente (-Y) al dron."""
    obj.constraints.clear()
    constraint = obj.constraints.new('LOCKED_TRACK')
    constraint.target = target
    constraint.lock_axis = lock_axis
    constraint.track_axis = 'TRACK_NEGATIVE_Y'


def setup(scene, out_dir):
    """Preparo cámara, dron, animación, seguimiento y ajustes de render."""
    camera = scene.camera
    camera.data.shift_x = CAMERA_SHIFT_X
    drone = build_drone()
    for frame in range(LOOP_FRAMES + 1):
        u, v, depth = drone_path(frame)
        drone.location = camera_point(camera, scene, u, v, depth)
        nu, nv, nd = drone_path(frame + 1)
        ahead = camera_point(camera, scene, nu, nv, nd) - drone.location
        drone.rotation_euler = (0.06 * math.sin(2 * math.pi * frame / LOOP_FRAMES), -0.12 * ahead.normalized().x, math.atan2(ahead.y, ahead.x) - math.pi / 2)
        drone.keyframe_insert('location', frame=frame + 1)
        drone.keyframe_insert('rotation_euler', frame=frame + 1)
    track(bpy.data.objects['PAN'], drone, 'LOCK_Z')
    track(bpy.data.objects['TILT'], drone, 'LOCK_X')

    scene.frame_start = 1
    scene.frame_end = LOOP_FRAMES
    scene.render.fps = FPS
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.use_persistent_data = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = f'{out_dir}/f####'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.seed = 7
    scene.cycles.use_animated_seed = False

    boxes = []
    for frame in range(1, LOOP_FRAMES + 1):
        scene.frame_set(frame)
        corners = [world_to_camera_view(scene, camera, drone.matrix_world @ Vector((x, y, z)))
                   for x in (-0.25, 0.25) for y in (-0.25, 0.25) for z in (-0.06, 0.06)]
        boxes.append({'x0': min(c.x for c in corners), 'x1': max(c.x for c in corners),
                      'y0': 1 - max(c.y for c in corners), 'y1': 1 - min(c.y for c in corners)})
    with open(f'{out_dir}/boxes.json', 'w') as target:
        json.dump(boxes, target)


def main():
    """Abro la escena sin ejecutar sus scripts, la preparo y renderizo los cuadros pedidos."""
    args = sys.argv[sys.argv.index('--') + 1:]
    blend_path, out_dir = args[0], args[1]
    first, last = (int(args[2]), int(args[3])) if len(args) > 3 else (1, LOOP_FRAMES)
    bpy.ops.wm.open_mainfile(filepath=blend_path, load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    setup(scene, out_dir)
    scene.frame_start = first
    scene.frame_end = last
    bpy.ops.render.render(animation=True)


if __name__ == '__main__':
    main()
