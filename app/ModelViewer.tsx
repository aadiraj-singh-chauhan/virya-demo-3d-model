'use client';

import React, { Suspense, useRef, useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Environment, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ─── Single source of truth for hotspot positions ─────────────────────────────
// Local coordinates relative to the robot group center.
// Changing these numbers moves hotspots — nothing else needs updating.
const HOTSPOT_POSITIONS = {
  'feature-1': [-0.01,  0.12,  0.30], // 2D Lidar
  'feature-2': [ 0.00,  0.44,  0.08], // 3D Lidar (top spinning dome)
  'feature-3': [ 0.30, -0.28,  0.38], // Wheelbase (front face of right wheel)
  'feature-4': [ 0.10,  0.06, -0.34], // AXIS-IMU — rear of model
};

// Flip to true to show red debug spheres at every hotspot position
const DEBUG = false;

const HOTSPOTS = [
  { id: 'feature-1', label: '2D LIDAR',  position: HOTSPOT_POSITIONS['feature-1'] as [number, number, number] },
  { id: 'feature-2', label: '3D LIDAR',  position: HOTSPOT_POSITIONS['feature-2'] as [number, number, number], fadePosition: HOTSPOT_POSITIONS['feature-1'] as [number, number, number] },
  { id: 'feature-3', label: 'WHEELBASE', position: HOTSPOT_POSITIONS['feature-3'] as [number, number, number], fadePosition: HOTSPOT_POSITIONS['feature-1'] as [number, number, number] },
  { id: 'feature-4', label: 'AXIS-IMU',  position: HOTSPOT_POSITIONS['feature-4'] as [number, number, number], fadeRange: [-0.30, 0.48] as [number, number], fadeRangeRight: [0.20, 0.48] as [number, number] },
];

// ─── Feature panel data ───────────────────────────────────────────────────────
interface FeatureSpec { label: string; value: string; }
interface Feature {
  id: string; badgeLabel: string; title: string; subtitle: string;
  description: string; imageUrl: string; status: string;
  statusColor: string; specs: FeatureSpec[];
}

const FEATURES: Record<string, Feature> = {
  'feature-1': {
    id: 'feature-1', badgeLabel: '2D LIDAR', title: '2D LIDAR',
    subtitle: 'Collision Avoidance & Obstacle Detection',
    description: 'Lorem ipsum dolor sit amet consectetur. Praesent duis congue elementum sapien. Nullam gravida netus cras volutpat feugiat. Et pulvinar augue sed nec cras at aenean.',
    imageUrl: '/2d_lidar.png', status: 'Active', statusColor: '#10b981',
    specs: [
      { label: 'Field of View', value: '270°' }, { label: 'Range',      value: '25m'      },
      { label: 'Frequency',    value: '15 Hz' }, { label: 'Interface',  value: 'Ethernet' },
    ],
  },
  'feature-2': {
    id: 'feature-2', badgeLabel: '3D LIDAR', title: '3D LIDAR',
    subtitle: 'Spatial Mapping & Localization',
    description: 'Equipped with high-precision multi-channel spinning lidar dome to provide a 3D point cloud of the environment, enabling real-time localization and path planning.',
    imageUrl: '/3d_lidar.png', status: 'Active', statusColor: '#10b981',
    specs: [
      { label: 'Field of View', value: '360°'   }, { label: 'Range',       value: '150m'    },
      { label: 'Channels',      value: '16'      }, { label: 'Data Points', value: '300k/s' },
    ],
  },
  'feature-3': {
    id: 'feature-3', badgeLabel: 'WHEELBASE', title: 'WHEELBASE',
    subtitle: 'Independent Drivetrain Suspension',
    description: 'Features high-torque motors inside a heavy-duty chassis structure with active spring suspension, allowing the rover to traverse slopes up to 25 degrees.',
    imageUrl: '/wheelbase.png', status: 'Operational', statusColor: '#10b981',
    specs: [
      { label: 'Tire Diameter', value: '320mm'  }, { label: 'Ground Clear.', value: '120mm'  },
      { label: 'Motor Power',   value: '4x 250W'}, { label: 'Max Payload',   value: '150kg'  },
    ],
  },
  'feature-4': {
    id: 'feature-4', badgeLabel: 'AXIS-IMU', title: 'AXIS-IMU',
    subtitle: 'Inertial Navigation & Odometry',
    description: 'Redundant industrial-grade inertial measurement units measuring linear acceleration and angular velocity along three axes to maintain precise heading control.',
    imageUrl: '/axis_imu.png', status: 'Operational', statusColor: '#10b981',
    specs: [
      { label: 'Axes',        value: '6-Axis IMU' }, { label: 'Gyro Range',  value: '±2000°/s' },
      { label: 'Accel Range', value: '±16g'       }, { label: 'Output Rate', value: '200 Hz'   },
    ],
  },
};

// ─── Smoothstep — mirrors GLSL smoothstep exactly ─────────────────────────────
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ─── Shaders ──────────────────────────────────────────────────────────────────
//
// Billboard vertex: reads the instance world position from instanceMatrix,
// then adds the PlaneGeometry vertex as a camera-space offset so the quad
// always faces the viewer. Instance positions are uploaded once via
// setMatrixAt; the GPU resolves billboard orientation every frame with zero
// JS-side matrix updates after creation — same philosophy as the globe demo.
//
const VERTEX_SHADER = /* glsl */`
  attribute float instanceOpacity;
  attribute float instanceRippleActive;
  varying  float vOpacity;
  varying  float vRippleActive;
  varying  vec2  vUv;
  uniform  float size;

  void main() {
    vUv           = uv;
    vOpacity      = instanceOpacity;
    vRippleActive = instanceRippleActive;

    // Full world position of this instance:
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Move to camera (view) space, then add the plane vertex as a screen-aligned
    // billboard offset — the quad always faces the camera with no JS rotation.
    vec4 viewPos  = viewMatrix * worldPos;
    viewPos.xy   += position.xy * size;

    // Pushes the quad slightly closer to the camera to prevent z-fighting with the underlying mesh
    viewPos.z    += 0.004;

    gl_Position = projectionMatrix * viewPos;
  }
`;

// Two interleaved expanding rings animate entirely in the shader via a time
// uniform — no JS-side updates to positions or geometry after mount.
const FRAGMENT_SHADER = /* glsl */`
  uniform float time;
  uniform vec3  hotspotColor;
  varying float vOpacity;
  varying float vRippleActive;
  varying vec2  vUv;

  void main() {
    vec2  uv   = vUv * 2.0 - 1.0;   // remap [0,1] → [-1,1]
    float dist = max(abs(uv.x), abs(uv.y)); // Chebyshev distance → square shape

    // Solid centre dot
    float centre = 1.0 - smoothstep(0.12, 0.20, dist);

    // First expanding ripple ring (slowed down from 1.1 to 0.6 for elegant motion)
    float speed = 0.6;
    float p1    = fract(time * speed);
    float r1    = p1 * 0.88;
    float w     = 0.055;
    float ring1 = smoothstep(r1 - w, r1, dist)
                * (1.0 - smoothstep(r1, r1 + w * 0.35, dist))
                * pow(1.0 - p1, 2.0);

    // Second ring, offset by half a cycle so they alternate
    float p2    = fract(time * speed + 0.5);
    float r2    = p2 * 0.88;
    float ring2 = smoothstep(r2 - w, r2, dist)
                * (1.0 - smoothstep(r2, r2 + w * 0.35, dist))
                * pow(1.0 - p2, 2.0);

    // Ripple outer rings are active only for the hovered/selected hotspot
    float alpha = centre + (ring1 + ring2) * 0.72 * vRippleActive;
    alpha      *= smoothstep(1.05, 0.88, dist); // hard clip at quad boundary
    alpha      *= vOpacity;                     // per-instance visibility fade

    if (alpha < 0.005) discard;

    gl_FragColor = vec4(hotspotColor, alpha);
  }
`;

// ─── Robot scene: model + instanced hotspot layer ─────────────────────────────
function RobotScene({
  activeFeature,
  onHoverStart,
  onHoverEnd,
  onClick,
}: {
  activeFeature: string;
  onHoverStart: (id: string) => void;
  onHoverEnd:   () => void;
  onClick:      (id: string) => void;
}) {
  const { scene } = useGLTF('/model.glb');

  const groupRef  = useRef<THREE.Group>(null);
  const meshRef   = useRef<THREE.InstancedMesh>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hitRefs   = useRef<(HTMLDivElement | null)[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Scratch vectors — allocated once, reused every frame with no GC pressure.
  const _groupPos   = useRef(new THREE.Vector3());
  const _camDir     = useRef(new THREE.Vector3());
  const _hotspotDir = useRef(new THREE.Vector3());

  // Geometry, material and the opacities buffer are all created exactly once.
  // The opacities Float32Array is the *same* object referenced by the
  // InstancedBufferAttribute, so mutating opacities[i] each frame and then
  // setting needsUpdate = true is all that's required — no extra allocations.
  const { geometry, material, opacities, rippleActives } = useMemo(() => {
    const geo      = new THREE.PlaneGeometry(1, 1);
    const ops      = new Float32Array(HOTSPOTS.length).fill(1.0);
    geo.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(ops, 1));

    const rips     = new Float32Array(HOTSPOTS.length).fill(0.0);
    geo.setAttribute('instanceRippleActive', new THREE.InstancedBufferAttribute(rips, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time:         { value: 0 },
        size:         { value: 0.18 },
        hotspotColor: { value: new THREE.Color('#F43D00') },
      },
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent:    true,
      depthTest:      false,  // temporarily disabled to debug occlusion
      depthWrite:     false,  // transparent quads must not write depth
      side:           THREE.DoubleSide,
    });

    return { geometry: geo, material: mat, opacities: ops, rippleActives: rips };
  }, []);

  // Centering the model geometry manually so it aligns exactly with static local coordinates
  useEffect(() => {
    if (!scene || scene.userData.isCentered) return;
    scene.userData.isCentered = true;
    scene.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    scene.position.copy(center).negate();
  }, [scene]);

  // Set every instance matrix exactly once using the authored HOTSPOTS coords.
  // The dummy carries identity rotation — billboard orientation is on the GPU.
  // This mirrors the globe's single-pass setup: positions authored once, never
  // recalculated.
  useEffect(() => {
    // Shift the whole group so the model sits lower and to the left in the viewport.
    // Done imperatively so no JSX prop or linter can reset it.
    if (groupRef.current) {
      groupRef.current.position.set(-0.45, 0, 0);
    }

    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    HOTSPOTS.forEach((hs, i) => {
      dummy.position.set(hs.position[0], hs.position[1], hs.position[2]);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ camera, clock }) => {
    if (!meshRef.current || !groupRef.current) return;

    material.uniforms.time.value = clock.getElapsedTime();

    // Camera direction relative to the robot group centre — the same dot-product
    // visibility logic used by the globe: normalize both sides, smoothstep the
    // result so hotspots fade smoothly as they rotate behind the model.
    groupRef.current.getWorldPosition(_groupPos.current);
    _camDir.current.copy(camera.position).sub(_groupPos.current).normalize();

    HOTSPOTS.forEach((hs, i) => {
      const fp = (hs as typeof hs & { fadePosition?: [number, number, number] }).fadePosition ?? hs.position;
      _hotspotDir.current
        .set(fp[0], fp[1], fp[2])
        .normalize();

      const dot  = _hotspotDir.current.dot(_camDir.current);
      const hsTyped = hs as typeof hs & { fadeRange?: [number, number]; fadeRangeRight?: [number, number] };
      let [fe0, fe1] = hsTyped.fadeRange ?? [0.05, 0.22];
      if (hsTyped.fadeRangeRight) {
        const camRelX = camera.position.x - _groupPos.current.x;
        const rightBias = Math.max(0, Math.min(1, camRelX / 0.4));
        fe0 = fe0 * (1 - rightBias) + hsTyped.fadeRangeRight[0] * rightBias;
        fe1 = fe1 * (1 - rightBias) + hsTyped.fadeRangeRight[1] * rightBias;
      }
      const fade = smoothstep(fe0, fe1, dot);

      opacities[i] = fade;
      
      // Only ripple if hovered or currently selected active feature card
      const isRippleActive = (activeFeature === hs.id || hoveredId === hs.id);
      rippleActives[i] = isRippleActive ? 1.0 : 0.0;

      const el = labelRefs.current[i];
      if (el) {
        el.style.opacity = String(fade);
      }

      const hitEl = hitRefs.current[i];
      if (hitEl) {
        hitEl.style.pointerEvents = fade > 0.15 ? 'auto' : 'none';
      }
    });

    (meshRef.current.geometry.getAttribute('instanceOpacity') as THREE.BufferAttribute)
      .needsUpdate = true;
    (meshRef.current.geometry.getAttribute('instanceRippleActive') as THREE.BufferAttribute)
      .needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />

      {/* Instanced ripple mesh — all positions come from HOTSPOTS, set once */}
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, HOTSPOTS.length]}
        renderOrder={1}
        frustumCulled={false}
      />

      {/* HTML badge labels — positioned at authored local coordinates */}
      {HOTSPOTS.map((hs, i) => {
        const isHovered = hoveredId === hs.id;
        const isActive = activeFeature === hs.id;
        return (
          <Html key={hs.id} position={hs.position} center zIndexRange={[100, 0]}>
            <div style={{ position: 'relative' }}>
              {/* Hit area: 18×18 px centered on the dot; pointerEvents toggled by useFrame */}
              <div
                ref={(el) => { hitRefs.current[i] = el; }}
                style={{
                  position:      'absolute',
                  width:         '30px',
                  height:        '30px',
                  left:          '-15px',
                  top:           '-15px',
                  cursor:        'pointer',
                  pointerEvents: 'none',
                }}
                onMouseEnter={() => {
                  setHoveredId(hs.id);
                  document.body.style.cursor = 'pointer';
                }}
                onMouseLeave={() => {
                  setHoveredId(null);
                  onHoverEnd();
                  document.body.style.cursor = 'auto';
                }}
                onClick={() => onClick(hs.id)}
              />
              {/* Label opacity wrapper — no visibility:hidden so CSS stays compositable */}
              <div
                ref={(el) => { labelRefs.current[i] = el; }}
                style={{ position: 'relative', pointerEvents: 'none', opacity: 0 }}
              >
                <div style={{
                  position:        'absolute',
                  left:            '22px',
                  top:             '0px',
                  transform:       `translateY(-50%) translateX(${isHovered ? '0px' : '-8px'})`,
                  backgroundColor: '#F43D00',
                  color:           '#FFFFFF',
                  height:          '38px',
                  padding:         '0 16px',
                  display:         'flex',
                  alignItems:      'center',
                  whiteSpace:      'nowrap',
                  fontFamily:      '"Outfit", sans-serif',
                  fontSize:        '14px',
                  fontWeight:      500,
                  letterSpacing:   '1.2px',
                  boxShadow:       '0 4px 12px rgba(244,61,0,0.2)',
                  pointerEvents:   'none',
                  opacity:         isHovered ? 1 : 0,
                  visibility:      isHovered ? 'visible' : 'hidden',
                  transition:      'opacity 0.2s ease, transform 0.2s cubic-bezier(0.16,1,0.3,1), visibility 0.2s ease',
                }}>
                  <span>{hs.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px' }}>
                    <div style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255,255,255,0.4)' }} />
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                      <line x1="0"  y1="8"  x2="6"  y2="8"  stroke="currentColor" strokeWidth="1.5" />
                      <line x1="10" y1="8"  x2="16" y2="8"  stroke="currentColor" strokeWidth="1.5" />
                      <line x1="8"  y1="0"  x2="8"  y2="6"  stroke="currentColor" strokeWidth="1.5" />
                      <line x1="8"  y1="10" x2="8"  y2="16" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </Html>
        );
      })}

      {/* Debug: red spheres & axes helper at each authored hotspot position */}
      {DEBUG && HOTSPOTS.map((hs) => (
        <group key={`dbg-${hs.id}`} position={hs.position}>
          <mesh>
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshBasicMaterial color="red" depthTest={false} transparent opacity={0.8} />
          </mesh>
          <axesHelper args={[0.1]} />
        </group>
      ))}
    </group>
  );
}

