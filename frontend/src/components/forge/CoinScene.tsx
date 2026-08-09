import { useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { CoinMetal } from "@/components/forge/Coin";

// The turning coin. Lighting is three plain lights — no HDRI fetches (the
// app never pulls external assets at runtime). Platinum gets real iridescence.
const FINISH: Record<
  CoinMetal,
  { color: string; ink: string; iridescence: number }
> = {
  gold: { color: "#dfa32c", ink: "#4a3305", iridescence: 0 },
  silver: { color: "#b9c4d4", ink: "#2c3546", iridescence: 0 },
  bronze: { color: "#b5713a", ink: "#3a2008", iridescence: 0 },
  platinum: { color: "#cfd4e8", ink: "#241a36", iridescence: 1 },
};

const Piece = ({ metal, label }: { metal: CoinMetal; label: string }) => {
  const ref = useRef<THREE.Group>(null);
  const f = FINISH[metal];
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.55;
  });
  return (
    <group ref={ref} rotation={[0.28, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[1, 1, 0.16, 72]} />
        <meshPhysicalMaterial
          color={f.color}
          metalness={0.92}
          roughness={0.24}
          iridescence={f.iridescence}
          iridescenceIOR={1.6}
        />
      </mesh>
      {/* reeded edge suggestion — a slightly larger, rougher ring */}
      <mesh>
        <torusGeometry args={[1, 0.045, 10, 96]} />
        <meshStandardMaterial color={f.color} metalness={0.85} roughness={0.5} />
      </mesh>
      <Text
        position={[0, 0.085, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.62}
        color={f.ink}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
};

const CoinScene = ({
  metal,
  size,
  label,
}: {
  metal: CoinMetal;
  size: number;
  label: string;
}) => (
  <Canvas
    dpr={[1, 2]}
    camera={{ position: [0, 0.9, 2.6], fov: 40 }}
    gl={{ antialias: true, alpha: true }}
    style={{ width: size, height: size, background: "transparent" }}
  >
    <ambientLight intensity={0.5} />
    <directionalLight position={[3, 4, 2]} intensity={2.1} color="#fff3df" />
    <directionalLight position={[-3, 1, -2]} intensity={0.5} color="#9db4d8" />
    <pointLight position={[0, -2, 1]} intensity={0.4} color="#e8940a" />
    <Piece metal={metal} label={label} />
  </Canvas>
);

export default CoinScene;
