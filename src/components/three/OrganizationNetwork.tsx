import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Organization, OrganizationType } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import { orgTypeColor, rijksblauw, readToken } from '@/config/brandColors';

const TYPE_COLOR: Record<OrganizationType, string> = orgTypeColor;

interface Node {
  org: Organization;
  position: THREE.Vector3;
}

/** Computes a simple two-layer radial layout from parent_id. */
function layout(orgs: Organization[]): { nodes: Node[]; edges: [THREE.Vector3, THREE.Vector3][] } {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const roots = orgs.filter((o) => !o.parent_id || !byId.has(o.parent_id));
  const pos = new Map<string, THREE.Vector3>();

  const rootRadius = Math.max(4, roots.length * 1.2);
  roots.forEach((root, i) => {
    const a = (i / Math.max(1, roots.length)) * Math.PI * 2;
    pos.set(root.id, new THREE.Vector3(Math.cos(a) * rootRadius, 1.5, Math.sin(a) * rootRadius));
  });

  for (const root of roots) {
    const children = orgs.filter((o) => o.parent_id === root.id);
    const base = pos.get(root.id)!;
    children.forEach((child, j) => {
      const a = (j / Math.max(1, children.length)) * Math.PI * 2;
      pos.set(
        child.id,
        new THREE.Vector3(base.x + Math.cos(a) * 2.6, -1.4, base.z + Math.sin(a) * 2.6),
      );
    });
  }

  // Deeper or orphaned nodes get a place near their parent or the origin.
  orgs.forEach((o, i) => {
    if (pos.has(o.id)) return;
    const parent = o.parent_id ? pos.get(o.parent_id) : undefined;
    const base = parent ?? new THREE.Vector3(0, 0, 0);
    const a = i * 1.3;
    pos.set(o.id, new THREE.Vector3(base.x + Math.cos(a) * 2, base.y - 1.4, base.z + Math.sin(a) * 2));
  });

  const nodes: Node[] = orgs.map((o) => ({ org: o, position: pos.get(o.id)! }));
  const edges: [THREE.Vector3, THREE.Vector3][] = [];
  for (const o of orgs) {
    if (o.parent_id && pos.has(o.parent_id)) {
      edges.push([pos.get(o.id)!, pos.get(o.parent_id)!]);
    }
  }
  return { nodes, edges };
}

function OrgNode({ node, labelColor, outline }: { node: Node; labelColor: string; outline: string }) {
  const [hovered, setHovered] = useState(false);
  const color = TYPE_COLOR[node.org.organization_type] ?? rijksblauw[500];
  const radius = node.org.organization_type === 'ministry' ? 0.55 : 0.38;

  return (
    <group position={node.position}>
      <mesh
        scale={hovered ? 1.3 : 1}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.5 : 0.15}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
      <Billboard position={[0, radius + 0.45, 0]}>
        <Text fontSize={0.32} color={labelColor} anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor={outline}>
          {node.org.name}
        </Text>
      </Billboard>
    </group>
  );
}

function Scene({
  orgs,
  labelColor,
  outline,
  edgeColor,
}: {
  orgs: Organization[];
  labelColor: string;
  outline: string;
  edgeColor: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { nodes, edges } = useMemo(() => layout(orgs), [orgs]);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.08;
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />
      <group ref={groupRef}>
        {edges.map((e, i) => (
          <Line key={i} points={[e[0], e[1]]} color={edgeColor} lineWidth={1} />
        ))}
        {nodes.map((n) => (
          <OrgNode key={n.org.id} node={n} labelColor={labelColor} outline={outline} />
        ))}
      </group>
      <OrbitControls enablePan={false} minDistance={4} maxDistance={30} />
    </>
  );
}

export default function OrganizationNetwork({ orgs }: { orgs: Organization[] }) {
  const { resolvedTheme } = useTheme();
  const scheme = resolvedTheme === 'dark' ? 'dark' : 'light';
  // The scene follows the theme: the tokens resolve in the scheme ThemeContext
  // reports, so a switch re-reads them on the next render.
  const colors = useMemo(
    () => ({
      bg: readToken('--semantics-surfaces-tinted-background-color', scheme),
      labelColor: readToken('--semantics-content-color', scheme),
      outline: readToken('--semantics-surfaces-base-background-color', scheme),
      edgeColor: readToken('--primitives-color-donkerblauw-250', scheme),
    }),
    [scheme],
  );
  const { bg, labelColor, outline, edgeColor } = colors;

  if (orgs.length === 0) {
    return <nldd-inline-dialog icon="info-circle" text="Nog geen organisaties om te tonen."></nldd-inline-dialog>;
  }
  return (
    <Canvas camera={{ position: [0, 6, 16], fov: 50 }} dpr={[1, 1.5]}>
      <color attach="background" args={[bg]} />
      <Scene orgs={orgs} labelColor={labelColor} outline={outline} edgeColor={edgeColor} />
    </Canvas>
  );
}
