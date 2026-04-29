import { AlertTriangle, ArrowUpRight, Link2, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RequestItem } from "@/types";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate } from "@/lib/utils";

interface RequestCardProps {
  request: RequestItem;
  onOpen: (requestId: string) => void;
}

export function RequestCard({ request, onOpen }: RequestCardProps): JSX.Element {
  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">{request.client}</p>
          <h3 className="mt-2 text-lg font-semibold text-foreground">{request.baseName}</h3>
          <p className="text-sm text-[#888888]">{request.structuredName}</p>
        </div>
        <StatusBadge kind="request" value={request.status} />
      </div>

      <p className="text-sm leading-6 text-[#888888]">{request.description}</p>

      {request.duplicateOfProjectId ? (
        <div className="flex items-start gap-3 rounded-2xl bg-[#F5A524]/15 p-4 text-sm text-[#F5A524] ring-1 ring-[#F5A524]/20">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          Posible duplicado detectado con un proyecto existente.
        </div>
      ) : null}

      {request.correctionReason ? (
        <div className="flex items-start gap-3 rounded-2xl bg-[#F5A524]/15 p-4 text-sm text-[#F5A524] ring-1 ring-[#F5A524]/20">
          <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0" />
          {request.correctionReason}
        </div>
      ) : null}

      {request.rejectionReason ? (
        <div className="flex items-start gap-3 rounded-2xl bg-[#E24B4A]/15 p-4 text-sm text-[#E24B4A] ring-1 ring-[#E24B4A]/20">
          <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0" />
          {request.rejectionReason}
        </div>
      ) : null}

      {request.linkedProjectId ? (
        <div className="flex items-start gap-3 rounded-2xl bg-[#2DBE7A]/15 p-4 text-sm text-[#2DBE7A] ring-1 ring-[#2DBE7A]/20">
          <Link2 className="mt-0.5 h-5 w-5 shrink-0" />
          Proyecto relacionado disponible para consulta.
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between">
        <p className="text-sm text-[#888888]">Alta: {formatDate(request.createdAt)}</p>
        <Button variant="outline" onClick={() => onOpen(request.id)}>
          Ver detalle
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