// OrbitControls type definition and interactive camera setup
type OrbitCtrl = { enableDamping: boolean; target: THREE.Vector3; object: { position: THREE.Vector3 }; update: () => void };
function CameraSetup({
  orbitRef,
  activeFeature,
  isAnimatingRef,
}: {
  orbitRef: React.MutableRefObject<OrbitCtrl | null>;
  activeFeature: string;
  isAnimatingRef: React.MutableRefObject<boolean>;
}) {
  const done = useRef(false);
  const targetPos = useRef(new THREE.Vector3());
  const animHorizontalDistance = useRef(0);

  // Trigger camera rotation to face the selected hotspot
  useEffect(() => {
    if (!done.current || !orbitRef.current) return;

    const hs = HOTSPOTS.find((h) => h.id === activeFeature);
    if (!hs) return;

    const ctrl = orbitRef.current;
    
    // Project direction onto XZ plane to match horizontal orbit constraint
    const dir = new THREE.Vector3(hs.position[0], 0, hs.position[2]).normalize();
    
    // Calculate current horizontal distance to target to keep zoom/distance unchanged
    const dx = ctrl.object.position.x - ctrl.target.x;
    const dz = ctrl.object.position.z - ctrl.target.z;
    animHorizontalDistance.current = Math.sqrt(dx * dx + dz * dz);
    
    // Set target position keeping Y and horizontal distance the same (prevents zoom or height shifts)
    targetPos.current.set(
      ctrl.target.x + dir.x * animHorizontalDistance.current,
      ctrl.object.position.y,
      ctrl.target.z + dir.z * animHorizontalDistance.current
    );
    isAnimatingRef.current = true;
  }, [activeFeature, orbitRef, isAnimatingRef]);

  useFrame(() => {
    if (!orbitRef.current) return;
    const ctrl = orbitRef.current;

    if (!done.current) {
      done.current = true;
      ctrl.enableDamping = false;
      ctrl.target.set(-0.45, 0, 0);
      ctrl.object.position.set(-0.45, 0, 3);
      ctrl.update();
      ctrl.enableDamping = true;
      return;
    }

    if (isAnimatingRef.current) {
      // 1. Lerp the camera position directly
      ctrl.object.position.lerp(targetPos.current, 0.08);
      
      // 2. Project back onto the cylinder to prevent zoom/shrink chord effect
      const dx = ctrl.object.position.x - ctrl.target.x;
      const dz = ctrl.object.position.z - ctrl.target.z;
      const currentHorizontalDist = Math.sqrt(dx * dx + dz * dz);
      
      if (currentHorizontalDist > 0.0001 && animHorizontalDistance.current > 0) {
        ctrl.object.position.x = ctrl.target.x + (dx / currentHorizontalDist) * animHorizontalDistance.current;
        ctrl.object.position.z = ctrl.target.z + (dz / currentHorizontalDist) * animHorizontalDistance.current;
      }
      
      ctrl.update();

      if (ctrl.object.position.distanceTo(targetPos.current) < 0.005) {
        isAnimatingRef.current = false;
      }
    }
  });

  return null;
}

