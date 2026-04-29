import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RequestItem } from "@/types";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate } from "@/lib/utils";

interface AdminReviewCardProps {
  request: RequestItem;
  onOpen: (requestId: string) => void;
}

export function AdminReviewCard({ request, onOpen }: AdminReviewCardProps): JSX.Element {
  return (
    <Card className="group flex h-full cursor-pointer flex-col gap-4 border-l-[3px] border-l-warning transition-all duration-200 hover:-translate-y-1 hover:border-white/15 hover:shadow-card-hover"
      onClick={() => onOpen(request.id)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
            {request.client} · {request.department}
          </p>
          <div>
            <h3 className="text-[17px] font-bold leading-snug text-foreground">{request.baseName}</h3>
            <p className="mt-0.5 text-xs text-[#888888]">{request.structuredName}</p>
          </div>
        </div>
        <StatusBadge kind="request" value={request.status} />
      </div>

      {request.duplicateOfProjectId ? (
        <div className="flex items-center gap-2 rounded-2xl bg-[#F5A524]/15 px-4 py-3 text-sm font-semibold text-[#F5A524] ring-1 ring-[#F5A524]/25">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Coincidencia con proyecto existente
        </div>
      ) : null}

      <div className="mt-auto flex items-end justify-between gap-4 border-t border-[#3F3F46] pt-4">
        <p className="text-xs text-[#888888]">Ingresado: {formatDate(request.createdAt)}</p>
        <Button
          variant="outline"
          onClick={(e) => { e.stopPropagation(); onOpen(request.id); }}
        >
          Revisar
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
