use sg_physics::{decode_for_tests, encode, parse_config, simulate};

fn run(mode: &str, apps: Vec<serde_json::Value>, screen_x: f64, n: usize) -> sg_physics::Decoded {
    let json = serde_json::json!({
        "mode": mode,
        "source": { "vMean": 500.0, "vSigma": 30.0, "aperture": 0.0005, "divergence": 0.001 },
        "apparatuses": apps,
        "screenX": screen_x,
        "particleCount": n,
        "heroCount": 100,
        "seed": 42
    });
    let c = parse_config(&json.to_string()).unwrap();
    let out = simulate(&c).unwrap();
    let buf = encode(&out);
    decode_for_tests(&buf)
}

fn app(id: &str, fields: serde_json::Value) -> serde_json::Value {
    let mut base = serde_json::json!({
        "id": id, "attachTo": "root", "xStart": 0.25, "length": 0.12, "angleDeg": 0.0,
        "gradient": 1500.0, "b0": 0.5, "gap": 0.006, "blockedPort": null
    });
    if let serde_json::Value::Object(map) = &mut base {
        if let serde_json::Value::Object(f) = fields {
            for (k, v) in f {
                map.insert(k.clone(), v.clone());
            }
        }
    }
    base
}

#[test]
fn semiclassical_two_spots_symmetric() {
    let d = run("semiclassical", vec![app("a1", serde_json::json!({}))], 0.6, 8000);
    let mut up = 0.0f64;
    let mut n_up = 0usize;
    let mut down = 0.0f64;
    let mut n_down = 0usize;
    for i in 0..d.n_particles {
        if d.absorbed[i] != 0 {
            continue;
        }
        if d.hit_z[i] > 0.002 {
            up += d.hit_z[i];
            n_up += 1;
        } else if d.hit_z[i] < -0.002 {
            down += d.hit_z[i];
            n_down += 1;
        }
    }
    let mean_up = up / n_up as f64;
    let mean_down = down / n_down as f64;
    assert!((mean_up + mean_down).abs() < 0.02 * mean_up.abs());
    let a = 9.2740100783e-24 * 1500.0 / 1.7915e-25;
    let t_m = 0.12 / 500.0;
    let t_d = (0.6 - 0.25 - 0.12) / 500.0;
    let theory = 0.5 * a * t_m * t_m + a * t_m * t_d;
    assert!((mean_up - theory).abs() / theory < 0.10, "mean_up={mean_up} theory={theory}");
}

#[test]
fn classical_continuous_band() {
    let d = run("classical", vec![app("a1", serde_json::json!({}))], 0.6, 8000);
    let mut near = 0usize;
    let mut total = 0usize;
    for i in 0..d.n_particles {
        if d.absorbed[i] != 0 {
            continue;
        }
        total += 1;
        if d.hit_z[i].abs() < 0.004 {
            near += 1;
        }
    }
    assert!(near as f64 / total as f64 > 0.05);
}

#[test]
fn routed_child_only_sees_its_branch() {
    let d = run(
        "semiclassical",
        vec![
            app("a1", serde_json::json!({"xStart": 0.2})),
            app("a2", serde_json::json!({"attachTo": "a1:down", "xStart": 0.44, "angleDeg": 90.0})),
        ],
        0.78,
        8000,
    );
    let mut from_up = 0usize;
    let mut from_down = 0usize;
    for i in 0..d.n_particles {
        if d.absorbed[i] != 0 || d.history[i * 2] == 255 || d.history[i * 2 + 1] == 255 {
            continue;
        }
        if d.history[i * 2] == 0 {
            from_down += 1;
        } else {
            from_up += 1;
        }
    }
    assert_eq!(from_up, 0);
    assert!(from_down > 1800, "from_down={from_down}");
}

#[test]
fn two_routed_children_90_four_equal_branches() {
    let d = run(
        "semiclassical",
        vec![
            app("a1", serde_json::json!({"xStart": 0.18})),
            app("a2", serde_json::json!({"attachTo": "a1:up", "xStart": 0.42, "angleDeg": 90.0})),
            app("a3", serde_json::json!({"attachTo": "a1:down", "xStart": 0.42, "angleDeg": 90.0})),
        ],
        0.78,
        8000,
    );
    let mut counts = [0usize; 4];
    let mut total = 0usize;
    for i in 0..d.n_particles {
        if d.absorbed[i] != 0 {
            continue;
        }
        let h0 = d.history[i * 3];
        if h0 == 255 {
            continue;
        }
        // slot 1 = a2 (up child), slot 2 = a3 (down child)
        let idx = if h0 == 1 { d.history[i * 3 + 1] } else { d.history[i * 3 + 2] };
        if idx == 255 {
            continue;
        }
        counts[h0 as usize * 2 + idx as usize] += 1;
        total += 1;
    }
    for cnt in counts {
        let f = cnt as f64 / total as f64;
        assert!(f > 0.2 && f < 0.3, "fraction {f}");
    }
}

#[test]
fn routed_child_60_cos2_probabilities() {
    let d = run(
        "semiclassical",
        vec![
            app("a1", serde_json::json!({"xStart": 0.2})),
            app("a2", serde_json::json!({"attachTo": "a1:up", "xStart": 0.44, "angleDeg": 60.0})),
        ],
        0.78,
        12000,
    );
    let mut up = 0usize;
    let mut down = 0usize;
    for i in 0..d.n_particles {
        if d.absorbed[i] != 0 {
            continue;
        }
        if d.history[i * 2] != 1 {
            continue;
        }
        if d.history[i * 2 + 1] == 1 {
            up += 1;
        } else {
            down += 1;
        }
    }
    let frac = up as f64 / (up + down) as f64;
    assert!((frac - 0.75).abs() < 0.02, "frac={frac}");
}

#[test]
fn blocked_port_absorbs_branch() {
    let d = run(
        "semiclassical",
        vec![app("a1", serde_json::json!({"blockedPort": "down"}))],
        0.6,
        8000,
    );
    let mut absorbed = 0usize;
    let mut screen = 0usize;
    for i in 0..d.n_particles {
        if d.absorbed[i] != 0 {
            absorbed += 1;
        } else {
            screen += 1;
            assert_ne!(d.history[i], 0, "down branch must be blocked");
        }
    }
    assert!(absorbed as f64 / d.n_particles as f64 > 0.4);
    assert!(screen as f64 / d.n_particles as f64 > 0.4);
}

#[test]
fn deterministic_same_seed() {
    let json = serde_json::json!({
        "mode": "semiclassical",
        "source": { "vMean": 500.0, "vSigma": 30.0, "aperture": 0.0005, "divergence": 0.001 },
        "apparatuses": [app("a1", serde_json::json!({}))],
        "screenX": 0.6, "particleCount": 4000, "heroCount": 50, "seed": 42
    });
    let c1 = parse_config(&json.to_string()).unwrap();
    let c2 = c1.clone();
    let r1 = encode(&simulate(&c1).unwrap());
    let r2 = encode(&simulate(&c2).unwrap());
    assert_eq!(r1, r2);
}
