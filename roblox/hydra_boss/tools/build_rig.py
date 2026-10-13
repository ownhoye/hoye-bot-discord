# Builds a skinned armature for the hydra and saves hydra_rigged.blend
import bpy, sys, math
from mathutils import Vector, Matrix
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-2])
OUT=sys.argv[-1]

# --- flatten: bake world transforms into mesh data, group by part
parts={}
empties={o.name:o.matrix_world.translation.copy() for o in bpy.data.objects if o.type=='EMPTY'}
for o in list(bpy.data.objects):
    if o.type!='MESH': continue
    part=o.parent.name
    mw=o.matrix_world.copy()
    o.data=o.data.copy()
    o.data.transform(mw)
    o.parent=None; o.matrix_world=Matrix.Identity(4)
    parts.setdefault(part,[]).append(o)
for o in list(bpy.data.objects):
    if o.type=='EMPTY': bpy.data.objects.remove(o)

def verts(part): return [v.co.copy() for o in parts[part] for v in o.data.vertices]
def bbox(part):
    ws=verts(part); return (Vector([min(w[i] for w in ws) for i in range(3)]), Vector([max(w[i] for w in ws) for i in range(3)]))
def mean(ps): s=Vector(); [s.__iadd__(p) for p in ps]; return s/len(ps)

def centerline(pts, start, shells=10):
    d=[(p-start).length for p in pts]; md=max(d)
    out=[start]
    for i in range(shells):
        a,b=md*i/shells, md*(i+1)/shells
        sel=[p for p,x in zip(pts,d) if a<=x<=b]
        if sel: out.append(mean(sel))
    return out
def resample(poly,n):
    L=[0]
    for a,b in zip(poly,poly[1:]): L.append(L[-1]+(b-a).length)
    res=[]
    for k in range(n+1):
        s=L[-1]*k/n
        for i in range(len(poly)-1):
            if L[i+1]>=s-1e-9:
                t=(s-L[i])/max(L[i+1]-L[i],1e-9); res.append(poly[i].lerp(poly[i+1],t)); break
    return res
def project(p,joints):
    best=(1e9,0)
    L=0
    for a,b in zip(joints,joints[1:]):
        ab=b-a; t=max(0,min(1,(p-a).dot(ab)/ab.length_squared)); q=a+ab*t
        dd=(p-q).length
        if dd<best[0]: best=(dd,L+t*ab.length)
        L+=ab.length
    return best[1]

bones={}   # name -> (head, tail, parent)
weights={} # part -> function(co)-> {bone:w}

def chain_weights(names,joints,blend=0.35):
    Ls=[0]
    for a,b in zip(joints,joints[1:]): Ls.append(Ls[-1]+(b-a).length)
    def f(co):
        s=project(co,joints); n=len(names)
        seg=n-1
        for i in range(n):
            if s<=Ls[i+1]: seg=i; break
        w={names[seg]:1.0}
        seglen=Ls[seg+1]-Ls[seg]; bw=blend*seglen
        if seg>0 and s-Ls[seg]<bw:
            t=0.5+0.5*(s-Ls[seg])/bw; w={names[seg]:t,names[seg-1]:1-t}
        elif seg<n-1 and Ls[seg+1]-s<bw:
            t=0.5+0.5*(Ls[seg+1]-s)/bw; w={names[seg]:t,names[seg+1]:1-t}
        return w
    return f

bones['Root']=(Vector((0,0,0)),Vector((0,-3,0)),None)
bones['Hips']=(Vector((0,2.5,8)),Vector((0,-0.5,8)),'Root')
bones['Chest']=(Vector((0,-0.5,8)),Vector((0,-4.5,9)),'Hips')
def body_w(co):
    t=max(0,min(1,(co.y-(-1.8))/2.6))  # y>0.8 -> hips, y<-1.8 -> chest
    t=t*t*(3-2*t); return {'Hips':t,'Chest':1-t}
weights['Body']=body_w

