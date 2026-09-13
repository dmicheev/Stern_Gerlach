//! Stern-Gerlach cascade trajectory engine (beam-tree routing).
//!
//! Faithful port of the TypeScript reference engine (`frontend/src/physics/engine.ts`):
//! identical PCG32 RNG call order, identical RK4 scheme, identical binary output
//! layout — results are bit-comparable between the JS fallback and the WASM build.
//!
//! Beam routing: the source emits the 'root' beam along +X; each apparatus A on a
//! beam splits it into `${A.id}:up` / `${A.id}:down`; downstream apparatuses are
//! attached to a specific beam and only see (and split) particles on that beam.
//! Magnet transverse centers are derived from the branch deflection
//! (mean-velocity impulse approximation), matching `frontend/src/physics/beams.ts`.

use serde::Deserialize;
use std::collections::HashMap;

const AG_MASS: f64 = 1.7915e-25;
const MU_B: f64 = 9.2740100783e-24;
const STEPS: usize = 1200;
const N_T: usize = 180;
const SAMPLE_EVERY: usize = 7;
const FRINGE: f64 = 0.012;

// ---------------------------------------------------------------- config ---

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub mode: String,
    pub source: Source,
    pub apparatuses: Vec<Apparatus>,
    pub screen_x: f64,
    pub particle_count: usize,
    pub hero_count: usize,
    pub seed: u32,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub v_mean: f64,
    pub v_sigma: f64,
    pub aperture: f64,
    pub divergence: f64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Apparatus {
    pub id: String,
    #[serde(default = "default_beam")]
    pub attach_to: String,
    pub x_start: f64,
    pub length: f64,
    pub angle_deg: f64,
    pub gradient: f64,
    #[allow(dead_code)]
    pub b0: f64,
    pub gap: f64,
    pub blocked_port: Option<String>,
}

fn default_beam() -> String {
    "root".to_string()
}

pub fn parse_config(json: &str) -> Result<Config, String> {
    serde_json::from_str(json).map_err(|e| format!("config parse error: {e}"))
}

// ------------------------------------------------------------------- rng ---

/// PCG32 — identical to the TypeScript implementation (BigInt math there).
struct Pcg32 {
    state: u64,
    inc: u64,
    cached_normal: Option<f64>,
}

impl Pcg32 {
    fn new(seed: u32, stream: u64) -> Self {
        let mut r = Pcg32 { state: 0, inc: (stream << 1) | 1, cached_normal: None };
        r.next_u32();
        r.state = r.state.wrapping_add(seed as u64);
        r.next_u32();
        r
    }

    fn next_u32(&mut self) -> u32 {
        let old = self.state;
        self.state = old.wrapping_mul(6364136223846793005).wrapping_add(self.inc);
        let xorshifted = (((old >> 18) ^ old) >> 27) as u32;
        let rot = (old >> 59) as u32;
        xorshifted.rotate_right(rot)
    }

    fn next_float(&mut self) -> f64 {
        self.next_u32() as f64 / 4294967296.0
    }

    fn normal(&mut self) -> f64 {
        if let Some(v) = self.cached_normal.take() {
            return v;
        }
        let mut u = self.next_float();
        while u <= 1e-12 {
            u = self.next_float();
        }
        let v = self.next_float();
        let r = (-2.0 * u.ln()).sqrt();
        let a = 2.0 * std::f64::consts::PI * v;
        self.cached_normal = Some(r * a.sin());
        r * a.cos()
    }

    fn uniform_yz(&mut self) -> (f64, f64) {
        let a = self.next_float() * 2.0 * std::f64::consts::PI;
        let c = self.next_float() * 2.0 - 1.0;
        let s = (1.0 - c * c).sqrt();
        (s * a.cos(), s * a.sin())
    }
}

// ------------------------------------------------------------- beam tree ---

struct AppCache {
    cos: f64,
    sin: f64,
    ny: f64,
    nz: f64,
    x_in: f64,
    x_out: f64,
    g: f64,
    b0: f64,
    gap: f64,
    fr: f64,
    blocked_up: bool,
    blocked_down: bool,
    angle_rad: f64,
    cy: f64,
    cz: f64,
    id: String,
    /// global index in x-sorted order (for history bookkeeping)
    slot: usize,
}

