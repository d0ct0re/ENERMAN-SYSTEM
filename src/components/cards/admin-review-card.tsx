import { AlertTriangle, ArrowUpRight, Check, MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RequestItem } from "@/types";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate } from "@/lib/utils";

interface AdminReviewCardProps {
  request: RequestItem;
  onOpen: (requestId: string) => void;
  onApprove?: (requestId: string) => void;
  onReject?: (requestId: string, reason: string) => void;
  onCorrection?: (requestId: string, reason: string) => void;
  requesterName?: string;
  suggestedSequence?: string;
}

type Mode = "idle" | "approving" | "rejecting" | "correcting";

export function AdminReviewCard({
  request,
  onOpen,
  onApprove,
  onReject,
  onCorrection,
  requesterName,
  suggestedSequence,
}: AdminReviewCardProps): JSX.Element {
  const [mode, setMode] = useState<Mode>("idle");
  const [rejectReason, setRejectReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const isPending = request.status === "under-review";

  const handleConfirmApprove = (): void => {
    onApprove?.(request.id);
    setMode("idle");
  };

  const handleConfirmReject = (): void => {
    if (!rejectReason.trim()) return;
    onReject?.(request.id, rejectReason.trim());
    setMode("idle");
    setRejectReason("");
  };

  const handleConfirmCorrection = (): void => {
    if (!correctionReason.trim()) return;
    onCorrection?.(request.id, correctionReason.trim());
    setMode("idle");
    setCorrectionReason("");
  };

  return (
    <Card
      className="group flex h-full flex-col gap-3 border-l-[3px] border-l-warning transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-card-hover"
      onClick={() => mode === "idle" && onOpen(request.id)}
      style={{ cursor: mode !== "idle" ? "default" : "pointer" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
            {request.client} · {request.department}
          </p>
          <h3 className="text-[16px] font-bold leading-snug text-foreground">{request.baseName}</h3>
          <p className="text-xs text-muted-foreground">{request.structuredName || "Sin folio aún"}</p>
        </div>
        <StatusBadge kind="request" value={request.status} />
      </div>

      {/* Description preview */}
      {request.description ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-ink-secondary">{request.description}</p>
      ) : null}

      {/* Requester */}
      {requesterName ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-ink-secondary">Solicitado por:</span> {requesterName}
        </p>
      ) : null}

      {/* Duplicate warning */}
      {request.duplicateOfProjectId ? (
        <div className="flex items-center gap-2 rounded-2xl bg-brand/15 px-4 py-2.5 text-sm font-semibold text-brand ring-1 ring-brand/25">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Coincidencia con proyecto existente
        </div>
      ) : null}

      {/* Approve confirm */}
      {mode === "approving" ? (
        <div className="space-y-2.5 rounded-2xl border border-success/20 bg-[#0D2417] p-3" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs font-bold text-success">Confirmar aprobación</p>
          <p className="text-xs text-muted-foreground">
            El servidor asignará el siguiente consecutivo disponible de forma atómica.
            {suggestedSequence ? (
              <>
                {" "}Estimado:{" "}
                <span className="font-mono font-semibold text-foreground">~#{suggestedSequence}</span>
              </>
            ) : null}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmApprove}
              className="flex-1 rounded-xl bg-[#166534]/30 py-2 text-sm font-bold text-success ring-1 ring-success/20 transition hover:bg-[#166534]/50"
            >
              Confirmar aprobación
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="rounded-xl border border-border-default px-4 py-2 text-sm font-bold text-muted-foreground transition hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* Reject confirm */}
      {mode === "rejecting" ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motivo del rechazo (obligatorio)..."
            className="w-full resize-none rounded-xl border border-border-default bg-bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-danger/50"
            rows={2}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!rejectReason.trim()}
              onClick={handleConfirmReject}
              className="flex-1 rounded-xl bg-danger/15 py-2 text-sm font-bold text-danger transition hover:bg-danger/25 disabled:opacity-40"
            >
              Confirmar rechazo
            </button>
            <button
              type="button"
              onClick={() => { setMode("idle"); setRejectReason(""); }}
              className="rounded-xl border border-border-default px-4 py-2 text-sm font-bold text-muted-foreground transition hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* Correction confirm */}
      {mode === "correcting" ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={correctionReason}
            onChange={(e) => setCorrectionReason(e.target.value)}
            placeholder="Indica qué debe corregir el ingeniero..."
            className="w-full resize-none rounded-xl border border-info/30 bg-[#0c1f2e] px-3 py-2 text-sm text-foreground outline-none focus:border-info/60"
            rows={2}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!correctionReason.trim()}
              onClick={handleConfirmCorrection}
              className="flex-1 rounded-xl bg-info/15 py-2 text-sm font-bold text-info ring-1 ring-info/25 transition hover:bg-info/25 disabled:opacity-40"
            >
              Enviar corrección
            </button>
            <button
              type="button"
              onClick={() => { setMode("idle"); setCorrectionReason(""); }}
              className="rounded-xl border border-border-default px-4 py-2 text-sm font-bold text-muted-foreground transition hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-3">
        <p className="text-xs text-muted-foreground">Ingresado: {formatDate(request.createdAt)}</p>
        {mode === "idle" ? (
          <div className="flex flex-wrap gap-2">
            {isPending && onApprove ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMode("approving"); }}
                className="flex items-center gap-1.5 rounded-xl bg-[#166534]/20 px-3 py-1.5 text-sm font-bold text-success ring-1 ring-success/20 transition hover:bg-[#166534]/40"
              >
                <Check className="h-3.5 w-3.5" />
                Aprobar
              </button>
            ) : null}
            {isPending && onCorrection ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMode("correcting"); }}
                className="flex items-center gap-1.5 rounded-xl bg-info/10 px-3 py-1.5 text-sm font-bold text-info ring-1 ring-info/20 transition hover:bg-info/20"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Solicitar corrección
              </button>
            ) : null}
            {isPending && onReject ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMode("rejecting"); }}
                className="flex items-center gap-1.5 rounded-xl bg-danger/10 px-3 py-1.5 text-sm font-bold text-danger ring-1 ring-danger/20 transition hover:bg-danger/20"
              >
                <X className="h-3.5 w-3.5" />
                Rechazar
              </button>
            ) : null}
            <Button variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(request.id); }}>
              Revisar
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
