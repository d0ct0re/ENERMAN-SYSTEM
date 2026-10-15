import type { ReactNode } from "react";
import "./app-header.css";
export function AppHeader({ children, chromeless = false }: { children: ReactNode; chromeless?: boolean }): JSX.Element {
  if (chromeless) return <div className="app-header engineer-toolbar">{children}</div>;
  return <header className="app-header">{children}</header>;
}
