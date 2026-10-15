import { useRef, useState, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import "./step-form.css";
export interface FormStep {
  id: string; label: string; title: string; content: ReactNode;
  progress: { filled: number; total: number };
}
interface StepFormProps {
  title: string; steps: FormStep[]; save: ReactNode; canContinue?: boolean;
  hint?: string; className?: string;
}
/** Reusable fixed header/footer with one scroller. Hidden steps retain mounted controls. */
export function StepForm({ title, steps, save, canContinue = true, hint, className }: StepFormProps): JSX.Element {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const go = (next: number): void => {
    setStep(next);
    requestAnimationFrame(() => { scroller.current?.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }); });
  };
  return <div className={cn("step-form", className)}>
    <div className="step-form__top"><div><p className="step-form__eyebrow">{title}</p><h3 ref={heading} tabIndex={-1}>{steps[step].title}</h3></div>
      <nav className="step-form__steps" aria-label={`Pasos de ${title.toLowerCase()}`}>{steps.map((item, index) => {
        const { filled, total } = item.progress;
        const complete = total > 0 && filled === total;
        const state = complete ? "complete" : filled > 0 ? "partial" : "pending";
        return <button key={item.id} type="button" data-progress={state} style={{ "--step-progress": `${total ? Math.round(filled / total * 100) : 0}%` } as CSSProperties} disabled={index > step && !canContinue} aria-current={step === index ? "step" : undefined} aria-label={`${item.label}: ${filled} de ${total} campos válidos`} onClick={() => go(index)}><span key={filled} className="step-form__progress-circle">{complete ? "\u2713" : index + 1}</span><span className="step-form__step-label">{item.label}<small>{filled}/{total} válidos</small></span></button>;
      })}</nav>
    </div>
    <div ref={scroller} className="step-form__fields">{steps.map((item,index) => <div key={item.id} hidden={step !== index} className="step-form__step space-y-3">{item.content}</div>)}</div>
    <footer className="step-form__footer"><span>Paso {step + 1} de {steps.length}</span><div>{step > 0 && <button type="button" onClick={() => go(step - 1)}>Anterior</button>}{step < steps.length - 1 ? <button type="button" className="step-form__next" disabled={!canContinue} onClick={() => go(step + 1)}>Siguiente</button> : save}</div>{!canContinue && hint && <p className="step-form__hint">{hint}</p>}</footer>
  </div>;
}
export interface SummaryField { label: string; value?: string; wide?: boolean; }
export function FormSummary({ fields }: { fields: SummaryField[] }): JSX.Element {
  return <dl className="step-form__review">{fields.map(field => <div key={field.label} className={field.wide ? "step-form__review-wide" : undefined}><dt>{field.label}</dt><dd>{field.value?.trim() || "Sin asignar"}</dd></div>)}</dl>;
}