for leg,par in [('Leg_FrontLeft','Chest'),('Leg_FrontRight','Chest'),('Leg_BackLeft','Hips'),('Leg_BackRight','Hips')]:
    mn,mx=bbox(leg); cx,cy=(mn.x+mx.x)/2,(mn.y+mx.y)/2
    up,lo=leg.replace('Leg_','Leg')+'_Upper',leg.replace('Leg_','Leg')+'_Lower'
    hip=Vector((cx,cy,mx.z-1.2)); knee=Vector((cx,cy,4.6)); ankle=Vector((cx,cy,0.8))
    bones[up]=(hip,knee,par); bones[lo]=(knee,ankle,up)
    def lw(co,up=up,lo=lo):
        t=max(0,min(1,(co.z-3.8)/1.6)); t=t*t*(3-2*t); return {up:t,lo:1-t}
    weights[leg]=lw

# tail
tp=verts('Tail'); mn,mx=bbox('Tail')
start=mean([p for p in tp if p.y<mn.y+1.0]); start.x=0
tj=resample(centerline(tp,start,12),4)
tn=[f'Tail{i+1}' for i in range(4)]
for i,n in enumerate(tn): bones[n]=(tj[i],tj[i+1],'Hips' if i==0 else tn[i-1])
weights['Tail']=chain_weights(tn,tj)

# necks / heads / jaws
for side,S in [('Center','C'),('Left','L'),('Right','R')]:
    npnts=verts('Neck_'+side); mn,mx=bbox('Neck_'+side)
    base=mean([p for p in npnts if p.z<mn.z+1.2])
    cl=centerline(npnts,base,10)
    nj=resample(cl,3)
    nn=[f'Neck{S}{i+1}' for i in range(3)]
    for i,n in enumerate(nn): bones[n]=(nj[i],nj[i+1],'Chest' if i==0 else nn[i-1])
    weights['Neck_'+side]=chain_weights(nn,nj,0.45)
    hmn,hmx=bbox('Head_'+side)
    snout=Vector(((hmn.x+hmx.x)/2,hmn.y,empties['Head_'+side].z))
    bones['Head'+S]=(nj[-1],snout,nn[-1])
    weights['Head_'+side]=lambda co,S=S:{'Head'+S:1.0}
    jmn,jmx=bbox('Jaw_'+side)
    hinge=empties['Jaw_'+side]
    bones['Jaw'+S]=(hinge,Vector(((jmn.x+jmx.x)/2,jmn.y,jmn.z+0.5)),'Head'+S)
    weights['Jaw_'+side]=lambda co,S=S:{'Jaw'+S:1.0}

# wings
for side,S in [('Left','L'),('Right','R')]:
    wp=verts('Wing_'+side); root=empties['Wing_'+side]
    wj=resample(centerline(wp,root,10),3)
    wn=[f'Wing{S}{i+1}' for i in range(3)]
    for i,n in enumerate(wn): bones[n]=(wj[i],wj[i+1],'Chest' if i==0 else wn[i-1])
    weights['Wing_'+side]=chain_weights(wn,wj,0.4)

# --- armature
arm_data=bpy.data.armatures.new('HydraRig'); arm=bpy.data.objects.new('HydraRig',arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm; bpy.ops.object.mode_set(mode='EDIT')
for n,(h,t,p) in bones.items():
    eb=arm_data.edit_bones.new(n); eb.head=h; eb.tail=t
    eb.roll=0
    if p: eb.parent=arm_data.edit_bones[p]
    eb.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')

# --- weights then join by material
for part,objs in parts.items():
    f=weights[part]
    for o in objs:
        for v in o.data.vertices:
            for bn,w in f(v.co).items():
                if w<=1e-4: continue
                g=o.vertex_groups.get(bn) or o.vertex_groups.new(name=bn)
                g.add([v.index],w,'REPLACE')
bymat={}
for objs in parts.values():
    for o in objs: bymat.setdefault(o.data.materials[0].name,[]).append(o)
for mat,objs in bymat.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    bpy.ops.object.join()
    o=bpy.context.view_layer.objects.active
    o.name='Hydra_'+mat; o.data.name='Hydra_'+mat
    o.parent=arm
    m=o.modifiers.new('Armature','ARMATURE'); m.object=arm
    # sanity: every vertex weighted, max 4 influences
    for v in o.data.vertices:
        assert 0<len(v.groups)<=4, (o.name,v.index)
for b in arm_data.bones: print('BONE',b.name,tuple(round(c,2) for c in b.head_local),'->',b.parent.name if b.parent else '-')
print('MESHES',[o.name for o in bpy.data.objects if o.type=='MESH'])
bpy.ops.wm.save_as_mainfile(filepath=OUT)
