# Adds animation actions to the rig and exports GLB + FBX files for Roblox
import bpy, sys, math, os
from mathutils import Vector, Matrix, Euler, Quaternion
BLEND, OUTDIR = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=BLEND)
sc=bpy.context.scene; sc.render.fps=30
arm=bpy.data.objects['HydraRig']
S=math.sin; C=math.cos; TAU=2*math.pi
def sm(t): t=max(0.0,min(1.0,t)); return t*t*(3-2*t)
def K(f,keys):
    """eased keyframe interpolation; keys=[(frame,value),...]"""
    if f<=keys[0][0]: return keys[0][1]
    for (f0,v0),(f1,v1) in zip(keys,keys[1:]):
        if f<=f1:
            t=sm((f-f0)/(f1-f0))
            if isinstance(v0,tuple): return tuple(a+(b-a)*t for a,b in zip(v0,v1))
            return v0+(v1-v0)*t
    return keys[-1][1]

SIDES=['C','L','R']; PH={'C':0.0,'L':2.1,'R':4.2}; OUTW={'C':0,'L':-1,'R':1}
LEGS=['LegFrontLeft','LegFrontRight','LegBackLeft','LegBackRight']

def idle(f):
    w=TAU*f/120; P={}; loc=(0,0,0.12*S(2*w))
    P['Chest']=(-1.5*S(w),0,0); P['Hips']=(0.8*S(w),0,0)
    for s in SIDES:
        ph=PH[s]
        for i in range(3): P[f'Neck{s}{i+1}']=(3*S(w+ph+i*0.6), 0, 4*S(w+ph+i*0.6+1))
        P['Head'+s]=(4*S(w+ph+2),0,5*S(w+ph+2.5))
        P['Jaw'+s]=(4+4*S(2*w+ph),0,0)
    for s,sg in [('L',1),('R',-1)]:
        for i in range(3): P[f'Wing{s}{i+1}']=(0,sg*(4-i)*S(w-i*0.6),0)
    for i in range(4): P[f'Tail{i+1}']=(1.5*S(w-i*0.7),0,5*S(w-i*0.7))
    return P,loc

def walk(f):
    p=TAU*f/40; P={}; loc=(0,0,0.3*C(2*p))
    P['Hips']=(0,2.5*S(p),0); P['Chest']=(0,-2.5*S(p),1.5*S(p))
    for leg,ph in zip(LEGS,[0,math.pi,math.pi,0]):
        P[leg+'_Upper']=(-22*S(p+ph),0,0)
        P[leg+'_Lower']=(30*max(0,C(p+ph)),0,0)
    for s in SIDES:
        for i in range(3): P[f'Neck{s}{i+1}']=(3*S(2*p+PH[s]+i*0.5),0,3*S(p+PH[s]))
        P['Head'+s]=(-3*S(2*p+PH[s]+1.5),0,0); P['Jaw'+s]=(5+3*S(p+PH[s]),0,0)
    for s,sg in [('L',1),('R',-1)]:
        for i in range(3): P[f'Wing{s}{i+1}']=(0,sg*3*S(2*p-i*0.6),0)
    for i in range(4): P[f'Tail{i+1}']=(0,0,8*S(p-i*0.8))
    return P,loc

def roar(f):
    P={}; a=K(f,[(0,0),(20,-1),(35,1),(70,1),(90,0)])  # -1 rear back, +1 roar
    back=K(f,[(0,0),(20,1),(35,0)]); r=K(f,[(20,0),(35,1),(70,1),(90,0)])
    shake=r*3*S(f*1.7)
    P['Chest']=(-8*back-5*r,0,0); P['Hips']=(-2*back,0,0)
    for s in SIDES:
        for i in range(3): P[f'Neck{s}{i+1}']=(-9*back+6*r,0,OUTW[s]*6*r+shake)
        P['Head'+s]=(-15*back-8*r,0,OUTW[s]*8*r+shake)
        P['Jaw'+s]=(5+10*back+38*r,0,0)
    for s,sg in [('L',1),('R',-1)]:
        for i in range(3): P[f'Wing{s}{i+1}']=(0,sg*(22-6*i)*r,-sg*8*r)
    for i in range(4): P[f'Tail{i+1}']=(-4*r,0,4*r*S(f*0.4-i))
    return P,(0,0.3*back,0.4*r)

