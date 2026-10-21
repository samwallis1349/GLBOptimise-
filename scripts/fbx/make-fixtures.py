# Builds the FBX test fixtures with Blender (headless):
#   blender -b --factory-startup --python scripts/fbx/make-fixtures.py -- tests/fixtures/fbx
# static-textured.fbx  a bevelled crate with an embedded 64 px checker texture
# rigged-animated.fbx  a two-bone arm skinned to a cylinder, with one 24-frame "Wave" action
import bpy, sys, os, math
out = sys.argv[sys.argv.index('--') + 1]
os.makedirs(out, exist_ok=True)

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

# ---- static textured
clear()
bpy.ops.mesh.primitive_cube_add(size=1)
crate = bpy.context.active_object
crate.name = 'Crate'
bevel = crate.modifiers.new('Bevel', 'BEVEL'); bevel.width = 0.06; bevel.segments = 2
bpy.ops.object.modifier_apply(modifier='Bevel')
img = bpy.data.images.new('checker', 64, 64)
px = []
for y in range(64):
    for x in range(64):
        on = ((x // 8) + (y // 8)) % 2
        px += [0.9, 0.55, 0.1, 1] if on else [0.15, 0.1, 0.08, 1]
img.pixels = px
img.filepath_raw = os.path.join(out, 'checker.png'); img.file_format = 'PNG'; img.save()
mat = bpy.data.materials.new('CrateWood'); mat.use_nodes = True
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
crate.data.materials.append(mat)
bpy.ops.object.shade_smooth()
bpy.ops.export_scene.fbx(filepath=os.path.join(out, 'static-textured.fbx'), path_mode='COPY', embed_textures=True, use_selection=False)

# ---- rigged + animated
clear()
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.15, depth=2, location=(0, 0, 1))
arm_mesh = bpy.context.active_object; arm_mesh.name = 'ArmMesh'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.subdivide(number_cuts=8); bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.armature_add(location=(0, 0, 0))
rig = bpy.context.active_object; rig.name = 'Rig'
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
upper = eb[0]; upper.name = 'Upper'; upper.head = (0, 0, 0); upper.tail = (0, 0, 1)
lower = eb.new('Lower'); lower.head = (0, 0, 1); lower.tail = (0, 0, 2); lower.parent = upper; lower.use_connect = True
bpy.ops.object.mode_set(mode='OBJECT')
arm_mesh.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
bpy.ops.object.mode_set(mode='POSE')
action = bpy.data.actions.new('Wave'); rig.animation_data_create(); rig.animation_data.action = action
pb = rig.pose.bones['Lower']; pb.rotation_mode = 'XYZ'
for frame, angle in [(1, 0), (12, 60), (24, 0)]:
    pb.rotation_euler = (math.radians(angle), 0, 0)
    pb.keyframe_insert('rotation_euler', frame=frame)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.scene.frame_start = 1; bpy.context.scene.frame_end = 24
bpy.ops.export_scene.fbx(filepath=os.path.join(out, 'rigged-animated.fbx'), use_selection=False, add_leaf_bones=False, bake_anim=True, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False)
print('FIXTURES_OK', sorted(os.listdir(out)))
