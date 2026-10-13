import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rijksblauw, rijksoranje, hexToVec3 } from '@/config/brandColors';

// Tegelachtergrond: een raster van vierkantjes dat in golven oplicht, afgeleid van
// het logo. Heel af en toe kleurt een tegel oranje; het midden blijft rustig zodat
// de kop leesbaar blijft. Decoratief (pointer-events: none in de wrapper).

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
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

    // Kleuren komen uit src/config/brandColors.js.
    vec3 bg = mix(${hexToVec3(rijksblauw[700])}, ${hexToVec3(rijksblauw[800])}, 0.35);
    vec3 tileLow = mix(${hexToVec3(rijksblauw[700])}, ${hexToVec3(rijksblauw[600])}, 0.6);
    vec3 tileHigh = mix(${hexToVec3(rijksblauw[400])}, ${hexToVec3(rijksblauw[300])}, 0.25);
    vec3 tile = mix(tileLow, tileHigh, level);
    tile = mix(tile, ${hexToVec3(rijksoranje)}, step(0.988, r) * level);

    vec2 fromCenter = (uv - 0.5) * vec2(1.0, 1.7);
    float calm = smoothstep(0.08, 0.55, length(fromCenter));
    float amount = square * (0.18 + 0.82 * level) * mix(0.25, 1.0, calm);

    gl_FragColor = vec4(mix(bg, tile, amount), 1.0);
  }
`;

function NoisePlane() {
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
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

export default function DashboardBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <Canvas
        gl={{ antialias: false, powerPreference: 'low-power' }}
        dpr={[1, 1.5]}
        frameloop="always"
        camera={{ position: [0, 0, 1] }}
      >
        <NoisePlane />
      </Canvas>
    </div>
  );
}
