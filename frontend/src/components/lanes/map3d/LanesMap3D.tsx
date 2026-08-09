import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { AreaMapDatum, MapLevel } from "@/lib/metrics/lanes";
import { groupKeyForStateName } from "@/lib/metrics/lanes";
import { rpm as fmtRpm } from "@/lib/format";
import {
  colorFor,
  maxLoadsOf,
  maxRateOf,
  type MapMode,
} from "@/components/lanes/mapColor";
import { stateSolids, type LaneFlow, type StateSolid } from "./geometry";
import { DUR, GSAP_EASE } from "@/theme/motion";

gsap.registerPlugin(useGSAP);

// The situation board — the full R3F treatment (Jason's call, 2026-08-09):
// states extrude by load volume, lanes fly as bloomed arcs with a pulse
// traveling each one. Loaded lazily; the SVG board is the non-WebGL fallback.
// Motion always plays.

interface Props {
  data: Record<string, AreaMapDatum>;
  level: MapLevel;
  windowDays: number;
  selected: string | null;
  onSelect: (key: string) => void;
  mode: MapMode;
  flows: LaneFlow[];
}

interface HoverState {
  x: number;
  y: number;
  datum: AreaMapDatum;
}

const BASE_H = 0.14; // unlit slab thickness
const MAX_H = 1.7; // tallest extrusion (the busiest area)
const AMBER = new THREE.Color("#e8940a");
const AMBER_HI = new THREE.Color("#f5b03a");

// Per-state boot stagger: west→east sweep, keyed off the centroid.
const sweepT = (cx: number) => (cx + 16) / 32;

const StateMesh = ({
  solid,
  height,
  color,
  lit,
  isSelected,
  hovered,
  boot,
  onOver,
  onOut,
  onClick,
}: {
  solid: StateSolid;
  height: number;
  color: string;
  lit: boolean;
  isSelected: boolean;
  hovered: boolean;
  boot: { states: number };
  onOver: (e: ThreeEvent<PointerEvent>) => void;
  onOut: () => void;
  onClick: () => void;
}) => {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const geom = useMemo(
    () =>
      new THREE.ExtrudeGeometry(solid.shapes, {
        depth: 1,
        bevelEnabled: false,
      }),
    [solid],
  );

  useFrame(() => {
    if (!mesh.current || !mat.current) return;
    // Rise with the sweep; hover/selection warm the metal.
    const t0 = sweepT(solid.centroid[0]) * 0.55;
    const local = Math.min(1, Math.max(0.001, (boot.states - t0) / 0.45));
    const eased = 1 - Math.pow(1 - local, 3);
    mesh.current.scale.z = Math.max(0.001, height * eased);
    const targetE = isSelected ? 0.65 : hovered ? 0.45 : lit ? 0.16 : 0.04;
    mat.current.emissiveIntensity +=
      (targetE - mat.current.emissiveIntensity) * 0.18;
  });

  return (
    <mesh
      ref={mesh}
      geometry={geom}
      rotation-x={-Math.PI / 2}
      onPointerOver={(e) => {
        e.stopPropagation();
        onOver(e);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        onOver(e);
      }}
      onPointerOut={onOut}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <meshStandardMaterial
        ref={mat}
        color={color}
        emissive={color}
        emissiveIntensity={0.05}
        roughness={0.62}
        metalness={0.35}
      />
    </mesh>
  );
};

