import { createPortal } from "react-dom";
import { ActivityFeed } from "./activity-feed";
import { useEffect, useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { AppHeader } from "./app-header";
import { AppNavigation, type NavigationItem } from "./app-navigation";
import { ThemeToggle } from "./theme-toggle";
import { AmperLogo } from "@/components/ui/amper-logo";
import type { NotificationItem, ProjectItem, UserItem } from "@/types";
interface TopBarProps {
  navigationItems?: NavigationItem[];
  currentPage?: string;
  onHome?: () => void;
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
  collapsibleSidebar?: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  unreadCount: number;
  notifications: NotificationItem[];
  projects: ProjectItem[];
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

export function TopBar({ notifications, projects, unreadCount, onMarkAllRead, onMarkRead, onDeleteNotification, onNavigateTo, onHome, onToggleSidebar, sidebarOpen = false, collapsibleSidebar = false, navigationItems = [], currentPage = "Inicio", searchQuery, onSearchChange, activeUser, accounts, onAccountChange, onAddAccount, onLogout }: TopBarProps): JSX.Element {
  const [activityTarget, setActivityTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setActivityTarget(document.getElementById("app-activity-feed")); }, [currentPage]);
  const [searchOpen, setSearchOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if(searchOpen) input.current?.focus(); }, [searchOpen]);
  const closeSearch = (): void => { setSearchOpen(false); trigger.current?.focus(); };
  return <>
    {activityTarget && createPortal(<ActivityFeed notifications={notifications} projects={projects} unreadCount={unreadCount} onMarkAllRead={onMarkAllRead} onMarkRead={onMarkRead} onDeleteNotification={onDeleteNotification} onNavigateTo={onNavigateTo} />, activityTarget)}
    <AppHeader chromeless={collapsibleSidebar}>
      <div className="app-header__brand">
        <button type="button" className={`shell-icon-button${collapsibleSidebar ? " engineer-menu-trigger" : ""}`} aria-label={sidebarOpen ? "Ocultar navegación" : "Mostrar navegación"} aria-expanded={sidebarOpen} aria-controls="app-navigation" onClick={onToggleSidebar}><Menu size={22} /></button>
        <AmperLogo onClick={() => { onHome?.(); window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }} />
        <span className="app-header__page" aria-live="polite">{currentPage}</span>
      </div>
      <form className="app-header__search" role="search" onSubmit={event => event.preventDefault()}><Search size={19} /><input aria-label="Buscar folio, cliente o descripción" value={searchQuery} onChange={event => onSearchChange(event.target.value)} placeholder="Buscar folio, cliente o descripción..." /></form>
      <div className="app-header__actions"><button ref={trigger} className="shell-icon-button app-header__search-trigger" type="button" aria-label="Abrir buscador" aria-expanded={searchOpen} aria-controls="mobile-search" onClick={() => setSearchOpen(!searchOpen)}><Search size={21} /></button>{!collapsibleSidebar && <ThemeToggle />}</div>
      {searchOpen && <form id="mobile-search" role="search" className="app-header__mobile-search" onSubmit={event => {event.preventDefault(); closeSearch();}} onKeyDown={event => {if(event.key === 'Escape') closeSearch();}}><Search size={18} /><input ref={input} aria-label="Buscar en ENERMAN" value={searchQuery} onChange={event => onSearchChange(event.target.value)} placeholder="Buscar en ENERMAN" /><button type="button" className="shell-icon-button" aria-label="Cerrar buscador" onClick={closeSearch}><X size={20} /></button></form>}
    </AppHeader>
    <AppNavigation notificationsPanel={collapsibleSidebar ? <ActivityFeed notifications={notifications} projects={projects} unreadCount={unreadCount} onMarkAllRead={onMarkAllRead} onMarkRead={onMarkRead} onDeleteNotification={onDeleteNotification} onNavigateTo={onNavigateTo} /> : undefined} collapsible={collapsibleSidebar} open={sidebarOpen} onClose={() => onToggleSidebar?.()} items={navigationItems} user={activeUser} accounts={accounts} onAccountChange={onAccountChange} onAddAccount={onAddAccount} onLogout={onLogout} />
  </>;
}
