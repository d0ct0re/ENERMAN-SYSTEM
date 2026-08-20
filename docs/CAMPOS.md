# Esquema vivo de campos — ENERMAN-SYSTEM

> **Cómo usarlo**: cada tabla es una fase del diálogo de proyecto. Las columnas indican quién edita,
> quién ve, en qué `useEffect` del diálogo se sincroniza, y con qué endpoint de API se guarda.
> Al agregar un campo nuevo, seguir la sección "Cómo agregar un campo".

---

## Infraestructura de sincronización

```
┌─────────────────────────────────────────────────────────────────────┐
│                       FLUJO DE DATOS                                │
│                                                                     │
│  Ingeniero / Admin / Supervisor                                     │
│       │ edita campo en dialog                                       │
│       ▼                                                             │
│  handleSaveF1/F2/F3/F4  (project-detail-dialog.tsx)                │
│       │ llama onUpdateProject(projectId, { campo: valor })          │
│       ▼                                                             │
│  handleUpdateProject  (App.tsx)                                     │
│       │ setProjects() → actualización optimista local               │
│       │ lastProjectMutationAt.set(projectId, now)  ← grace period  │
│       │ apiUpdateProject(projectId, fields)  → PHP                  │
│       ▼                                                             │
│  PHP update_project  (api/index.php)                                │
│       │ array_merge($current, $fields) → MySQL                     │
│       ▼                                                             │
│  Polling cada 4s  (realtime.ts → App.tsx onProjectUpdate)          │
│       │ si el proyecto NO está en grace period de ESTA sesión       │
│       │ → setProjects() con datos del servidor                      │
│       ▼                                                             │
│  Sync effects en dialog  (project-detail-dialog.tsx useEffect)     │
│       │ cada campo tiene su dep en un useEffect específico          │
│       │ cuando project.campo cambia → setF2StartDate(v) etc.        │
│       ▼                                                             │
│  UI actualizada para TODOS los usuarios                             │
└─────────────────────────────────────────────────────────────────────┘
```

**Grace period por proyecto**: cuando esta sesión muta el proyecto X, el polling ignora
actualizaciones de X durante 8s (evita race condition). Los demás proyectos se actualizan
al instante → admin y engineer ven cambios del otro en ≤ 4s.

---

## F1 — Apertura

> `handleSaveF1` → `onUpdateProject` → `handleUpdateProject` → `apiUpdateProject`
> Sync effect: dep en campos individuales de F1 (segundo useEffect en dialog)

| Campo JS (`ProjectItem`) | Etiqueta UI | Tipo | Edita | Ve | Sync effect dep | Notas |
|---|---|---|---|---|---|---|
| `client` | Cliente | `string` | Ambos | Ambos | `project?.client` | datalist de clientes |
| `department` | Departamento | `string` | Ambos | Ambos | `project?.department` | datalist de departamentos |
| `type` | Tipo de proyecto | `ProjectType` | Ambos | Ambos | `project?.type` | enum: INST, MTTO, MEDI…; en UI va junto a Departamento |
| `lugar` | Lugar | `string` | Ambos | Ambos | `project?.lugar` | texto libre |
| `baseName` | Nombre / descripción | `string` | Ambos | Ambos | `project?.baseName` | parte del structuredName |
| `priority` | Urgencia | `PriorityLevel` | Ambos | Ambos | `project?.priority` | bajo/medio/alto/emergencia |
| `createdBy` | Ingeniero asignado | `string` (userId) | **Admin** | Ambos | `project?.createdBy` | controla filtro de vista del ingeniero |
| `participants` | — (oculto) | `string[]` | **Admin** | — | `JSON.stringify(participants)` | array de userIds |
| `negociador` | Compras / Negociador | `string` | Ambos | Ambos | `project?.negociador` | texto libre |
| `usuarioContacto` | Usuario de contacto | `string` | Ambos | Ambos | `project?.usuarioContacto` | texto libre |
| `ubicacion` | Ubicación del trabajo | `UbicacionProyecto` | Ambos | Ambos | `JSON.stringify(ubicacion)` | objeto {calle,planta,edificio,piso,puerta,descripcion} |
| `totalContratado` | Monto contratado | `number` | **Admin** | Admin (readonly para inge) | `project?.totalContratado` | en pesos MXN |
| `importantDates` | Fechas importantes | `ProjectImportantDateItem[]` | Ambos | Ambos | — (reset effect en project.id) | append atómico via `addProjectImportantDate` |
| `fechaSolicitud` | F. Solicitud 🔒 | `string` (ISO date) | **Nadie** | Ambos (readonly) | reset effect en `project?.id` | inmutable, protegido en PHP; se muestra en F1 y F2 |
| `structuredName` | Código de proyecto | `string` | **Auto** | Ambos | — | calculado al crear, nunca se edita |

