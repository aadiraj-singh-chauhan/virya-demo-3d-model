'use client';

import { Suspense, useRef, useEffect, RefObject, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Environment, Center, Html } from '@react-three/drei';
import * as THREE from 'three';

interface FeatureSpec {
  label: string;
  value: string;
}

interface Feature {
  id: string;
  badgeLabel: string;
  nodeName: string;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  status: string;
  statusColor: string;
  specs: FeatureSpec[];
}

const FEATURES: Record<string, Feature> = {
  'feature-1': {
    id: 'feature-1',
    badgeLabel: '2D LIDAR',
    nodeName: 'N2D Lidar',
    title: '2D LIDAR',
    subtitle: 'Collision Avoidance & Obstacle Detection',
    description: 'Lorem ipsum dolor sit amet consectetur. Praesent duis congue elementum sapien. Nullam gravida netus cras volutpat feugiat. Et pulvinar augue sed nec cras at aenean.',
    imageUrl: '/2d_lidar.png',
    status: 'Active',
    statusColor: '#10b981',
    specs: [
      { label: 'Field of View', value: '270°' },
      { label: 'Range', value: '25m' },
      { label: 'Frequency', value: '15 Hz' },
      { label: 'Interface', value: 'Ethernet' }
    ]
  },
  'feature-2': {
    id: 'feature-2',
    badgeLabel: '3D LIDAR',
    nodeName: 'N3D Lidar',
    title: '3D LIDAR',
    subtitle: 'Spatial Mapping & Localization',
    description: 'Equipped with high-precision multi-channel spinning lidar dome to provide a 3D point cloud of the environment, enabling real-time localization and path planning.',
    imageUrl: '/3d_lidar.png',
    status: 'Active',
    statusColor: '#10b981',
    specs: [
      { label: 'Field of View', value: '360°' },
      { label: 'Range', value: '150m' },
      { label: 'Channels', value: '16' },
      { label: 'Data Points', value: '300k/s' }
    ]
  },
  'feature-3': {
    id: 'feature-3',
    badgeLabel: 'WHEELBASE',
    nodeName: 'Alloys',
    title: 'WHEELBASE',
    subtitle: 'Independent Drivetrain Suspension',
    description: 'Features high-torque motors inside a heavy-duty chassis structure with active spring suspension, allowing the rover to traverse slopes up to 25 degrees.',
    imageUrl: '/wheelbase.png',
    status: 'Operational',
    statusColor: '#10b981',
    specs: [
      { label: 'Tire Diameter', value: '320mm' },
      { label: 'Ground Clear.', value: '120mm' },
      { label: 'Motor Power', value: '4x 250W' },
      { label: 'Max Payload', value: '150kg' }
    ]
  },
  'feature-4': {
    id: 'feature-4',
    badgeLabel: 'AXIS-IMU',
    nodeName: 'Red Pushbutton',
    title: 'AXIS-IMU',
    subtitle: 'Inertial Navigation & Odometry',
    description: 'Redundant industrial-grade inertial measurement units measuring linear acceleration and angular velocity along three axes to maintain precise heading control.',
    imageUrl: '/axis_imu.png',
    status: 'Operational',
    statusColor: '#10b981',
    specs: [
      { label: 'Axes', value: '6-Axis IMU' },
      { label: 'Gyro Range', value: '±2000°/s' },
      { label: 'Accel Range', value: '±16g' },
      { label: 'Output Rate', value: '200 Hz' }
    ]
  }
};

