// Shared status chip — spec §18: visual distinction between actual data,
// features under progress, and information that is not available.
export function StatusChip({ state }: { state: "under-progress" | "not-available" }) {
  return (
    <span className={`status-chip status-chip--${state}`}>
      {state === "under-progress" ? "Under Progress" : "Not Available"}
    </span>
  );
}