#[inline]
fn envelope(x: f64, a: &AppCache) -> f64 {
    let u = (x - a.x_in) / a.fr;
    let v = (x - a.x_out) / a.fr;
    0.5 * (u.tanh() - v.tanh())
}

#[inline]
fn smoothstep(a: f64, b: f64, x: f64) -> f64 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[inline]
fn gap_window(rp: f64, gap: f64) -> f64 {
    1.0 - smoothstep(gap, gap * 1.6, rp)
}

/// mean-velocity impulse kick of a branch (speed along the apparatus axis n)
fn branch_kick(app: &Apparatus, v_mean: f64) -> (f64, f64) {
    let a = MU_B * app.gradient / AG_MASS;
    let tau = app.length / v_mean;
    (a * tau, 0.5 * a * tau * tau)
}

/// Build x-sorted caches with beam routing and transverse centers.
fn build_tree(apps: &[Apparatus], v_mean: f64) -> (Vec<AppCache>, HashMap<String, Vec<usize>>) {
    let mut order: Vec<usize> = (0..apps.len()).collect();
    order.sort_by(|&i, &j| apps[i].x_start.partial_cmp(&apps[j].x_start).unwrap());

    let mut caches: Vec<Option<AppCache>> = (0..apps.len()).map(|_| None).collect();
    let mut centers: HashMap<usize, (f64, f64)> = HashMap::new();
    let mut beams: HashMap<String, Vec<usize>> = HashMap::new();

    let by_id: HashMap<&str, usize> = apps.iter().enumerate().map(|(i, a)| (a.id.as_str(), i)).collect();

    for (slot, &idx) in order.iter().enumerate() {
        let app = &apps[idx];
        let mut cy = 0.0;
        let mut cz = 0.0;
        if app.attach_to != "root" {
            if let Some(colon) = app.attach_to.rfind(':') {
                let (pid, port) = app.attach_to.split_at(colon);
                let port = &port[1..];
                if let Some(&pidx) = by_id.get(pid) {
                    let p = &apps[pidx];
                    let t = p.angle_deg * std::f64::consts::PI / 180.0;
                    let ny = -t.sin();
                    let nz = t.cos();
                    let s = if port == "up" { 1.0 } else { -1.0 };
                    let pc = *centers.get(&pidx).unwrap_or(&(0.0, 0.0));
                    let (vz, z_exit) = branch_kick(p, v_mean);
                    let drift = (app.x_start - (p.x_start + p.length)) / v_mean;
                    let d = s * (z_exit + vz * drift);
                    cy = pc.0 + d * ny;
                    cz = pc.1 + d * nz;
                }
            }
        }
        centers.insert(idx, (cy, cz));
        let t = app.angle_deg * std::f64::consts::PI / 180.0;
        caches[idx] = Some(AppCache {
            cos: t.cos(),
            sin: t.sin(),
            ny: -t.sin(),
            nz: t.cos(),
            x_in: app.x_start,
            x_out: app.x_start + app.length,
            g: app.gradient,
            b0: app.b0,
            gap: app.gap,
            fr: FRINGE,
            blocked_up: app.blocked_port.as_deref() == Some("up"),
            blocked_down: app.blocked_port.as_deref() == Some("down"),
            angle_rad: t,
            cy,
            cz,
            id: app.id.clone(),
            slot,
        });
        beams.entry(app.attach_to.clone()).or_default().push(idx);
    }
    let flat: Vec<AppCache> = order.iter().map(|&idx| caches[idx].take().unwrap()).collect();
    // remap beam lists from app indices to slots (x-sorted positions)
    let mut beam_slots: HashMap<String, Vec<usize>> = HashMap::new();
    for (key, list) in beams {
        let slots: Vec<usize> = list
            .iter()
            .map(|&idx| order.iter().position(|&o| o == idx).unwrap())
            .collect();
        beam_slots.insert(key, slots);
    }
    (flat, beam_slots)
}

