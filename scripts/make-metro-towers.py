from PIL import Image
import colorsys, sys
from collections import deque
RAMP={'trade':[(70,45,5),(150,105,20),(222,175,55),(255,236,160),(255,252,235)],
      'politics':[(12,26,70),(35,75,160),(85,140,225),(185,215,255),(245,250,255)],
      'science':[(6,45,22),(20,110,55),(60,180,105),(175,240,200),(240,255,245)]}
def ramp(stops,t):
    t=max(0,min(1,t)); n=len(stops)-1; i=min(n-1,int(t*n)); f=t*n-i
    return tuple(int(stops[i][k]+(stops[i+1][k]-stops[i][k])*f) for k in range(3))
T={'metro-politics.webp':('trade',33,0),'metro-trade.webp':('politics',38,11),'metro-science.webp':('science',33,7)}
K=float(sys.argv[1]) if len(sys.argv)>1 else 1.35
for f,(name,cut,extra) in T.items():
    im=Image.open(f).convert('RGBA'); px=im.load(); w,h=im.size
    cand=set()
    for y in range(cut+extra):
        for x in range(w):
            r,g,b,al=px[x,y]
            if al<10: continue
            ss=colorsys.rgb_to_hsv(r/255,g/255,b/255)[1]
            if y<cut or ss>0.3: cand.add((x,y))
    # keep only what connects to the part above the parapet
    keep=set(); q=deque(p for p in cand if p[1]<cut)
    while q:
        p=q.popleft()
        if p in keep or p not in cand: continue
        keep.add(p); x,y=p; q.extend([(x+1,y),(x-1,y),(x,y+1),(x,y-1)])
    emb=Image.new('RGBA',im.size,(0,0,0,0)); ep=emb.load()
    xs=[p[0] for p in keep]; ys=[p[1] for p in keep]; eb=(min(xs),min(ys),max(xs)+1,max(ys)+1)
    for (x,y) in keep:
        r,g,b,al=px[x,y]; l=(0.3*r+0.59*g+0.11*b)/255
        if l<0.22: ep[x,y]=(18,16,22,al); continue
        u=(x-eb[0])/max(1,eb[2]-eb[0]); v=(y-eb[1])/max(1,eb[3]-eb[1])
        sheen=max(0,1-abs(u-v+0.1)*4)*0.35
        ep[x,y]=ramp(RAMP[name],0.12+l*0.75+sheen)+(al,)
    body=im.copy(); bp=body.load()
    for (x,y) in keep:
        bp[x,y]=(0,0,0,0) if y<cut else (210,206,196,255)
    g=body.convert('LA'); L,A=g.split()
    L=L.point(lambda v: 0 if v<60 else min(255,int(150+(v-60)*1.1)))
    body=Image.merge('RGBA',(L,L,L,A))
    eb2=emb.getbbox()
    e=emb.crop(eb2); e=e.resize((int(e.width*K),int(e.height*K)),Image.LANCZOS)
    pad=int(h*0.35)
    B=Image.new('RGBA',(w,h+pad),(0,0,0,0)); B.paste(body,(0,pad),body)
    E=Image.new('RGBA',(w,h+pad),(0,0,0,0)); cxm=(eb2[0]+eb2[2])/2
    E.paste(e,(int(cxm-e.width/2),int(eb2[3]+pad-e.height+3)),e)
    B.save(f'tower-body-{name}.png'); E.save(f'tower-emb-{name}.png')
ims=[]
for n in ['trade','politics','science']:
    b=Image.open(f'tower-body-{n}.png'); ims+= [b, Image.alpha_composite(b,Image.open(f'tower-emb-{n}.png'))]
o=Image.new('RGBA',(sum(i.width for i in ims),ims[0].height),(255,0,255,255)); x=0
for i in ims: o.paste(i,(x,0),i); x+=i.width
o=o.resize((o.width*2,o.height*2)); o.save('check.png')
