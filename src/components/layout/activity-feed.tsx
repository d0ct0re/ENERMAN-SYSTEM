import { Trash2 } from "lucide-react";
import { cn, getProjectSequence } from "@/lib/utils";
import type { NotificationItem, ProjectItem } from "@/types";
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Justo ahora";
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  return `Hace ${d}d`;
}


interface Props { notifications: NotificationItem[]; projects: ProjectItem[]; unreadCount: number; onMarkAllRead: () => void; onMarkRead?: (id: string) => void; onDeleteNotification: (id: string) => void; onNavigateTo: (projectId?: string, requestId?: string) => void; }
export function ActivityFeed({notifications, projects, unreadCount, onMarkAllRead, onMarkRead, onDeleteNotification, onNavigateTo}: Props): JSX.Element { return (    <>
      <div className="flex items-center justify-between border-b border-[#3F3F46] px-4 py-3">
        <p className="text-sm font-bold text-foreground">Notificaciones</p>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => { onMarkAllRead();  }}
            className="min-h-11 text-xs font-semibold text-accent hover:underline"
          >
            Marcar todas como leídas
          </button>
        ) : null}
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#555555]">Sin notificaciones</p>
        ) : (
          notifications.slice(0, 30).map((n) => {
            const relatedProject = n.relatedProjectId ? projects.find((p) => p.id === n.relatedProjectId) : undefined;
            const folioValue = relatedProject ? getProjectSequence(relatedProject) : null;
            const folio = folioValue && folioValue !== "—" ? folioValue : null;
            return (
            <div
              key={n.id}
              className={cn(
                "group flex w-full gap-3 px-4 py-3 transition hover:bg-[#27272A]",
                !n.isRead && "bg-accent/[0.04]",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  onNavigateTo(n.relatedProjectId, n.relatedRequestId);
                  onMarkRead?.(n.id);

                }}
                className="flex min-w-0 flex-1 gap-3 text-left"
              >
                <span className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  n.isRead ? "bg-[#3F3F46]" : "bg-accent",
                )} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", !n.isRead ? "font-semibold text-foreground" : "font-medium text-[#A1A1AA]")}>
                    {folio ? (
                      <span className="mr-1.5 inline-flex items-center rounded-md bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-black text-accent align-middle">
                        #{folio}
                      </span>
                    ) : null}
                    {n.title}
                    {(n.occurrenceCount ?? 1) > 1 ? (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-[#3F3F46] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#A1A1AA] align-middle">
                        ×{n.occurrenceCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#71717A]">{n.description}</span>
                  <span className="mt-1 block text-[11px] text-[#52525B]">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteNotification(n.id)}
                className="ml-1 shrink-0 self-start rounded-full min-h-11 min-w-11 inline-flex items-center justify-center text-[#52525B] transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                aria-label="Eliminar notificación"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            );
          })
        )}
      </div>
    </>); }
