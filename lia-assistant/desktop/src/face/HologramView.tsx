import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { HoloMesh } from './HoloMesh'

const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying vec4 vCol;
void main(){
  vUv = uv;
  vCol = color;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uFlicker;
uniform vec3 uCam;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying vec4 vCol;

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vWorld);
  float fres = pow(1.0 - max(dot(N,V), 0.0), 2.2);
  float scan = 0.55 + 0.45 * sin(vWorld.y * 120.0 + uTime * 6.0);
  float flick = 0.92 + 0.08 * sin(uTime * 17.0 + vWorld.x * 30.0) * uFlicker;
  float neck = smoothstep(-0.55, -0.05, vWorld.y);
  vec3 cyan = vec3(0.43, 0.90, 1.0);
  vec3 mag = vec3(0.71, 0.42, 1.0);
  vec3 base = mix(cyan, mag, fres * 0.55);
  base *= (0.35 + 0.65 * scan) * flick;
  base += fres * mag * 0.55;
  float a = neck * (0.75 + 0.25 * fres);
  // Soft holo — unlit additive feel
  gl_FragColor = vec4(base * a * (0.7 + 0.3 * vCol.g), 1.0);
}
`

export type MouthWeights = { jaw: number; funnel: number; wide: number }

type Props = {
  mouth: MouthWeights
  speaking?: boolean
}

export function HologramView({ mouth, speaking }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const mouthRef = useRef(mouth)
  mouthRef.current = mouth

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0714)
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20)
    // Match Android SceneView framing (cam ~z=3.4, look at face)
    camera.position.set(0, -0.02, 2.6)
    camera.lookAt(0, -0.02, 0)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch (err) {
      console.error('WebGL unavailable', err)
      el.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6EE7FF;font-family:Orbitron,sans-serif;letter-spacing:.12em">ЛИА · WebGL</div>'
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uFlicker: { value: 1 },
        uCam: { value: camera.position.clone() },
      },
      vertexColors: true,
    })

    let mesh: THREE.Mesh | null = null
    let holo: HoloMesh | null = null
    let posAttr: THREE.BufferAttribute | null = null
    const scratch = { arr: null as Float32Array | null }

    let yaw = 0
    let pitch = 0
    let targetYaw = 0
    let targetPitch = 0
    let dragging = false
    let lastX = 0
    let lastY = 0

    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      targetYaw += (e.clientX - lastX) * 0.004
      targetPitch += (e.clientY - lastY) * 0.003
      targetYaw = Math.max(-0.61, Math.min(0.61, targetYaw))
      targetPitch = Math.max(-0.26, Math.min(0.26, targetPitch))
      lastX = e.clientX
      lastY = e.clientY
    }
    const onUp = () => {
      dragging = false
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let raf = 0
    const t0 = performance.now()

    ;(async () => {
      try {
        holo = await HoloMesh.load('/models/lia_holo_mesh.bin')
        const geo = new THREE.BufferGeometry()
        scratch.arr = new Float32Array(holo.basePositions)
        geo.setAttribute('position', new THREE.BufferAttribute(scratch.arr, 3))
        geo.setAttribute('normal', new THREE.BufferAttribute(holo.normals, 3))
        geo.setAttribute('uv', new THREE.BufferAttribute(holo.uvs, 2))
        geo.setAttribute('color', new THREE.BufferAttribute(holo.colors, 4))
        geo.setIndex(new THREE.BufferAttribute(holo.indices, 1))
        geo.computeBoundingSphere()
        posAttr = geo.getAttribute('position') as THREE.BufferAttribute
        mesh = new THREE.Mesh(geo, material)
        // Android default head pose ≈ yaw 34°, pitch -7°
        mesh.rotation.set(THREE.MathUtils.degToRad(-7), THREE.MathUtils.degToRad(34), THREE.MathUtils.degToRad(2))
        scene.add(mesh)

        // Soft point lights for rim presence
        const rim = new THREE.PointLight(0xb56cff, 0.8, 4)
        rim.position.set(0.6, 0.4, 0.8)
        scene.add(rim)
        const fill = new THREE.PointLight(0x6ee7ff, 0.5, 4)
        fill.position.set(-0.5, 0.1, 1.0)
        scene.add(fill)
      } catch (err) {
        console.error('holo load', err)
      }
    })()

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = (performance.now() - t0) / 1000
      material.uniforms.uTime.value = t
      material.uniforms.uFlicker.value = speaking ? 1.15 : 1.0
      material.uniforms.uCam.value.copy(camera.position)

      yaw += (targetYaw - yaw) * 0.12
      pitch += (targetPitch - pitch) * 0.12
      if (mesh) {
        mesh.rotation.y = THREE.MathUtils.degToRad(34) + yaw
        mesh.rotation.x = THREE.MathUtils.degToRad(-7) + pitch
        mesh.rotation.z = THREE.MathUtils.degToRad(2)
      }

      if (holo && posAttr && scratch.arr) {
        const m = mouthRef.current
        holo.morphedPositions(m.jaw, m.funnel, m.wide, scratch.arr)
        posAttr.needsUpdate = true
      }
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      renderer.dispose()
      material.dispose()
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement)
    }
  }, [speaking])

  return <div className="holo-stage" ref={mountRef} />
}
