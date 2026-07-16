'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface PlacementTreeNode {
  id: string
  name: string
  upline_id: string | null
  sponsor_id?: string | null
  sponsor_name?: string
  level: number
  highest_position: string
  is_active: number
  is_qualified?: number
  monthly_bv: number
  total_vol_left: number
  total_vol_right: number
}

interface VisualNode {
  data: PlacementTreeNode
  children: VisualNode[]
  depth: number
  width: number
  x: number
  y: number
}

interface SceneState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  network: THREE.Group
  raycaster: THREE.Raycaster
  pointer: THREE.Vector2
  animationId: number
  resizeObserver: ResizeObserver
  pointerDown: { x: number; y: number }
}

interface Props {
  nodes: PlacementTreeNode[]
  rootId: string
  selectedId: string
  collapsedIds: Set<string>
  coreIds: Set<string>
  paintMode: boolean
  maxDepth: number
  onSelect: (id: string) => void
  onToggleCollapse: (node: PlacementTreeNode) => void
  onToggleCore: (node: PlacementTreeNode) => void
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    }
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose()
      child.material.dispose()
    }
  })
}

function makeLabel(text: string) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.width = 512
  canvas.height = 96
  if (!context) return null

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(2, 6, 23, 0.88)'
  context.beginPath()
  context.roundRect(4, 4, 504, 88, 12)
  context.fill()
  context.strokeStyle = 'rgba(148, 163, 184, 0.45)'
  context.lineWidth = 2
  context.stroke()
  context.fillStyle = '#f8fafc'
  context.font = '600 30px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 256, 48, 480)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(7.5, 1.4, 1)
  return sprite
}

function buildVisualTree(
  nodes: PlacementTreeNode[],
  rootId: string,
  collapsedIds: Set<string>,
  maxDepth: number
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const childrenMap = new Map<string, PlacementTreeNode[]>()

  nodes.forEach((node) => {
    if (!node.upline_id) return
    const children = childrenMap.get(node.upline_id) ?? []
    // Keep Gemini's original binary-tree rule: connect rows in report order
    // and accept only the first two children for each Upline.
    if (children.length < 2) {
      children.push(node)
      childrenMap.set(node.upline_id, children)
    }
  })

  const build = (id: string, depth: number, path: Set<string>): VisualNode | null => {
    const data = nodeMap.get(id)
    if (!data || path.has(id)) return null
    const nextPath = new Set(path)
    nextPath.add(id)

    const canExpand = depth < maxDepth && !collapsedIds.has(id)
    const children = canExpand
      ? (childrenMap.get(id) ?? [])
          .map((child) => build(child.id, depth + 1, nextPath))
          .filter((child): child is VisualNode => Boolean(child))
      : []

    return { data, children, depth, width: 1, x: 0, y: -depth * 4.2 }
  }

  const root = build(rootId, 0, new Set())
  if (!root) return null

  const measure = (node: VisualNode): number => {
    node.width = node.children.length
      ? Math.max(1, node.children.reduce((sum, child) => sum + measure(child), 0))
      : 1
    return node.width
  }

  const position = (node: VisualNode, left: number) => {
    node.x = left + node.width / 2
    let cursor = left
    node.children.forEach((child) => {
      position(child, cursor)
      cursor += child.width
    })
  }

  measure(root)
  position(root, -root.width / 2)
  return root
}

function flattenVisualTree(root: VisualNode) {
  const result: VisualNode[] = []
  const visit = (node: VisualNode) => {
    result.push(node)
    node.children.forEach(visit)
  }
  visit(root)
  return result
}

