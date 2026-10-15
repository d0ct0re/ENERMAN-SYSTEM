import { useState } from "react";

export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const label = theme === "dark" ? "Activar modo claro cálido" : "Activar modo oscuro";
  return <button type="button" className="shell-icon-button theme-toggle" aria-label={label} title={label} onClick={() => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next === "light" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("enerman-theme", next); } catch { /* Session preference still works when storage is unavailable. */ }
  }}><span>{theme === "dark" ? "Claro" : "Oscuro"}</span></button>;
}
