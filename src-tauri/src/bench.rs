//! Gancho de benchmark (`scripts/bench.mjs`, método em `docs/benchmark.md`).

use std::{
    sync::OnceLock,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

/// Gancho de benchmark (`scripts/bench.mjs`, método em `docs/benchmark.md`). Só existe com
/// `LEVE_BENCH=1` no ambiente: aí `run()` guarda o instante de partida, o plugin `bench` marca a
/// página (`window.__LEVE_BENCH__`) e o frontend chama `bench_report` ao fim do layout e no
/// primeiro quadro de cada documento (`src/bench.ts`). Desligado, o frontend não chama nada e o
/// comando recusa. Só escreve no stdout.
static BENCH: OnceLock<Option<Instant>> = OnceLock::new();

pub fn bench_started() -> Option<Instant> {
    *BENCH.get_or_init(|| bench_flag(std::env::var_os("LEVE_BENCH").as_deref()).then(Instant::now))
}

/// Só o valor exato `1` arma o gancho: `0`, vazio ou outro valor não.
fn bench_flag(v: Option<&std::ffi::OsStr>) -> bool {
    v.is_some_and(|v| v == "1")
}

#[derive(Deserialize, Serialize)]
pub struct BenchMeasure {
    name: String,
    ms: f64,
    end: f64,
}

/// Linha do stdout que o `bench.mjs` lê: prefixo fixo e JSON numa linha só.
fn bench_line(
    doc: &str,
    phase: &str,
    run_ms: f64,
    epoch_ms: u128,
    page_ms: f64,
    measures: &[BenchMeasure],
) -> String {
    let json = serde_json::json!({
        "doc": doc,
        "phase": phase,
        "runMs": run_ms,
        "epochMs": epoch_ms as u64,
        "pageMs": page_ms,
        "measures": measures,
    });
    format!("LEVE_BENCH {json}")
}

#[tauri::command]
pub fn bench_report(
    doc: String,
    phase: String,
    page_ms: f64,
    measures: Vec<BenchMeasure>,
) -> Result<(), String> {
    let started = bench_started().ok_or("LEVE_BENCH desligado")?;
    let epoch_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let run_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "{}",
        bench_line(&doc, &phase, run_ms, epoch_ms, page_ms, &measures)
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linha_do_bench_e_json_numa_linha() {
        let m = vec![BenchMeasure {
            name: "leve:render".into(),
            ms: 12.5,
            end: 40.0,
        }];
        let line = bench_line(
            "/tmp/a\nb.md",
            "paint",
            340.25,
            1_700_000_000_123,
            210.0,
            &m,
        );
        assert!(line.starts_with("LEVE_BENCH {"));
        assert!(
            !line.contains('\n'),
            "quebra de linha no caminho vira escape"
        );
        let v: serde_json::Value = serde_json::from_str(&line["LEVE_BENCH ".len()..]).unwrap();
        assert_eq!(v["doc"], "/tmp/a\nb.md");
        assert_eq!(v["phase"], "paint");
        assert_eq!(v["epochMs"], 1_700_000_000_123u64);
        assert_eq!(v["runMs"], 340.25);
        assert_eq!(v["pageMs"], 210.0);
        assert_eq!(v["measures"][0]["name"], "leve:render");
        assert_eq!(v["measures"][0]["ms"], 12.5);
        assert_eq!(v["measures"][0]["end"], 40.0);
    }

    #[test]
    fn so_o_valor_1_arma() {
        use std::ffi::OsStr;
        assert!(bench_flag(Some(OsStr::new("1"))));
        assert!(!bench_flag(Some(OsStr::new("0"))));
        assert!(!bench_flag(Some(OsStr::new(""))));
        assert!(!bench_flag(Some(OsStr::new("true"))));
        assert!(!bench_flag(None));
    }

    #[test]
    fn sem_variavel_o_comando_recusa() {
        // O teste não define LEVE_BENCH; se o ambiente de quem roda definir, não há o que provar.
        if std::env::var_os("LEVE_BENCH").is_some() {
            return;
        }
        assert!(bench_report("x.md".into(), "layout".into(), 0.0, vec![]).is_err());
    }
}
