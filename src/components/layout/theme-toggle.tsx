import { SunMoon } from "lucide-react";
import { useState } from "react";

export function ThemeToggle({ sidebar = false }: { sidebar?: boolean }): JSX.Element {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const label = theme === "dark" ? "Activar modo claro cálido" : "Activar modo oscuro";
  return <button type="button" className={`shell-icon-button theme-toggle${sidebar ? " theme-toggle--sidebar" : ""}`} aria-label={label} title={label} onClick={() => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next === "light" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("enerman-theme", next); } catch { /* Session preference still works when storage is unavailable. */ }
  }}>{sidebar && <SunMoon size={18} />}<span>{theme === "dark" ? "Claro" : "Oscuro"}</span></button>;
}
