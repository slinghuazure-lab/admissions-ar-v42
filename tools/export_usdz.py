"""Run in Blender: --background --factory-startup --python tools/export_usdz.py -- INPUT OUTPUT"""
import bpy, sys, json
from pathlib import Path
source,target=sys.argv[sys.argv.index('--')+1:]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
scene=bpy.context.scene
scene.render.fps=24;scene.frame_start=1;scene.frame_end=1441
for obj in scene.objects:
    if obj.animation_data:
        obj.animation_data.use_nla=True
        for track in obj.animation_data.nla_tracks:track.mute=False
    if obj.type=='MESH' and obj.data.shape_keys and obj.data.shape_keys.animation_data:
        obj.data.shape_keys.animation_data.use_nla=True
scene.frame_set(1)
bpy.ops.wm.usd_export(filepath=str(Path(target).resolve()),export_animation=True,
    export_armatures=True,export_shapekeys=True,export_materials=True,
    generate_preview_surface=True,generate_materialx_network=False,
    export_textures_mode='NEW',overwrite_textures=True,export_lights=False,
    export_cameras=False,convert_orientation=True,export_global_up_selection='Y',
    export_global_forward_selection='NEGATIVE_Z',usdz_downscale_size='1024',
    convert_scene_units='METERS',relative_paths=True)
from pxr import Usd, UsdSkel
stage=Usd.Stage.Open(str(Path(target).resolve()))
animations=[p for p in stage.Traverse() if p.IsA(UsdSkel.Animation)]
report={'file':Path(target).name,'start':stage.GetStartTimeCode(),'end':stage.GetEndTimeCode(),
    'frames_per_second':stage.GetTimeCodesPerSecond(),'skeleton_animations':len(animations),
    'max_joint_samples':max((len(UsdSkel.Animation(p).GetRotationsAttr().GetTimeSamples()) for p in animations),default=0),
    'bytes':Path(target).stat().st_size}
Path(str(target)+'.report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
assert animations and report['max_joint_samples']>100, 'USDZ skeletal animation missing'
print('USDZ_REPORT '+json.dumps(report))
