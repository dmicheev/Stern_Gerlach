import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Procedural Milky Way backdrop: an inside-out sphere with a shader drawing a
 * dim galactic band (disk + central bulge + dust lanes). Fully offline, no
 * textures. Deliberately kept far below the bloom luminance threshold so the
 * backdrop stays subtle against the apparatus ("не ярко").
 *
 * Galaxy frame (object space): the galactic plane is y = 0, the bulge lies
 * toward +X. The mesh is rotated by +90° around the world X axis, which maps
 * the galactic plane onto the world X-Y plane — the same plane the beamline
 * apparatus lies in, so the band streaks parallel to the instrument and the
 * bulge sits behind the screen end (+X). The material ignores scene fog and
 * writes no depth — it is a pure backdrop.
 */

const vertexShader = /* glsl */ `
varying vec3 vDir;

void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
varying vec3 vDir;
uniform float uIntensity;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p *= 2.17;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 v = normalize(vDir);
  // height above the galactic plane; band half-width in radians
  float h = v.y;
  float w = 0.22;
  float band = exp(-(h * h) / (w * w));
  // central bulge toward +X
  float ca = clamp(dot(v, vec3(1.0, 0.0, 0.0)), -1.0, 1.0);
  float bulge = exp((ca - 1.0) * 9.0);
  // dust lanes: noise stretched along the band, strongest near the plane
  float n = fbm(v * vec3(3.0, 16.0, 3.0));
  float lane = smoothstep(0.42, 0.78, n) * exp(-(h * h) / (w * w * 0.6));
  float core = band * (0.5 + 0.5 * bulge) * (1.0 - 0.7 * lane);
  // warm core, cool blue outskirts
  vec3 cool = vec3(0.42, 0.52, 0.82);
  vec3 warm = vec3(0.95, 0.78, 0.55);
  vec3 col = mix(cool, warm, clamp(bulge * band * 1.2, 0.0, 1.0));
  gl_FragColor = vec4(col * core * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function MilkyWay({ intensity = 0.16 }: { intensity?: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uIntensity: { value: intensity } },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh
      material={material}
      renderOrder={-10}
      // +90° about X: object y=0 plane → world X-Y plane (parallel to the
      // beamline), bulge stays toward +X
      rotation={[Math.PI / 2, 0, 0]}
      frustumCulled={false}
    >
      <sphereGeometry args={[6000, 48, 32]} />
    </mesh>
  )
}