**Campos de solo lectura calculados en F1:**
- `consecutivo` → primer segmento de `structuredName`
- `progress` → % basado en 4 indicadores (client, status/startDate, totalSinIva, pagos)

---

## F2 — Ejecución

> `handleSaveF2` → `onUpdateProject` → `handleUpdateProject` → `apiUpdateProject`
> Sync effect: `useEffect([status, estimacion, cotizacion, paymentStatus, startDate, endDate, commitmentDate, fotos, reporte, autorizador, comentariosCampo])`

| Campo JS (`ProjectItem`) | Etiqueta UI | Tipo | Edita | Ve | Sync effect dep | Notas |
|---|---|---|---|---|---|---|
| `status` | Estado del proyecto | `ProjectStatus` | Ambos | Ambos | `project?.status` | 11 valores; ver STATUS_OPTIONS |
| `estimacion` | Estado estimación | `EstimacionStatus` | Ambos | Ambos | `project?.estimacion` | Pendiente/Realizada/Cancelada… |
| `cotizacion` | Estado cotización | `CotizacionStatus` | Ambos | Ambos | `project?.cotizacion` | Pendiente/Realizada/Enviada… |
| `paymentStatus` | Estado pago | `PaymentStatus` | Ambos | Ambos | `project?.paymentStatus` | unpaid/partial/paid |
| `startDate` | F. Inicio | `string` (YYYY-MM-DD) | Ambos | Ambos | `project?.startDate` | date input directo, sin conversión UTC |
| `endDate` | F. Fin ★ | `string` (YYYY-MM-DD) | Ambos | Ambos | `project?.endDate` | date input directo |
| `commitmentDate` | F. Compromiso | `string` (YYYY-MM-DD) | Ambos | Ambos | `project?.commitmentDate` | date input directo; controla `isOverdue` |
| `fotos` | — (legacy bool) | `boolean` | Ambos | Ambos | `project?.fotos` | sustituido por `fotosStatus` |
| `fotosStatus` | Fotos de evidencia | `FileStatus` | **Admin** (aprueba) | Ambos | `project?.fotosStatus` | no/en-revision/si/rechazado; sube el ingeniero, aprueba admin |
| `reporte` | — (legacy bool) | `boolean` | Ambos | Ambos | `project?.reporte` | sustituido por `reporteFileStatus` |
| `reporteFileStatus` | Reporte generado | `FileStatus` | **Admin** (aprueba) | Ambos | `project?.reporteFileStatus` | igual que fotosStatus |
| `estimacionFileStatus` | — | `FileStatus` | **Admin** | Admin | `project?.estimacionFileStatus` | status de archivo de estimación |
| `cotizacionFileStatus` | — | `FileStatus` | **Admin** | Admin | `project?.cotizacionFileStatus` | status de archivo de cotización |
| `otrosFileStatus` | — | `FileStatus` | **Admin** | Admin | `project?.otrosFileStatus` | status de sección "otros" |
| `autorizador` | Autorizador | `string` | **Admin** | Ambos (readonly para inge) | `project?.autorizador` | campo naranja; solo admin escribe |
| `comentariosCampo` | Comentarios del campo | `string` | Ambos | Ambos | `project?.comentariosCampo` | notas del ingeniero sobre el trabajo |

**⚠ `fechaSolicitud` NO se envía desde `handleSaveF2`** — es inmutable y se protege en PHP.

---

## F3 — Financiero

> Solo visible/editable para `admin` y `system_admin` (`canEditBudget = true`)
> `handleSaveF3` → `onUpdateProject` → `handleUpdateProject` → `apiUpdateProject`
> Sync effect: `useEffect([totalSinIva, iva, costoMateriales, costoServicios, costoPersonal, costoSvoContratado, costoComision, costoOtros, oapc, egpc, luna, pagoPadillas, estatusPagoTrabajo, estatusPagoAlberto, estatusPagoLuna, comentariosDireccion])`