/// Classical force F = grad(mu.B) over all magnets (with centers).
fn force_classical(
    caches: &[AppCache],
    x: f64,
    y: f64,
    z: f64,
    m_hat_y: f64,
    m_hat_z: f64,
    out: &mut [f64; 3],
) {
    out[0] = 0.0;
    out[1] = 0.0;
    out[2] = 0.0;
    for a in caches {
        if x < a.x_in - 4.0 * a.fr || x > a.x_out + 4.0 * a.fr {
            continue;
        }
        let yr = y - a.cy;
        let zr = z - a.cz;
        let yl = a.cos * yr + a.sin * zr;
        let zl = -a.sin * yr + a.cos * zr;
        let gw = gap_window(yl.hypot(zl), a.gap);
        if gw == 0.0 {
            continue;
        }
        let muy_l = a.cos * m_hat_y + a.sin * m_hat_z;
        let muz_l = -a.sin * m_hat_y + a.cos * m_hat_z;
        let u = (x - a.x_in) / a.fr;
        let v = (x - a.x_out) / a.fr;
        let sech2 = |t: f64| 1.0 / t.cosh() / t.cosh();
        let dedx = (0.5 / a.fr) * (sech2(u) - sech2(v));
        let e = envelope(x, a);
        let fl_y = e * gw * (-a.g * muy_l);
        let fl_z = e * gw * a.g * muz_l;
        let mu_dot_b = -a.g * muy_l * yl + muz_l * (a.b0 + a.g * zl);
        let fl_x = gw * dedx * mu_dot_b;
        out[0] += MU_B * fl_x;
        out[1] += MU_B * (a.cos * fl_y - a.sin * fl_z);
        out[2] += MU_B * (a.sin * fl_y + a.cos * fl_z);
    }
}

// --------------------------------------------------------------- output ---

pub struct SimOutput {
    pub n_particles: usize,
    pub n_hero: usize,
    pub n_t: usize,
    pub n_apparatus: usize,
    pub hero_pos: Vec<f64>,
    pub hero_spin_theta: Vec<f64>,
    pub hero_spin_sign: Vec<i8>,
    pub hero_birth: Vec<f64>,
    pub hero_sample_dt: Vec<f64>,
    pub hit_time: Vec<f64>,
    pub hit_y: Vec<f64>,
    pub hit_z: Vec<f64>,
    pub absorbed: Vec<u8>,
    pub spin_theta: Vec<f64>,
    pub spin_sign: Vec<i8>,
    pub history: Vec<u8>,
    pub t_total: f64,
}

// ----------------------------------------------------------------- core ---

