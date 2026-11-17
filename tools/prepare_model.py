"""Combine named GLB clips, compact referenced data, and keep replaceable assets.
Usage: python tools/prepare_model.py INPUT OUTPUT CLIP [CLIP ...]
Only standard Python is required. CUBICSPLINE/sparse data are rejected explicitly.
"""
import copy, json, math, struct, sys
from pathlib import Path

SIZES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16,'MAT3':9,'MAT2':4}

def mix(a, b, t, rotation=False):
    if rotation:
        dot = sum(x*y for x,y in zip(a,b))
        if dot < 0: b, dot = [-v for v in b], -dot
        if dot < .9995:
            angle = math.acos(max(-1,min(1,dot)))
            return [(x*math.sin((1-t)*angle)+y*math.sin(t*angle))/math.sin(angle) for x,y in zip(a,b)]
    values = [x+(y-x)*t for x,y in zip(a,b)]
    if rotation:
        length = math.sqrt(sum(x*x for x in values))
        return [x/length for x in values]
    return values

def simplify(times, values, rotation):
    keep = {0,len(times)-1}; stack = [(0,len(times)-1)]
    while stack:
        a,b = stack.pop()
        if b-a < 2: continue
        error,index = 0,None
        for i in range(a+1,b):
            predicted = mix(values[a],values[b],(times[i]-times[a])/(times[b]-times[a]),rotation)
            distance = max(abs(x-y) for x,y in zip(predicted,values[i]))
            if distance > error: error,index = distance,i
        if error > .00001 and index is not None:
            keep.add(index);stack.extend([(a,index),(index,b)])
    indices = sorted(keep)
    return [times[i] for i in indices],[values[i] for i in indices]

