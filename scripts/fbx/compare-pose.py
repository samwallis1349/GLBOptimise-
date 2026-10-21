# Imports a model (glb or fbx) and prints, for several frames of its first
# action, the evaluated (deformed) world bounding box of all meshes, plus rig facts.
#   blender -b --factory-startup --python scripts/fbx/compare-pose.py -- model.(glb|fbx)
import bpy, sys, json
path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
(bpy.ops.import_scene.fbx if path.lower().endswith('.fbx') else bpy.ops.import_scene.gltf)(filepath=path)
scene = bpy.context.scene
arms = [o for o in scene.objects if o.type == 'ARMATURE']
meshes = [o for o in scene.objects if o.type == 'MESH' and o.vertex_groups]
action = None
for a in arms:
    if a.animation_data and a.animation_data.action: action = a.animation_data.action
start, end = (int(action.frame_range[0]), int(action.frame_range[1])) if action else (1, 1)
frames = [start + (end - start) * k / 8 for k in range(9)]
out = {'bones': sum(len(a.data.bones) for a in arms), 'vertex_groups': sorted({g.name for m in meshes for g in m.vertex_groups}),
       'action': action.name if action else None, 'range': [start, end], 'frames': {}}
for f in frames:
    scene.frame_set(int(f), subframe=f - int(f))
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for m in meshes:
        e = m.evaluated_get(dg); me = e.to_mesh()
        pts += [e.matrix_world @ v.co for v in me.vertices]
        e.to_mesh_clear()
    lo = [round(min(p[i] for p in pts), 3) for i in range(3)]; hi = [round(max(p[i] for p in pts), 3) for i in range(3)]
    out['frames'][round((f - start) / max(1, end - start), 3)] = [lo, hi]
print('POSE', json.dumps(out))