// ─── Root component ───────────────────────────────────────────────────────────
export default function ModelViewer() {
  const [activeFeature, setActiveFeature] = useState<string>('feature-1');
  const [cameraFeature, setCameraFeature] = useState<string>('feature-1');
  const orbitRef = useRef<OrbitCtrl | null>(null);
  const isAnimatingRef = useRef(false);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#FAF7F2',
      touchAction: 'none',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: '"Outfit", "Inter", sans-serif',
    }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />

      <style dangerouslySetInnerHTML={{ __html: `
        .collapsed-tab {
          background: #ffffff;
          border: 1px solid #e2e2e2;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .collapsed-tab:hover {
          background: #faf8f5 !important;
          border-color: #d0d0d0 !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(0,0,0,0.02) !important;
        }
      `}} />

      {/* Page heading */}
      <div style={{
        position: 'absolute', top: '55px', left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10, textAlign: 'center',
        width: '100%', maxWidth: '800px',
        padding: '0 20px', pointerEvents: 'none',
      }}>
        <h1 style={{
          fontSize: '36px', fontWeight: 600,
          letterSpacing: '1px', color: '#111111',
          margin: 0, fontFamily: '"Outfit", sans-serif',
        }}>
          BUILT ON AN INTELLIGENT CORE
        </h1>
        <p style={{
          fontSize: '14px', color: '#8b8a85',
          marginTop: '10px', lineHeight: '1.6',
          fontWeight: 400, fontFamily: '"Inter", sans-serif',
          maxWidth: '580px', marginLeft: 'auto', marginRight: 'auto',
        }}>
          Lorem ipsum dolor sit amet consectetur. Cursus sit diam pulvinar netus eget.
          Neque cras eget quis sapien cursus. Lorem ultrices neque sed sapien mattis.
        </p>
      </div>

      {/* Full-viewport canvas — panel overlays on the right */}
      <Canvas
        camera={{ position: [0, 0.55, 2.8], fov: 32 }}
        onPointerDown={() => {
          isAnimatingRef.current = false;
        }}
        style={{
          touchAction: 'none',
          position: 'absolute',
          left: 0,
          top: '80px',
          width: 'calc(100vw - 340px)',
          height: 'calc(100vh - 80px)',
        }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[5, 5, 5]} intensity={0.85} />
        <CameraSetup orbitRef={orbitRef} activeFeature={cameraFeature} isAnimatingRef={isAnimatingRef} />
        <Suspense fallback={null}>
          <RobotScene
            activeFeature={activeFeature}
            onHoverStart={() => {}}
            onHoverEnd={() => {}}
            onClick={(id) => { setActiveFeature(id); setCameraFeature(id); }}
          />
          <Environment preset="studio" background={false} environmentIntensity={0.45} />
        </Suspense>
        <OrbitControls
          ref={orbitRef as React.Ref<any>}
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={0.6}
          minPolarAngle={Math.PI / 2}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>

      {/* Feature cards panel */}
      <div style={{
        position: 'absolute', top: '200px', right: '48px',
        width: '300px', maxWidth: 'calc(100vw - 80px)',
        maxHeight: 'calc(100vh - 170px)', overflowY: 'auto',
        scrollBehavior: 'smooth',
        zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: '8px',
        fontFamily: '"Outfit", "Inter", sans-serif',
      }}>
        {Object.keys(FEATURES).map((key) => {
          const feat = FEATURES[key];
          const isActive = activeFeature === key;

          return (
            <motion.div
              key={key}
              layout
              onMouseEnter={() => { setActiveFeature(key); setCameraFeature(key); }}
              onClick={() => { setActiveFeature(key); setCameraFeature(key); }}
              ref={(el) => { if (el && activeFeature === key) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}
              animate={{
                boxShadow: isActive
                  ? '0 8px 32px rgba(0,0,0,0.07)'
                  : '0 2px 8px rgba(0,0,0,0.02)',
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e2e2',
                borderRadius: '6px',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              {/* Image — reveals downward */}
              <AnimatePresence initial={false}>
                {isActive && (
                  <motion.div
                    key="img"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 160, opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: 'hidden', background: '#f0f0f0' }}
                  >
                    <motion.img
                      src={feat.imageUrl}
                      alt={feat.title}
                      initial={{ scale: 1.06 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 1.06 }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Title — always visible */}
              <div style={{ padding: '9px 14px' }}>
                <h2 style={{
                  fontSize: '13px', fontWeight: 700, margin: 0,
                  letterSpacing: '1px', textTransform: 'uppercase',
                  fontFamily: '"Outfit", sans-serif', color: '#111111',
                }}>
                  {feat.title}
                </h2>

                {/* Description — fades up after image settles */}
                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.p
                      key="desc"
                      initial={{ opacity: 0, y: 8, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto', marginTop: '8px' }}
                      exit={{ opacity: 0, y: 4, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        fontSize: '12px', lineHeight: '1.65', color: '#666666',
                        marginBottom: 0, fontWeight: 400,
                        fontFamily: '"Inter", sans-serif',
                        overflow: 'hidden',
                      }}
                    >
                      {feat.description}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
