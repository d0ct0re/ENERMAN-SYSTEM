import type { ReactNode } from "react";
import "./app-header.css";
export function AppHeader({ children }: { children: ReactNode }): JSX.Element {
  return <header className="app-header">{children}</header>;
}
