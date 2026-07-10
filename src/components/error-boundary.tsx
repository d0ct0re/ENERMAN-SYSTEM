import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ENERMAN] Error crítico:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh", background: "rgb(var(--bg-base))", color: "rgb(var(--text-primary))",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "2rem", fontFamily: "sans-serif",
      }}>
        <div style={{
          maxWidth: 520, width: "100%", background: "rgb(var(--bg-surface))",
          border: "1px solid rgb(var(--danger) / 0.25)", borderRadius: 20, padding: "2rem",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ margin: "0 0 8px", fontSize: 22, color: "rgb(var(--danger))" }}>
            Error en la aplicación
          </h1>
          <p style={{ margin: "0 0 16px", color: "rgb(var(--text-secondary))", fontSize: 14 }}>
            Ocurrió un error inesperado. Intenta recargar la página.
          </p>
          <pre style={{
            background: "rgb(var(--bg-base))", border: "1px solid rgb(var(--bg-surface-elevated))",
            borderRadius: 10, padding: "12px 16px", fontSize: 12,
            color: "rgb(var(--danger))", whiteSpace: "pre-wrap", wordBreak: "break-all",
            marginBottom: 20, maxHeight: 200, overflowY: "auto",
          }}>
            {error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "rgb(var(--info))", color: "rgb(var(--info-fg))", border: "none",
              borderRadius: 10, padding: "10px 24px", fontSize: 14,
              fontWeight: 700, cursor: "pointer", width: "100%",
            }}
          >
            Recargar página
          </button>
        </div>
        <p style={{ marginTop: 16, fontSize: 12, color: "rgb(var(--text-tertiary))" }}>
          ENERMAN · {new Date().toLocaleString("es-MX")}
        </p>
      </div>
    );
  }
}
