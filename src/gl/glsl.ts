// Shared GLSL snippets.
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 curl(vec3 p){
  const float e=0.1;
  vec3 dx=vec3(e,0.0,0.0), dy=vec3(0.0,e,0.0), dz=vec3(0.0,0.0,e);
  float x=snoise(p+dy+vec3(31.4))-snoise(p-dy+vec3(31.4))-snoise(p+dz+vec3(-17.1))+snoise(p-dz+vec3(-17.1));
  float y=snoise(p+dz)-snoise(p-dz)-snoise(p+dx+vec3(31.4))+snoise(p-dx+vec3(31.4));
  float z=snoise(p+dx+vec3(-17.1))-snoise(p-dx+vec3(-17.1))-snoise(p+dy)+snoise(p-dy);
  return vec3(x,y,z)/(2.0*e);
}
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y); }
mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
// painterly dissolve mask: an irregular mosaic of elongated brush dabs, one random threshold per dab.
// Every dab is rotated about its own centre (flow-aligned per cell), so there are no global whorls.
float dabs(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float best = 1e9, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 c = i + g;
    vec2 d = g + vec2(hash12(c), hash12(c + 19.19)) - f;
    float a = vnoise(c * 0.11) * 6.2831 + (hash12(c + 3.7) - 0.5) * 0.7;
    float dist = length((rot2(a) * d) * vec2(0.42, 1.25));
    if (dist < best){ best = dist; id = hash12(c + 7.7); }
  }
  return id;
}
`;

// Simulated ageing of Van Gogh's yellows (artistic, informed by Monico 2015 / Vanmeert 2018):
// light-sensitive (sulphur-rich) chrome yellow in the bright, cool yellows darkens towards olive-brown,
// the red lake fades out of the oranges, and the varnish yellows the whole surface.
export const AGEING = /* glsl */ `
vec3 ageColor(vec3 c, float age){
  if(age <= 0.0001) return c;
  float L = luma(c);
  float yel = smoothstep(0.08, 0.35, (c.r + c.g)*0.5 - c.b) * smoothstep(0.45, 0.85, L);
  float cool = smoothstep(-0.06, 0.06, c.g - c.r*0.86);
  float sens = yel * (0.35 + 0.65*cool);
  vec3 olive = vec3(0.50, 0.44, 0.20) * (0.55 + 0.55*L);
  vec3 o = mix(c, olive, clamp(age*sens*0.95, 0.0, 1.0));
  float orange = smoothstep(0.12, 0.38, c.r - c.g);
  o = mix(o, vec3(o.r*0.86 + 0.06, o.g*1.02, o.b*0.95), orange*age);
  o = mix(o, o*vec3(0.93, 0.86, 0.66), age*0.55);
  return o;
}
`;