function Hotspot({
  position,
  featureId,
  badgeLabel,
  onHoverStart,
  onHoverEnd,
  onClick,
  isActive,
}: {
  position: [number, number, number];
  featureId: string;
  badgeLabel: string;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onClick: (id: string) => void;
  isActive: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useFrame(() => {
    if (!groupRef.current || !divRef.current) return;
    const parent = groupRef.current.parent;
    if (!parent) return;
    
    const rotY = parent.rotation.y;
    const localX = position[0];
    const localZ = position[2];
    const rotatedZ = localX * Math.sin(rotY) + localZ * Math.cos(rotY);
    
    const isBehind = rotatedZ < -0.02;
    divRef.current.style.opacity = isBehind ? '0' : '1';
    divRef.current.style.visibility = isBehind ? 'hidden' : 'visible';
    divRef.current.style.pointerEvents = isBehind ? 'none' : 'auto';
  });

  return (
    <group ref={groupRef} position={position}>
      <Html center zIndexRange={[100, 0]}>
        <div
          ref={divRef}
          style={{
            position: 'relative',
            transition: 'opacity 0.25s ease, visibility 0.25s ease',
          }}
        >
          <a
            href={`#${featureId}`}
            onClick={(e) => {
              e.preventDefault();
              onClick(featureId);
            }}
            onMouseEnter={() => {
              setIsHovered(true);
              onHoverStart(featureId);
            }}
            onMouseLeave={() => {
              setIsHovered(false);
              onHoverEnd();
            }}
            style={{
              position: 'absolute',
              left: '-19px',
              top: '-19px',
              width: '38px',
              height: '38px',
              cursor: 'pointer',
              textDecoration: 'none',
              transform: (isHovered || isActive) ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          >
            <div
              className="squarish-pulse-outer"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(244, 61, 0, 0.15)',
                transition: 'all 0.3s ease',
              }}
            />
            
            <div
              className="squarish-pulse-medium"
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                width: '22px',
                height: '22px',
                backgroundColor: (isHovered || isActive) ? 'rgba(244, 61, 0, 0.45)' : 'rgba(244, 61, 0, 0.25)',
                transition: 'all 0.3s ease',
                border: (isHovered || isActive) ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
              }}
            />
            
            <div
              style={{
                position: 'absolute',
                top: '14px',
                left: '14px',
                width: '10px',
                height: '10px',
                backgroundColor: '#F43D00',
                transition: 'all 0.3s ease',
                boxShadow: (isHovered || isActive) ? '0 0 10px #F43D00, 0 0 2px #fff' : 'none',
              }}
            />
          </a>

          {/* Hover Label */}
          <div
            style={{
              position: 'absolute',
              left: '26px',
              top: '0px',
              transform: `translateY(-50%) translateX(${isHovered ? '0px' : '-8px'})`,
              backgroundColor: '#F43D00',
              color: '#FFFFFF',
              height: '38px',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              fontFamily: '"Outfit", sans-serif',
              fontSize: '14px',
              fontWeight: 500,
              letterSpacing: '1.2px',
              boxShadow: '0 4px 12px rgba(244, 61, 0, 0.2)',
              pointerEvents: 'none',
              opacity: isHovered ? 1 : 0,
              visibility: isHovered ? 'visible' : 'hidden',
              transition: 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.2s ease',
            }}
          >
            <span>{badgeLabel}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px' }}>
              <div style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255, 255, 255, 0.4)' }} />
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                <line x1="0" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" />
                <line x1="10" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5" />
                <line x1="8" y1="0" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" />
                <line x1="8" y1="10" x2="8" y2="16" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
          </div>
        </div>
      </Html>
    </group>
  );
}

