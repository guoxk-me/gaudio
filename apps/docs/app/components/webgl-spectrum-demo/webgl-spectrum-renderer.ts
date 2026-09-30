import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

export type SpectrumSceneMode = 'tunnel' | 'terrain' | 'voxels'

export interface SpectrumFrame {
  bands: Float32Array
  deltaSeconds: number
  elapsedSeconds: number
  isPlaying: boolean
  progress: number
  pointerX: number
  pointerY: number
}

interface SpectrumSceneController {
  bloom: {
    radius: number
    strength: number
    threshold: number
  }
  camera: THREE.Camera
  scene: THREE.Scene
  dispose: () => void
  resize: (aspectRatio: number) => void
  update: (frame: SpectrumFrame) => void
}

const spectrumBandCount = 64
const violet = new THREE.Color('#7c3aed')
const violetBright = new THREE.Color('#a78bfa')
const cyan = new THREE.Color('#5ee7f7')
const white = new THREE.Color('#f8f7ff')

function releaseScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry
      material?: THREE.Material | THREE.Material[]
    }

    renderable.geometry?.dispose()

    if (Array.isArray(renderable.material)) {
      renderable.material.forEach(material => material.dispose())
      return
    }

    renderable.material?.dispose()
  })
}

function bandEnergy(bands: Float32Array, start: number, end: number): number {
  let energy = 0
  const boundedEnd = Math.min(end, bands.length)

  for (let index = start; index < boundedEnd; index += 1) {
    energy += bands[index] ?? 0
  }

  return energy / Math.max(1, boundedEnd - start)
}

function terrainFrequencyPosition(column: number, columns: number): number {
  const horizontalPosition = column / (columns - 1) * 2 - 1
  const peakCenters = [-0.5, 0.04, 0.56]
  const nearestPeakDistance = Math.min(...peakCenters.map(center => Math.abs(horizontalPosition - center)))
  const outwardFrequency = THREE.MathUtils.clamp(nearestPeakDistance / 0.48, 0, 1)

  // AI modified: repeat low-to-high frequency ridges across the landscape so it reads as terrain, not one EQ spike.
  return (0.06 + outwardFrequency * 0.94) * (spectrumBandCount - 1)
}

class TunnelScene implements SpectrumSceneController {
  readonly bloom = { strength: 1.55, radius: 0.72, threshold: 0.06 }
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(47, 16 / 9, 0.1, 80)
  private readonly tunnelGroup = new THREE.Group()
  private readonly rings: THREE.Line[] = []
  private readonly waveformLines: THREE.Line[] = []
  private readonly particleGeometry = new THREE.BufferGeometry()
  private readonly particlePositions: Float32Array
  private readonly particleBaseDepths: Float32Array
  private readonly portal = new THREE.Group()
  private readonly portalBeam: THREE.Mesh

