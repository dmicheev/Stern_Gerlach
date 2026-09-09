/** Deterministic PCG32 RNG — identical algorithm implemented in Rust (sg-physics). */
export class Pcg32 {
  private state: bigint
  private inc: bigint
  private cachedNormal: number | null = null

  private static readonly MASK64 = (1n << 64n) - 1n

  constructor(seed: number, stream = 1n) {
    this.state = 0n
    this.inc = ((stream << 1n) | 1n) & Pcg32.MASK64
    this.nextU32()
    this.state = (this.state + BigInt(seed)) & Pcg32.MASK64
    this.nextU32()
  }

  nextU32(): number {
    const old = this.state
    this.state = (old * 6364136223846793005n + this.inc) & Pcg32.MASK64
    const xorshifted = Number(((old >> 18n) ^ old) >> 27n & 0xffffffffn)
    const rot = Number(old >> 59n)
    return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0
  }

  /** uniform [0, 1) */
  nextFloat(): number {
    return this.nextU32() / 4294967296
  }

  /** standard normal, Box-Muller */
  normal(): number {
    if (this.cachedNormal !== null) {
      const v = this.cachedNormal
      this.cachedNormal = null
      return v
    }
    let u = this.nextFloat()
    const v = this.nextFloat()
    while (u <= 1e-12) u = this.nextFloat()
    const r = Math.sqrt(-2 * Math.log(u))
    const a = 2 * Math.PI * v
    this.cachedNormal = r * Math.sin(a)
    return r * Math.cos(a)
  }

  /** uniform point on unit sphere in the Y-Z plane is NOT this; this is full 3D sphere */
  uniformSphere3(): [number, number, number] {
    const x = this.normal()
    const y = this.normal()
    const z = this.normal()
    const n = Math.hypot(x, y, z) || 1
    return [x / n, y / n, z / n]
  }
}