def bite(f):
    P={}; chest=0
    for s,st in [('C',8),('L',22),('R',36)]:
        wind=K(f,[(st,0),(st+8,1),(st+13,0)]); hit=K(f,[(st+8,0),(st+13,1),(st+18,1),(st+26,0)])
        for i in range(3): P[f'Neck{s}{i+1}']=(-10*wind+16*hit,0,OUTW[s]*-4*hit)
        P['Head'+s]=(-12*wind+12*hit,0,0)
        P['Jaw'+s]=(4+38*wind+(0 if hit>0.5 else 0)-4*hit,0,0)
        chest+=3*hit
    P['Chest']=(chest,0,0)
    for i in range(4): P[f'Tail{i+1}']=(0,0,3*S(TAU*f/60-i))
    return P,(0,-0.3*chest/3,0)

def tailswipe(f):
    P={}; h=K(f,[(0,0),(15,-12),(30,22),(42,22),(60,0)])
    P['Hips']=(0,0,h); P['Chest']=(0,0,-h*0.4)
    for i in range(4):
        lag=i*2
        P[f'Tail{i+1}']=(-3,0,K(f-lag,[(0,0),(15,-14),(30,30),(42,24),(60,0)]))
    for s in SIDES:
        P['Head'+s]=(0,0,-h*0.5); P['Jaw'+s]=(K(f,[(0,4),(20,25),(40,25),(60,4)]),0,0)
    for leg in LEGS: P[leg+'_Upper']=(0,0,-h*0.3)
    return P,(0,0,0)

def winggust(f):
    P={}; up=K(f,[(0,0),(10,1),(50,1),(60,0)])
    def beat(t): return K(t,[(0,0),(12,40),(22,-25),(34,40),(44,-25),(58,0)])
    P['Chest']=(-10*up,0,0); P['Hips']=(-4*up,0,0)
    for leg in ['LegFrontLeft','LegFrontRight']:
        P[leg+'_Upper']=(-20*up,0,0); P[leg+'_Lower']=(25*up,0,0)
    for s,sg in [('L',1),('R',-1)]:
        for i,(lag,k) in enumerate([(0,1),(3,0.7),(6,0.5)]): P[f'Wing{s}{i+1}']=(0,sg*k*beat(f-lag),0)
    for s in SIDES:
        P['Head'+s]=(-6*up,0,0); P['Jaw'+s]=(4+20*up,0,0)
    return P,(0,0,0.6*up)

def hit(f):
    P={}; a=K(f,[(0,0),(4,1),(24,0)])
    P['Chest']=(-8*a,0,2*a); P['Hips']=(-3*a,0,0)
    for s in SIDES:
        for i in range(3): P[f'Neck{s}{i+1}']=(-6*a,0,OUTW[s]*5*a)
        P['Head'+s]=(-10*a,0,(OUTW[s] or 1)*10*a); P['Jaw'+s]=(4+25*a,0,0)
    for s,sg in [('L',1),('R',-1)]: P[f'Wing{s}1']=(0,sg*10*a,0)
    return P,(0,0.5*a,0)

