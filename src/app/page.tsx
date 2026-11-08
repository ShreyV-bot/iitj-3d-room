'use client'

import { type ComponentRef, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, useProgress } from '@react-three/drei'
import * as THREE from 'three'

const IMAGE_URL = '/images/room-360.jpg' // must be a 2:1 equirectangular image (public/images/room-360.jpg)

// Zoom is done by changing the field of view (NOT by moving the camera).
// Landscape screens: value = vertical FOV. Portrait screens: value = horizontal FOV.
const DEFAULT_FOV = 60
const MIN_FOV = 25
const MAX_FOV = 80
const MAX_HFOV = 100 // wider than this and rectilinear projection stretches the edges badly

// Rotates the sphere so the CENTER of your image (= the direction your Blender camera
// was facing) is what you see on load. Change this to pick a different starting view.
const INITIAL_YAW = -Math.PI / 2

/** Convert the user's zoom value into a vertical FOV that looks right on any aspect ratio. */
function fitVerticalFov(zoomFov: number, aspect: number) {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(zoomFov) / 2)
  const vertTan =
    aspect >= 1
      ? Math.min(tanHalf, Math.tan(THREE.MathUtils.degToRad(MAX_HFOV) / 2) / aspect)
      : tanHalf / aspect
  return Math.min(THREE.MathUtils.radToDeg(2 * Math.atan(vertTan)), 120)
}

function Panorama() {
  const texture = useLoader(THREE.TextureLoader, IMAGE_URL)
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())

  useLayoutEffect(() => {
    // Without this the image looks washed out / wrong brightness
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = maxAnisotropy
    texture.needsUpdate = true
  }, [texture, maxAnisotropy])

  return (
    // scale x = -1 un-mirrors the image (a BackSide sphere shows it flipped horizontally)
    <mesh scale={[-1, 1, 1]} rotation={[0, INITIAL_YAW, 0]}>
      <sphereGeometry args={[500, 64, 48]} />
      {/* toneMapped={false} stops R3F's default ACES tone mapping from changing your Blender colors */}
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  )
}

function Controls() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const gl = useThree((s) => s.gl)
  const zoom = useRef(DEFAULT_FOV)

  // Mouse wheel + touch pinch -> change FOV (the camera never leaves the center)
  useEffect(() => {
    const el = gl.domElement
    const clamp = (v: number) => THREE.MathUtils.clamp(v, MIN_FOV, MAX_FOV)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
      zoom.current = clamp(zoom.current + dy * 0.05)
    }

    const pointers = new Map<number, { x: number; y: number }>()
    let pinchStart = 0
    let zoomStart = 0
    const pinchDistance = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        pinchStart = pinchDistance()
        zoomStart = zoom.current
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2 && pinchStart > 0) {
        zoom.current = clamp((zoomStart * pinchStart) / pinchDistance())
      }
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      pinchStart = 0
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [gl])

  // Smoothly follow the zoom value and adapt the FOV to the current screen shape
  useFrame((state) => {
    const cam = state.camera as THREE.PerspectiveCamera
    const aspect = state.size.width / state.size.height
    const target = fitVerticalFov(zoom.current, aspect)
    if (Math.abs(cam.fov - target) > 0.01) {
      cam.fov = THREE.MathUtils.lerp(cam.fov, target, 0.2)
      cam.updateProjectionMatrix()
    }
    // Negative = "grab the world" feel. Slower when zoomed in so it stays controllable.
    if (controls.current) controls.current.rotateSpeed = -0.5 * (zoom.current / DEFAULT_FOV)
  })

  return (
    <OrbitControls
      ref={controls}
      enableZoom={false} // zoom is handled above via FOV
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
    />
  )
}

function Loader() {
  const { progress } = useProgress()
  if (progress >= 100) return null
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black text-white">
      Loading 3D Environment… {Math.round(progress)}%
    </div>
  )
}

export default function PortfolioStreetView() {
  return (
    <main className="relative h-dvh w-screen cursor-grab overflow-hidden bg-black active:cursor-grabbing">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: DEFAULT_FOV, near: 0.1, far: 1100, position: [0, 0, 0.1] }}
      >
        <Suspense fallback={null}>
          <Panorama />
        </Suspense>
        <Controls />
      </Canvas>
      <Loader />
    </main>
  )
}