const Arc = ({
  flow,
  centroids,
  heights,
  maxGross,
  boot,
  index,
}: {
  flow: LaneFlow;
  centroids: Map<string, [number, number]>;
  heights: Map<string, number>;
  maxGross: number;
  boot: { arcs: number };
  index: number;
}) => {
  const tube = useRef<THREE.Mesh>(null);
  const dot = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random());

  const built = useMemo(() => {
    const a = centroids.get(flow.from);
    const b = centroids.get(flow.to);
    if (!a || !b) return null;
    const ha = heights.get(flow.from) ?? BASE_H;
    const hb = heights.get(flow.to) ?? BASE_H;
    const va = new THREE.Vector3(a[0], ha + 0.05, a[1]);
    const vb = new THREE.Vector3(b[0], hb + 0.05, b[1]);
    const dist = va.distanceTo(vb);
    const mid = va
      .clone()
      .add(vb)
      .multiplyScalar(0.5)
      .setY(Math.max(ha, hb) + 0.9 + dist * 0.22);
    const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
    const radius = 0.035 + (flow.gross / maxGross) * 0.05;
    const geom = new THREE.TubeGeometry(curve, 48, radius, 8);
    return { curve, geom, indexCount: geom.index?.count ?? 0 };
  }, [flow, centroids, heights, maxGross]);

  useFrame(() => {
    if (!built) return;
    // Draw-in: reveal tube indices as the boot's arc phase reaches this arc.
    const local = Math.min(1, Math.max(0, boot.arcs * 5 - index * 0.55));
    if (tube.current) {
      built.geom.setDrawRange(0, Math.floor(built.indexCount * local));
    }
    // The pulse travels forever once its arc is drawn — a load in motion.
    if (dot.current) {
      if (local >= 1) {
        t.current = (t.current + 0.004) % 1.12;
        const tt = Math.min(1, t.current);
        dot.current.position.copy(built.curve.getPointAt(tt));
        dot.current.visible = t.current <= 1;
      } else {
        dot.current.visible = false;
      }
    }
  });

  if (!built) return null;
  return (
    <group>
      <mesh ref={tube} geometry={built.geom}>
        <meshStandardMaterial
          color="#1a1206"
          emissive={AMBER}
          emissiveIntensity={2.1}
          toneMapped={false}
          roughness={0.4}
        />
      </mesh>
      <mesh ref={dot}>
        <sphereGeometry args={[0.085, 12, 12]} />
        <meshStandardMaterial
          color="#000"
          emissive={AMBER_HI}
          emissiveIntensity={3.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

// Cursor parallax — the table-map feel from the approved mockup. The whole
// board eases toward the pointer; no free orbit.
const ParallaxRig = ({
  pointer,
  children,
}: {
  pointer: React.MutableRefObject<{ x: number; y: number }>;
  children: React.ReactNode;
}) => {
  const rig = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!rig.current) return;
    rig.current.rotation.x +=
      (pointer.current.y * 0.055 - rig.current.rotation.x) * 0.06;
    rig.current.rotation.z +=
      (-pointer.current.x * 0.045 - rig.current.rotation.z) * 0.06;
  });
  return <group ref={rig}>{children}</group>;
};

