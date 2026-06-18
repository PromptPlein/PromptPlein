import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Vloeiend morphende achtergrond met Perlin-achtige noise in een fragment shader.
// Subtiel rijksblauw verloop, ~30+ FPS, decoratief (pointer-events: none in de wrapper).

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

  void main() {
    vec2 st = vUv;
    float aspect = uResolution.x / uResolution.y;
    st.x *= aspect;

    float t = uTime * 0.06;
    float n = 0.0;
    n += snoise(st * 1.4 + vec2(t, t * 0.7)) * 0.6;
    n += snoise(st * 2.8 - vec2(t * 0.8, t)) * 0.3;
    n += snoise(st * 5.0 + vec2(t * 0.4, -t * 0.5)) * 0.1;
    n = n * 0.5 + 0.5;

    // Verloop van diep rijksblauw naar een lichtere blauwe tint.
    vec3 deep = vec3(0.039, 0.157, 0.318);   // #0a2851
    vec3 mid  = vec3(0.082, 0.259, 0.451);   // #154273
    vec3 light = vec3(0.255, 0.404, 0.643);  // #4167a4

    vec3 color = mix(deep, mid, smoothstep(0.2, 0.6, n));
    color = mix(color, light, smoothstep(0.6, 0.95, n) * 0.6);

    gl_FragColor = vec4(color, 1.0);
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
    const { width, height } = state.size;
    materialRef.current.uniforms.uResolution.value.set(width, height);
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
