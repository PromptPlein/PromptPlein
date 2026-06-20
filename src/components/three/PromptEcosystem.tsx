import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Category, Prompt } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import { ecosystemPalette } from '@/config/brandColors';

const PALETTE = ecosystemPalette;

interface Cluster {
  id: string;
  label: string;
  center: THREE.Vector3;
  color: string;
  prompts: Prompt[];
}

function buildClusters(prompts: Prompt[], categories: Category[]): Cluster[] {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, Prompt[]>();
  for (const p of prompts) {
    const key = p.category_id ?? 'none';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const keys = [...groups.keys()];
  const radius = Math.max(5, keys.length * 1.6);
  return keys.map((key, i) => {
    const a = (i / Math.max(1, keys.length)) * Math.PI * 2;
    return {
      id: key,
      label: key === 'none' ? 'Overig' : catMap.get(key) ?? 'Onbekend',
      center: new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius),
      color: PALETTE[i % PALETTE.length],
      prompts: groups.get(key)!,
    };
  });
}

/** Deterministische positie van een prompt rond zijn clustercentrum. */
function satellitePosition(center: THREE.Vector3, index: number, count: number): THREE.Vector3 {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = count > 1 ? 1 - (index / (count - 1)) * 2 : 0; // -1..1
  const r = Math.sqrt(Math.max(0, 1 - y * y)) * 2.2;
  const theta = golden * index;
  return new THREE.Vector3(center.x + Math.cos(theta) * r, center.y + y * 2.2, center.z + Math.sin(theta) * r);
}

function PromptNode({
  position,
  color,
  title,
  labelColor,
  outline,
}: {
  position: THREE.Vector3;
  color: string;
  title: string;
  labelColor: string;
  outline: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={position}>
      <mesh
        scale={hovered ? 1.8 : 1}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.6 : 0.2} />
      </mesh>
      {hovered && (
        <Billboard position={[0, 0.4, 0]}>
          <Text fontSize={0.3} color={labelColor} anchorX="center" outlineWidth={0.012} outlineColor={outline}>
            {title}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

function Scene({
  clusters,
  labelColor,
  outline,
}: {
  clusters: Cluster[];
  labelColor: string;
  outline: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.06;
  });

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 10, 6]} intensity={0.7} />
      <group ref={groupRef}>
        {clusters.map((c) => (
          <group key={c.id}>
            <Billboard position={[c.center.x, c.center.y + 3, c.center.z]}>
              <Text fontSize={0.5} color={c.color} anchorX="center" outlineWidth={0.015} outlineColor={outline}>
                {`${c.label} (${c.prompts.length})`}
              </Text>
            </Billboard>
            {c.prompts.map((p, i) => (
              <PromptNode
                key={p.id}
                position={satellitePosition(c.center, i, c.prompts.length)}
                color={c.color}
                title={p.title}
                labelColor={labelColor}
                outline={outline}
              />
            ))}
          </group>
        ))}
      </group>
      <OrbitControls enablePan={false} minDistance={5} maxDistance={40} />
    </>
  );
}

export default function PromptEcosystem({
  prompts,
  categories,
}: {
  prompts: Prompt[];
  categories: Category[];
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const bg = dark ? '#0b1220' : '#f8fafc';
  const labelColor = dark ? '#e2e8f0' : '#1f2937';
  const outline = dark ? '#0b1220' : '#ffffff';

  const clusters = useMemo(() => buildClusters(prompts, categories), [prompts, categories]);
  if (prompts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        Nog geen prompts om te tonen.
      </div>
    );
  }
  return (
    <Canvas camera={{ position: [0, 8, 20], fov: 50 }} dpr={[1, 1.5]}>
      <color attach="background" args={[bg]} />
      <Scene clusters={clusters} labelColor={labelColor} outline={outline} />
    </Canvas>
  );
}
