interface FieldDisplayProps {
  label: string;
  value: React.ReactNode;
}

export function FieldDisplay({ label, value }: FieldDisplayProps): JSX.Element {
  return (
    <div className="space-y-1 rounded-2xl border border-border-default bg-muted/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground-foreground">{label}</p>
      <div className="text-sm leading-6 text-foreground">{value}</div>
    </div>
  );
}