pub fn simulate(cfg: &Config) -> Result<SimOutput, String> {
    let classical = cfg.mode == "classical";
    let (caches, beams) = build_tree(&cfg.apparatuses, cfg.source.v_mean);
    let n_app = caches.len();
    let n = cfg.particle_count;
    let n_hero = cfg.hero_count.min(n);

    let mut hero_pos = vec![0.0; n_hero * N_T * 3];
    let mut hero_spin_theta = vec![f64::NAN; n_hero * N_T];
    let mut hero_spin_sign = vec![0i8; n_hero * N_T];
    let mut hero_birth = vec![0.0; n_hero];
    let mut hero_sample_dt = vec![0.0; n_hero];
    let mut hit_time = vec![0.0; n];
    let mut hit_y = vec![0.0; n];
    let mut hit_z = vec![0.0; n];
    let mut absorbed = vec![0u8; n];
    let mut spin_theta = vec![f64::NAN; n];
    let mut spin_sign = vec![0i8; n];
    let mut history = vec![255u8; n * n_app];

    let src = &cfg.source;
    let t_emit = 0.25 * (cfg.screen_x / src.v_mean);
    let mut rng = Pcg32::new(cfg.seed, 54);

    let mut acc = [0.0f64; 3];
    let mut t_total: f64 = 0.0;

    for i in 0..n {
        let is_hero = i < n_hero;
        let t0 = if is_hero {
            (t_emit * (i as f64 + 0.5)) / n_hero as f64
        } else {
            rng.next_float() * t_emit
        };

        let mut p_y = rng.normal() * src.aperture * 0.5;
        let mut p_z = rng.normal() * src.aperture * 0.5;
        let p_vx = (src.v_mean + rng.normal() * src.v_sigma).max(0.25 * src.v_mean);
        let mut p_vy = rng.normal() * src.divergence * p_vx;
        let mut p_vz = rng.normal() * src.divergence * p_vx;

        let (mut sy, mut sz) = rng.uniform_yz();
        let m_hat_y = sy;
        let m_hat_z = sz;

        let t_flight = (cfg.screen_x + 0.02) / p_vx;
        let dt = t_flight / STEPS as f64;

        // beam routing state
        let mut beam = "root".to_string();
        let mut beam_list: Vec<usize> = beams.get(&beam).cloned().unwrap_or_default();
        let mut beam_idx = 0usize;
        let mut cur_app: Option<usize> = None; // slot in caches

        let mut cur_theta = f64::NAN;
        let mut cur_sign: i8 = 0;
        let mut will_absorb = false;
        let mut is_absorbed = false;
        let mut landed = false;
        let mut i_sample = 0usize;
        let mut t = t0;

        let mut record = |px: f64, py: f64, pz: f64, theta: f64, sign: i8,
                          hero_pos: &mut Vec<f64>, hero_theta: &mut Vec<f64>,
                          hero_sign: &mut Vec<i8>, i_sample: &mut usize| {
            if !is_hero || *i_sample >= N_T {
                return;
            }
            let base = (i * N_T + *i_sample) * 3;
            hero_pos[base] = px;
            hero_pos[base + 1] = py;
            hero_pos[base + 2] = pz;
            hero_theta[i * N_T + *i_sample] = theta;
            hero_sign[i * N_T + *i_sample] = sign;
            *i_sample += 1;
        };
        record(0.0, p_y, p_z, cur_theta, cur_sign, &mut hero_pos, &mut hero_spin_theta, &mut hero_spin_sign, &mut i_sample);

        let mut k = 0usize;
        while k < STEPS && !landed && !is_absorbed {
            let px = p_vx * (t - t0);
            let py = p_y;
            let pz = p_z;

            // RK4 on (y, z, vy, vz); x evaluated analytically
            let mut eval = |h: f64, yy: f64, zz: f64, out: &mut [f64; 3]| {
                let x_now = p_vx * (t - t0 + h);
                out[0] = 0.0;
                out[1] = 0.0;
                out[2] = 0.0;
                if classical {
                    force_classical(&caches, x_now, yy, zz, m_hat_y, m_hat_z, out);
                    out[1] /= AG_MASS;
                    out[2] /= AG_MASS;
                } else if let Some(slot) = cur_app {
                    let a = &caches[slot];
                    let yr = yy - a.cy;
                    let zr = zz - a.cz;
                    let yl = a.cos * yr + a.sin * zr;
                    let zl = -a.sin * yr + a.cos * zr;
                    let f = cur_sign as f64 * MU_B * a.g * envelope(x_now, a) * gap_window(yl.hypot(zl), a.gap);
                    out[1] = (f * a.ny) / AG_MASS;
                    out[2] = (f * a.nz) / AG_MASS;
                }
            };

            eval(0.0, p_y, p_z, &mut acc);
            let (k1y, k1z, k1vy, k1vz) = (p_vy, p_vz, acc[1], acc[2]);
            eval(dt / 2.0, p_y + k1y * dt / 2.0, p_z + k1z * dt / 2.0, &mut acc);
            let (k2y, k2z, k2vy, k2vz) = (p_vy + k1vy * dt / 2.0, p_vz + k1vz * dt / 2.0, acc[1], acc[2]);
            eval(dt / 2.0, p_y + k2y * dt / 2.0, p_z + k2z * dt / 2.0, &mut acc);
            let (k3y, k3z, k3vy, k3vz) = (p_vy + k2vy * dt / 2.0, p_vz + k2vz * dt / 2.0, acc[1], acc[2]);
            eval(dt, p_y + k3y * dt, p_z + k3z * dt, &mut acc);
            let (k4y, k4z, k4vy, k4vz) = (p_vy + k3vy * dt, p_vz + k3vz * dt, acc[1], acc[2]);

            p_y += (dt / 6.0) * (k1y + 2.0 * k2y + 2.0 * k3y + k4y);
            p_z += (dt / 6.0) * (k1z + 2.0 * k2z + 2.0 * k3z + k4z);
            p_vy += (dt / 6.0) * (k1vy + 2.0 * k2vy + 2.0 * k3vy + k4vy);
            p_vz += (dt / 6.0) * (k1vz + 2.0 * k2vz + 2.0 * k3vz + k4vz);
            t += dt;
            let p_x = p_vx * (t - t0);
            let _ = px;

            // beam routing: measurement at the next apparatus on our beam
            while !classical && beam_idx < beam_list.len() {
                let slot = beam_list[beam_idx];
                let node = &caches[slot];
                if p_x < node.x_in {
                    break;
                }
                let a = node;
                let sd = sy * a.ny + sz * a.nz;
                let p_up = (1.0 + sd) / 2.0;
                let up = rng.next_float() < p_up;
                cur_sign = if up { 1 } else { -1 };
                sy = cur_sign as f64 * a.ny;
                sz = cur_sign as f64 * a.nz;
                cur_theta = a.angle_rad;
                spin_theta[i] = a.angle_rad;
                spin_sign[i] = cur_sign;
                history[i * n_app + a.slot] = if up { 1 } else { 0 };
                if (a.blocked_up && up) || (a.blocked_down && !up) {
                    will_absorb = true;
                }
                // continue on the measured branch beam
                let beam_key = format!("{}:{}", a.id, if up { "up" } else { "down" });
                beam = beam_key;
                beam_list = beams.get(&beam).cloned().unwrap_or_default();
                beam_idx = 0;
                cur_app = Some(slot);
            }

            // leave the magnet region: force off
            if let Some(slot) = cur_app {
                let a = &caches[slot];
                if p_x > a.x_out + 4.0 * a.fr {
                    cur_app = None;
                }
            }

            // classical blocker: the plate physically cuts the blocked half of the beam
            if classical {
                for a in &caches {
                    if !a.blocked_up && !a.blocked_down {
                        continue;
                    }
                    let x_block = a.x_out + 0.004;
                    if px < x_block && p_x >= x_block {
                        let d = (p_y - a.cy) * a.ny + (p_z - a.cz) * a.nz;
                        if (a.blocked_up && d > 0.0) || (a.blocked_down && d < 0.0) {
                            is_absorbed = true;
                            break;
                        }
                    }
                }
                if is_absorbed {
                    break;
                }
            }

            // blocker absorption shortly after magnet exit
            if will_absorb {
                if let Some(slot) = cur_app {
                    let a = &caches[slot];
                    if p_x >= a.x_out + 0.004 {
                        is_absorbed = true;
                        break;
                    }
                }
            }

            // screen crossing
            if p_x >= cfg.screen_x {
                let frac = (cfg.screen_x - px) / (if p_x - px != 0.0 { p_x - px } else { 1.0 });
                hit_y[i] = py + (p_y - py) * frac;
                hit_z[i] = pz + (p_z - pz) * frac;
                hit_time[i] = t - dt + dt * frac;
                landed = true;
                break;
            }

            if k % SAMPLE_EVERY == 0 {
                record(p_x, p_y, p_z, cur_theta, cur_sign, &mut hero_pos, &mut hero_spin_theta, &mut hero_spin_sign, &mut i_sample);
            }
            k += 1;
        }

        if is_absorbed {
            hit_y[i] = p_y;
            hit_z[i] = p_z;
            hit_time[i] = t;
            absorbed[i] = 1;
        } else if !landed {
            hit_y[i] = p_y;
            hit_z[i] = p_z;
            hit_time[i] = t;
        }

        if is_hero {
            hero_birth[i] = t0;
            hero_sample_dt[i] = dt * SAMPLE_EVERY as f64;
            while i_sample < N_T {
                let p_x = p_vx * (t - t0);
                let base = (i * N_T + i_sample) * 3;
                hero_pos[base] = p_x;
                hero_pos[base + 1] = p_y;
                hero_pos[base + 2] = p_z;
                hero_spin_theta[i * N_T + i_sample] = cur_theta;
                hero_spin_sign[i * N_T + i_sample] = cur_sign;
                i_sample += 1;
            }
        }

        if hit_time[i] > t_total {
            t_total = hit_time[i];
        }
    }

    Ok(SimOutput {
        n_particles: n,
        n_hero,
        n_t: N_T,
        n_apparatus: n_app,
        hero_pos,
        hero_spin_theta,
        hero_spin_sign,
        hero_birth,
        hero_sample_dt,
        hit_time,
        hit_y,
        hit_z,
        absorbed,
        spin_theta,
        spin_sign,
        history,
        t_total,
    })
}

