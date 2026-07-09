# Migration Log — Dark/Light Mode Token Migration
Sistema: ENERMAN/AMPR · Stack: React + Tailwind + CSS Variables

---

## PASO 1 — Fundación: `globals.css` + `tailwind.config.ts`

### Archivos modificados
- `src/styles/globals.css`
- `tailwind.config.ts`

### globals.css — cambios de color

| Color anterior | Nuevo | Token asignado | Notas |
|---|---|---|---|
| `--color-primary: #EAB308` | eliminado | — | Código muerto, sin referencias en componentes |
| `--color-dark: #1E1E20` | eliminado | — | Código muerto |
| `--color-surface: #27272A` | eliminado | — | Código muerto |
| `--color-muted: #313136` | eliminado | — | Código muerto |
| `--color-teal: #008C89` | eliminado | — | Código muerto |
| `--color-danger: #E24B4A` | eliminado | — | Código muerto |
| `--color-warning: #F5A524` | eliminado | — | Código muerto |
| `#3F3F46` (scrollbar) | `rgb(var(--border-default))` | `--border-default` | |
| `#52525B` (scrollbar:hover) | `rgb(var(--border-strong))` | `--border-strong` | |
| `#1E1E20` (body background-color) | `rgb(var(--bg-surface))` | `--bg-surface` | |
| `rgba(30, 30, 32, 0.90)` (.glass-panel) | `rgb(var(--bg-surface) / 0.90)` | `--bg-surface` | |
| `rgba(39, 39, 42, 0.88)` (.glass-card) | `rgb(var(--bg-surface-elevated) / 0.88)` | `--bg-surface-elevated` | |
| `border-l-[#3F3F46]` (.accent-low) | `border-l-border-default` | `--border-default` | Clase Tailwind, no hex inline |

**Agregados:** `:root` con los 16 tokens aprobados. Clase `.light` con overrides de modo claro.

### tailwind.config.ts — cambios de color

| Key | Valor anterior | Valor nuevo | Impacto inmediato |
|---|---|---|---|
| `success` | `"#2DBE7A"` | `rgb(var(--success) / <alpha-value>)` | Todos los `bg-success`, `text-success` existentes cambian de #2DBE7A → #4ADE80 en dark mode |
| `danger` | `"#E24B4A"` | `rgb(var(--danger) / <alpha-value>)` | Todos los `bg-danger`, `text-danger`, `bg-danger/10` existentes cambian de #E24B4A → #F87171 en dark mode |

**Nuevas keys agregadas:**
`bg-base`, `surface`, `surface-elevated`, `bg-input`, `border-default`, `border-strong`,
`ink-primary`, `ink-secondary`, `ink-tertiary`, `ink-muted`,
`brand`, `brand-fg`, `success-fg`, `info`, `info-fg`, `danger-fg`

### ⚠️ Bug encontrado y corregido (2026-07-09): colisión `text-secondary` vs `secondary`

Las keys de texto adaptativo se agregaron originalmente como `text-primary`/`text-secondary`/
`text-tertiary`/`text-muted`. Esto **colisiona** con las keys fijas preexistentes `primary`,
`secondary` (teal `#008C89`) y `muted` — Tailwind genera `text-secondary` a partir de AMBAS keys,
y la key `secondary` (fija) siempre gana. Resultado: ~43 usos de `text-secondary` en toda la app,
pensados para texto gris adaptativo, en realidad renderizaban teal `#008C89` — un bug invisible sin
un toggle de modo claro para contrastar.

