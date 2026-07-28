// The two-voice brand row: "FNM" in sans + accent middot + a mono telemetry
// sub-label that changes per screen ("FOOD NEAR ME", "YOUR PICK", "DECIDED"…).

export default function BrandRow({ label = "Food near me" }: { label?: string }) {
  return (
    <div className="brand">
      FNM <span className="brand-dot">·</span> <span className="brand-sub">{label}</span>
    </div>
  );
}
