import { prefersReducedMotion } from '@/context/AccessibilityContext';
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rijksblauw, nadruk, hexToVec3 } from '@/config/brandColors';

// Heldachtergrond in WebGL met twee varianten, beide decoratief (pointer-events:
// none in de wrapper):
//  - tegels: een raster van vierkantjes dat in golven oplicht, afgeleid van het
//    logo. Heel af en toe kleurt een tegel rood; het midden blijft rustig zodat
//    de kop leesbaar blijft.
//  - polder: hoogtelijnen zoals op een topografische kaart, die traag omhoog
//    schuiven. Elke vierde lijn is iets sterker.
//  - getij: zes lagen water die als eb en vloed op en neer gaan. Af en toe kleurt
//    één golfrand een paar seconden rood.
//  - lucht: een Hollandse lucht met wolken boven een lage horizon. Af en toe slaat
//    er aan de rand een rode bliksem door, zodat het midden rustig blijft.

export type ShaderBackground = 'tegels' | 'polder' | 'getij' | 'lucht';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const shaderHeader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;

  // Klassieke 2D simplex noise (Ashima Arts, MIT-licentie).
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                   + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * snoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

// Kleuren komen uit src/config/brandColors.js.
const tegelsShader = /* glsl */ `
  void main() {
    // uResolution is in apparaatpixels, net als gl_FragCoord.
    vec2 uv = gl_FragCoord.xy / uResolution;
    float cellSize = uResolution.y / 9.0;
    vec2 cell = floor(gl_FragCoord.xy / cellSize);
    vec2 local = fract(gl_FragCoord.xy / cellSize);

    float r = hash(cell);
    float n = snoise(cell * 0.13 + vec2(uTime * 0.09, uTime * 0.05)) * 0.5 + 0.5;
    float level = smoothstep(0.45, 0.9, n + (r - 0.5) * 0.3);

    vec2 q = abs(local - 0.5);
    float square = 1.0 - smoothstep(0.40, 0.41, max(q.x, q.y));

    vec3 bg = mix(${hexToVec3(rijksblauw[700])}, ${hexToVec3(rijksblauw[800])}, 0.35);
    vec3 tileLow = mix(${hexToVec3(rijksblauw[700])}, ${hexToVec3(rijksblauw[600])}, 0.6);
    vec3 tileHigh = mix(${hexToVec3(rijksblauw[400])}, ${hexToVec3(rijksblauw[300])}, 0.25);
    vec3 tile = mix(tileLow, tileHigh, level);
    tile = mix(tile, ${hexToVec3(nadruk)}, step(0.988, r) * level);

    vec2 fromCenter = (uv - 0.5) * vec2(1.0, 1.7);
    float calm = smoothstep(0.08, 0.55, length(fromCenter));
    float amount = square * (0.18 + 0.82 * level) * mix(0.25, 1.0, calm);

    gl_FragColor = vec4(mix(bg, tile, amount), 1.0);
  }
`;

