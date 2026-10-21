# Imports an FBX into an empty Blender scene and prints what came through,
# as JSON on a line starting FBX_CHECK.
#   blender -b --factory-startup --python scripts/fbx/check-in-blender.py -- file.fbx
import bpy, sys, json
path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=path)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
images = [i for i in bpy.data.images if i.size[0] > 0]
mats = []
for m in bpy.data.materials:
    tex = None
    if m.use_nodes:
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf and bsdf.inputs['Base Color'].is_linked:
            src = bsdf.inputs['Base Color'].links[0].from_node
            tex = getattr(getattr(src, 'image', None), 'name', None)
    mats.append({'name': m.name, 'texture': tex})
lo = [min(v[i] for o in meshes for v in [o.matrix_world @ vv.co for vv in o.data.vertices]) for i in range(3)] if meshes else []
hi = [max(v[i] for o in meshes for v in [o.matrix_world @ vv.co for vv in o.data.vertices]) for i in range(3)] if meshes else []
uv = all(o.data.uv_layers for o in meshes)
print('FBX_CHECK', json.dumps({'meshes': len(meshes), 'triangles': tris, 'materials': mats, 'images': [(i.name, list(i.size)) for i in images], 'uvs': uv, 'bounds_min': [round(x, 3) for x in lo], 'bounds_max': [round(x, 3) for x in hi]}))
