"use client"

import { useRef, useMemo } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Float } from "@react-three/drei"
import { useTheme } from "next-themes"
import * as THREE from "three"

function TorusKnotMesh() {
  const meshRef = useRef<THREE.Mesh>(null)
  const { theme } = useTheme()
  const { pointer } = useThree()

  const isDark = theme === "dark"

  const color = useMemo(
    () => (isDark ? new THREE.Color("#a78bfa") : new THREE.Color("#7c3aed")),
    [isDark]
  )

  useFrame((_, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.x += delta * 0.15
    meshRef.current.rotation.y += delta * 0.2
    // Mouse influence
    meshRef.current.rotation.z = pointer.x * 0.3
    meshRef.current.rotation.x += pointer.y * 0.1
  })

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={meshRef} scale={1.8}>
        <torusKnotGeometry args={[1, 0.35, 200, 32, 2, 3]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={isDark ? 0.6 : 0.4}
        />
      </mesh>
      {/* Glow layer */}
      <mesh ref={meshRef} scale={1.85}>
        <torusKnotGeometry args={[1, 0.35, 200, 32, 2, 3]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={isDark ? 0.15 : 0.08}
        />
      </mesh>
    </Float>
  )
}

function Particles() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const count = 300
  const ref = useRef<THREE.Points>(null)

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 12
      arr[i * 3 + 1] = (Math.random() - 0.5) * 12
      arr[i * 3 + 2] = (Math.random() - 0.5) * 12
    }
    return arr
  }, [])

  useFrame((_, delta) => {
    if (!ref.current) return
    ref.current.rotation.y += delta * 0.02
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color={isDark ? "#c4b5fd" : "#8b5cf6"}
        transparent
        opacity={isDark ? 0.5 : 0.3}
        sizeAttenuation
      />
    </points>
  )
}

export function Scene3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 60 }}
      style={{ position: "absolute", inset: 0 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.5} />
      <TorusKnotMesh />
      <Particles />
    </Canvas>
  )
}
