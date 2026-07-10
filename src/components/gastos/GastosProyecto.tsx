import { useState } from "react";
import { ChevronLeft, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExpenseCategory, ExpenseType, ProjectExpenseItem } from "@/types";
import { useGastos } from "@/hooks/useGastos";
import { formatDate } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

interface CatDef {
  value: ExpenseCategory;
  label: string;
  tw: string;
  bar: string;
  tipo: ExpenseType;
}

const CATS: CatDef[] = [
  { value: "material",     label: "Material",     tw: "bg-blue-900/40 text-blue-400",       bar: "bg-blue-500",    tipo: "material" },
  { value: "herramienta",  label: "Herramienta",  tw: "bg-teal-900/40 text-teal-400",       bar: "bg-teal-500",    tipo: "material" },
  { value: "transporte",   label: "Transporte",   tw: "bg-amber-900/40 text-amber-400",     bar: "bg-amber-500",   tipo: "material" },
  { value: "servicio",     label: "Servicio",     tw: "bg-violet-900/40 text-violet-400",   bar: "bg-violet-500",  tipo: "material" },
  { value: "sueldo",       label: "Sueldo",       tw: "bg-emerald-900/40 text-emerald-400", bar: "bg-emerald-500", tipo: "personal" },
  { value: "horas_extras", label: "Horas extras", tw: "bg-orange-900/40 text-orange-400",   bar: "bg-orange-500",  tipo: "personal" },
  { value: "viaticos",     label: "Viáticos",     tw: "bg-sky-900/40 text-sky-400",         bar: "bg-sky-500",     tipo: "personal" },
  { value: "bono",         label: "Bono",         tw: "bg-pink-900/40 text-pink-400",       bar: "bg-pink-500",    tipo: "personal" },
];

const CATS_MATERIAL = CATS.filter((c) => c.tipo === "material");
const CATS_PERSONAL = CATS.filter((c) => c.tipo === "personal");

const defaultForm = {
  step: 1 as 1 | 2,
  tipo: "material" as ExpenseType,
  titulo: "",
  descripcion: "",
  monto: "",
  categoria: "material" as ExpenseCategory,
  fecha: new Date().toISOString().slice(0, 10),
};

interface GastosProyectoProps {
  expenses: ProjectExpenseItem[];
  totalContratado: number;
  canAdd: boolean;
  canDelete: boolean;
  canEditBudget: boolean;
  onAddExpense: (expense: Omit<ProjectExpenseItem, "id" | "createdAt" | "creadoPor">) => void;
  onDeleteExpense: (expenseId: string) => void;
  onUpdateBudget: (amount: number) => void;
}

