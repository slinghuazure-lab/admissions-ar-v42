"""Pack a GLB with meshopt without changing topology, skinning, or animation.
Uses the already installed Blender meshoptimizer bridge (no Blender re-export).
Only geometry POSITION/NORMAL floats get bounded precision reduction; all other
streams, textures and animation values must round-trip byte-for-byte.
Usage: python tools/compress-camera-model.py INPUT OUTPUT BRIDGE_DLL
"""
import ctypes as C, copy, json, math, os, struct, sys, gzip
from pathlib import Path

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
source,target,dll=args[:3]
_dll_dirs=[]
if sys.platform=='win32':
    for directory in [Path(dll).parent,Path(dll).parents[4]]:
        _dll_dirs.append(os.add_dll_directory(str(directory)))
raw=Path(source).read_bytes();json_size=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+json_size]);original=raw[28+json_size:]
assert len(doc['buffers'])==1 and not doc.get('extensionsRequired')
lib=C.CDLL(str(Path(dll).resolve()))
for name,value in [('encodeIndexVersion',1),('encodeVertexVersion',0)]:
    fn=getattr(lib,name);fn.argtypes=[C.c_int];fn.restype=None;fn(value)
for name in ['encodeVertexBufferBound','encodeIndexSequenceBound']:
    fn=getattr(lib,name);fn.argtypes=[C.c_size_t,C.c_size_t];fn.restype=C.c_size_t
lib.encodeVertexBuffer.argtypes=[C.c_void_p,C.c_size_t,C.c_void_p,C.c_size_t,C.c_size_t];lib.encodeVertexBuffer.restype=C.c_size_t
lib.encodeIndexSequence.argtypes=[C.c_void_p,C.c_size_t,C.c_void_p,C.c_size_t];lib.encodeIndexSequence.restype=C.c_size_t
for name in ['decodeVertexBuffer','decodeIndexSequence']:
    fn=getattr(lib,name);fn.argtypes=[C.c_void_p,C.c_size_t,C.c_size_t,C.c_void_p,C.c_size_t];fn.restype=C.c_int