def prepare(source, target, names):
    raw = Path(source).read_bytes()
    assert raw[:4] == b'glTF' and struct.unpack_from('<I',raw,4)[0] == 2
    size = struct.unpack_from('<I',raw,12)[0]
    document = json.loads(raw[20:20+size]); binary = raw[28+size:]
    animations = {a['name']:a for a in document['animations']}
    chosen = [animations[name] for name in names]
    def read(index):
        accessor = document['accessors'][index]
        if 'sparse' in accessor: raise ValueError('Sparse animation accessor is unsupported')
        assert accessor['componentType'] == 5126
        view = document['bufferViews'][accessor['bufferView']]
        assert not view.get('byteStride')
        count = accessor['count']*SIZES[accessor['type']]
        offset = view.get('byteOffset',0)+accessor.get('byteOffset',0)
        return list(struct.unpack_from('<'+'f'*count,binary,offset))
    def channels(animation):
        return {(c['target']['node'],c['target']['path']):c for c in animation['channels']}
    maps = [channels(a) for a in chosen]
    assert all(m.keys() == maps[0].keys() for m in maps), 'Clips need identical channel targets'
    durations = [max(read(s['input'])[-1] for s in a['samplers']) for a in chosen]
    result = copy.deepcopy(document); result['bufferViews']=[];result['accessors']=[]
    output = bytearray(); old_views = {}; old_accessors = {}
    def add_view(data, template=None):
        output.extend(b'\0'*((-len(output))%4)); offset=len(output);output.extend(data)
        view=copy.deepcopy(template or {});view.update(buffer=0,byteOffset=offset,byteLength=len(data))
        result['bufferViews'].append(view);return len(result['bufferViews'])-1
    def view(index):
        if index not in old_views:
            v=document['bufferViews'][index];off=v.get('byteOffset',0)
            old_views[index]=add_view(binary[off:off+v['byteLength']],v)
        return old_views[index]
    def accessor(index):
        if index not in old_accessors:
            a=copy.deepcopy(document['accessors'][index])
            if 'bufferView' in a:a['bufferView']=view(a['bufferView'])
            if 'sparse' in a:
                for part in ['indices','values']:a['sparse'][part]['bufferView']=view(a['sparse'][part]['bufferView'])
            result['accessors'].append(a);old_accessors[index]=len(result['accessors'])-1
        return old_accessors[index]
    def morph_accessor(index):
        if index in old_accessors:return old_accessors[index]
        a=copy.deepcopy(document['accessors'][index])
        if a.get('sparse') or a['componentType']!=5126:return accessor(index)
        values=read(index);width=SIZES[a['type']]
        active=[i for i in range(a['count']) if any(v!=0 for v in values[i*width:(i+1)*width])]
        if len(active)*1.2>=a['count']:return accessor(index)
        a.pop('bufferView',None);a.pop('byteOffset',None)
        if active:
            short=a['count']<65536;fmt='H' if short else 'I'
            indices=add_view(struct.pack('<'+fmt*len(active),*active))
            flat=[v for i in active for v in values[i*width:(i+1)*width]]
            data=add_view(struct.pack('<'+'f'*len(flat),*flat))
            a['sparse']={'count':len(active),'indices':{'bufferView':indices,'componentType':5123 if short else 5125},'values':{'bufferView':data}}
        result['accessors'].append(a);old_accessors[index]=len(result['accessors'])-1
        return old_accessors[index]
    for mesh in result.get('meshes',[]):
        for primitive in mesh['primitives']:
            for key,value in primitive['attributes'].items():primitive['attributes'][key]=accessor(value)
            if 'indices' in primitive:primitive['indices']=accessor(primitive['indices'])
            for morph in primitive.get('targets',[]):
                for key,value in morph.items():morph[key]=morph_accessor(value)
    for skin in result.get('skins',[]):
        if 'inverseBindMatrices' in skin:skin['inverseBindMatrices']=accessor(skin['inverseBindMatrices'])
    for image in result.get('images',[]):
        if 'bufferView' in image:image['bufferView']=view(image['bufferView'])
    def floats(values, kind, count, bounds=False):
        index=add_view(struct.pack('<'+'f'*len(values),*values))
        a={'bufferView':index,'componentType':5126,'count':count,'type':kind}
        if bounds:a.update(min=[min(values)],max=[max(values)])
        result['accessors'].append(a);return len(result['accessors'])-1
    combined={'name':'Exhibit_Loop','channels':[],'samplers':[]}
    for key,original in maps[0].items():
        times=[];values=[];offset=0;kind=None;interpolation=None
        for animation,mapping,duration in zip(chosen,maps,durations):
            sampler=animation['samplers'][mapping[key]['sampler']]
            mode=sampler.get('interpolation','LINEAR')
            assert mode in ['LINEAR','STEP'], 'Unsupported animation interpolation'
            if interpolation is None:interpolation=mode
            assert mode==interpolation
            ts=read(sampler['input']);vs=read(sampler['output']);a=document['accessors'][sampler['output']]
            kind=a['type'];width=len(vs)//len(ts)
            assert width*len(ts)==len(vs)
            for i,t in enumerate(ts):
                absolute=t+offset
                row=vs[i*width:(i+1)*width]
                if times and abs(times[-1]-absolute)<1e-5:
                    values[-1]=row
                else:times.append(absolute);values.append(row)
            offset+=duration
        before=len(times)
        if interpolation=='LINEAR':times,values=simplify(times,values,key[1]=='rotation')
        flat=[v for row in values for v in row]
        input_index=floats(times,'SCALAR',len(times),True)
        output_index=floats(flat,kind,len(flat)//SIZES[kind])
        combined['channels'].append({'sampler':len(combined['samplers']),'target':copy.deepcopy(original['target'])})
        combined['samplers'].append({'input':input_index,'output':output_index,'interpolation':interpolation})
    result['animations']=[combined]
    result['buffers']=[{'byteLength':len(output)}]
    result.setdefault('asset',{})['generator']='Admissions AR / loss-bounded animation compaction'
    metadata={'source_clips':names,'duration_seconds':sum(durations),'channel_count':len(combined['channels']),
              'source_bytes':len(raw),'max_key_component_error':.00001,'transition':'original clip boundaries; visual/device QA required'}
    result.setdefault('extras',{})['exhibit']=metadata
    js=json.dumps(result,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
    output.extend(b'\0'*((-len(output))%4))
    packed=struct.pack('<III',0x46546c67,2,28+len(js)+len(output))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(output),0x004e4942)+output
    Path(target).parent.mkdir(parents=True,exist_ok=True);Path(target).write_bytes(packed)
    metadata['output_bytes']=len(packed)
    Path(str(target)+'.report.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(metadata,ensure_ascii=False))

if __name__=='__main__':prepare(sys.argv[1],sys.argv[2],sys.argv[3:])