export function GastosProyecto({
  expenses,
  totalContratado,
  canAdd,
  canDelete,
  canEditBudget,
  onAddExpense,
  onDeleteExpense,
  onUpdateBudget,
}: GastosProyectoProps): JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { totalGastos, porcentajeEjecutado, porCategoria } = useGastos(expenses, totalContratado);

  const pct = Math.min(porcentajeEjecutado, 100);
  const restante = totalContratado - totalGastos;
  const isExceeded = porcentajeEjecutado >= 100;
  const isCritical = porcentajeEjecutado >= 90 && !isExceeded;
  const isWarning = porcentajeEjecutado >= 70 && !isCritical && !isExceeded;

  const heroGradient = isExceeded
    ? "from-danger/10 to-danger/40 border border-danger/30"
    : isCritical
    ? "from-danger/10 to-danger/30 border border-danger/25"
    : isWarning
    ? "from-brand/10 to-brand/25 border border-brand/30"
    : "from-surface-elevated via-surface-elevated to-surface border border-accent/25 shadow-glow-gold";

  const mainBarColor = isExceeded
    ? "bg-red-700"
    : isCritical
    ? "bg-red-500"
    : isWarning
    ? "bg-amber-500"
    : "bg-accent";

  const restanteColor = isExceeded || isCritical
    ? "text-red-300 font-semibold"
    : isWarning
    ? "text-amber-300 font-semibold"
    : "text-accent font-semibold";

  const getCatBarColor = (catValue: ExpenseCategory, defaultBar: string): string => {
    if (isExceeded) return "bg-red-500";
    if (totalContratado > 0 && porCategoria[catValue] / totalContratado > 0.8) return "bg-amber-500";
    return defaultBar;
  };

  const openSheet = (): void => {
    setForm(defaultForm);
    setSheetOpen(true);
  };

  const closeSheet = (): void => {
    setSheetOpen(false);
    setForm(defaultForm);
  };

  const selectTipo = (tipo: ExpenseType): void => {
    const firstCat: ExpenseCategory = tipo === "material" ? "material" : "sueldo";
    setForm((f) => ({ ...f, tipo, categoria: firstCat, step: 2 }));
  };

  const handleSubmit = (): void => {
    if (!form.titulo.trim() || !form.monto || Number(form.monto) <= 0) return;
    onAddExpense({
      tipo: form.tipo,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      monto: Number(form.monto),
      categoria: form.categoria,
      fecha: form.fecha,
      imagenes: [],
    });
    closeSheet();
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation();
    setRemovingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      onDeleteExpense(id);
    }, 200);
  };

  const handleSaveBudget = (): void => {
    const amount = Number(budgetInput);
    if (!Number.isNaN(amount) && amount >= 0) onUpdateBudget(amount);
    setEditingBudget(false);
  };

  const activeCats = form.tipo === "material" ? CATS_MATERIAL : CATS_PERSONAL;

  return (
    <div className="mt-5 space-y-4 pb-20">

      {/* Hero card */}
      <div className={`rounded-[28px] bg-gradient-to-br p-5 text-white transition-all duration-500 ${heroGradient}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">Presupuesto del proyecto</p>
            {editingBudget ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="h-10 w-40 border-white/40 bg-white/20 text-lg font-bold text-white placeholder:text-white/50 focus:border-white/60 focus:ring-white/10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveBudget();
                    if (e.key === "Escape") setEditingBudget(false);
                  }}
                />
                <Button size="sm" onClick={handleSaveBudget} className="bg-accent text-brand-fg hover:bg-accent/90">
                  Guardar
                </Button>
                <button
                  type="button"
                  onClick={() => setEditingBudget(false)}
                  className="rounded-full p-1 opacity-70 hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="mt-2 text-2xl font-bold">
                {totalContratado > 0 ? fmt(totalContratado) : "Sin definir"}
              </p>
            )}
          </div>
          {canEditBudget && !editingBudget ? (
            <button
              type="button"
              onClick={() => {
                setBudgetInput(totalContratado > 0 ? String(totalContratado) : "");
                setEditingBudget(true);
              }}
              className="mt-1 rounded-full p-2 opacity-60 transition hover:bg-white/15 hover:opacity-100"
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {totalContratado > 0 ? (
          <>
            <div className="mt-4 h-2 rounded-full bg-white/20">
              <div
                className={`h-full rounded-full transition-all duration-500 ${mainBarColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs opacity-80">
                {fmt(totalGastos)} en costos de {fmt(totalContratado)}
                {" · "}
                <span className={restanteColor}>
                  {restante >= 0 ? fmt(restante) : `-${fmt(Math.abs(restante))}`} restantes
                </span>
              </p>
              {isExceeded ? (
                <span className="rounded-full bg-red-400/30 px-2.5 py-0.5 text-xs font-bold text-red-200">
                  Presupuesto excedido
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="mt-3 text-xs opacity-80">{fmt(totalGastos)} registrados</p>
        )}
      </div>

      {/* Category breakdown */}
      {expenses.length > 0 ? (
        <div className="space-y-3 rounded-[24px] border border-border-default bg-surface-elevated p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Desglose por categoría</p>
          {CATS.map((cat) => {
            const amount = porCategoria[cat.value];
            if (amount === 0) return null;
            const catPct = totalGastos > 0 ? (amount / totalGastos) * 100 : 0;
            const barColor = getCatBarColor(cat.value, cat.bar);
            return (
              <div key={cat.value} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cat.tw}`}>{cat.label}</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {fmt(amount)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">({catPct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-border-default">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${catPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Expense list */}
      {expenses.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-border-default bg-surface-elevated/50 p-8 text-center text-sm text-muted-foreground">
          No hay costos registrados en este proyecto.
        </div>
      ) : (
        <div className="space-y-3">
          {[...expenses].reverse().map((expense) => {
            const cat = CATS.find((c) => c.value === expense.categoria);
            const isRemoving = removingIds.has(expense.id);
            return (
              <div
                key={expense.id}
                className={`space-y-2 rounded-[24px] border border-border-default bg-surface-elevated p-4 transition-all duration-200 ${
                  isRemoving ? "opacity-0 -translate-y-2 scale-95" : "opacity-100 translate-y-0 scale-100"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{expense.titulo}</p>
                      {cat ? (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cat.tw}`}>{cat.label}</span>
                      ) : null}
                    </div>
                    {expense.descripcion ? (
                      <p className="text-sm text-muted-foreground">{expense.descripcion}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{formatDate(expense.fecha)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <p className="font-bold text-foreground tabular-nums">{fmt(expense.monto)}</p>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(e, expense.id)}
                        className="rounded-full p-1.5 text-muted-foreground transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                {expense.imagenes.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {expense.imagenes.map((img) => (
                      <button
                        key={img}
                        type="button"
                        onClick={() => setLightbox(img)}
                        className="flex items-center gap-1.5 rounded-xl bg-border-default px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-border-strong hover:text-foreground"
                      >
                        <Paperclip className="h-3 w-3" />{img}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      {canAdd ? (
        <button
          type="button"
          onClick={openSheet}
          className="fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-brand-fg shadow-glow-gold transition-transform hover:bg-accent/90 active:scale-95"
        >
          <Plus className="h-7 w-7" />
        </button>
      ) : null}

      {/* Bottom sheet */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-[150] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/70" onClick={closeSheet} />
          <div className="relative z-10 max-h-[85vh] overflow-y-auto rounded-t-[32px] border border-border-default border-b-0 bg-surface-elevated px-5 pb-8 pt-5 shadow-panel">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border-strong" />
            <div className="mb-5 flex items-center justify-between">
              {form.step === 2 ? (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, step: 1 }))}
                  className="flex items-center gap-1 text-sm font-semibold text-accent"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Tipo
                </button>
              ) : (
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Nuevo costo</p>
              )}
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-full p-1.5 transition hover:bg-border-default"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {form.step === 1 ? (
              <div className="space-y-3">
                <p className="mb-4 text-base font-semibold text-foreground">¿Qué tipo de costo quieres registrar?</p>
                <button
                  type="button"
                  onClick={() => selectTipo("material")}
                  className="w-full rounded-[20px] border-2 border-accent/20 bg-accent/5 p-5 text-left transition hover:border-accent/40 hover:bg-accent/10"
                >
                  <p className="font-bold text-foreground">Material / Servicio</p>
                  <p className="mt-1 text-sm text-muted-foreground">Compras, herramientas, transporte, servicios externos</p>
                </button>
                <button
                  type="button"
                  onClick={() => selectTipo("personal")}
                  className="w-full rounded-[20px] border-2 border-secondary/20 bg-secondary/5 p-5 text-left transition hover:border-secondary/40 hover:bg-secondary/10"
                >
                  <p className="font-bold text-foreground">Personal</p>
                  <p className="mt-1 text-sm text-muted-foreground">Sueldos, horas extras, viáticos, bonos</p>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Título del costo"
                    value={form.titulo}
                    onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  />
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as ExpenseCategory }))}
                    className="h-12 w-full rounded-2xl border border-border-default bg-muted px-4 text-sm font-semibold text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                  >
                    {activeCats.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="number"
                    placeholder="Monto (MXN sin IVA)"
                    value={form.monto}
                    onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                  />
                  <Input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                  />
                </div>
                <Textarea
                  placeholder="Descripción (opcional)"
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className="min-h-[80px]"
                />
                <Button
                  variant="accent"
                  onClick={handleSubmit}
                  disabled={!form.titulo.trim() || !form.monto || Number(form.monto) <= 0}
                  className="w-full"
                >
                  Guardar costo
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Lightbox */}
      {lightbox ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative w-full max-w-md rounded-3xl border border-border-default bg-surface-elevated p-6 shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute right-4 top-4 rounded-full bg-border-default p-1.5 text-muted-foreground transition hover:bg-border-strong hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Comprobante</p>
            <div className="flex h-52 items-center justify-center rounded-2xl border border-dashed border-border-default bg-muted">
              <div className="space-y-2 text-center">
                <p className="text-3xl">📄</p>
                <p className="text-sm font-semibold text-foreground">{lightbox}</p>
                <p className="text-xs text-muted-foreground">Vista previa disponible al conectar almacenamiento</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
