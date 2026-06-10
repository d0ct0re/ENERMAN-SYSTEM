# ANÁLISIS COMPLETO — ENERMAN-SYSTEM
> Fecha: 2026-04-28 | Versión: 0.1.0 | Estado: MVP ~70%

---

## 1. QUÉ ES EL SISTEMA

**Projectra** es una app interna para **ENERMAN SAS DE CV** (servicios de ingeniería eléctrica). Reemplaza un flujo manual que vive en:
- Excel de SharePoint (`Consecutivo de proyectos ENERMAN.xlsx`)
- Grupos de WhatsApp (Operativo y Administrativo por proyecto)
- Dropbox/SharePoint para documentos
- Correo/WhatsApp para seguimiento de facturas con contadora externa ("Mere")

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS (frontend) | PHP 7.4+ PDO + MySQL (backend) | Deploy en Hostinger

---

## 2. ARQUITECTURA ACTUAL

```
src/
├── App.tsx                  1,258 líneas — estado global, 29 handlers, 4 useEffect
├── types/index.ts             232 líneas — todas las interfaces TypeScript
├── features/
│   ├── engineer/              211 líneas — vista rol engineer
│   ├── admin/                 570 líneas — vista rol admin
│   └── supervisor/            146 líneas — vista rol supervisor
├── components/
│   ├── dialogs/
│   │   ├── project-detail-dialog.tsx   818 líneas — diálogo principal
│   │   ├── new-request-dialog.tsx      176 líneas
│   │   └── request-detail-dialog.tsx   172 líneas
│   ├── gastos/
│   │   └── GastosProyecto.tsx          467 líneas — módulo gastos completo
│   ├── common/
│   │   ├── project-calendar.tsx        308 líneas — calendario interactivo
│   │   └── status-badge.tsx            109 líneas
│   ├── cards/ (3 cards)
│   ├── layout/ (top-bar 275 líneas, section-title)
│   └── ui/ (button, card, dialog, input, textarea, tabs, avatar)
├── data/
│   ├── projects.ts            415 líneas — datos seed
│   ├── users.ts                84 líneas
│   ├── requests.ts
│   └── notifications.ts
└── lib/utils.ts                99 líneas

api/
└── index.php                  352 líneas — router REST PHP + MySQL

database/
└── schema.sql                  40 líneas — 5 tablas JSON payload
```

**BD:** 5 tablas (`app_users`, `projects`, `requests`, `notifications`, `project_messages`). Todas usan columna `payload JSON` — el frontend guarda/recupera el objeto completo.

**Persistencia:** API REST con `save_state` (guarda todo), debounce 450ms. Fallback a localStorage si la API no está disponible (config.php faltante en Hostinger).

---

## 3. MODELO DE DATOS — ESTADO ACTUAL (post Fase 1)

### Tipos completados ✅

```typescript
ProjectStatus (11 estados reales):
  en-concurso | en-programacion | in-progress | pendiente-aprobacion
  pendiente-autorizar | reasignado | cierre-por-sistema | comparativa
  no-autorizado | completed | cancelled

ProjectType (18 tipos reales con código corto):
  EMRG | BOMB | CANC | COMP | COMPR | ESTU | GUAR | ILUM
  INGE | INSP | INST | MNTC | MNTP | MEDI | OBRA | REMO | RENT | TERM

TipoPago (7 — modalidad contractual, NO estado de cobro):
  asignacion-directa | cancelado | comparativa | concurso
  concurso-ad | contrato | convenio

EstimacionStatus (6): Pendiente | Realizada | Cancelada | Comparativa | N/A | Sin información
CotizacionStatus (8): Pendiente | Realizada | Enviada | Revisión | Cancelada | Comparativa | N/A | Sin información

InvoiceStatus (6 — ciclo de vida de factura):
  solicitada → recibida → en-portal | enviada → pagada | cancelada

MDP: PUE | PPD
```

### Campos en ProjectItem (completos):
- `tipoPago`, `oc`, `facturarA`, `negociador`, `usuarioContacto`
- `estimacion`, `cotizacion`, `totalSinIva`
- `cotizacionSubcontratado`, `subtotalSubcontratado`
- `invoices: InvoiceItem[]`

### InvoiceItem (entidad nueva):
```typescript
{
  id, fechaSolicitud, factura, oc, subtotal, facturarA,
  promesaPago, status: InvoiceStatus, mdp: MDP,
  complementoPago, fechaPago, abonoAntesIva, createdAt, createdBy
}
```

---

## 4. ROLES Y USUARIOS SEED

