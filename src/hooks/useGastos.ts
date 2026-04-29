import { useMemo } from "react";
import { ExpenseCategory, ProjectExpenseItem } from "@/types";

export interface GastosSummary {
  totalGastos: number;
  ganancia: number;
  porcentajeEjecutado: number;
  porCategoria: Record<ExpenseCategory, number>;
  totalPersonal: number;
}

export function useGastos(expenses: ProjectExpenseItem[], totalContratado: number): GastosSummary {
  return useMemo(() => {
    const totalGastos = expenses.reduce((sum, e) => sum + e.monto, 0);
    const ganancia = totalContratado - totalGastos;
    const porcentajeEjecutado = totalContratado > 0 ? (totalGastos / totalContratado) * 100 : 0;

    const porCategoria: Record<ExpenseCategory, number> = {
      material: 0, herramienta: 0, transporte: 0, servicio: 0,
      sueldo: 0, horas_extras: 0, viaticos: 0, bono: 0,
    };

    for (const e of expenses) {
      porCategoria[e.categoria] += e.monto;
    }

    const totalPersonal = porCategoria.sueldo + porCategoria.horas_extras + porCategoria.viaticos + porCategoria.bono;

    return { totalGastos, ganancia, porcentajeEjecutado, porCategoria, totalPersonal };
  }, [expenses, totalContratado]);
}
