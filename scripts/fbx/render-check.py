# Renders an imported model (fbx or glb) with its textures, front three-quarter view.
#   blender -b --factory-startup --python scripts/fbx/render-check.py -- model.fbx out.png
import bpy, sys, math, mathutils
args = sys.argv[sys.argv.index('--') + 1:]
path, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
(bpy.ops.import_scene.fbx if path.lower().endswith('.fbx') else bpy.ops.import_scene.gltf)(filepath=path)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
c = (lo + hi) / 2; r = (hi - lo).length / 2
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.scene.collection.objects.link(cam)
d = mathutils.Vector((0.9, -1.6, 0.7)).normalized() * r * 2.6
cam.location = c + d; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
s = bpy.context.scene; s.camera = cam
s.render.engine = 'BLENDER_WORKBENCH'; s.display.shading.color_type = 'TEXTURE'; s.display.shading.light = 'STUDIO'
s.render.resolution_x = 512; s.render.resolution_y = 512; s.render.filepath = out
s.world = bpy.data.worlds.new('w'); s.world.color = (0.05, 0.05, 0.06)
bpy.ops.render.render(write_still=True)
print('RENDERED', out)