def death(f):
    P={}; rear=K(f,[(0,0),(15,1),(30,0)]); fall=K(f,[(20,0),(60,1)]); neck=K(f,[(35,0),(80,1)])
    wing=K(f,[(40,0),(85,1)])
    P['Chest']=(-8*rear,0,0)
    for leg,sg in zip(LEGS,[1,-1,1,-1]):
        P[leg+'_Upper']=(-10*fall if 'Front' in leg else 10*fall,sg*45*fall,0)
        P[leg+'_Lower']=(0,-sg*40*fall,0)
    for s in SIDES:
        drop={'C':(26,0),'L':(22,-10),'R':(22,10)}[s]
        for i in range(3): P[f'Neck{s}{i+1}']=(-10*rear+drop[0]*neck,0,drop[1]*neck)
        P['Head'+s]=(-12*rear+20*neck,(OUTW[s] or 1)*15*neck,0)
        P['Jaw'+s]=(4+35*rear+18*neck,0,0)
    for s,sg in [('L',1),('R',-1)]:
        for i in range(3): P[f'Wing{s}{i+1}']=(-10*wing,-sg*(25-5*i)*wing,0)
    for i in range(4): P[f'Tail{i+1}']=(6*fall if i==0 else 2*fall,0,6*neck)
    return P,(0,0,-3.8*fall)

ANIMS=[('Idle',idle,120,True),('Walk',walk,40,True),('Roar',roar,90,False),('Bite',bite,62,False),
       ('TailSwipe',tailswipe,60,False),('WingGust',winggust,60,False),('Hit',hit,24,False),('Death',death,100,False)]

rest={b.name:b.matrix_local.to_3x3() for b in arm.data.bones}
def to_local(bn,deg):
    q=Euler([math.radians(d) for d in deg],'XYZ').to_matrix()
    M=rest[bn]; return (M.inverted()@q@M).to_quaternion()

bpy.context.view_layer.objects.active=arm
for pb in arm.pose.bones: pb.rotation_mode='QUATERNION'
actions=[]
for name,fn,length,loop in ANIMS:
    arm.animation_data_create()
    act=bpy.data.actions.new('Hydra_'+name); act.use_fake_user=True
    arm.animation_data.action=act
    for f in range(length+1):
        P,loc=fn(f if not loop or f<length else 0)
        for pb in arm.pose.bones:
            pb.rotation_quaternion=to_local(pb.name,P.get(pb.name,(0,0,0)))
            pb.location=rest[pb.name].inverted()@Vector(loc) if pb.name=='Root' else Vector()
            pb.keyframe_insert('rotation_quaternion',frame=f)
            pb.keyframe_insert('location',frame=f)
    act.use_frame_range=True; act.frame_range=(0,length); act.use_cyclic=loop
    actions.append((name,act,length))

os.makedirs(OUTDIR+'/animations_fbx',exist_ok=True)
def sel_all():
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type in('MESH','ARMATURE'): o.select_set(True)
FBX=dict(use_selection=True,object_types={'ARMATURE','MESH'},apply_scale_options='FBX_SCALE_ALL',
         axis_forward='-Z',axis_up='Y',add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,
         bake_anim_use_nla_strips=False,bake_anim_force_startend_keying=True,bake_anim_simplify_factor=0.0,
         mesh_smooth_type='FACE',use_armature_deform_only=True)
for name,act,length in actions:
    arm.animation_data.action=act; sc.frame_start=0; sc.frame_end=length; sc.frame_set(0)
    sel_all(); bpy.ops.export_scene.fbx(filepath=f'{OUTDIR}/animations_fbx/Hydra_{name}.fbx',**FBX)
# model + rig with Idle
arm.animation_data.action=actions[0][1]; sc.frame_end=actions[0][2]; sc.frame_set(0)
sel_all(); bpy.ops.export_scene.fbx(filepath=f'{OUTDIR}/HydraBoss_Rig.fbx',**FBX)
# GLB with every animation as a separate clip
bpy.ops.export_scene.gltf(filepath=f'{OUTDIR}/HydraBoss_Animated.glb',export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_force_sampling=True,
    export_def_bones=False,export_yup=True)
arm.animation_data.action=actions[0][1]
bpy.ops.wm.save_as_mainfile(filepath=OUTDIR+'/HydraBoss_Animated.blend')
print('DONE',[a[0] for a in actions])
