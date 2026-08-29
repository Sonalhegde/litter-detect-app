import { Link } from "wouter";

export default function NotFound() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: "40px 24px", textAlign: "center" }}>
      <div>
        <p style={{ fontSize: "3rem", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>404</p>
        <p style={{ fontSize: "1.125rem", color: "var(--text-2)", marginBottom: "24px" }}>Page not found.</p>
        <Link href="/" style={{ color: "var(--accent)", fontSize: "0.9375rem" }}>← Back to Sentinel</Link>
      </div>
    </div>
  );
}