lib.encodeFilterExp.argtypes=[C.c_void_p,C.c_size_t,C.c_size_t,C.c_int,C.c_void_p,C.c_int];lib.encodeFilterExp.restype=None
lib.decodeFilterExp.argtypes=[C.c_void_p,C.c_size_t,C.c_size_t];lib.decodeFilterExp.restype=None
sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
bytes_per={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
semantics={i:set() for i in range(len(doc['accessors']))}
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        for name,index in primitive['attributes'].items():semantics[index].add(name)
        if 'indices' in primitive:semantics[primitive['indices']].add('INDEX')
        for morph in primitive.get('targets',[]):
            for name,index in morph.items():semantics[index].add(name)
refs={};strides={};index_views={}
for i,a in enumerate(doc['accessors']):
    stride=sizes[a['type']]*bytes_per[a['componentType']]
    if 'bufferView' in a:
        v=a['bufferView'];refs.setdefault(v,set()).update(semantics[i] or {'OTHER'});strides.setdefault(v,set()).add(stride)
        if semantics[i]=={'INDEX'} and a['componentType'] in [5123,5125]:index_views[v]=bytes_per[a['componentType']]
    if 'sparse' in a:
        v=a['sparse']['values']['bufferView'];refs.setdefault(v,set()).update(semantics[i] or {'OTHER'});strides.setdefault(v,set()).add(stride)
        v=a['sparse']['indices']['bufferView'];refs.setdefault(v,set()).add('SPARSE_INDEX');strides.setdefault(v,set()).add(bytes_per[a['sparse']['indices']['componentType']])
        if a['sparse']['indices']['componentType'] in [5123,5125]:index_views[v]=bytes_per[a['sparse']['indices']['componentType']]
images={im['bufferView'] for im in doc.get('images',[]) if 'bufferView' in im}
result=copy.deepcopy(doc);packed=bytearray();virtual=0;quantized={};max_error=0;encoded_count=0
def append(data):
    packed.extend(b'\0'*((-len(packed))%4));offset=len(packed);packed.extend(data);return offset
for i,v in enumerate(doc['bufferViews']):
    offset=v.get('byteOffset',0);data=original[offset:offset+v['byteLength']];new=result['bufferViews'][i]
    if i in images or len(data)<64:
        new.update(buffer=0,byteOffset=append(data));continue
    mode='INDICES' if i in index_views else 'ATTRIBUTES';filter_name='NONE'
    if mode=='INDICES':
        stride=index_views[i];assert len(data)%stride==0
        count=len(data)//stride;indices=struct.unpack('<'+('H' if stride==2 else 'I')*count,data)
        array=(C.c_uint*count)(*indices);bound=lib.encodeIndexSequenceBound(count,max(indices,default=0)+1)
        output=C.create_string_buffer(bound);written=lib.encodeIndexSequence(output,bound,array,count)
    else:
        candidates=strides.get(i,{4});stride=v.get('byteStride') or (next(iter(candidates)) if len(candidates)==1 else 4)
        if stride%4 or stride>256 or len(data)%stride:stride=4
        padded=data+b'\0'*((-len(data))%stride);count=len(padded)//stride;input_buffer=C.create_string_buffer(padded)
        quant=bool(refs.get(i)) and refs[i].issubset({'POSITION','NORMAL'})
        if quant:
            filtered=C.create_string_buffer(len(padded));lib.encodeFilterExp(filtered,count,stride,18,input_buffer,1);input_buffer=filtered;filter_name='EXPONENTIAL'
        bound=lib.encodeVertexBufferBound(count,stride);output=C.create_string_buffer(bound);written=lib.encodeVertexBuffer(output,bound,input_buffer,count,stride)
    assert written>0
    encoded=output.raw[:written];decoded=C.create_string_buffer(count*stride)
    decode=lib.decodeIndexSequence if mode=='INDICES' else lib.decodeVertexBuffer
    assert decode(decoded,count,stride,C.create_string_buffer(encoded),written)==0
    if filter_name=='EXPONENTIAL':lib.decodeFilterExp(decoded,count,stride)
    restored=decoded.raw[:len(data)]
    if filter_name=='EXPONENTIAL':
        a=struct.iter_unpack('<f',data);b=struct.iter_unpack('<f',restored)
        error=max((abs(x[0]-y[0]) for x,y in zip(a,b)),default=0);assert error<=.0001,(i,error)
        max_error=max(max_error,error);quantized[i]=restored
    else:assert restored==data,('Lossless stream mismatch',i)
    if len(encoded)>=len(data) and filter_name=='NONE':new.update(buffer=0,byteOffset=append(data));continue
    virtual=(virtual+3)//4*4;new.update(buffer=1,byteOffset=virtual,byteLength=count*stride);virtual+=count*stride
    new.setdefault('extensions',{})['EXT_meshopt_compression']={'buffer':0,'byteOffset':append(encoded),'byteLength':len(encoded),'byteStride':stride,'count':count,'mode':mode,'filter':filter_name}
    encoded_count+=1

# Keep POSITION bounds consistent with the decoded bounded-precision data.
for a in result['accessors']:
    if 'min' not in a and 'max' not in a:continue
    sparse=a.get('sparse');entry=sparse['values'] if sparse else a;view=entry.get('bufferView')
    if view not in quantized:continue
    assert a['componentType']==5126
    width=sizes[a['type']];count=sparse['count'] if sparse else a['count'];offset=entry.get('byteOffset',0);stride=doc['bufferViews'][view].get('byteStride',width*4)
    zero=bool(sparse and sparse['count']<a['count']);minimum=[0 if zero else math.inf]*width;maximum=[0 if zero else -math.inf]*width
    for j in range(count):
        for k,value in enumerate(struct.unpack_from('<'+'f'*width,quantized[view],offset+j*stride)):
            minimum[k]=min(minimum[k],value);maximum[k]=max(maximum[k],value)
    if 'min' in a:a['min']=minimum
    if 'max' in a:a['max']=maximum
packed.extend(b'\0'*((-len(packed))%4))
result['buffers']=[{'byteLength':len(packed)},{'byteLength':virtual,'extensions':{'EXT_meshopt_compression':{'fallback':True}}}]
for name in ['extensionsUsed','extensionsRequired']:result[name]=list(dict.fromkeys(result.get(name,[])+['EXT_meshopt_compression']))
report={'source_bytes':len(raw),'compressed_views':encoded_count,'position_normal_max_error':max_error,'topology_changed':False,'animation_changed':False,'textures_changed':False,'geometry_precision_bits':18}
result.setdefault('extras',{})['cameraOptimization']=report
js=json.dumps(result,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
blob=struct.pack('<III',0x46546c67,2,28+len(js)+len(packed))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(packed),0x004e4942)+packed
Path(target).parent.mkdir(parents=True,exist_ok=True);Path(target).write_bytes(blob)
report.update(output_bytes=len(blob),reduction_percent=round((1-len(blob)/len(raw))*100,1),source_gzip_bytes=len(gzip.compress(raw,compresslevel=6)),output_gzip_bytes=len(gzip.compress(blob,compresslevel=6)))
Path(str(target)+'.report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
