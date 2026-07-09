import { Bell, ChevronDown, LogIn, LogOut, Menu, Search, Trash2, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { AmperLogo } from "@/components/ui/amper-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NotificationItem, UserItem } from "@/types";

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

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  unreadCount: number;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onMarkRead?: (id: string) => void;
  onDeleteNotification: (id: string) => void;
  onNavigateTo: (projectId?: string, requestId?: string) => void;
  activeUser: UserItem;
  accounts: UserItem[];
  onAccountChange: (userId: string) => void;
  onAddAccount: () => void;
  onLogout: () => void;
}

export function TopBar({
  searchQuery,
  onSearchChange,
  unreadCount,
  notifications,
  onMarkAllRead,
  onMarkRead,
  onDeleteNotification,
  onNavigateTo,
  activeUser,
  accounts,
  onAccountChange,
  onAddAccount,
  onLogout,
}: TopBarProps): JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [isHiddenOnMobile, setIsHiddenOnMobile] = useState(false);
  const lastScrollYRef = useRef(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const handleAccountChange = (userId: string): void => {
    onAccountChange(userId);
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const handleScroll = (): void => {
      if (window.innerWidth >= 1024 || mobileMenuOpen || accountMenuOpen) {
        setIsHiddenOnMobile(false);
        lastScrollYRef.current = window.scrollY;
        return;
      }
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollYRef.current;
      if (currentScrollY < 80) setIsHiddenOnMobile(false);
      else if (scrollDelta > 8) setIsHiddenOnMobile(true);
      else if (scrollDelta < -6) setIsHiddenOnMobile(false);
      lastScrollYRef.current = currentScrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [accountMenuOpen, mobileMenuOpen]);

  const NotifDropdown = (): JSX.Element => (
    <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-96 rounded-[24px] border border-border-default bg-surface shadow-panel">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <p className="text-sm font-bold text-foreground">Notificaciones</p>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => { onMarkAllRead(); setNotifOpen(false); }}
            className="text-xs font-semibold text-accent hover:underline"
          >
            Marcar todas como leídas
          </button>
        ) : null}
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#555555]">Sin notificaciones</p>
        ) : (
          notifications.slice(0, 30).map((n) => (
            <div
              key={n.id}
              className={cn(
                "group flex w-full gap-3 px-4 py-3 transition hover:bg-surface-elevated",
                !n.isRead && "bg-accent/[0.04]",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  onNavigateTo(n.relatedProjectId, n.relatedRequestId);
                  onMarkRead?.(n.id);
                  setNotifOpen(false);
                }}
                className="flex min-w-0 flex-1 gap-3 text-left"
              >
                <span className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  n.isRead ? "bg-border-default" : "bg-accent",
                )} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", !n.isRead ? "font-semibold text-foreground" : "font-medium text-ink-secondary")}>
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">{n.description}</span>
                  <span className="mt-1 block text-[11px] text-[#52525B]">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteNotification(n.id)}
                className="ml-1 shrink-0 self-start rounded-full p-1 text-[#52525B] opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                aria-label="Eliminar notificación"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <header
      className={cn(
        "glass-panel sticky top-4 z-40 rounded-[30px] px-4 py-3.5 shadow-panel transition-transform duration-300 ease-out sm:px-6",
        isHiddenOnMobile ? "-translate-y-[calc(100%+1.5rem)] lg:translate-y-0" : "translate-y-0",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <AmperLogo onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
          <div className="hidden lg:block">
            <p className="text-xs font-medium leading-relaxed text-muted-foreground">
              Gestión centralizada de proyectos, pagos y solicitudes eléctricas
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <div className="hidden items-center gap-3 lg:flex">
          <div className="relative w-[300px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar folio, cliente o descripción…"
              className="pl-11"
            />
          </div>

          {/* Campana con dropdown */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => { setNotifOpen((p) => !p); setAccountMenuOpen(false); }}
              className="relative cursor-pointer rounded-full border border-border-default bg-surface-elevated p-3 text-muted-foreground shadow-soft transition hover:border-accent/30 hover:bg-accent/5 hover:text-accent"
              aria-label="Notificaciones"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>
            {notifOpen ? <NotifDropdown /> : null}
          </div>

          {/* Menú de cuenta */}
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => { setAccountMenuOpen((p) => !p); setNotifOpen(false); }}
              className="flex cursor-pointer items-center gap-3 rounded-full border border-border-default bg-surface-elevated px-3 py-2 shadow-soft transition hover:border-accent/20 hover:bg-muted"
            >
              <Avatar initials={activeUser.avatar} className="h-10 w-10 text-xs" />
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">{activeUser.name}</p>
                <p className="text-xs text-muted-foreground">{activeUser.roleLabel}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>

            {accountMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-80 rounded-[24px] border border-border-default bg-surface-elevated p-3 shadow-panel">
                <div className="mb-2 flex items-center gap-2 px-2 py-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  <UsersRound className="h-4 w-4" />
                  Cambiar cuenta
                </div>
                <div className="space-y-1">
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleAccountChange(account.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left transition",
                        account.id === activeUser.id
                          ? "bg-border-default text-foreground"
                          : "hover:bg-muted text-[#BCBCBC] hover:text-foreground",
                      )}
                    >
                      <Avatar initials={account.avatar} className="h-9 w-9 text-xs" />
                      <span>
                        <span className="block text-sm font-semibold">{account.name}</span>
                        <span className="block text-xs text-muted-foreground">{account.roleLabel}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { setAccountMenuOpen(false); onAddAccount(); }}
                  className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
                >
                  <LogIn className="h-4 w-4" />
                  Agregar cuenta
                </button>
                <button
                  type="button"
                  onClick={() => { setAccountMenuOpen(false); onLogout(); }}
                  className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold text-danger transition hover:bg-danger/10"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileMenuOpen((p) => !p)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen ? (
        <div className="mt-4 space-y-4 border-t border-border-default pt-4 lg:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar en ENERMAN-SYSTEM"
              className="pl-11"
            />
          </div>

          <div className="rounded-2xl border border-border-default bg-surface-elevated p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar initials={activeUser.avatar} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{activeUser.name}</p>
                  <p className="text-xs text-muted-foreground">{activeUser.roleLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setNotifOpen((p) => !p); setMobileMenuOpen(false); }}
                className="flex cursor-pointer items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent/10 hover:text-accent"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? unreadCount : ""}
              </button>
            </div>
            <div className="space-y-1 border-t border-border-default pt-3">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => handleAccountChange(account.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left transition",
                    account.id === activeUser.id ? "bg-border-default" : "hover:bg-muted",
                  )}
                >
                  <Avatar initials={account.avatar} className="h-9 w-9 text-xs" />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{account.name}</span>
                    <span className="block text-xs text-muted-foreground">{account.roleLabel}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); onAddAccount(); }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
              >
                <LogIn className="h-4 w-4" />
                Agregar cuenta
              </button>
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); onLogout(); }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold text-danger transition hover:bg-danger/10"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
