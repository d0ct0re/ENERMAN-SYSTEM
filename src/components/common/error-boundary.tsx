import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Ultimo colchon: si cualquier dato con forma inesperada tumba el render en
// cualquier parte del arbol, esto evita que TODA la app se quede en blanco.
// Muestra el error en pantalla para que se pueda diagnosticar desde una sola
// captura, sin depender de que alguien abra la consola del navegador.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#111111] px-6 text-center">
        <div className="rounded-full bg-danger/10 p-4 ring-1 ring-danger/20">
          <AlertTriangle className="h-8 w-8 text-danger" />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-bold text-foreground">Algo salió mal en esta pantalla</h1>
          <p className="max-w-md text-sm text-[#888888]">
            El resto del sistema sigue funcionando — recarga la página para continuar.
            Si vuelve a pasar, manda esta captura completa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-[#111111] transition hover:bg-accent/90"
        >
          <RefreshCw className="h-4 w-4" />
          Recargar página
        </button>
        <p className="max-w-lg break-words rounded-xl bg-[#1E1E20] px-4 py-3 font-mono text-xs text-[#71717A]">
          {error.message || String(error)}
        </p>
      </div>
    );
  }
}