export default function PlacementNetwork3D({
  nodes,
  rootId,
  selectedId,
  collapsedIds,
  coreIds,
  paintMode,
  maxDepth,
  onSelect,
  onToggleCollapse,
  onToggleCore,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneStateRef = useRef<SceneState | null>(null)
  const nodesRef = useRef(nodes)
  const paintModeRef = useRef(paintMode)
  const onSelectRef = useRef(onSelect)
  const onToggleCollapseRef = useRef(onToggleCollapse)
  const onToggleCoreRef = useRef(onToggleCore)

  nodesRef.current = nodes
  paintModeRef.current = paintMode
  onSelectRef.current = onSelect
  onToggleCollapseRef.current = onToggleCollapse
  onToggleCoreRef.current = onToggleCore

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#080b10')
    scene.fog = new THREE.FogExp2('#080b10', 0.002)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000)
    camera.position.set(0, 0, 50)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 8
    controls.maxDistance = 500
    controls.screenSpacePanning = true

    scene.add(new THREE.AmbientLight('#dbeafe', 1.5))
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.3)
    keyLight.position.set(10, 20, 30)
    scene.add(keyLight)
    const fillLight = new THREE.PointLight('#22d3ee', 55, 120)
    fillLight.position.set(-20, 5, 18)
    scene.add(fillLight)

    const grid = new THREE.GridHelper(240, 48, '#16202d', '#101722')
    grid.rotation.x = Math.PI / 2
    grid.position.z = -4
    scene.add(grid)

    const network = new THREE.Group()
    scene.add(network)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const pointerDown = { x: 0, y: 0 }

    const resize = () => {
      const width = Math.max(container.clientWidth, 1)
      const height = Math.max(container.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const onPointerDown = (event: PointerEvent) => {
      pointerDown.x = event.clientX
      pointerDown.y = event.clientY
    }

    const onPointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      const hit = raycaster.intersectObjects(network.children, true)
        .find((item) => item.object.userData.memberId)
      if (!hit) return

      const node = nodesRef.current.find((item) => item.id === hit.object.userData.memberId)
      if (!node) return
      if (paintModeRef.current) onToggleCoreRef.current(node)
      else {
        onSelectRef.current(node.id)
        onToggleCollapseRef.current(node)
      }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    let animationId = 0
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      animationId = requestAnimationFrame(animate)
      const state = sceneStateRef.current
      if (state) state.animationId = animationId
    }

    animationId = requestAnimationFrame(animate)
    sceneStateRef.current = {
      scene,
      camera,
      renderer,
      controls,
      network,
      raycaster,
      pointer,
      animationId,
      resizeObserver,
      pointerDown,
    }

    return () => {
      cancelAnimationFrame(animationId)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      disposeObject(network)
      renderer.dispose()
      renderer.domElement.remove()
      sceneStateRef.current = null
    }
  }, [])

  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return

    disposeObject(state.network)
    state.network.clear()

    const root = buildVisualTree(nodes, rootId, collapsedIds, maxDepth)
    if (!root) return
    const visualNodes = flattenVisualTree(root)
    const spacing = Math.max(2.8, Math.min(6, 38 / Math.sqrt(Math.max(root.width, 1))))

    const materials = {
      active: new THREE.MeshPhongMaterial({ color: '#16a34a', emissive: '#052e16', shininess: 65 }),
      inactive: new THREE.MeshPhongMaterial({ color: '#64748b', emissive: '#0f172a', shininess: 40 }),
      collapsed: new THREE.MeshPhongMaterial({ color: '#a855f7', emissive: '#3b0764', shininess: 80 }),
      core: new THREE.MeshPhongMaterial({ color: '#22d3ee', emissive: '#0e7490', shininess: 110 }),
      selected: new THREE.MeshPhongMaterial({ color: '#fbbf24', emissive: '#78350f', shininess: 110 }),
      line: new THREE.LineBasicMaterial({ color: '#475569', transparent: true, opacity: 0.72 }),
    }
    const sphere = new THREE.SphereGeometry(0.85, 24, 18)

    visualNodes.forEach((visual) => {
      const node = visual.data
      let material = node.is_active ? materials.active : materials.inactive
      if (collapsedIds.has(node.id)) material = materials.collapsed
      if (coreIds.has(node.id)) material = materials.core
      if (node.id === selectedId && !paintMode) material = materials.selected

      const mesh = new THREE.Mesh(sphere, material)
      mesh.position.set(visual.x * spacing, visual.y, 0)
      mesh.userData.memberId = node.id
      if (node.id === rootId) mesh.scale.setScalar(1.6)
      state.network.add(mesh)

      if (node.id === rootId || node.id === selectedId) {
        const label = makeLabel(`${node.id} · ${node.name}`)
        if (label) {
          label.position.set(visual.x * spacing, visual.y + 1.65, 0.2)
          state.network.add(label)
        }
      }

      visual.children.forEach((child) => {
        const points = [
          new THREE.Vector3(visual.x * spacing, visual.y, -0.05),
          new THREE.Vector3(child.x * spacing, child.y, -0.05),
        ]
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          materials.line
        )
        state.network.add(line)
      })
    })

    const xs = visualNodes.map((node) => node.x * spacing)
    const ys = visualNodes.map((node) => node.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const width = Math.max(maxX - minX, 12)
    const height = Math.max(maxY - minY, 12)
    const halfFov = THREE.MathUtils.degToRad(state.camera.fov / 2)
    const distanceForHeight = height / (2 * Math.tan(halfFov))
    const distanceForWidth = width / (2 * Math.tan(halfFov) * state.camera.aspect)
    const distance = Math.max(distanceForHeight, distanceForWidth, 24) * 1.25

    state.controls.target.set(centerX, centerY, 0)
    state.camera.position.set(centerX, centerY, Math.min(220, distance))
    state.controls.update()
    state.renderer.render(state.scene, state.camera)

    return () => {
      sphere.dispose()
      Object.values(materials).forEach((material) => material.dispose())
    }
  }, [collapsedIds, coreIds, maxDepth, nodes, paintMode, rootId, selectedId])

  return <div ref={containerRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
}