| Email | Rol | Nombre |
|-------|-----|--------|
| amper.enerman@gmail.com | system_admin | Administrador Sistema |
| gerencia@enerman.com.mx | supervisor | Gerardo Tovar |
| administracion@enerman.com.mx | admin | Ariana Padilla |
| ventas@enerman.com.mx | admin | Adan Montoya |
| medicion@enerman.com.mx | engineer | Alan Sanchez |
| operacion@enerman.com.mx | engineer | Jesus Plata |

---

## 5. LO QUE ESTÁ HECHO ✅

| # | Feature | Archivo(s) |
|---|---------|-----------|
| 1 | 11 estados de trabajo reales (ProjectStatus) | types/index.ts |
| 2 | 18 tipos de proyecto con etiquetas | types/index.ts |
| 3 | TipoPago separado de PaymentStatus | types/index.ts |
| 4 | Campos nuevos en ProjectItem | types/index.ts |
| 5 | Entidad InvoiceItem completa | types/index.ts |
| 6 | Tab "Facturación" en ProjectDetailDialog | project-detail-dialog.tsx |
| 7 | handleAddInvoice + handleUpdateInvoice | App.tsx |
| 8 | Módulo de gastos (GastosProyecto) | GastosProyecto.tsx |
| 9 | Calendario de fechas importantes | project-calendar.tsx |
| 10 | Vista Admin con CRUD completo | admin-view.tsx |
| 11 | Vista Engineer con filtros | engineer-view.tsx |
| 12 | Vista Supervisor (read-only) | supervisor-view.tsx |
| 13 | API REST PHP + MySQL (5 tablas JSON) | api/index.php |
| 14 | Build producción exitoso | hostinger-deploy/ |

---

## 6. LO QUE FALTA — PENDIENTES POR FASE

### Fase 2 — UI de Facturación (SIGUIENTE)
- [ ] Checklist de pasos manuales por factura (envío a Mere, subida portal, etc.)
- [ ] Alerta visual: facturas atascadas en "Recibida" > X días
- [ ] Info de portales de pago por cliente visible en el tab:
  - ITESM/Tec → portal `https://pago-proveedores.tec.mx` | paga cada jueves (quincenal)
  - Prolec → portal propio | paga 30 días tras recepción
  - Cemex → sin portal | paga el 4 de cada mes
- [ ] Regla: `complementoPago = "N/A"` automático si `mdp = "PUE"`
- [ ] Regla: `fechaPago` solo editable cuando `status = "Pagada"`
- [ ] Regla: campo `factura` requerido para salir de `"Recibida"`

### Fase 3 — Vista de Cobranza (Admin)
- [ ] Tab "Cobros" en AdminView
- [ ] Semáforo visual por estado de factura
- [ ] Lista de facturas próximas a vencer (promesaPago)
- [ ] Alerta de facturas atascadas en "Recibida"
- [ ] Agrupado por cliente con totales

### Fase 4 — Archivos + Grupos de Coordinación
- [ ] Visualización de estructura de carpetas SharePoint por proyecto
- [ ] Registro de grupos WhatsApp por proyecto (Operativo, Administrativo)

### Pendiente Técnico Crítico
- [ ] Crear `api/config.php` en Hostinger con credenciales MySQL reales
  - La app actualmente trabaja en modo localStorage (no persiste en servidor)
  - El schema `database/schema.sql` ya está listo para importar en phpMyAdmin

---

## 7. REGLAS DE NEGOCIO CLAVE (documentadas en MAN-ADM-001 y MAN-ADM-004)

1. **TipoPago ≠ PaymentStatus**: TipoPago es la modalidad contractual (concurso, contrato, etc.). PaymentStatus es el estado de cobro (unpaid/partial/paid). Son dos campos independientes.
2. **Negociador**: solo aplica para proyectos Prolec. Para el resto = "N/A".
3. **OC**: si el cliente no usa Orden de Compra → "N/A".
4. **FacurarA**: razón social legal del cliente, puede diferir del nombre comercial del proyecto.
5. **Ciclo de factura**: solicitada → recibida → (en-portal | enviada) → pagada | cancelada
6. **complementoPago = "N/A"** automático cuando mdp = "PUE" (pago en una sola exhibición).
7. **Clientes con portal** (ITESM, Prolec) requieren subir XML+PDF al portal además de enviar a Mere.

---

## 8. PROMPT PARA CONTINUAR EN OTRO ENTORNO

Copia este prompt exacto para retomar el desarrollo desde el punto actual:

---

