import { Filter, UniformGroup } from "pixi.js";
import { glowColorRgb, type CharacterEffect } from "./characterSettings";

const vertex = `
precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 p = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  p.x = p.x * (2.0 / uOutputTexture.x) - 1.0;
  p.y = p.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(p, 0.0, 1.0);
  vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`;
const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uMode;
uniform float uAmount;
uniform float uTime;
uniform vec3 uGlowColor;
uniform float uGlowOnly;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
vec4 sampleAt(vec2 p) {
  if (any(lessThan(p, uInputClamp.xy)) || any(greaterThan(p, uInputClamp.zw))) return vec4(0.0);
  return texture(uTexture, p);
}
void main() {
  vec2 uv = vTextureCoord;
  vec4 color = sampleAt(uv);
  if (uMode < 0.5) {
    float edge = 0.0;
    float radius = 2.0 + uAmount * 5.0;
    for (int i=0; i<12; i++) {
      float a = float(i) * 6.2831853 / 12.0;
      edge += sampleAt(uv + vec2(cos(a),sin(a)) * uInputSize.zw * radius).a;
    }
    edge = clamp(edge / 12.0 * uAmount * (0.85 + 0.15*sin(uTime*2.0)),0.0,1.0) * (1.0-color.a);
    finalColor = vec4(color.rgb * (1.0-uGlowOnly) + uGlowColor*edge, color.a * (1.0-uGlowOnly) + edge);
  } else if (uMode < 1.5) {
    float beat = floor(uTime*10.0);
    float band = floor(uv.y*uInputSize.y/18.0);
    float shift = step(0.65,hash(vec2(band,beat))) * (hash(vec2(beat,band))-0.5) * 22.0 * uAmount;
    uv.x += shift*uInputSize.z;
    color = sampleAt(uv);
    vec4 r = sampleAt(uv + vec2(3.0*uAmount*uInputSize.z,0.0));
    vec4 b = sampleAt(uv - vec2(3.0*uAmount*uInputSize.z,0.0));
    finalColor = vec4(r.r,color.g,b.b,max(color.a,max(r.a,b.a)));
  } else {
    float noise = hash(floor(uv*uInputSize.xy/5.0));
    float cutoff = uAmount*0.5;
    float keep = smoothstep(cutoff,cutoff+0.035,noise);
    float edge = (1.0-smoothstep(cutoff+0.035,cutoff+0.1,noise))*keep;
    vec3 rim = vec3(0.35,0.85,1.0)*(0.8+0.2*sin(uTime*3.0));
    finalColor = vec4(mix(color.rgb,rim*color.a,edge)*keep,color.a*keep);
  }
}`;

export function createCharacterFilter(glowOnly = false) {
  const uniforms = new UniformGroup({
    uMode: { value: 0, type: "f32" },
    uGlowOnly: { value: glowOnly ? 1 : 0, type: "f32" },
    uGlowColor: { value: glowColorRgb(), type: "vec3<f32>" },
    uAmount: { value: 1, type: "f32" },
    uTime: { value: 0, type: "f32" },
  });
  const filter = Filter.from({
    gl: { vertex, fragment, name: "neoarchive-character-effect" },
    resources: { effectUniforms: uniforms },
    padding: 24,
    resolution: "inherit",
    antialias: "inherit",
  });
  return {
    filter,
    update(settings: CharacterEffect, time: number) {
      uniforms.uniforms.uMode = settings.kind === "glow" ? 0 : settings.kind === "glitch" ? 1 : 2;
      uniforms.uniforms.uAmount = settings.intensity;
      const rgb = glowColorRgb(settings.color);
      uniforms.uniforms.uGlowColor[0] = rgb[0];
      uniforms.uniforms.uGlowColor[1] = rgb[1];
      uniforms.uniforms.uGlowColor[2] = rgb[2];
      uniforms.uniforms.uTime = time;
    },
    destroy() {
      filter.destroy();
    },
  };
}
