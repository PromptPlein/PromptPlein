import { prefersReducedMotion } from '@/context/AccessibilityContext';
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rijksblauw, rijkskleur, hexToVec3 } from '@/config/brandColors';

// WebGL hero background with two variants, both decorative (the parent in
// DailyBackground is aria-hidden and sits behind the content):
//  - tegels: a grid of squares that light up in waves, after the logo. Now and
//    then a tile turns orange; the middle stays calm so the heading stays legible.
//  - polder: contour lines as on a topographic map, slowly moving up. Every
//    fourth line is a little stronger.

export type ShaderBackground = 'tegels' | 'polder';

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

  // Classic 2D simplex noise (Ashima Arts, MIT license).
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

// Colors come from the design system tokens via src/config/brandColors.js. The
// shaders are built on first use, once the stylesheet holds the tokens.
const tegelsShader = () => /* glsl */ `
  void main() {
    // uResolution is in device pixels, as is gl_FragCoord.
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
    tile = mix(tile, ${hexToVec3(rijkskleur.oranje)}, step(0.988, r) * level);

    vec2 fromCenter = (uv - 0.5) * vec2(1.0, 1.7);
    float calm = smoothstep(0.08, 0.55, length(fromCenter));
    float amount = square * (0.18 + 0.82 * level) * mix(0.25, 1.0, calm);

    gl_FragColor = vec4(mix(bg, tile, amount), 1.0);
  }
`;

const polderShader = () => /* glsl */ `
  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 st = vec2(uv.x * uResolution.x / uResolution.y, uv.y);
    float t = uTime * 0.035;

    // Noise bends horizontal bands; fract() of the height gives the lines.
    float n = fbm(st * vec2(0.8, 1.4) + vec2(t, t * 0.4));
    float height = uv.y * 13.0 + n * 3.2 - uTime * 0.12;
    float f = fract(height);
    float dist = min(f, 1.0 - f);
    float line = 1.0 - smoothstep(0.0, fwidth(height) * 1.3, dist);
    float major = mod(floor(height + 0.5), 4.0) < 0.5 ? 1.0 : 0.0;

    vec3 bg = mix(${hexToVec3(rijksblauw[900])}, ${hexToVec3(rijksblauw[700])}, uv.y * 0.8 + 0.1);
    bg += vec3(0.0, 0.03, 0.05) * fbm(st * 2.0 - t);
    // Softer around the heading, so the text stays legible.
    float calm = mix(0.55, 1.0, smoothstep(0.1, 0.5, abs(uv.y - 0.55)));
    vec3 color = bg + ${hexToVec3(rijksblauw[300])} * line * mix(0.16, 0.42, major) * calm;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const FRAGMENT_SHADERS: Record<ShaderBackground, () => string> = {
  tegels: () => shaderHeader + tegelsShader(),
  polder: () => shaderHeader + polderShader(),
};

function ShaderPlane({ variant }: { variant: ShaderBackground }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const fragmentShader = useMemo(() => FRAGMENT_SHADERS[variant](), [variant]);

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
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

/**
 * Fills its parent, which positions it and hides it from assistive technology.
 */
export default function DashboardBackground({ variant }: { variant: ShaderBackground }) {
  return (
    <Canvas
      gl={{ antialias: false, powerPreference: 'low-power' }}
      dpr={[1, 1.5]}
      frameloop={prefersReducedMotion() ? 'demand' : 'always'}
      camera={{ position: [0, 0, 1] }}
    >
      <ShaderPlane key={variant} variant={variant} />
    </Canvas>
  );
}
