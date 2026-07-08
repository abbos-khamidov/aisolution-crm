type Tone = "accent" | "spark" | "success" | "danger" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-strong",
  spark: "bg-spark-soft text-spark",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-ink-dim",
};

export default function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}