// ------------------------------------------------------------- encoding ---
//
// [u32 headerLen][header JSON][zero padding to 8-byte alignment][payload]
// payload: f64 {heroPos, heroSpinTheta, heroBirth, heroSampleDt, hitTime,
//               hitY, hitZ, spinTheta, tTotal}
//          i8 {heroSpinSign, spinSign}  u8 {absorbed, history}

pub fn encode(out: &SimOutput) -> Vec<u8> {
    let header = format!(
        "{{\"nParticles\":{},\"nHero\":{},\"nT\":{},\"nApparatus\":{}}}",
        out.n_particles, out.n_hero, out.n_t, out.n_apparatus
    );
    let mut buf = Vec::with_capacity(1 << 20);
    buf.extend_from_slice(&(header.len() as u32).to_le_bytes());
    buf.extend_from_slice(header.as_bytes());
    while buf.len() % 8 != 0 {
        buf.push(0);
    }
    let mut push_f64 = |v: &[f64], buf: &mut Vec<u8>| {
        for x in v {
            buf.extend_from_slice(&x.to_le_bytes());
        }
    };
    push_f64(&out.hero_pos, &mut buf);
    push_f64(&out.hero_spin_theta, &mut buf);
    push_f64(&out.hero_birth, &mut buf);
    push_f64(&out.hero_sample_dt, &mut buf);
    push_f64(&out.hit_time, &mut buf);
    push_f64(&out.hit_y, &mut buf);
    push_f64(&out.hit_z, &mut buf);
    push_f64(&out.spin_theta, &mut buf);
    push_f64(&[out.t_total], &mut buf);
    for v in &out.hero_spin_sign {
        buf.push(*v as u8);
    }
    for v in &out.spin_sign {
        buf.push(*v as u8);
    }
    buf.extend_from_slice(&out.absorbed);
    buf.extend_from_slice(&out.history);
    buf
}