**Fix:** las 4 keys nuevas se renombraron con prefijo `ink-` (`ink-primary`, `ink-secondary`,
`ink-tertiary`, `ink-muted`) para eliminar cualquier colisión posible. Se corrigieron los ~43 usos
rotos (`text-secondary` → `text-ink-secondary`) en `App.tsx`, `admin-view.tsx`, `admin-review-card.tsx`,
`project-card.tsx`, `project-calendar.tsx`, `project-detail-dialog.tsx`, `top-bar.tsx`,
`engineer-view.tsx`, `supervisor-view.tsx`. Los usos legítimos de `text-secondary` (teal intencional —
prioridad media, estados "en proceso"/"enviada", tarjetas "Proyectos activos", tipo de fecha
"compromiso" en el calendario) se dejaron sin tocar.

**Lección para los lotes siguientes:** cualquier clase con el patrón `bg-text-*`/`text-text-*` era
síntoma del mismo problema (prefijo "text-" duplicado por error). Ya no debería volver a pasar
porque las keys ahora se llaman `ink-*`, sin overlap con ningún nombre de marca existente.

### ⚠️ Impacto colateral de danger/success en tailwind.config

Cambiar `danger` y `success` en tailwind.config afecta inmediatamente componentes que aún
no han sido migrados formalmente, porque ya usan `bg-danger`, `text-danger` como clases:

**Archivos afectados por el cambio de `danger` (#E24B4A → #F87171):**
- `src/App.tsx` — `text-danger`, `border-danger/25`, `bg-danger/10`
- `src/features/supervisor/supervisor-view.tsx` — `bg-danger/15 text-danger`
- `src/components/gastos/GastosProyecto.tsx` — `border-danger/30`, `hover:bg-danger/10`
- `src/components/dialogs/correction-request-dialog.tsx` — (no usa danger directamente)
- `src/components/layout/top-bar.tsx` — `bg-danger`, `text-danger`, `hover:bg-danger/10`
- `src/features/engineer/engineer-view.tsx` — `border-danger/15`, `bg-danger/5`, `text-danger`
- `src/components/cards/admin-review-card.tsx` — `bg-danger/15`, `text-danger`, `ring-danger/20`
- `src/components/dialogs/project-detail-dialog.tsx` — `text-danger`, `bg-danger/10`
- `src/styles/globals.css` — `.accent-critical { border-l-danger }` → ✓ (ya migrado arriba)

**Verificación semántica danger:** Todos los usos de `danger`/`#E24B4A` encontrados
son semánticamente "error/rechazado/peligro" — ninguno es uso decorativo sin relación.
El cambio de color (#E24B4A → #F87171) es correcto: mismo rol, mejor WCAG.

**Archivos afectados por el cambio de `success` (#2DBE7A → #4ADE80):**
- `src/components/dialogs/request-detail-dialog.tsx` — `bg-success/10 text-success`

### Verificación funcional
- Build: ✅ sin errores ni warnings
- CSS generado: `var(--danger)` aparece 31×, `var(--success)` 3×, `var(--border-default)` 3× → tokens activos en output
- Modo oscuro: visual idéntico al anterior para elementos que no usan `danger`/`success` como clase. Los que sí los usan muestran el nuevo color (#F87171 rojo más claro, #4ADE80 verde más claro) — esto es el cambio intencional para cumplir WCAG.
- Modo claro: no hay toggle aún, la clase `.light` está lista pero inactiva.

### Lógica condicional tocada
Ninguna. Este paso es solo CSS/config.

### Notas para pasos futuros
- `body` aún tiene `@apply bg-background` (genera bg-color: #111111) que es sobreescrito por
  `rgb(var(--bg-surface))`. Hay redundancia menor — no tocar hasta el refactor de globals.
- `.glass-panel` y `.glass-card` usan `border-white/[0.07]` y `border-white/[0.06]` — colores
  hardcodeados que serán revisados en paso 7 (components/common/) cuando aplique.
- `warning: "#F5A524"` permanece como hex fijo (no tiene un token --warning en la propuesta
  aprobada). Si en el futuro se agrega modo claro para warning, requerirá su propio token.

---

## PASO 2 — En progreso: priority-badge.tsx → status-badge.tsx → admin-review-card.tsx

_(pendiente)_