const LanesMap3D = ({
  data,
  level,
  windowDays,
  selected,
  onSelect,
  mode,
  flows,
}: Props) => {
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const solids = useMemo(() => stateSolids(), []);
  const maxLoads = useMemo(() => maxLoadsOf(data), [data]);
  const maxRate = useMemo(() => maxRateOf(data), [data]);
  const maxGross = useMemo(
    () => Math.max(1, ...flows.map((f) => f.gross)),
    [flows],
  );

  // Height/color per state, at this level's grouping.
  const perState = useMemo(() => {
    const out = new Map<
      string,
      { key: string; datum?: AreaMapDatum; height: number; color: string }
    >();
    for (const s of solids) {
      const key = groupKeyForStateName(s.name, level) ?? s.name;
      const datum = data[key];
      const height = datum
        ? BASE_H + (datum.loadCount / maxLoads) * MAX_H
        : BASE_H * 0.45;
      out.set(s.name, {
        key,
        datum,
        height,
        color: colorFor(datum, mode, maxLoads, maxRate),
      });
    }
    return out;
  }, [solids, data, level, mode, maxLoads, maxRate]);

  const centroids = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const s of solids) m.set(s.name, s.centroid);
    return m;
  }, [solids]);
  const stateHeights = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of solids) m.set(s.name, perState.get(s.name)?.height ?? BASE_H);
    return m;
  }, [solids, perState]);

  // Group labels at grouped levels, at the lit groups' member-average centroid.
  const groupLabels = useMemo(() => {
    if (level === "state") return [];
    const acc = new Map<string, { x: number; z: number; n: number; h: number }>();
    for (const s of solids) {
      const p = perState.get(s.name);
      if (!p?.datum) continue;
      const a = acc.get(p.key) ?? { x: 0, z: 0, n: 0, h: 0 };
      a.x += s.centroid[0];
      a.z += s.centroid[1];
      a.h = Math.max(a.h, p.height);
      a.n += 1;
      acc.set(p.key, a);
    }
    return [...acc.entries()].map(([key, a]) => ({
      key,
      datum: data[key],
      pos: [a.x / a.n, a.h + 0.75, a.z / a.n] as [number, number, number],
    }));
  }, [level, solids, perState, data]);

  // Top-paying groups (≥3 loads) get the hot ring — the flame, machined.
  const hotRings = useMemo(() => {
    const byKey = new Map<string, { x: number; z: number; h: number; n: number }>();
    for (const s of solids) {
      const p = perState.get(s.name);
      if (!p?.datum) continue;
      const a = byKey.get(p.key) ?? { x: 0, z: 0, h: 0, n: 0 };
      a.x += s.centroid[0];
      a.z += s.centroid[1];
      a.h = Math.max(a.h, p.height);
      a.n += 1;
      byKey.set(p.key, a);
    }
    return Object.values(data)
      .filter((d) => d.medianRpm != null && d.loadCount >= 3)
      .sort((a, b) => (b.medianRpm as number) - (a.medianRpm as number))
      .slice(0, 3)
      .map((d) => {
        const a = byKey.get(d.key);
        return a
          ? { key: d.key, pos: [a.x / a.n, a.h + 0.12, a.z / a.n] as const }
          : null;
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);
  }, [data, solids, perState]);

  // One boot timeline: states sweep up, then the arcs draw and pulses launch.
  const boot = useRef({ states: 0, arcs: 0 }).current;
  useGSAP(() => {
    boot.states = 0;
    boot.arcs = 0;
    const tl = gsap.timeline();
    tl.to(boot, { states: 1, duration: DUR.slow + 0.4, ease: "none" });
    tl.to(boot, { arcs: 1, duration: DUR.slow + 0.6, ease: GSAP_EASE.mech }, "-=0.35");
  }, [level, windowDays]);

  const overState = (name: string) => (e: ThreeEvent<PointerEvent>) => {
    const p = perState.get(name);
    if (!p?.datum || !wrap.current) return;
    const rect = wrap.current.getBoundingClientRect();
    setHover({
      x: Math.min(e.clientX - rect.left + 14, rect.width - 200),
      y: e.clientY - rect.top - 12,
      datum: p.datum,
    });
    setHoverKey(p.key);
  };
  const out = () => {
    setHover(null);
    setHoverKey(null);
  };

  return (
    <div
      ref={wrap}
      className="relative"
      onMouseMove={(e) => {
        const r = wrap.current?.getBoundingClientRect();
        if (!r) return;
        pointer.current.x = (e.clientX - r.left) / r.width - 0.5;
        pointer.current.y = (e.clientY - r.top) / r.height - 0.5;
      }}
      onMouseLeave={() => {
        pointer.current.x = 0;
        pointer.current.y = 0;
      }}
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 13.2, 11.6], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        style={{ height: "min(58vh, 560px)", background: "transparent" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[7, 11, 5]} intensity={1.15} color="#fff3df" />
        <directionalLight position={[-7, 6, -6]} intensity={0.3} color="#9db4d8" />
        <ParallaxRig pointer={pointer}>
          {solids.map((s) => {
            const p = perState.get(s.name)!;
            return (
              <StateMesh
                key={s.name}
                solid={s}
                height={p.height}
                color={p.color}
                lit={!!p.datum}
                isSelected={selected === p.key}
                hovered={hoverKey === p.key}
                boot={boot}
                onOver={overState(s.name)}
                onOut={out}
                onClick={() => p.datum && onSelect(p.key)}
              />
            );
          })}
          {flows.map((f, i) => (
            <Arc
              key={`${f.from}→${f.to}`}
              flow={f}
              centroids={centroids}
              heights={stateHeights}
              maxGross={maxGross}
              boot={boot}
              index={i}
            />
          ))}
          {hotRings.map((h) => (
            <mesh
              key={h.key}
              position={h.pos as unknown as THREE.Vector3}
              rotation-x={-Math.PI / 2}
            >
              <torusGeometry args={[0.38, 0.045, 8, 40]} />
              <meshStandardMaterial
                color="#000"
                emissive={AMBER_HI}
                emissiveIntensity={2.6}
                toneMapped={false}
              />
            </mesh>
          ))}
          {groupLabels.map((g) => (
            <Billboard key={g.key} position={g.pos}>
              <Text
                fontSize={0.62}
                color="#e6ecf7"
                outlineColor="#070a10"
                outlineWidth={0.045}
                anchorY="bottom"
              >
                {g.key}
              </Text>
              <Text
                fontSize={0.34}
                color="#8494ab"
                outlineColor="#070a10"
                outlineWidth={0.03}
                position={[0, -0.42, 0]}
                anchorY="bottom"
              >
                {`${g.datum?.loadCount ?? 0} ${g.datum?.loadCount === 1 ? "load" : "loads"}`}
              </Text>
            </Billboard>
          ))}
        </ParallaxRig>
        <EffectComposer>
          <Bloom
            intensity={0.72}
            luminanceThreshold={0.62}
            mipmapBlur
            radius={0.72}
          />
        </EffectComposer>
      </Canvas>

      {hover && (
        <div
          className="absolute pointer-events-none z-10 rounded-md border border-hairline bg-[#040609] p-2 text-xs text-dim"
          style={{ left: hover.x, top: hover.y, maxWidth: 220 }}
        >
          <div className="font-semibold text-ink">{hover.datum.key}</div>
          <div>
            {hover.datum.loadCount} load{hover.datum.loadCount === 1 ? "" : "s"} ·{" "}
            {windowDays}d
          </div>
          <div>
            {hover.datum.medianRpm == null ? (
              <span>no rate</span>
            ) : (
              <>
                <span className="font-semibold text-ink">
                  {fmtRpm(hover.datum.medianRpm)}
                </span>{" "}
                /mi median
              </>
            )}
          </div>
          {hover.datum.members.length > 0 && (
            <div className="text-faint">{hover.datum.members.join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default LanesMap3D;
