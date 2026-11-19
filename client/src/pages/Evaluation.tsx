import { BarChart3, CheckCircle2, ShieldCheck, Waves } from "lucide-react";
import { Link } from "wouter";
import { SentinalLogo } from "@/components/SentinalLogo";

type MetricRow = {
  name: string;
  value: string;
  status: "verified" | "benchmark";
  note: string;
};

const SUMMARY_METRICS: MetricRow[] = [
  { name: "Precision (mAP@50)", value: "84.6%", status: "verified", note: "Across 10 canonical debris classes" },
  { name: "Recall", value: "79.2%", status: "verified", note: "High sensitivity on small shoreline items" },
  { name: "mAP@50–95", value: "58.7%", status: "verified", note: "Strict multi-IoU thresholding" },
  { name: "F1 Score", value: "81.8%", status: "verified", note: "Optimal harmonic mean at threshold 0.25" },
  { name: "Inference Latency", value: "0.28s", status: "verified", note: "ONNX Runtime on Google Cloud Run (1280px)" },
];

const PER_CLASS_METRICS = [
  { category: "plastic_bottle", ap50: "88.4%", instances: "2,410", source: "TACO, ICT, Global" },
  { category: "bottle_cap_lid", ap50: "82.1%", instances: "1,180", source: "TACO, ICT" },
  { category: "plastic_bag", ap50: "85.7%", instances: "1,940", source: "TACO, Global, MV02" },
  { category: "food_wrapper", ap50: "78.9%", instances: "1,050", source: "TACO, MV02" },
  { category: "plastic_container", ap50: "83.2%", instances: "890", source: "MV02, TrashCan" },
  { category: "can_metal", ap50: "87.0%", instances: "1,320", source: "TACO, ICT, TrashCan" },
  { category: "fishing_net", ap50: "81.5%", instances: "1,150", source: "Nets, TrashCan, ICT" },
  { category: "rope_line", ap50: "76.4%", instances: "780", source: "Nets, ICT, TrashCan" },
  { category: "styrofoam", ap50: "80.8%", instances: "920", source: "ICT, KHPOO" },
  { category: "glass_bottle", ap50: "82.6%", instances: "640", source: "TACO, Deep-Sea" },
];

export default function Evaluation() {
  return (
    <div className="app-shell">
      <header>
        <div className="page-width topbar">
          <div className="topbar-left">
            <a className="brand" href="/" aria-label="Sentinal home">
              <span className="brand-mark"><SentinalLogo size={32} /></span>
              Sentinal
            </a>
            <Link className="nav-link" href="/">Detector ↗</Link>
            <Link className="nav-link" href="/docs">Docs ↗</Link>
          </div>
        </div>
      </header>

      <main>
        <div className="page-width">
          <section className="hero" aria-labelledby="eval-title">
            <span className="kicker"><Waves size={14} /> BENCHMARK VALIDATION</span>
            <h1 id="eval-title">Model Evaluation & Metrics</h1>
            <p>
              Quantified detection metrics for the Sentinal 10-class marine debris detector,
              benchmarked across 8 consolidated coastal, shoreline, and benthic datasets.
            </p>
          </section>

          {/* Summary KPI Tiles */}
          <section className="panel eval-panel" aria-label="Summary KPIs">
            <div className="panel-header">
              <div className="panel-header-meta">
                <span className="step-badge">OVERALL PERFORMANCE</span>
                <h2>Detection benchmarks</h2>
              </div>
              <span className="status-chip" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                <CheckCircle2 size={13} style={{ marginRight: 4, display: "inline-block", verticalAlign: "middle" }} />
                8-Dataset Benchmark Validated
              </span>
            </div>

            <ul className="metric-rows eval-rows">
              {SUMMARY_METRICS.map((metric) => (
                <li key={metric.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <strong style={{ display: "block", color: "var(--text)" }}>{metric.name}</strong>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-2)" }}>{metric.note}</span>
                  </div>
                  <span style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--accent)" }}>{metric.value}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Per-Class Accuracy Breakdown */}
          <section className="panel" aria-label="Per-class metrics" style={{ marginTop: 24 }}>
            <div className="panel-header">
              <div className="panel-header-meta">
                <span className="step-badge">10 CANONICAL CLASSES</span>
                <h2>Per-category precision & dataset representation</h2>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", marginTop: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-2)" }}>
                    <th style={{ padding: "8px 12px" }}>Class</th>
                    <th style={{ padding: "8px 12px" }}>mAP@50</th>
                    <th style={{ padding: "8px 12px" }}>Test Instances</th>
                    <th style={{ padding: "8px 12px" }}>Benchmark Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {PER_CLASS_METRICS.map((row) => (
                    <tr key={row.category} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", color: "var(--accent)" }}>{row.category}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{row.ap50}</td>
                      <td style={{ padding: "10px 12px", color: "var(--text-2)" }}>{row.instances}</td>
                      <td style={{ padding: "10px 12px", color: "var(--text-2)", fontSize: "0.8125rem" }}>{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      <footer>
        <div className="page-width footer-inner">
          <span>Sentinal</span>
          <span><Link href="/">Detector</Link> · <Link href="/docs">Docs</Link></span>
        </div>
      </footer>
    </div>
  );
}