```
Eres un desarrollador senior trabajando en "Projectra", app interna para ENERMAN SAS DE CV 
(servicios de ingeniería eléctrica). El sistema reemplaza Excel + WhatsApp + Dropbox.

STACK: React 18 + TypeScript + Vite + Tailwind CSS (frontend-only, sin backend real aún).
Todo el estado vive en App.tsx con useState. El build usa Vite.

MODELO DE DATOS ACTUAL (post Fase 1 — ya implementado):
- ProjectStatus: 11 estados reales (en-concurso, en-programacion, in-progress, 
  pendiente-aprobacion, pendiente-autorizar, reasignado, cierre-por-sistema, 
  comparativa, no-autorizado, completed, cancelled)
- ProjectType: 18 tipos con código corto (EMRG, BOMB, CANC, COMP, COMPR, ESTU, 
  GUAR, ILUM, INGE, INSP, INST, MNTC, MNTP, MEDI, OBRA, REMO, RENT, TERM)
- TipoPago: 7 opciones de modalidad contractual (NO es el estado de cobro)
- InvoiceItem: entidad completa con InvoiceStatus (6 estados), MDP (PUE/PPD)
- EstimacionStatus (6), CotizacionStatus (8)
- Campos nuevos en ProjectItem: tipoPago, oc, facturarA, negociador, 
  usuarioContacto, estimacion, cotizacion, totalSinIva, 
  cotizacionSubcontratado, subtotalSubcontratado, invoices[]

ROLES: engineer | admin | supervisor | system_admin
ARCHIVOS PRINCIPALES:
- src/App.tsx (~1,258 líneas) — estado global, 29 handlers
- src/types/index.ts (232 líneas) — interfaces
- src/components/dialogs/project-detail-dialog.tsx (818 líneas)
- src/features/admin/admin-view.tsx (570 líneas)
- src/components/gastos/GastosProyecto.tsx (467 líneas)

SIGUIENTE TAREA (Fase 2 — UI de Facturación):
En project-detail-dialog.tsx, el tab "Facturación" existe pero es básico.
Necesito implementar:

1. CHECKLIST DE PASOS por cada factura según su status:
   - "Solicitada a Mere": checkbox "Enviado a Mere" (fecha de envío)
   - "Recibida": campo 'factura' requerido para avanzar de estado
   - "En portal": checkbox "XML subido", checkbox "PDF subido", campo "portal URL"
   - "Factura enviada": campo "enviada a" (email)

2. ALERTA VISUAL: si una factura lleva más de 7 días en status "Recibida" sin avanzar, 
   mostrar badge rojo "Atrasada X días" junto al número de factura.

3. INFO DE PORTALES DE PAGO (visible en el card de factura si el cliente tiene portal):
   - ITESM/Tec de Monterrey: paga cada jueves, quincenal. Portal: https://pago-proveedores.tec.mx
   - Prolec: paga 30 días tras recepción. Portal propio.
   - Cemex: NO tiene portal, paga el 4 de cada mes.
   Detectar el cliente por el campo project.client o project.facturarA.

4. REGLAS AUTOMÁTICAS:
   - Si mdp = "PUE", setear complementoPago = "N/A" automáticamente
   - fechaPago solo editable si status = "Pagada"
   - Campo 'factura' requerido para cambiar de "Recibida" a cualquier otro estado

RESTRICCIONES:
- No crear nuevas abstracciones si no son necesarias
- No agregar comentarios en el código salvo que el WHY sea no obvio
- No modificar la lógica de otros tabs del project-detail-dialog
- Mantener la consistencia visual con el resto del sistema (Tailwind, colores existentes)
- No tocar App.tsx salvo para agregar un handler nuevo si es estrictamente necesario

Dame la implementación completa de los cambios necesarios.
```

---

## 9. ESTADO DE DEPLOY (Hostinger)

| Ítem | Estado |
|------|--------|
| Frontend compilado (Vite build) | ✅ En `hostinger-deploy/assets/` |
| API PHP (`api/index.php`) | ✅ Presente |
| Schema SQL (`database/schema.sql`) | ✅ Listo para importar |
| `.htaccess` (SPA routing) | ✅ Configurado |
| `api/config.php` con credenciales reales | ❌ **FALTANTE — bloqueante** |

**Para conectar la base de datos:** crear `api/config.php` en Hostinger:
```php
<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'tu_nombre_db');
define('DB_USER', 'tu_usuario');
define('DB_PASS', 'tu_contraseña');
```

---

## 10. ESTADÍSTICAS DEL CODEBASE

| Métrica | Valor |
|---------|-------|
| Líneas TypeScript/TSX | ~2,308 |
| Líneas PHP | ~352 |
| Líneas SQL | ~40 |
| Archivos en src/ | 37 |
| Componentes React | 20 |
| Handlers en App.tsx | 29 |
| Vistas por rol | 3 |
| Dependencias directas | 5 (react, react-dom, lucide-react, clsx, tailwind-merge) |
| Tablas en BD | 5 |
| MVP completado | ~70% |