function Model({
  containerRef,
  activeFeature,
  onHoverStart,
  onHoverEnd,
  onClick,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  activeFeature: string;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onClick: (id: string) => void;
}) {
  const { scene } = useGLTF('/model.glb');
  const groupRef = useRef<THREE.Group>(null);
  const targetRotY = useRef(0);
  const currentRotY = useRef(0);
  const [positionsMapped, setPositionsMapped] = useState(false);

  const [positions, setPositions] = useState<Record<string, [number, number, number]>>({
    'feature-1': [-0.1, 0.1, 0.25],
    'feature-2': [0.18, 0.28, 0.22],
    'feature-3': [0.22, -0.18, 0.28],
    'feature-4': [-0.28, 0.0, 0.18]
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let isMouseDown = false;
    let lastMouseX = 0;

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button, a, [data-no-drag]')) return;
      isMouseDown = true;
      lastMouseX = e.clientX;
      container.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isMouseDown) return;
      const deltaX = e.clientX - lastMouseX;
      lastMouseX = e.clientX;
      targetRotY.current += deltaX * 0.007;
    };

    const onMouseUp = () => {
      if (isMouseDown) {
        isMouseDown = false;
        container.style.cursor = 'grab';
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.style.cursor = 'grab';

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [containerRef]);

  useFrame(() => {
    if (!groupRef.current) return;
    currentRotY.current = THREE.MathUtils.lerp(currentRotY.current, targetRotY.current, 0.06);
    groupRef.current.rotation.y = currentRotY.current;

    // Map positions once when scene and groupRef are fully mounted and updated
    if (!positionsMapped && scene) {
      // Temporarily set rotation to 0 to do coordinate mapping
      const tempRotY = groupRef.current.rotation.y;
      groupRef.current.rotation.y = 0;
      groupRef.current.updateMatrixWorld(true);
      scene.updateMatrixWorld(true);

      const updatedPositions = { ...positions };
      let wasUpdated = false;

      Object.keys(FEATURES).forEach((key) => {
        const feat = FEATURES[key];
        const node = scene.getObjectByName(feat.nodeName);
        if (node) {
          const worldPos = new THREE.Vector3();
          node.getWorldPosition(worldPos);
          const localPos = groupRef.current!.worldToLocal(worldPos);
          updatedPositions[key] = [localPos.x, localPos.y, localPos.z];
          wasUpdated = true;
        }
      });

      groupRef.current.rotation.y = tempRotY;

      if (wasUpdated) {
        setPositions(updatedPositions);
      }
      setPositionsMapped(true);
    }
  });

  return (
    <group ref={groupRef} position={[-0.4, -0.15, 0]}>
      <Center>
        <primitive object={scene} />
      </Center>
      <Hotspot
        position={positions['feature-1']}
        featureId="feature-1"
        badgeLabel={FEATURES['feature-1'].badgeLabel}
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
        onClick={onClick}
        isActive={activeFeature === 'feature-1'}
      />
      <Hotspot
        position={positions['feature-2']}
        featureId="feature-2"
        badgeLabel={FEATURES['feature-2'].badgeLabel}
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
        onClick={onClick}
        isActive={activeFeature === 'feature-2'}
      />
      <Hotspot
        position={positions['feature-3']}
        featureId="feature-3"
        badgeLabel={FEATURES['feature-3'].badgeLabel}
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
        onClick={onClick}
        isActive={activeFeature === 'feature-3'}
      />
      <Hotspot
        position={positions['feature-4']}
        featureId="feature-4"
        badgeLabel={FEATURES['feature-4'].badgeLabel}
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
        onClick={onClick}
        isActive={activeFeature === 'feature-4'}
      />
    </group>
  );
}

export default function ModelViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFeature, setActiveFeature] = useState<string>('feature-1');

  const handleHoverStart = (id: string) => setActiveFeature(id);
  const handleHoverEnd = () => {};
  const handleClick = (id: string) => setActiveFeature(id);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        background: '#FAF7F2',
        touchAction: 'none',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '"Outfit", "Inter", sans-serif',
      }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes squarish-pulse-out {
          0% { transform: scale(0.95); opacity: 0.4; }
          50% { transform: scale(1.15); opacity: 0.7; }
          100% { transform: scale(0.95); opacity: 0.4; }
        }
        
        @keyframes squarish-pulse-med {
          0% { transform: scale(0.95); opacity: 0.6; }
          50% { transform: scale(1.1); opacity: 0.8; }
          100% { transform: scale(0.95); opacity: 0.6; }
        }

        .squarish-pulse-outer { animation: squarish-pulse-out 2s infinite ease-in-out; }
        .squarish-pulse-medium { animation: squarish-pulse-med 2s infinite ease-in-out; }

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

      <div style={{
        position: 'absolute',
        top: '55px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        textAlign: 'center',
        width: '100%',
        maxWidth: '800px',
        padding: '0 20px',
        pointerEvents: 'none',
      }}>
        <h1 style={{
          fontSize: '36px',
          fontWeight: 600,
          letterSpacing: '1px',
          color: '#111111',
          margin: 0,
          fontFamily: '"Outfit", sans-serif',
        }}>
          BUILT ON AN INTELLIGENT CORE
        </h1>
        <p style={{
          fontSize: '14px',
          color: '#8b8a85',
          marginTop: '10px',
          lineHeight: '1.6',
          fontWeight: 400,
          fontFamily: '"Inter", sans-serif',
          maxWidth: '580px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          Lorem ipsum dolor sit amet consectetur. Cursus sit diam pulvinar netus eget. Neque cras eget quis sapien cursus. Lorem ultrices neque sed sapien mattis.
        </p>
      </div>

      {/* Instructions removed */}

      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 45 }}
        style={{ touchAction: 'none', position: 'absolute', inset: 0 }}
        eventSource={containerRef as RefObject<HTMLElement>}
        eventPrefix="client"
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[5, 5, 5]} intensity={0.85} />
        <Suspense fallback={null}>
          <Model
            containerRef={containerRef}
            activeFeature={activeFeature}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
            onClick={handleClick}
          />
          <Environment preset="studio" background={false} environmentIntensity={0.45} />
        </Suspense>
      </Canvas>

      <div
        style={{
          position: 'absolute',
          top: '205px',
          right: '80px',
          width: '370px',
          maxWidth: 'calc(100vw - 120px)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          fontFamily: '"Outfit", "Inter", sans-serif',
        }}
      >
        {Object.keys(FEATURES).map((key) => {
          const feat = FEATURES[key];
          const isActive = activeFeature === key;

          if (isActive) {
            return (
              <div
                key={key}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e2e2',
                  borderRadius: '0px',
                  overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ width: '100%', height: '150px', overflow: 'hidden', position: 'relative', background: '#f5f5f5' }}>
                  <img
                    src={feat.imageUrl}
                    alt={feat.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                
                <div style={{ padding: '24px', color: '#111111' }}>
                  <h2 style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    margin: 0,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    fontFamily: '"Outfit", sans-serif',
                  }}>
                    {feat.title}
                  </h2>
                  <p style={{
                    fontSize: '13px',
                    lineHeight: '1.6',
                    color: '#666666',
                    marginTop: '10px',
                    marginBottom: 0,
                    fontWeight: 400,
                    fontFamily: '"Inter", sans-serif',
                  }}>
                    {feat.description}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div
              key={key}
              onClick={() => setActiveFeature(key)}
              onMouseEnter={() => setActiveFeature(key)}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e2e2',
                padding: '16px 24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.01)',
              }}
              className="collapsed-tab"
            >
              <span style={{
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '1px',
                color: '#111111',
                textTransform: 'uppercase',
              }}>
                {feat.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
