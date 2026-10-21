# Blender: import an FBX and export it as GLB (for test fixtures).
#   blender -b --factory-startup --python scripts/fbx/fbx-to-glb.py -- in.fbx out.glb
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=a[0])
bpy.ops.export_scene.gltf(filepath=a[1], export_format='GLB', export_animations=True)
print('GLB_OK')
