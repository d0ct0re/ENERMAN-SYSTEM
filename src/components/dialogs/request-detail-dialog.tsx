import { CheckCircle2, Link2, MessageSquareText, XCircle } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { FieldDisplay } from "@/components/common/field-display";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatOptionalDate } from "@/lib/utils";
import { ProjectItem, RequestItem, UserItem } from "@/types";

interface RequestDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: RequestItem;
  users: UserItem[];
  projects: ProjectItem[];
  linkedProjectName?: string;
  duplicateProjectName?: string;
  canManageActions: boolean;
  onApprove: (requestId: string) => void;
  onCorrection: (requestId: string, reason: string) => void;
  onReject: (requestId: string, reason: string) => void;
  onOpenLinkedProject: (projectId: string) => void;
}

type ActionMode = "approve" | "correction" | "reject" | null;

export function RequestDetailDialog({
  open,
  onOpenChange,
  request,
  users,
  projects,
  linkedProjectName,
  duplicateProjectName,
  canManageActions,
  onApprove,
  onCorrection,
  onReject,
  onOpenLinkedProject,
}: RequestDetailDialogProps): JSX.Element | null {
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [reason, setReason] = useState("");

  if (!request) {
    return null;
  }

  const closeAction = (): void => {
    setActionMode(null);
    setReason("");
  };

  const handleAction = (): void => {
    if (actionMode === "approve") {
      onApprove(request.id);
    }

    if (actionMode === "correction" && reason.trim()) {
      onCorrection(request.id, reason.trim());
    }

    if (actionMode === "reject" && reason.trim()) {
      onReject(request.id, reason.trim());
    }

    closeAction();
  };

  const actionTitle =
    actionMode === "approve"
      ? "Confirmar aprobación"
      : actionMode === "correction"
        ? "Solicitar corrección"
        : actionMode === "reject"
          ? "Rechazar solicitud"
          : "";
  const requester = users.find((user) => user.id === request.createdBy);
  const relatedProject = projects.find((project) => project.id === (request.linkedProjectId ?? request.duplicateOfProjectId));
  const totalGastos = relatedProject?.expenses.reduce((total, expense) => total + expense.monto, 0) ?? 0;
  const totalFacturado = relatedProject?.invoices?.reduce((total, invoice) => total + invoice.subtotal, 0) ?? 0;
  const totalPagado = relatedProject?.invoices?.reduce((total, invoice) => total + (invoice.status === "pagada" ? invoice.subtotal : 0), 0) ?? 0;
  const utilidad = (relatedProject?.totalContratado ?? 0) - totalGastos;
  const utilidadPct = relatedProject?.totalContratado ? (utilidad / relatedProject.totalContratado) * 100 : 0;
  const mxn = (value: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(value);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Detalle de solicitud"
        className="max-w-5xl"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <FieldDisplay label="Solicitado por" value={requester ? `${requester.name} · ${requester.roleLabel}` : request.createdBy} />
          <FieldDisplay label="Fecha de solicitud" value={formatDate(request.createdAt)} />
          <FieldDisplay label="Estado" value={<StatusBadge kind="request" value={request.status} />} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <FieldDisplay label="Nombre estructurado" value={request.structuredName} />
          <FieldDisplay label="Nombre base" value={request.baseName} />
          <FieldDisplay label="Cliente" value={request.client} />
          <FieldDisplay label="Departamento" value={request.department} />
          <FieldDisplay label="Tipo" value={request.type} />
          <FieldDisplay label="Descripción" value={request.description} />
          <FieldDisplay label="Posible duplicado" value={duplicateProjectName ?? "Sin coincidencias detectadas"} />
          <FieldDisplay label="Motivo de rechazo" value={request.rejectionReason ?? "N/A"} />
          <FieldDisplay label="Motivo de corrección" value={request.correctionReason ?? "N/A"} />
          <FieldDisplay
            label="Proyecto relacionado"
            value={
              request.linkedProjectId ? (
                <button
                  type="button"
                  onClick={() => onOpenLinkedProject(request.linkedProjectId!)}
                  className="inline-flex items-center gap-2 font-medium text-accent"
                >
                  <Link2 className="h-4 w-4" />
                  {linkedProjectName ?? "Abrir proyecto"}
                </button>
              ) : (
                "Sin vínculo"
              )
            }
          />
        </div>

        {relatedProject ? (
          <div className="mt-6 space-y-4 border-t border-[#3F3F46] pt-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Expediente del proyecto relacionado</p>
              <p className="mt-1 text-sm text-[#888888]">Resumen operativo, financiero y administrativo visible para el Gestor del sistema.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-4">
              <FieldDisplay label="Proyecto" value={relatedProject.structuredName} />
              <FieldDisplay label="Estatus proyecto" value={<StatusBadge kind="project" value={relatedProject.status} />} />
              <FieldDisplay label="Cobro" value={<StatusBadge kind="payment" value={relatedProject.paymentStatus} />} />
              <FieldDisplay label="Responsable inicial" value={users.find((user) => user.id === relatedProject.createdBy)?.name ?? relatedProject.createdBy} />
              <FieldDisplay label="Total contratado" value={mxn(relatedProject.totalContratado)} />
              <FieldDisplay label="Gastos registrados" value={mxn(totalGastos)} />
              <FieldDisplay label="Utilidad estimada" value={`${mxn(utilidad)} · ${Number.isFinite(utilidadPct) ? utilidadPct.toFixed(1) : "0.0"}%`} />
              <FieldDisplay label="Facturado / pagado" value={`${mxn(totalFacturado)} / ${mxn(totalPagado)}`} />
              <FieldDisplay label="Fecha alta proyecto" value={formatDate(relatedProject.createdAt)} />
              <FieldDisplay label="Fecha compromiso" value={formatOptionalDate(relatedProject.commitmentDate)} />
              <FieldDisplay label="Inicio / cierre" value={`${formatOptionalDate(relatedProject.startDate)} / ${formatOptionalDate(relatedProject.endDate)}`} />
              <FieldDisplay label="OC / facturar a" value={`${relatedProject.oc ?? "N/A"} · ${relatedProject.facturarA ?? "N/A"}`} />
            </div>
            <FieldDisplay label="Resumen del proyecto" value={relatedProject.summary} />
            <div className="grid gap-4 lg:grid-cols-2">
              <FieldDisplay
                label="Últimos gastos"
                value={
                  relatedProject.expenses.length > 0
                    ? relatedProject.expenses.slice(-4).reverse().map((expense) => `${formatDate(expense.fecha)} · ${expense.titulo}: ${mxn(expense.monto)}`).join(" | ")
                    : "Sin gastos registrados"
                }
              />
              <FieldDisplay
                label="Historial reciente"
                value={
                  relatedProject.history.length > 0
                    ? relatedProject.history.slice(-4).reverse().map((item) => `${formatDate(item.createdAt)} · ${item.action} (${item.author})`).join(" | ")
                    : "Sin historial"
                }
              />
            </div>
          </div>
        ) : null}

        {canManageActions ? (
          <div className="mt-6 flex flex-col gap-3 border-t border-[#3F3F46] pt-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="border-transparent bg-[#166534]/20 text-[#4ADE80] ring-1 ring-[#4ADE80]/20 hover:border-transparent hover:bg-[#166534]/40 hover:text-[#4ADE80]"
              onClick={() => setActionMode("approve")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Aprobar
            </Button>
            <Button variant="secondary" onClick={() => setActionMode("correction")}>
              <MessageSquareText className="h-4 w-4" />
              Solicitar corrección
            </Button>
            <Button variant="danger" onClick={() => setActionMode("reject")}>
              <XCircle className="h-4 w-4" />
              Rechazar
            </Button>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={actionMode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeAction();
          }
        }}
        title={actionTitle}
        description="Revisa los detalles antes de confirmar"
        className="max-w-xl"
      >
        {actionMode === "approve" ? (
          <div className="space-y-5">
            <div className="rounded-2xl bg-success/10 p-4 text-sm text-success">
              Al aprobar, esta solicitud se convertirá en un proyecto activo.
            </div>
            <div className="flex justify-end">
              <Button onClick={handleAction}>Confirmar aprobación</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                actionMode === "correction"
                  ? ""
                  : "Indica claramente el motivo de rechazo."
              }
            />
            <div className="flex justify-end">
              <Button onClick={handleAction} disabled={!reason.trim()} variant={actionMode === "reject" ? "danger" : "secondary"}>
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