// ---------------------------------------------------------- test support ---

/// Decoded view over the encoded buffer (native tests only).
pub struct Decoded {
    pub n_particles: usize,
    #[allow(dead_code)]
    pub n_apparatus: usize,
    pub hit_z: Vec<f64>,
    pub absorbed: Vec<u8>,
    pub history: Vec<u8>,
}

pub fn decode_for_tests(buf: &[u8]) -> Decoded {
    let header_len = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
    let header: serde_json::Value = serde_json::from_slice(&buf[4..4 + header_len]).expect("header");
    let n = header["nParticles"].as_u64().unwrap() as usize;
    let n_app = header["nApparatus"].as_u64().unwrap() as usize;
    let mut off = (4 + header_len + 7) & !7;
    let n_hero = header["nHero"].as_u64().unwrap() as usize;
    let n_t = header["nT"].as_u64().unwrap() as usize;
    // skip f64 arrays before hitZ: heroPos(nH*nT*3), heroSpinTheta(nH*nT),
    // heroBirth(nH), heroSampleDt(nH), hitTime(n), hitY(n)
    off += (n_hero * n_t * 3 + n_hero * n_t + 2 * n_hero + 2 * n) * 8;
    let mut hit_z = Vec::with_capacity(n);
    for i in 0..n {
        let b = &buf[off + i * 8..off + i * 8 + 8];
        hit_z.push(f64::from_le_bytes(b.try_into().unwrap()));
    }
    off += n * 8; // hitZ consumed
    off += n * 8; // spinTheta
    off += 8; // tTotal
    off += n_hero * n_t; // heroSpinSign (i8)
    off += n; // spinSign (i8)
    let absorbed = buf[off..off + n].to_vec();
    off += n;
    let history = buf[off..off + n * n_app].to_vec();
    Decoded { n_particles: n, n_apparatus: n_app, hit_z, absorbed, history }
}

// ----------------------------------------------------------------- wasm ---

#[cfg(target_arch = "wasm32")]
pub mod wasm {
    use super::*;
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub fn run_simulation(config_json: &str) -> Result<Vec<u8>, JsValue> {
        let cfg: Config = serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("config parse error: {e}")))?;
        let out = simulate(&cfg).map_err(|e| JsValue::from_str(&e))?;
        Ok(encode(&out))
    }
}
