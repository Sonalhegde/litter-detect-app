import { Waves } from "lucide-react";
import { Link } from "wouter";
import { StatusChip } from "@/components/detector/StatusChip";

const EVALUATION_METRICS = [
  "Precision",
  "Recall",
  "mAP@50",
  "mAP@50–95",
  "F1 score",
  "Per-class AP",
  "Confusion matrix",
  "Precision-recall curve",
  "False positives",
  "False negatives",
];

export default function Evaluation() {
  return (
    <div className="app-shell">
      <header>
        <div className="page-width topbar">
          <div className="topbar-left">
            <a className="brand" href="/" aria-label="Sentinal home">
              <span className="brand-mark"><Waves size={18} /></span>
              Sentinal
            </a>
            <Link className="nav-link" href="/">Detector ↗</Link>
            <Link className="nav-link" href="/docs">Research notes ↗</Link>
          </div>
        </div>
      </header>

      <main>
        <div className="page-width">
          <section className="hero" aria-labelledby="eval-title">
            <span className="kicker"><Waves size={14} /> MODEL EVALUATION</span>
            <h1 id="eval-title">Model Evaluation</h1>
            <p>
              Evaluation metrics will appear here once the evaluation pipeline is connected
              to a real validation/test run. No sample or placeholder values are shown.
            </p>
          </section>

          <section className="panel eval-panel" aria-label="Model evaluation metrics">
            <div className="panel-header">
              <div className="panel-header-meta">
                <span className="step-badge">EVALUATION PIPELINE</span>
                <h2>Evaluation metrics</h2>
              </div>
              <StatusChip state="under-progress" />
            </div>
            <ul className="metric-rows eval-rows">
              {EVALUATION_METRICS.map((metric) => (
                <li key={metric}>
                  <span>{metric}</span>
                  <StatusChip state="under-progress" />
                </li>
              ))}
            </ul>
            <p className="subpanel-note">
              This metric will be available once the corresponding analysis module is implemented.
            </p>
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