const polderShader = /* glsl */ `
  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 st = vec2(uv.x * uResolution.x / uResolution.y, uv.y);
    float t = uTime * 0.035;

    // Ruis vervormt horizontale banden; fract() van de hoogte geeft de lijnen.
    float n = fbm(st * vec2(0.8, 1.4) + vec2(t, t * 0.4));
    float height = uv.y * 13.0 + n * 3.2 - uTime * 0.12;
    float f = fract(height);
    float dist = min(f, 1.0 - f);
    float line = 1.0 - smoothstep(0.0, fwidth(height) * 1.3, dist);
    float major = mod(floor(height + 0.5), 4.0) < 0.5 ? 1.0 : 0.0;

    vec3 bg = mix(${hexToVec3(rijksblauw[900])}, ${hexToVec3(rijksblauw[700])}, uv.y * 0.8 + 0.1);
    bg += vec3(0.0, 0.03, 0.05) * fbm(st * 2.0 - t);
    // Rond de kop iets zachter, zodat de tekst leesbaar blijft.
    float calm = mix(0.55, 1.0, smoothstep(0.1, 0.5, abs(uv.y - 0.55)));
    vec3 color = bg + ${hexToVec3(rijksblauw[300])} * line * mix(0.16, 0.42, major) * calm;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const getijShader = /* glsl */ `
  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    float x = uv.x * uResolution.x / uResolution.y;
    float t = uTime;
    float px = 1.5 / uResolution.y;

    // Elke 8 seconden een beurt; in ruim de helft daarvan wordt één rand rood.
    float cycle = floor(t / 8.0);
    float redLayer = floor(hash(vec2(cycle, 4.2)) * 6.0);
    float redAmount = step(0.45, hash(vec2(cycle, 9.1))) * pow(sin(3.14159 * fract(t / 8.0)), 3.0);

    vec3 col = mix(${hexToVec3(rijksblauw[900])}, ${hexToVec3(rijksblauw[800])}, uv.y);
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float base = 0.80 - fi * 0.135;
      float tide = sin(t * 0.22 + fi * 0.7) * 0.022;
      float wave = snoise(vec2(x * 0.8 + t * (0.04 + fi * 0.012), fi * 3.7)) * 0.03
                 + sin(x * 2.4 - t * (0.35 + fi * 0.05) + fi * 1.3) * 0.01;
      float edge = base + tide + wave;
      float below = 1.0 - smoothstep(edge - px, edge + px, uv.y);
      col = mix(col, mix(${hexToVec3(rijksblauw[700])}, ${hexToVec3(rijksblauw[500])}, fi / 5.0), below * 0.42);
      float red = abs(fi - redLayer) < 0.5 ? redAmount : 0.0;
      float rim = 1.0 - smoothstep(0.0, px * mix(1.5, 2.6, red), abs(uv.y - edge));
      col = mix(col, mix(${hexToVec3(rijksblauw[200])}, ${hexToVec3(nadruk)}, red), rim * mix(0.35, 0.95, red));
    }

    vec2 fromCenter = (uv - 0.5) * vec2(1.0, 1.7);
    float calm = smoothstep(0.08, 0.6, length(fromCenter));
    col = mix(${hexToVec3(rijksblauw[900])}, col, mix(0.45, 1.0, calm));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const luchtShader = /* glsl */ `
  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    float aspect = uResolution.x / uResolution.y;
    float t = uTime * 0.02;
    float horizon = 0.15;
    float h = smoothstep(horizon, 1.0, uv.y);
    vec3 sky = mix(mix(${hexToVec3(rijksblauw[600])}, ${hexToVec3(rijksblauw[500])}, 0.55), ${hexToVec3(rijksblauw[800])}, h);

    // Wolken op een vlak boven de kijker: bij de horizon kleiner en dichter.
    float z = 1.0 / (max(uv.y - horizon, 0.0) + 0.14);
    vec2 p = vec2((uv.x - 0.5) * aspect * z * 0.55 - t * 3.0, z * 0.7 + t * 0.6);
    float n = fbm(p);
    float d = fbm(p * 2.1 + vec2(-t * 2.0, 5.0));
    float fade = smoothstep(horizon, horizon + 0.25, uv.y);
    float cloud = smoothstep(0.0, 0.55, n + d * 0.35 - 0.1) * fade;
    vec3 cloudCol = mix(${hexToVec3(rijksblauw[300])}, ${hexToVec3(rijksblauw[100])}, clamp(d * 0.6 + 0.5, 0.0, 1.0));
    vec3 col = mix(sky, cloudCol, cloud * 0.5);

    float edge = horizon + snoise(vec2(uv.x * aspect * 2.5, 1.0)) * 0.006;
    float land = 1.0 - smoothstep(edge - 1.5 / uResolution.y, edge + 1.5 / uResolution.y, uv.y);
    col = mix(col, ${hexToVec3(rijksblauw[900])}, land);

    vec2 fromCenter = (uv - 0.5) * vec2(1.0, 1.7);
    float calm = smoothstep(0.08, 0.6, length(fromCenter));
    col = mix(${hexToVec3(rijksblauw[900])}, col, mix(0.55, 1.0, calm));

    // Bliksem: elke 6 seconden een kans van de helft, aan de linker- of
    // rechterrand. Twee flitsen kort na elkaar, zoals bij echt onweer.
    float bc = floor(uTime / 6.0);
    float bt = uTime - bc * 6.0;
    float flash = step(0.5, hash(vec2(bc, 1.7)))
      * (step(bt, 0.12) + step(0.2, bt) * step(bt, 0.45) * (1.0 - (bt - 0.2) / 0.25));
    if (flash > 0.0) {
      float x0 = mix(0.06, 0.26, hash(vec2(bc, 5.1)));
      if (hash(vec2(bc, 3.3)) > 0.5) x0 = 1.0 - x0;
      float top = 0.78 + hash(vec2(bc, 8.8)) * 0.12;
      float jag = snoise(vec2(uv.y * 9.0, bc * 7.1)) * 0.025
                + snoise(vec2(uv.y * 31.0, bc * 3.7)) * 0.008;
      float dist = abs(uv.x * aspect - (x0 + jag) * aspect);
      float inRange = step(edge, uv.y) * step(uv.y, top);
      float core = 1.0 - smoothstep(0.0, 1.8 / uResolution.y, dist);
      float halo = exp(-dist * 60.0) * 0.5;
      col = mix(col, ${hexToVec3(nadruk)}, clamp(core + halo, 0.0, 1.0) * flash * inRange);
      float glow = exp(-length(vec2((uv.x - x0) * aspect, uv.y - top)) * 6.0) * 0.3;
      col = mix(col, ${hexToVec3(nadruk)}, glow * flash);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

const FRAGMENT_SHADERS: Record<ShaderBackground, string> = {
  tegels: shaderHeader + tegelsShader,
  polder: shaderHeader + polderShader,
  getij: shaderHeader + getijShader,
  lucht: shaderHeader + luchtShader,
};

function ShaderPlane({ variant }: { variant: ShaderBackground }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    }),
    [],
  );

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    state.gl.getDrawingBufferSize(materialRef.current.uniforms.uResolution.value);
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={FRAGMENT_SHADERS[variant]}
        uniforms={uniforms}
      />
    </mesh>
  );
}

export default function DashboardBackground({
  variant,
  className = '',
}: {
  variant: ShaderBackground;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <Canvas
        gl={{ antialias: false, powerPreference: 'low-power' }}
        dpr={[1, 1.5]}
        frameloop={prefersReducedMotion() ? 'demand' : 'always'}
        camera={{ position: [0, 0, 1] }}
      >
        <ShaderPlane key={variant} variant={variant} />
      </Canvas>
    </div>
  );
}
