interface FieldDisplayProps {
  label: string;
  value: React.ReactNode;
}

export function FieldDisplay({ label, value }: FieldDisplayProps): JSX.Element {
  return (
    <div className="space-y-1 rounded-2xl border border-[#3F3F46] bg-[#313136]/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="text-sm leading-6 text-foreground">{value}</div>
    </div>
  );
}
