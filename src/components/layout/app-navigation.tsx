import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutDashboard, FolderOpen, FileText, CalendarDays, Users, Activity, CircleCheck, TriangleAlert, Wallet, Bell, X, ChevronUp, LogIn, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { UserItem } from "@/types";

const icons = { notifications: Bell, home: LayoutDashboard, projects: FolderOpen, requests: FileText, calendar: CalendarDays, users: Users, activity: Activity, completed: CircleCheck, correction: TriangleAlert, money: Wallet };
export interface NavigationItem { key: string; label: string; active: boolean; onSelect: () => void; icon: keyof typeof icons; count?: number; }
interface Props { notificationsPanel?: ReactNode; collapsible?: boolean; open: boolean; onClose: () => void; items: NavigationItem[]; user: UserItem; accounts: UserItem[]; onAccountChange: (id: string) => void; onAddAccount: () => void; onLogout: () => void; }

export function AppNavigation({notificationsPanel, collapsible = false, open, onClose, items, user, accounts, onAccountChange, onAddAccount, onLogout}: Props): JSX.Element | null {
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 900px)").matches);
  const panel = useRef<HTMLElement>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverTimer = (): void => { if (hoverTimer.current) clearTimeout(hoverTimer.current); };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  useEffect(() => {
    const query = matchMedia("(max-width: 900px)");
    const update = (): void => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const elements = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, [tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); previous?.focus(); };
    // The effect follows the drawer lifecycle; handlers are refreshed on each open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mobile]);
  const autoExpand = collapsible && !mobile;
  const collapsed = autoExpand && !hovered && !keyboardFocused;
  useEffect(() => {
    if (collapsed || (mobile && !open)) { setAccountOpen(false); }
  }, [collapsed, mobile, open]);
  if (!open && !autoExpand) return null;
  const content = <aside ref={panel} id="app-navigation" className={`app-navigation${collapsible ? " app-navigation--engineer" : ""}${autoExpand ? " app-navigation--auto" : ""}${collapsed ? " app-navigation--collapsed" : ""}`} onPointerEnter={event => { cancelHoverTimer(); if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={() => { cancelHoverTimer(); hoverTimer.current = setTimeout(() => setHovered(false), 150); }} onPointerDown={() => setKeyboardFocused(false)} onFocus={event => { if (event.target.matches(":focus-visible")) setKeyboardFocused(true); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardFocused(false); }} role={mobile ? "dialog" : undefined} aria-modal={mobile ? true : undefined} aria-label="Navegación principal">
    {collapsible && <button type="button" className="app-navigation__brand" aria-label="ENERMAN, inicio" onClick={() => { items.find(item => item.key === "home")?.onSelect(); if (mobile) onClose(); }}><img src="/logo-wordmark-transparent.png" alt="ENERMAN" width={640} height={213} /></button>}
    <div className="app-navigation__heading"><span>ESPACIO DE TRABAJO</span>{mobile && <button type="button" className="shell-icon-button" aria-label="Cerrar navegación" onClick={onClose}><X size={22} /></button>}</div>
    <nav aria-label="Secciones de ENERMAN">{items.map(item => { const Icon = icons[item.icon]; return <Fragment key={item.key}>{collapsible && (item.key === "all" || item.key === "requests" || item.key === "notifications") && <p className="app-navigation__group">{item.key === "all" ? "Proyectos" : item.key === "requests" ? "Seguimiento" : "Actividad"}</p>}<button type="button" aria-label={item.count !== undefined ? `${item.label}, ${item.count}` : item.label} title={collapsed ? item.label : undefined} aria-current={item.active ? "page" : undefined} aria-expanded={item.key === "notifications" ? notificationsOpen : undefined} aria-controls={item.key === "notifications" ? "sidebar-notifications" : undefined} onClick={() => { if (item.key === "notifications" && notificationsPanel) { setNotificationsOpen(value => !value); } else { item.onSelect(); if(mobile) onClose(); } }}><Icon size={20} /><span>{item.label}</span>{item.count !== undefined && <b>{item.count}</b>}</button>{item.key === "notifications" && notificationsOpen && !collapsed && <div id="sidebar-notifications" className="app-navigation__notifications">{notificationsPanel}</div>}</Fragment>; })}</nav>
    <div className="app-navigation__account">
      <p className="app-navigation__heading app-navigation__profile-label">PERFIL</p>
      {accountOpen && <div className="app-navigation__account-menu" aria-label="Opciones de cuenta">{accounts.map(account => <button type="button" key={account.id} onClick={() => {setAccountOpen(false); onAccountChange(account.id);}}><Avatar initials={account.avatar} className="h-8 w-8" /><span>{account.name}</span></button>)}<button type="button" onClick={onAddAccount}><LogIn size={18} />Agregar cuenta</button><button type="button" onClick={onLogout}><LogOut size={18} />Cerrar sesión</button></div>}
      <button type="button" className="app-navigation__profile" title={collapsed ? user.name : undefined} aria-label={`Cuenta de ${user.name}`} aria-expanded={accountOpen} onClick={() => setAccountOpen(!accountOpen)} onKeyDown={event => {if(event.key === 'Escape')setAccountOpen(false);}}><Avatar initials={user.avatar} className="h-10 w-10" /><span><strong>{user.name}</strong><small>{user.roleLabel}</small></span><ChevronUp size={16} /></button>
    </div>
  </aside>;
  return mobile ? createPortal(<div className="app-navigation-overlay"><div className="app-navigation-backdrop" aria-hidden="true" onClick={onClose} />{content}</div>, document.body) : content;
}
