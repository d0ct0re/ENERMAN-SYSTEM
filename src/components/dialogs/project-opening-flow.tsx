import { useRef, useState, type ReactNode, type CSSProperties } from "react";
import "./project-opening-flow.css";

interface Props {
  enabled: boolean;
  information: ReactNode;
  location: ReactNode;
  review: ReactNode;
  save: ReactNode;
  canContinue: boolean;
  fieldProgress: { filled: number; total: number }[];
  preview: { name: string; reference: string; client: string; department: string; place: string; engineer: string; folio: string; address: string; negotiator: string; contact: string; };
}

/** Keeps the original controlled fields mounted so switching steps never loses drafts. */
export function ProjectOpeningFlow({ enabled, information, location, review, save, canContinue, preview, fieldProgress }: Props): JSX.Element {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = ["Información", "Ubicación", "Revisión"];
  const go = (next: number): void => {
    setStep(next);
    requestAnimationFrame(() => { heading.current?.focus({preventScroll: true}); heading.current?.scrollIntoView({block: "nearest", behavior: "instant" as ScrollBehavior}); });
  };
  if (!enabled) return <div className="space-y-3">{information}{location}{review}{save}</div>;
  return <div className="opening-flow">
    <div className="opening-flow__top"><div><p className="opening-flow__eyebrow">FASE 1</p><h3>Apertura del proyecto</h3></div>
    <nav className="opening-flow__steps" aria-label="Pasos de apertura">{steps.map((label, index) => {
      const progress = fieldProgress[index];
      const state = progress.filled === progress.total ? "complete" : progress.filled > 0 ? "partial" : "pending";
      const percent = Math.round(progress.filled / progress.total * 100);
      return <button key={label} type="button" data-progress={state} style={{"--step-progress": percent + "%"} as CSSProperties} disabled={index > 0 && !canContinue} aria-current={step === index ? "step" : undefined} aria-label={label + ": " + progress.filled + " de " + progress.total + " campos registrados"} onClick={() => go(index)}><span key={progress.filled} className="opening-flow__progress-circle">{state === "complete" ? "\u2713" : index + 1}</span>{label}<small>{progress.filled}/{progress.total} campos</small></button>;
    })}</nav></div>
    <div className="opening-flow__layout">
      <div className="opening-flow__fields">
        <h3 ref={heading} tabIndex={-1}>{["Información del proyecto", "Ubicación y contactos", "Revisa la apertura"][step]}</h3>
        <p className="opening-flow__description">{["Los datos principales que identifican este trabajo.", "Indica dónde se realizará y a quién contactar. Estos campos siguen siendo los del formulario original.", "Comprueba la información antes de guardar. Las fechas importantes conservan su guardado independiente."][step]}</p>
        <div hidden={step !== 0} className="space-y-3">{information}</div>
        <div hidden={step !== 1} className="space-y-3">{location}</div>
        <div hidden={step !== 2} className="space-y-3">
          <dl className="opening-flow__review">{[["Trabajo", preview.name], ["Cliente", preview.client], ["Departamento", preview.department], ["Lugar", preview.place], ["Ingeniero", preview.engineer], ["Ubicación del trabajo", preview.address], ["Compras / Negociador", preview.negotiator], ["Contacto", preview.contact]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Sin registrar"}</dd></div>)}</dl>
          {review}
        </div>
      </div>
      <aside className="opening-flow__preview" aria-label="Vista previa del proyecto">
        <p className="opening-flow__eyebrow">VISTA PREVIA</p>
        <div className="opening-flow__preview-card">
        <span className="opening-flow__folio">Folio #{preview.folio}</span>
        <h4>{preview.name || "Nombre del proyecto"}</h4>
        <p>{preview.client || "Cliente"} · {preview.department || "Departamento"}</p>
        <p>{preview.place || "Lugar por definir"}</p>
        </div>
        <dl className="opening-flow__metadata"><div><dt>Ingeniero</dt><dd>{preview.engineer}</dd></div><div><dt>Contacto</dt><dd>{preview.contact || "Sin registrar"}</dd></div></dl>
        <div className="opening-flow__reference">{preview.reference}</div>
        <small>Los cambios del formulario se guardan al pulsar “Guardar apertura”.</small>
      </aside>
    </div>
    <footer className="opening-flow__footer">
      <span>Paso {step + 1} de 3</span>
      <div>{step > 0 && <button type="button" onClick={() => go(step - 1)}>Anterior</button>}{step < 2 ? <button type="button" className="opening-flow__next" disabled={!canContinue} onClick={() => go(step + 1)}>Siguiente</button> : save}</div>
    </footer>
    {!canContinue && <p className="opening-flow__hint">Para continuar, registra cliente, departamento, tipo, lugar y nombre del trabajo.</p>}
  </div>;
}
