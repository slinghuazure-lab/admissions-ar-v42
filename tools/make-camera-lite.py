"""Create an animated preview GLB using one shared vertex map for every morph.
Run inside Blender for bundled numpy and image resizing; never re-export the rig.
"""
import bpy, numpy as np, sys, json, struct, copy
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:];source,target=map(Path,args[:2])
raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
out=copy.deepcopy(doc);out['accessors']=[];out['bufferViews']=[];packed=bytearray();cache={}
widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
dtypes={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
def view_bytes(index):
 v=doc['bufferViews'][index];return binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def read(index):
 a=doc['accessors'][index];dtype=np.dtype(dtypes[a['componentType']]);w=widths[a['type']]
 data=np.zeros((a['count'],w),dtype=dtype)
 if 'bufferView' in a:
  v=doc['bufferViews'][a['bufferView']];data=np.ndarray((a['count'],w),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dtype.itemsize),dtype.itemsize)).copy()
 if 'sparse' in a:
  s=a['sparse'];ind=s['indices'];values=s['values']
  ids=np.frombuffer(view_bytes(ind['bufferView']),dtype=dtypes[ind['componentType']],count=s['count'],offset=ind.get('byteOffset',0))
  data[ids]=np.frombuffer(view_bytes(values['bufferView']),dtype=dtype,count=s['count']*w,offset=values.get('byteOffset',0)).reshape(-1,w)
 return data
def add_view(data):
 packed.extend(b'\0'*((-len(packed))%4));i=len(out['bufferViews']);out['bufferViews'].append({'buffer':0,'byteOffset':len(packed),'byteLength':len(data)});packed.extend(data);return i
def add_array(data,template,bounds=False):
 a={k:copy.deepcopy(v) for k,v in template.items() if k not in ['bufferView','byteOffset','sparse','count','min','max']}
 a.update(bufferView=add_view(np.ascontiguousarray(data,dtype=dtypes[a['componentType']]).tobytes()),count=len(data))
 if bounds or 'min' in template:a['min']=data.min(axis=0).tolist()
 if bounds or 'max' in template:a['max']=data.max(axis=0).tolist()
 i=len(out['accessors']);out['accessors'].append(a);return i
def copy_accessor(index):
 if index not in cache:cache[index]=add_array(read(index),doc['accessors'][index])
 return cache[index]
before=after=vertices_before=vertices_after=0
for mesh in out['meshes']:
 for p in mesh['primitives']:
  attrs={k:read(v) for k,v in p['attributes'].items()};pos=attrs['POSITION'];count=len(pos);vertices_before+=count
  indices=read(p['indices']).reshape(-1) if 'indices' in p else np.arange(count,dtype=np.uint32)
  before+=len(indices)//3
  if count>2500:
   # Attribute seams may duplicate vertices, but share geometric positions,
   # morph deltas and skinning so animation cannot open cracks at those seams.
   cell=max(float(np.ptp(pos,axis=0).max())/20,1e-7)
   spatial=np.floor((pos-pos.min(axis=0))/cell).astype(np.int32)
   _,geo_first,geo_inverse=np.unique(spatial,axis=0,return_index=True,return_inverse=True)
   keys=[spatial]
   for k,a in attrs.items():
    if k.startswith('TEXCOORD_'):keys.append(np.floor(a*16).astype(np.int32))
    elif k=='NORMAL':keys.append(np.floor(a*2).astype(np.int32))
   _,first,inverse=np.unique(np.concatenate(keys,axis=1),axis=0,return_index=True,return_inverse=True)
  else:first=np.arange(count);inverse=first;geo_first=first;geo_inverse=first
  groups=len(first);weights=np.bincount(inverse,minlength=groups).reshape(-1,1)
  def reduce(data,semantic='',morph=False):
   if semantic.startswith(('JOINTS_','WEIGHTS_')):return data[geo_first[geo_inverse[first]]]
   if semantic=='POSITION':
    totals=np.bincount(geo_inverse,minlength=len(geo_first)).reshape(-1,1)
    merged=np.stack([np.bincount(geo_inverse,weights=data[:,k],minlength=len(geo_first)) for k in range(data.shape[1])],axis=1)/totals
    return merged[geo_inverse[first]].astype(data.dtype)
   reduced=np.stack([np.bincount(inverse,weights=data[:,k],minlength=groups) for k in range(data.shape[1])],axis=1)/weights
   if not morph and semantic in ['NORMAL','TANGENT']:
    reduced[:,:3]/=np.maximum(np.linalg.norm(reduced[:,:3],axis=1,keepdims=True),1e-12)
    if semantic=='TANGENT':reduced[:,3]=np.where(reduced[:,3]>=0,1,-1)
   if np.issubdtype(data.dtype,np.integer):reduced=np.rint(reduced)
   return reduced.astype(data.dtype)
  for k,index in list(p['attributes'].items()):p['attributes'][k]=add_array(reduce(attrs[k],k),doc['accessors'][index],k=='POSITION')
  for morph in p.get('targets',[]):
   for k,index in list(morph.items()):
    if k in ['NORMAL','TANGENT']:del morph[k]
    else:morph[k]=add_array(reduce(read(index),k,True),doc['accessors'][index])
  triangles=inverse[indices].reshape(-1,3);triangles=triangles[(triangles[:,0]!=triangles[:,1])&(triangles[:,1]!=triangles[:,2])&(triangles[:,0]!=triangles[:,2])]
  index_type=5123 if groups<65536 else 5125
  p['indices']=add_array(triangles.reshape(-1,1),{'type':'SCALAR','componentType':index_type})
  after+=len(triangles);vertices_after+=groups
for skin in out.get('skins',[]):
 if 'inverseBindMatrices' in skin:skin['inverseBindMatrices']=copy_accessor(skin['inverseBindMatrices'])
for animation in out['animations']:
 for sampler in animation['samplers']:
  for key in ['input','output']:sampler[key]=copy_accessor(sampler[key])
scratch=target.parent/'lite-textures';scratch.mkdir(parents=True,exist_ok=True)
for i,image in enumerate(out.get('images',[])):
 old=doc['images'][i];path=scratch/f'source-{i}.img';path.write_bytes(view_bytes(old['bufferView']))
 img=bpy.data.images.load(str(path.resolve()),check_existing=False)
 ratio=min(1,256/max(img.size));img.scale(max(1,round(img.size[0]*ratio)),max(1,round(img.size[1]*ratio)))
 path=scratch/f'lite-{i}.png';img.filepath_raw=str(path.resolve());img.file_format='PNG';img.save();bpy.data.images.remove(img)
 image.update(bufferView=add_view(path.read_bytes()),mimeType='image/png')
packed.extend(b'\0'*((-len(packed))%4));out['buffers']=[{'byteLength':len(packed)}]
out['asset']['generator']='Admissions AR animated preview; shared morph-aware vertex clustering'
report={'source_triangles':before,'preview_triangles':after,'source_vertices':vertices_before,'preview_vertices':vertices_after,'texture_max_edge':256,'duration_seconds':60,'rig_reexported':False,'morph_positions_retained':True,'morph_normals_omitted':True}
out.setdefault('extras',{})['cameraPreview']=report
js=json.dumps(out,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
blob=struct.pack('<III',0x46546c67,2,28+len(js)+len(packed))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(packed),0x004e4942)+packed
target.write_bytes(blob);report['output_bytes']=len(blob);Path(str(target)+'.report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