  constructor() {
    this.scene.background = new THREE.Color('#05040f')
    this.scene.fog = new THREE.FogExp2('#08051b', 0.035)
    this.camera.position.set(-0.7, 0.15, 6.8)
    this.camera.lookAt(2.25, -0.1, -13)
    this.scene.add(this.tunnelGroup)

    // AI modified: offset the tunnel toward a right-side vanishing point to match the selected composition.
    for (let ringIndex = 0; ringIndex < 42; ringIndex += 1) {
      const points: THREE.Vector3[] = []
      const segmentCount = 112

      for (let segment = 0; segment <= segmentCount; segment += 1) {
        const angle = (segment / segmentCount) * Math.PI * 2
        points.push(new THREE.Vector3(Math.cos(angle) * 3.15, Math.sin(angle) * 2.65, 0))
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const material = new THREE.LineBasicMaterial({
        color: ringIndex % 6 === 0 ? cyan : violetBright,
        transparent: true,
        opacity: ringIndex % 6 === 0 ? 0.9 : 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      const ring = new THREE.Line(geometry, material)
      ring.position.x = 2.8
      ring.userData.offset = ringIndex * 0.7
      this.rings.push(ring)
      this.tunnelGroup.add(ring)
    }

    for (let lineIndex = 0; lineIndex < 11; lineIndex += 1) {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(150 * 3)
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const material = new THREE.LineBasicMaterial({
        color: lineIndex % 3 === 0 ? cyan : violetBright,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      const line = new THREE.Line(geometry, material)
      line.userData.phase = lineIndex * 0.74
      this.waveformLines.push(line)
      this.tunnelGroup.add(line)
    }

    const particleCount = 1500
    this.particlePositions = new Float32Array(particleCount * 3)
    this.particleBaseDepths = new Float32Array(particleCount)

    for (let index = 0; index < particleCount; index += 1) {
      const radius = 1 + ((index * 37) % 100) / 100 * 2.4
      const angle = ((index * 47) % 360) * Math.PI / 180
      this.particlePositions[index * 3] = 2.8 + Math.cos(angle) * radius
      this.particlePositions[index * 3 + 1] = Math.sin(angle) * radius * 0.86
      const depth = 1.2 - ((index * 83) % 350) / 10
      this.particlePositions[index * 3 + 2] = depth
      this.particleBaseDepths[index] = depth
    }

    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3))
    const particles = new THREE.Points(
      this.particleGeometry,
      new THREE.PointsMaterial({
        color: '#b8a0ff',
        size: 0.085,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    )
    this.tunnelGroup.add(particles)

    const portalGrid = new THREE.Mesh(
      new THREE.PlaneGeometry(8.7, 5.4, 30, 18),
      new THREE.MeshBasicMaterial({
        color: '#7550f5',
        wireframe: true,
        transparent: true,
        opacity: 0.17,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    portalGrid.position.set(2.7, 0, -8.2)
    portalGrid.rotation.y = -0.32

    this.portalBeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 5.7, 0.045),
      new THREE.MeshBasicMaterial({ color: '#f4ecff', toneMapped: false }),
    )
    this.portalBeam.position.set(-1.25, 0, -5.6)
    this.portal.add(portalGrid, this.portalBeam)
    this.tunnelGroup.add(this.portal)

    const floor = new THREE.GridHelper(40, 46, '#6338d8', '#27164f')
    floor.position.set(2, -2.7, -10)
    const floorMaterial = floor.material as THREE.Material
    floorMaterial.transparent = true
    floorMaterial.opacity = 0.28
    this.tunnelGroup.add(floor)
  }

  resize(aspectRatio: number): void {
    this.camera.aspect = aspectRatio
    this.camera.updateProjectionMatrix()
  }

  update(frame: SpectrumFrame): void {
    const bass = bandEnergy(frame.bands, 0, 8)
    const mids = bandEnergy(frame.bands, 8, 30)
    const highs = bandEnergy(frame.bands, 30, 64)
    const travel = frame.elapsedSeconds * (frame.isPlaying ? 2.1 + bass * 3.4 : 0.08)

    this.tunnelGroup.rotation.z = Math.sin(frame.elapsedSeconds * 0.14) * 0.025 + frame.pointerX * 0.025
    this.tunnelGroup.rotation.x = frame.pointerY * 0.018
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, -0.7 + frame.pointerX * 0.24, 0.04)
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 0.15 - frame.pointerY * 0.16, 0.04)
    this.camera.lookAt(2.25, -0.1, -13)

    this.rings.forEach((ring, ringIndex) => {
      const offset = ring.userData.offset as number
      const depth = 1.3 - ((offset + travel) % 33)
      const band = frame.bands[(ringIndex * 3) % spectrumBandCount] ?? 0
      const radiusScale = 1 + bass * 0.09 + band * 0.1
      ring.position.z = depth
      ring.scale.setScalar(radiusScale)
      ring.rotation.z = frame.elapsedSeconds * 0.025 + ringIndex * 0.045
      const material = ring.material as THREE.LineBasicMaterial
      material.opacity = Math.min(1, 0.36 + band * 0.58 + (ringIndex % 6 === 0 ? highs * 0.38 : 0))
    })

    this.waveformLines.forEach((line, lineIndex) => {
      const attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute
      const phase = line.userData.phase as number

      for (let pointIndex = 0; pointIndex < attribute.count; pointIndex += 1) {
        const horizontalRatio = pointIndex / (attribute.count - 1)
        const bandIndex = Math.min(spectrumBandCount - 1, Math.floor(horizontalRatio * spectrumBandCount))
        const magnitude = frame.bands[bandIndex] ?? 0
        const x = -6.6 + horizontalRatio * 12.7
        const depth = -2.3 - horizontalRatio * 10.6 - lineIndex * 0.12
        const carrier = Math.sin(horizontalRatio * 24 + phase + frame.elapsedSeconds * 1.8)
        const fineWave = Math.sin(horizontalRatio * 65 + phase * 1.4) * highs * 0.2
        const yOffset = (lineIndex - 5) * 0.22
        attribute.setXYZ(
          pointIndex,
          x,
          yOffset + carrier * (0.2 + magnitude * 1.15) + fineWave,
          depth,
        )
      }

      attribute.needsUpdate = true
      const material = line.material as THREE.LineBasicMaterial
      material.opacity = 0.46 + mids * 0.42 + (lineIndex % 3 === 0 ? highs * 0.24 : 0)
    })

    const particleAttribute = this.particleGeometry.getAttribute('position') as THREE.BufferAttribute
    for (let index = 0; index < particleAttribute.count; index += 1) {
      const initialDepth = this.particleBaseDepths[index] ?? 0
      const depth = 1.2 - ((Math.abs(initialDepth) + travel * (1.1 + highs)) % 35)
      particleAttribute.setZ(index, depth)
    }
    particleAttribute.needsUpdate = true

    this.portalBeam.scale.x = 0.9 + bass * 5
    this.portalBeam.scale.z = 0.9 + bass * 5
    this.portalBeam.position.x = -1.25 + frame.progress * 0.16
    this.portal.rotation.y = Math.sin(frame.elapsedSeconds * 0.15) * 0.018
  }

  dispose(): void {
    releaseScene(this.scene)
  }
}

class TerrainScene implements SpectrumSceneController {
  readonly bloom = { strength: 0.96, radius: 0.76, threshold: 0.1 }
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(43, 16 / 9, 0.1, 70)
  private readonly columns = 96
  private readonly rows = 56
  private readonly terrainGeometry: THREE.PlaneGeometry
  private readonly history: Float32Array
  private readonly baseX: Float32Array
  private readonly baseZ: Float32Array
  private readonly beam = new THREE.Group()
  private historyAccumulator = 0
  private hasSeededHistory = false

  constructor() {
    this.scene.background = new THREE.Color('#0a081b')
    this.scene.fog = new THREE.FogExp2('#120b2c', 0.058)
    this.camera.position.set(0, 4.15, 7.1)
    this.camera.lookAt(0, 0.72, -3.7)

    this.terrainGeometry = new THREE.PlaneGeometry(14.4, 17.5, this.columns - 1, this.rows - 1)
    this.terrainGeometry.rotateX(-Math.PI / 2)
    this.terrainGeometry.translate(0, 0, -3.5)
    const positions = this.terrainGeometry.getAttribute('position') as THREE.BufferAttribute
    this.baseX = new Float32Array(positions.count)
    this.baseZ = new Float32Array(positions.count)
    this.history = new Float32Array(this.columns * this.rows)

    for (let index = 0; index < positions.count; index += 1) {
      this.baseX[index] = positions.getX(index)
      this.baseZ[index] = positions.getZ(index)
    }

    const colors = new Float32Array(positions.count * 3)
    this.terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const surface = new THREE.Mesh(
      this.terrainGeometry,
      new THREE.MeshStandardMaterial({
        color: '#231047',
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        roughness: 0.24,
        metalness: 0.42,
        side: THREE.DoubleSide,
      }),
    )
    this.scene.add(surface)

    const wireframe = new THREE.Mesh(
      this.terrainGeometry,
      new THREE.MeshBasicMaterial({
        color: violetBright,
        wireframe: true,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.scene.add(wireframe)

    const sparkleLayer = new THREE.Points(
      this.terrainGeometry,
      new THREE.PointsMaterial({
        color: '#d7c6ff',
        vertexColors: true,
        size: 0.04,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    sparkleLayer.position.y = 0.025
    this.scene.add(sparkleLayer)

    const ambientLight = new THREE.HemisphereLight('#9b93d6', '#10051f', 1.85)
    const violetLight = new THREE.PointLight('#8b5cf6', 22, 24)
    violetLight.position.set(-4, 5, 2)
    const cyanLight = new THREE.PointLight('#5ee7f7', 18, 22)
    cyanLight.position.set(4, 3.8, -7)
    this.scene.add(ambientLight, violetLight, cyanLight)

    const beamGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 5.4, 0),
    ])
    this.beam.add(new THREE.Line(
      beamGeometry,
      new THREE.LineBasicMaterial({
        color: white,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    ))
    this.beam.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 18, 18),
      new THREE.MeshBasicMaterial({ color: white }),
    ))
    this.beam.children[1]?.position.set(0, 5.4, 0)
    this.scene.add(this.beam)
  }

  resize(aspectRatio: number): void {
    this.camera.aspect = aspectRatio
    this.camera.updateProjectionMatrix()
  }

  update(frame: SpectrumFrame): void {
    this.historyAccumulator += frame.deltaSeconds

    if (!this.hasSeededHistory && bandEnergy(frame.bands, 0, frame.bands.length) > 0.01) {
      for (let row = 0; row < this.rows; row += 1) {
        const depthFade = 1 - row / this.rows * 0.42
        for (let column = 0; column < this.columns; column += 1) {
          const sourceBand = Math.floor(terrainFrequencyPosition(column, this.columns))
          const shiftedBand = (sourceBand + Math.floor(row * 0.7)) % spectrumBandCount
          this.history[row * this.columns + column] = (frame.bands[shiftedBand] ?? 0) * depthFade
        }
      }
      this.hasSeededHistory = true
    }

    if (frame.isPlaying && this.historyAccumulator >= 1 / 18) {
      this.history.copyWithin(this.columns, 0, this.history.length - this.columns)
      for (let column = 0; column < this.columns; column += 1) {
        const bandPosition = terrainFrequencyPosition(column, this.columns)
        const lowerBand = Math.floor(bandPosition)
        const upperBand = Math.min(spectrumBandCount - 1, lowerBand + 1)
        const interpolation = bandPosition - lowerBand
        this.history[column] = THREE.MathUtils.lerp(
          frame.bands[lowerBand] ?? 0,
          frame.bands[upperBand] ?? 0,
          interpolation,
        )
      }
      this.historyAccumulator = 0
    }

    const positions = this.terrainGeometry.getAttribute('position') as THREE.BufferAttribute
    const colors = this.terrainGeometry.getAttribute('color') as THREE.BufferAttribute
    const color = new THREE.Color()

    for (let row = 0; row < this.rows; row += 1) {
      const depthFade = 1 - row / this.rows * 0.56

      for (let column = 0; column < this.columns; column += 1) {
        const index = row * this.columns + column
        const magnitude = this.history[index] ?? 0
        const leftMagnitude = this.history[row * this.columns + Math.max(0, column - 1)] ?? magnitude
        const rightMagnitude = this.history[row * this.columns + Math.min(this.columns - 1, column + 1)] ?? magnitude
        const farLeftMagnitude = this.history[row * this.columns + Math.max(0, column - 2)] ?? magnitude
        const farRightMagnitude = this.history[row * this.columns + Math.min(this.columns - 1, column + 2)] ?? magnitude
        const ridgeMagnitude = magnitude * 0.4
          + leftMagnitude * 0.2
          + rightMagnitude * 0.2
          + farLeftMagnitude * 0.1
          + farRightMagnitude * 0.1
        const idleRipple = Math.sin(column * 0.22 + row * 0.16 + frame.elapsedSeconds * 0.35) * 0.045
        const height = ridgeMagnitude ** 0.92 * 3.9 * depthFade + idleRipple
        positions.setXYZ(index, this.baseX[index] ?? 0, height, this.baseZ[index] ?? 0)
        color.copy(violet).lerp(cyan, Math.min(1, ridgeMagnitude * 1.05 + row / this.rows * 0.16))
        color.lerp(white, Math.min(0.22, ridgeMagnitude * 0.2))
        color.multiplyScalar(0.72 + ridgeMagnitude * 0.78)
        colors.setXYZ(index, color.r, color.g, color.b)
      }
    }

    positions.needsUpdate = true
    colors.needsUpdate = true
    this.terrainGeometry.computeVertexNormals()

    this.beam.position.x = -7.2 + frame.progress * 14.4
    this.beam.position.z = -0.4
    this.beam.scale.y = 0.75 + bandEnergy(frame.bands, 0, 10) * 0.35
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, frame.pointerX * 0.42, 0.035)
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 4.15 - frame.pointerY * 0.24, 0.035)
    this.camera.lookAt(0, 0.72, -3.7)
  }

  dispose(): void {
    releaseScene(this.scene)
  }
}

class VoxelScene implements SpectrumSceneController {
  readonly bloom = { strength: 0.1, radius: 0.4, threshold: 0.88 }
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-8.8, 8.8, 5, -5, 0.1, 70)
  private readonly gridColumns = 37
  private readonly gridRows = 23
  private readonly voxelMesh: THREE.InstancedMesh
  private readonly voxelEdges: THREE.InstancedMesh
  private readonly placement = new THREE.Object3D()
  private readonly scanPlane: THREE.Mesh

  constructor() {
    this.scene.background = new THREE.Color('#f2effb')
    this.camera.position.set(10.8, 10.2, 12.8)
    this.camera.lookAt(0, 0.45, 0)

    const geometry = new THREE.BoxGeometry(0.29, 1, 0.29)
    const material = new THREE.MeshBasicMaterial({
      color: '#9a80d5',
      toneMapped: false,
    })
    this.voxelMesh = new THREE.InstancedMesh(geometry, material, this.gridColumns * this.gridRows)
    this.voxelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.voxelMesh.receiveShadow = true

    this.voxelEdges = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.305, 1.005, 0.305),
      new THREE.MeshBasicMaterial({
        color: '#8b5cf6',
        wireframe: true,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      this.gridColumns * this.gridRows,
    )
    this.voxelEdges.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scene.add(this.voxelMesh, this.voxelEdges)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 10.4),
      new THREE.MeshStandardMaterial({ color: '#e8e2f8', roughness: 0.72, metalness: 0 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.035
    floor.receiveShadow = true
    this.scene.add(floor)

    const ambientLight = new THREE.HemisphereLight('#ffffff', '#8063ae', 2.35)
    const keyLight = new THREE.DirectionalLight('#fffaff', 2.8)
    keyLight.position.set(-6, 11, 7)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    keyLight.shadow.camera.left = -9
    keyLight.shadow.camera.right = 9
    keyLight.shadow.camera.top = 7
    keyLight.shadow.camera.bottom = -7
    const violetLight = new THREE.PointLight('#7c3aed', 10, 22)
    violetLight.position.set(-3, 4, 1)
    const cyanLight = new THREE.PointLight('#43dff3', 8, 20)
    cyanLight.position.set(4, 5, -3)
    this.scene.add(ambientLight, keyLight, violetLight, cyanLight)

    this.scanPlane = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.045, 9.1),
      new THREE.MeshBasicMaterial({
        color: '#b58cff',
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    )
    this.scanPlane.position.y = 0.14
    this.scanPlane.renderOrder = 10
    this.scene.add(this.scanPlane)
  }

  resize(aspectRatio: number): void {
    const verticalExtent = 4.7
    this.camera.left = -verticalExtent * aspectRatio
    this.camera.right = verticalExtent * aspectRatio
    this.camera.top = verticalExtent
    this.camera.bottom = -verticalExtent
    this.camera.updateProjectionMatrix()
  }

  update(frame: SpectrumFrame): void {
    const color = new THREE.Color()
    const bass = bandEnergy(frame.bands, 0, 9)
    let instanceIndex = 0

    for (let row = 0; row < this.gridRows; row += 1) {
      for (let column = 0; column < this.gridColumns; column += 1) {
        const horizontalRatio = column / (this.gridColumns - 1)
        const bandIndex = Math.min(spectrumBandCount - 1, Math.floor(horizontalRatio * spectrumBandCount))
        const nearbyBand = Math.min(spectrumBandCount - 1, bandIndex + (row % 5) - 2)
        const primaryEnergy = (frame.bands[bandIndex] ?? 0) * 0.72 + (frame.bands[Math.max(0, nearbyBand)] ?? 0) * 0.28
        const x = (column - (this.gridColumns - 1) / 2) * 0.365
        const z = (row - (this.gridRows - 1) / 2) * 0.365
        const clusterA = Math.exp(-((x + 2.4) ** 2 / 5.5 + (z + 0.25) ** 2 / 2.2))
        const clusterB = Math.exp(-((x - 0.2) ** 2 / 4.1 + (z - 0.6) ** 2 / 2.9))
        const clusterC = Math.exp(-((x - 3.45) ** 2 / 2.8 + (z + 0.8) ** 2 / 1.8))
        const spectralField = Math.min(1, clusterA * 0.76 + clusterB + clusterC * 0.7)
        const deterministicNoise = ((column * 23 + row * 41) % 29) / 29
        const spectrumValue = Math.min(1, Math.sqrt(primaryEnergy) * spectralField + bass * clusterB * 0.2)
        const ambientHeight = 0.09 + deterministicNoise * 0.1
        const towerGain = deterministicNoise > 0.58
          ? 0.9 + deterministicNoise * 0.72
          : 0.14 + deterministicNoise * 0.24
        const height = Math.max(0.08, ambientHeight + spectrumValue ** 1.16 * 5.8 * towerGain)

        this.placement.position.set(x, height / 2, z)
        this.placement.scale.set(0.82, height, 0.82)
        this.placement.rotation.y = spectrumValue * 0.08
        this.placement.updateMatrix()
        this.voxelMesh.setMatrixAt(instanceIndex, this.placement.matrix)
        this.voxelEdges.setMatrixAt(instanceIndex, this.placement.matrix)

        color.copy(white)
        color.lerp(cyan, 0.06 + clusterC * 0.13)
        color.lerp(violetBright, 0.08 + clusterB * 0.14)
        this.voxelMesh.setColorAt(instanceIndex, color)
        instanceIndex += 1
      }
    }

    this.voxelMesh.instanceMatrix.needsUpdate = true
    this.voxelEdges.instanceMatrix.needsUpdate = true
    if (this.voxelMesh.instanceColor) {
      this.voxelMesh.instanceColor.needsUpdate = true
    }

    this.scanPlane.position.x = -6.55 + frame.progress * 13.1
    this.scanPlane.scale.z = 0.9 + bass * 0.18
    this.camera.position.x = 10.8 + frame.pointerX * 0.7
    this.camera.position.y = 10.2 - frame.pointerY * 0.48
    this.camera.lookAt(0, 0.45, 0)
  }

  dispose(): void {
    releaseScene(this.scene)
  }
}

function createSceneController(mode: SpectrumSceneMode): SpectrumSceneController {
  if (mode === 'terrain') {
    return new TerrainScene()
  }

  if (mode === 'voxels') {
    return new VoxelScene()
  }

  return new TunnelScene()
}

export class WebglSpectrumRenderer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly composer: EffectComposer
  private readonly renderPass: RenderPass
  private readonly bloomPass: UnrealBloomPass
  private readonly frequencyBands = new Float32Array(spectrumBandCount)
  private controller: SpectrumSceneController
  private readSpectrum: () => Uint8Array | undefined = () => undefined
  private isPlaying = false
  private progress = 0
  private pointerX = 0
  private pointerY = 0
  private shouldReduceMotion = false
  private isRunning = false
  private startedAt = performance.now()
  private previousFrameTimestamp = 0

  constructor(canvas: HTMLCanvasElement, initialMode: SpectrumSceneMode) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.22
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.controller = createSceneController(initialMode)
    this.renderPass = new RenderPass(this.controller.scene, this.controller.camera)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      this.controller.bloom.strength,
      this.controller.bloom.radius,
      this.controller.bloom.threshold,
    )
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(this.renderPass)
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(new OutputPass())
  }

  setMode(mode: SpectrumSceneMode): void {
    this.controller.dispose()
    this.controller = createSceneController(mode)
    this.renderPass.scene = this.controller.scene
    this.renderPass.camera = this.controller.camera
    this.bloomPass.strength = this.controller.bloom.strength
    this.bloomPass.radius = this.controller.bloom.radius
    this.bloomPass.threshold = this.controller.bloom.threshold
    const dimensions = this.renderer.getSize(new THREE.Vector2())
    this.controller.resize(dimensions.x / Math.max(1, dimensions.y))
    this.renderFrame()
  }

  setPlayback(isPlaying: boolean): void {
    this.isPlaying = isPlaying
  }

  setProgress(progress: number): void {
    this.progress = Math.min(1, Math.max(0, progress))
  }

  setPointer(x: number, y: number): void {
    this.pointerX = Math.min(1, Math.max(-1, x))
    this.pointerY = Math.min(1, Math.max(-1, y))
  }

  setReducedMotion(shouldReduceMotion: boolean): void {
    this.shouldReduceMotion = shouldReduceMotion
    this.renderFrame()
  }

  resize(width: number, height: number, pixelRatio: number): void {
    const boundedWidth = Math.max(1, Math.floor(width))
    const boundedHeight = Math.max(1, Math.floor(height))
    this.renderer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)))
    this.renderer.setSize(boundedWidth, boundedHeight, false)
    this.composer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)))
    this.composer.setSize(boundedWidth, boundedHeight)
    this.controller.resize(boundedWidth / boundedHeight)
    this.renderFrame()
  }

  start(readSpectrum: () => Uint8Array | undefined): void {
    this.readSpectrum = readSpectrum
    this.isRunning = true
    this.startedAt = performance.now()
    this.previousFrameTimestamp = 0

    // AI modified: Three owns one display loop while GAudio spectrum sampling stays throttled independently.
    this.renderer.setAnimationLoop(timestamp => this.renderFrame(timestamp))
  }

  private renderFrame(timestamp = performance.now()): void {
    if (!this.isRunning && this.renderer.info.render.frame > 0) {
      return
    }

    const deltaSeconds = this.previousFrameTimestamp === 0
      ? 0
      : Math.min(0.05, (timestamp - this.previousFrameTimestamp) / 1000)
    const elapsedSeconds = Math.max(0, (timestamp - this.startedAt) / 1000)
    this.previousFrameTimestamp = timestamp
    const spectrum = this.shouldReduceMotion ? undefined : this.readSpectrum()

    for (let index = 0; index < this.frequencyBands.length; index += 1) {
      const target = spectrum ? (spectrum[index] ?? 0) / 255 : 0
      const current = this.frequencyBands[index] ?? 0
      const response = target > current ? 0.42 : 0.075
      this.frequencyBands[index] = THREE.MathUtils.lerp(current, target, response)
    }

    this.controller.update({
      bands: this.frequencyBands,
      deltaSeconds: this.shouldReduceMotion ? 0 : deltaSeconds,
      elapsedSeconds: this.shouldReduceMotion ? 0 : elapsedSeconds,
      isPlaying: this.isPlaying && !this.shouldReduceMotion,
      progress: this.progress,
      pointerX: this.pointerX,
      pointerY: this.pointerY,
    })
    this.composer.render()
  }

  dispose(): void {
    this.isRunning = false
    this.renderer.setAnimationLoop(null)
    this.controller.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}
