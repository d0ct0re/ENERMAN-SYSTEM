import { Bell, ChevronDown, LogIn, LogOut, Menu, Search, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { UserItem } from "@/types";

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  unreadCount: number;
  activeUser: UserItem;
  accounts: UserItem[];
  onAccountChange: (userId: string) => void;
  onAddAccount: () => void;
  onLogout: () => void;
  onNotificationsClick: () => void;
}

export function TopBar({
  searchQuery,
  onSearchChange,
  unreadCount,
  activeUser,
  accounts,
  onAccountChange,
  onAddAccount,
  onLogout,
  onNotificationsClick,
}: TopBarProps): JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isHiddenOnMobile, setIsHiddenOnMobile] = useState(false);
  const lastScrollYRef = useRef(0);

  const handleAccountChange = (userId: string): void => {
    onAccountChange(userId);
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const handleScroll = (): void => {
      if (window.innerWidth >= 1024 || mobileMenuOpen || accountMenuOpen) {
        setIsHiddenOnMobile(false);
        lastScrollYRef.current = window.scrollY;
        return;
      }

      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollYRef.current;

      if (currentScrollY < 80) {
        setIsHiddenOnMobile(false);
      } else if (scrollDelta > 8) {
        setIsHiddenOnMobile(true);
      } else if (scrollDelta < -6) {
        setIsHiddenOnMobile(false);
      }

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
          <img
            src="/amper-logo.jpeg"
            alt="AMPER"
            className="h-16 w-36 rounded-xl border border-accent/50 bg-black object-contain p-1.5 shadow-glow-gold"
            draggable={false}
          />
          <div className="hidden lg:block">
            <p className="text-xs font-medium leading-relaxed text-[#888888]">
              Gestión centralizada de proyectos, pagos y solicitudes eléctricas
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <div className="hidden items-center gap-3 lg:flex">
          <div className="relative w-[300px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888888]" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar folio, cliente o descripción…"
              className="pl-11"
            />
          </div>

          <button
            type="button"
            onClick={onNotificationsClick}
            className="relative cursor-pointer rounded-full border border-[#3F3F46] bg-[#27272A] p-3 text-[#888888] shadow-soft transition hover:border-accent/30 hover:bg-accent/5 hover:text-accent"
            aria-label="Notificaciones"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((current) => !current)}
              className="flex cursor-pointer items-center gap-3 rounded-full border border-[#3F3F46] bg-[#27272A] px-3 py-2 shadow-soft transition hover:border-accent/20 hover:bg-[#313136]"
            >
              <Avatar initials={activeUser.avatar} className="h-10 w-10 text-xs" />
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">{activeUser.name}</p>
                <p className="text-xs text-[#888888]">{activeUser.roleLabel}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-[#888888]" />
            </button>

            {accountMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-80 rounded-[24px] border border-[#3F3F46] bg-[#27272A] p-3 shadow-panel">
                <div className="mb-2 flex items-center gap-2 px-2 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#888888]">
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
                          ? "bg-[#3F3F46] text-foreground"
                          : "hover:bg-[#313136] text-[#BCBCBC] hover:text-foreground",
                      )}
                    >
                      <Avatar initials={account.avatar} className="h-9 w-9 text-xs" />
                      <span>
                        <span className="block text-sm font-semibold">{account.name}</span>
                        <span className="block text-xs text-[#888888]">{account.roleLabel}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onAddAccount();
                  }}
                  className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
                >
                  <LogIn className="h-4 w-4" />
                  Agregar cuenta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onLogout();
                  }}
                  className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold text-danger transition hover:bg-danger/10"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileMenuOpen((current) => !current)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {mobileMenuOpen ? (
        <div className="mt-4 space-y-4 border-t border-[#3F3F46] pt-4 lg:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888888]" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar en AMPER"
              className="pl-11"
            />
          </div>

          <div className="rounded-2xl border border-[#3F3F46] bg-[#27272A] p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar initials={activeUser.avatar} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{activeUser.name}</p>
                  <p className="text-xs text-[#888888]">{activeUser.roleLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onAddAccount();
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
              >
                <LogIn className="h-4 w-4" />
                Agregar cuenta
              </button>
              <button
                type="button"
                onClick={() => {
                  onNotificationsClick();
                  setMobileMenuOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-full bg-[#313136] px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent/10 hover:text-accent"
                aria-label="Ir a notificaciones"
              >
                <Bell className="h-4 w-4" />
                {unreadCount}
              </button>
            </div>
            <div className="space-y-1 border-t border-[#3F3F46] pt-3">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => handleAccountChange(account.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left transition",
                    account.id === activeUser.id ? "bg-[#3F3F46]" : "hover:bg-[#313136]",
                  )}
                >
                  <Avatar initials={account.avatar} className="h-9 w-9 text-xs" />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{account.name}</span>
                    <span className="block text-xs text-[#888888]">{account.roleLabel}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
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