| Campo JS (`ProjectItem`) | Etiqueta UI | Tipo | Edita | Ve | Sync effect dep | Notas |
|---|---|---|---|---|---|---|
| `totalSinIva` | Total sin IVA | `number` | **Admin** | Admin | `project?.totalSinIva` | base para cálculo de ganancia |
| `iva` | IVA (16%) | `number` | **Auto** | Admin | `project?.iva` | calculado: totalSinIva × 0.16 |
| `costoMateriales` | Materiales | `number` | **Admin** | Admin | `project?.costoMateriales` | |
| `costoServicios` | Servicios | `number` | **Admin** | Admin | `project?.costoServicios` | |
| `costoPersonal` | Personal | `number` | **Admin** | Admin | `project?.costoPersonal` | |
| `costoSvoContratado` | Svo. Contratado | `number` | **Admin** | Admin | `project?.costoSvoContratado` | |
| `costoComision` | Comisión | `number` | **Admin** | Admin | `project?.costoComision` | |
| `costoOtros` | Otros gastos | `number` | **Admin** | Admin | `project?.costoOtros` | |
| `oapc` | OAPC | `number` | **Admin** | Admin | `project?.oapc` | |
| `egpc` | EGPC | `number` | **Admin** | Admin | `project?.egpc` | |
| `luna` | Luna | `number` | **Admin** | Admin | `project?.luna` | |
| `pagoPadillas` | Pago Padillas | `boolean` | **Admin** | Admin | `project?.pagoPadillas` | toggle |
| `estatusPagoTrabajo` | Estatus pago trabajo | `"Pendiente"\|"Pagado"` | **Admin** | Admin | `project?.estatusPagoTrabajo` | |
| `estatusPagoAlberto` | Estatus pago Alberto | `"Pendiente"\|"Pagado"` | **Admin** | Admin | `project?.estatusPagoAlberto` | |
| `estatusPagoLuna` | Estatus pago Luna | `"Pendiente"\|"Pagado"` | **Admin** | Admin | `project?.estatusPagoLuna` | |
| `comentariosDireccion` | Comentarios dirección | `string` | **Admin** | Admin | `project?.comentariosDireccion` | notas internas |

**Calculados en UI (no almacenados):**
- `ganancia` = totalSinIva − (materiales + servicios + personal + svoContratado + comision + otrosGastos)
- `porCobrar` = totalSinIva − Σ(abonosRealizados de F4)

**Gastos de campo** (`expenses: ProjectExpenseItem[]`):
Guardados via `apiAddProjectExpense` (append atómico, evita race condition con uploads paralelos).
Campos: `id, tipo, titulo, descripcion, monto, categoria, fecha, creadoPor, createdAt`.

---

## F4 — Pagos

> Solo visible/editable para `admin` y `system_admin` (`canEditBudget = true`)
> `handleSaveF4` → `onUpdateProject` → `handleUpdateProject` → `apiUpdateProject`
> Sync effect: `useEffect([JSON.stringify(pagosProyecto), estatusPagoFinal])`

| Campo JS (`PagoProyecto`) | Etiqueta UI | Tipo | Notas |
|---|---|---|---|
| `id` | — | `string` (UUID) | generado al crear |
| `numeroPago` | N° Pago | `number` | recalculado al reordenar |
| `estado` | Estado | `"pendiente"\|"realizado"` | toggle |
| `promesaPago` | Promesa de pago | `string` (fecha) | |
| `tipoPagoAbono` | Tipo pago abono | `"PPD"\|"PUE"\|"Contado"` | |
| `factura` | Factura | `string` | número de factura |
| `mdp` | MDP | `"PPD"\|"PUE"` | método de pago |
| `complementoPago` | Complemento | `string` | |
| `fechaPago` | Fecha de pago | `string` (YYYY-MM-DD) | se llena automáticamente al marcar "realizado" |
| `subtotalAbono` | Subtotal abono | `number` | en MXN |
| `createdAt` | — | `string` (ISO) | |

**Campo raíz:**
- `pagosProyecto: PagoProyecto[]` — array completo, se reemplaza en cada `handleSaveF4`
- `estatusPagoFinal: "Pendiente"|"Pagado"` — status global de F4

**Facturas** (`invoices: InvoiceItem[]`):
Guardadas via `apiAddProjectInvoice` (append atómico). Ver `InvoiceItem` en `types/index.ts`.

---

## Archivos (Tab "Archivos")

> Guardados via `uploadFile` → `upload_file` PHP (append atómico en BD, evita sobrescritura)
> Eliminados via `deleteFile` → `delete_file` PHP

| Campo JS (`ProjectFileItem`) | Descripción | Notas |
|---|---|---|
| `id` | UUID del archivo | generado por PHP |
| `name` | Nombre original | |
| `sizeLabel` | Tamaño legible | |
| `sizeBytes` | Tamaño en bytes | |
| `uploadedAt` | Timestamp upload | ISO UTC |
| `url` | URL pública | solo como fallback |
| `category` | Categoría | `fotos\|estimacion\|cotizacion\|reporte\|otros` |

**Categorías y quién las gestiona:**
| Categoría | Sube | Aprueba (FileStatus) | Campo status |
|---|---|---|---|
| `fotos` | Ingeniero | Admin | `fotosStatus` |
| `estimacion` | Admin | — | `estimacionFileStatus` |
| `cotizacion` | Admin | — | `cotizacionFileStatus` |
| `reporte` | Ingeniero | Admin | `reporteFileStatus` |
| `otros` | Ambos | Admin | `otrosFileStatus` |

---

## Chat (Tab "Chat")

> Servicio independiente via `realtime.sendMessage` / `realtime.loadMessages`
> Endpoint: `send_message` / `get_messages` en PHP
> Polling de mensajes: dentro del ciclo de 4s del `RealtimeService`

| Campo (`ChatMessage`) | Tipo | Descripción |
|---|---|---|
| `id` | `string` | UUID |
| `projectId` | `string` | proyecto al que pertenece |
| `authorId` | `string` | userId del autor |
| `authorName` | `string` | nombre completo |
| `authorRole` | `string` | rol del autor |
| `message` | `string` | contenido |
| `isPriority` | `boolean` | mensaje marcado como prioritario |
| `createdAt` | `string` | ISO timestamp |

---

## Campos raíz de `ProjectItem` (sistema)

| Campo | Tipo | Descripción | Quién controla |
|---|---|---|---|
| `id` | `string` (UUID) | identificador único | Auto (crypto.randomUUID) |
| `structuredName` | `string` | código completo ej. `4001-ITESM-OSEH-CAMPUS-BOMB-ASD` | Auto (buildStructuredName) |
| `createdAt` | `string` (ISO) | timestamp de creación | Auto |
| `updatedAt` | `string` (ISO) | timestamp de última actualización | Auto en cada save |
| `createdBy` | `string` (userId) | ingeniero asignado actualmente | Admin (reasignable en F1) |
| `participants` | `string[]` | historial de ingenieros asignados | Auto (acumulativo) |
| `deletedAt` | `string\|undefined` | timestamp de papelera | Admin (handleDeleteProject) |
| `history` | `ProjectHistoryItem[]` | log de cambios | Auto en cada save |
| `paymentLabel` | `string` | texto del paymentStatus en español | Auto (calculado de paymentStatus) |

---

## Cómo agregar un campo nuevo

1. **Tipo** → agregar en `ProjectItem` interface (`src/types/index.ts`)
2. **Estado local** → `const [f2NuevoCampo, setF2NuevoCampo] = useState("")` en `project-detail-dialog.tsx`
3. **Reset effect** → agregar `setF2NuevoCampo(project.nuevoCampo ?? "")` en el reset effect `[project?.id]`
4. **Sync effect** → agregar `project?.nuevoCampo` a las deps del useEffect de F2 y agregar el setter dentro
5. **Guardar** → agregar `nuevoCampo: f2NuevoCampo || undefined` en `handleSaveF2`
6. **UI** → agregar el campo en la sección F2 del JSX con el label correcto y `disabled={!canEditProject}`
7. **Inmutable?** → si el campo no debe cambiar después de la creación, agregar protección en PHP `update_project` (igual que `fechaSolicitud`)
8. **Solo admin?** → usar `FLD_ADM` en lugar de `FLD`, `LabelAdmin` en lugar de `<label>`, y `disabled={!canManageProjectStatus}`

---

## Permisos por rol

| Capacidad | engineer | supervisor | admin | system_admin |
|---|---|---|---|---|
| Ver proyectos | Solo asignados | Todos | Todos | Todos |
| Editar F1/F2 (`canEditProject`) | ✓ | — | ✓ | ✓ |
| Editar estados y asignar inge (`canManageProjectStatus`) | — | — | ✓ | ✓ |
| Ver/editar F3/F4 (`canEditBudget`) | — | — | ✓ | ✓ |
| Eliminar proyecto (`canDeleteProject`) | — | — | — | ✓ |
| Gestionar facturas (`canManageInvoices`) | — | — | ✓ | ✓ |

---

## Endpoints PHP relevantes

| Acción (`?action=`) | Método | Quién llama | Qué hace |
|---|---|---|---|
| `bootstrap` | GET | App.tsx al iniciar | carga completa de estado |
| `poll` | GET | realtime.ts cada 4s | devuelve cambios desde `?since=` |
| `update_project` | POST | `apiUpdateProject` | merge atómico de campos en BD |
| `upload_file` | POST | `uploadFile` | sube archivo y hace append atómico en `files[]` |
| `delete_file` | POST | `deleteFile` | elimina archivo por id |
| `add_project_expense` | POST | `apiAddProjectExpense` | append atómico en `expenses[]` |
| `delete_project_expense` | POST | `apiDeleteProjectExpense` | elimina gasto por id |
| `add_project_invoice` | POST | `apiAddProjectInvoice` | append atómico en `invoices[]` |
| `update_project_invoice` | POST | `apiUpdateProjectInvoice` | merge de factura por id |
| `send_message` | POST | `realtime.sendMessage` | inserta mensaje de chat |
| `get_messages` | GET | `realtime.loadMessages` | historial de mensajes del proyecto |
