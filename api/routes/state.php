<?php
declare(strict_types=1);

/* ── save_state ── */
if ($action === 'save_state') {
    requireAuth();
    $data = readJson();
    foreach (['projects', 'requests', 'notifications'] as $key) {
        if (!isset($data[$key]) || !is_array($data[$key])) {
            throw new RuntimeException("Falta arreglo {$key}.");
        }
    }

    $beforeProjects = tableRows('projects');
    // NOTA: requests NO se sincronizan aquí. save_state hace DELETE masivo ("id NOT IN ?")
    // lo que en un entorno multi-usuario destruye solicitudes de otros usuarios antes de que
    // el polling las traiga. Las solicitudes se gestionan sólo por endpoints atómicos:
    // create_request / update_request / delete_request.
    // NOTA (2026-09-14): usuarios (app_users) TAMPOCO se sincronizan aquí — mismo criterio.
    // Antes este endpoint reescribía la fila completa del usuario en cada ciclo (~4s en
    // cualquier pestaña abierta), y aunque se le agregaron protecciones por updatedAt, seguía
    // siendo una fuente de riesgo para datos tan sensibles como el correo de acceso: cualquier
    // condición de carrera ahí revierte o corrompe una cuenta real. Los usuarios se gestionan
    // 100% por endpoints atómicos: create_user / update_user / delete_user. Las claves de
    // notificación que antes viajaban "de rebote" en el objeto de usuario (dismissedNotifKeys,
    // readNotifKeys, dismissedNotifIds, readNotifIds) ahora se guardan directo via
    // update_notif_prefs — ver notifications.php.

    // Ingenieros no pueden crear proyectos nuevos — se filtran silenciosamente
    // (no rechazar con 403 porque el debounce del frontend dispara bajo sesión ingeniero
    //  después de que el admin ya guardó el proyecto vía save inmediato; rechazar rompe apiReady)
    $sessionUser = sessionUser();
    if (($sessionUser['role'] ?? '') === 'engineer') {
        $sessionUserId = $sessionUser['id'] ?? '';
        // Mapa por id de la version en BD (fuente de verdad de createdBy/participants —
        // nunca confiar en el payload entrante para decidir pertenencia, un cliente
        // manipulado podria mandarse a si mismo como participante de cualquier proyecto).
        $beforeById = [];
        foreach ($beforeProjects as $bp) {
            if (isset($bp['id'])) $beforeById[$bp['id']] = $bp;
        }
        // Antes solo se filtraban proyectos nuevos (que el ingeniero no puede crear). Un
        // ingeniero podia incluir en su payload modificaciones a CUALQUIER proyecto existente
        // y save_state las aplicaba sin checar pertenencia — igual que el hueco ya cerrado
        // en update_project/add_project_comment/etc, pero por esta puerta trasera legado.
        $data['projects'] = array_values(array_filter($data['projects'], function ($p) use ($beforeById, $sessionUserId) {
            $pid = $p['id'] ?? '';
            if (!isset($beforeById[$pid])) return false; // no puede crear proyectos nuevos
            return canSeeProject($beforeById[$pid], $sessionUserId, 'engineer');
        }));
    }

    // Preserve fechaSolicitud (immutable) and recalculate IVA server-side
    $beforeProjectMap = [];
    foreach ($beforeProjects as $bp) {
        if (isset($bp['id'])) $beforeProjectMap[$bp['id']] = $bp;
    }
    $projectsToSave = $data['projects'];
    foreach ($projectsToSave as &$proj) {
        $pid = $proj['id'] ?? '';
        if ($pid && isset($beforeProjectMap[$pid])) {
            $before = $beforeProjectMap[$pid];

            // ── Merge con protección de concurrencia por updatedAt ───────────────────────
            // Si la BD tiene un updatedAt MÁS RECIENTE que el frontend, otro usuario
            // (p.ej. admin via update_project) modificó este proyecto después del último
            // sync del cliente actual. En ese caso la BD gana para no revertir sus cambios.
            // Si el frontend es igual o más reciente, el frontend gana (caso normal).
            // IMPORTANTE: comparar como TIEMPO real (strtotime), no como string. PHP emite
            // '...+00:00' (gmdate('c')) y JS emite '...123Z' (toISOString()) — comparar los
            // strings crudos hace que el de JS "gane" por formato cuando ambos caen en el
            // mismo segundo, aunque el de PHP sea en realidad el más reciente. Esto causaba
            // que ediciones atómicas (update_project) fueran revertidas por este safety-net
            // unos segundos después, de forma intermitente (bug reportado: "a veces necesito
            // Ctrl+R para ver los cambios de otro usuario").
            $frontendUpdatedAt = $proj['updatedAt'] ?? '';
            $dbUpdatedAt       = $before['updatedAt'] ?? '';
            $dbTs = $dbUpdatedAt ? strtotime($dbUpdatedAt) : false;
            $feTs = $frontendUpdatedAt ? strtotime($frontendUpdatedAt) : false;
            if ($dbTs !== false && $feTs !== false && $dbTs > $feTs) {
                // BD más reciente — preservar datos del otro usuario intactos
                $proj = $before;
            } else {
                // Frontend es actual — merge normal, frontend sobreescribe BD
                $merged = array_merge($before, $proj);
                foreach ($merged as $k => $v) {
                    if ($v === null) unset($merged[$k]);
                }
                $proj = $merged;
            }

            // ── BD siempre gana para estos campos de solo lectura / atómicos ────────────
            // Preserve original fechaSolicitud (inmutable)
            if (!empty($before['fechaSolicitud'])) {
                $proj['fechaSolicitud'] = $before['fechaSolicitud'];
            }
            // Campos de estado de sección — solo cambian via upload_file/delete_file
            $sectionStatusFields = ['fotosStatus', 'estimacionFileStatus', 'cotizacionFileStatus', 'reporteFileStatus', 'otrosFileStatus'];
            foreach ($sectionStatusFields as $stField) {
                $proj[$stField] = $before[$stField] ?? 'no';
            }
            // Archivos — solo via upload_file / delete_file
            if (isset($before['files'])) {
                $proj['files'] = $before['files'];
            } else {
                if (empty($proj['files'])) {
                    $proj['files'] = [];
                }
            }
            // Gastos, facturas, comentarios/historial, participantes, fechas importantes,
            // pagos de Fase 4 y su estatus final — todos tienen su propio endpoint atómico
            // (add/delete_project_expense, add/update_project_invoice, add_project_comment,
            // update_project). El merge de arriba solo compara el updatedAt DEL PROYECTO
            // COMPLETO: si esta sesión hizo un cambio local distinto (ej. cambió la prioridad)
            // DESPUÉS de que otra sesión guardó Fase 4 (pagosProyecto/estatusPagoFinal) pero
            // ANTES de refrescar por polling, su updatedAt "gana" la comparación de arriba
            // aunque su copia de estos campos esté desactualizada — y los pisaría con la
            // versión vieja (ej. un pago que ya se marcó "Pagado" volvería a verse "Pendiente").
            // Igual que files: la BD siempre gana para estos campos.
            foreach (['expenses', 'invoices', 'comments', 'history', 'participants', 'importantDates', 'pagosProyecto'] as $atomicField) {
                if (isset($before[$atomicField])) {
                    $proj[$atomicField] = $before[$atomicField];
                } elseif (empty($proj[$atomicField])) {
                    $proj[$atomicField] = [];
                }
            }
            // estatusPagoFinal es texto ("Pendiente"/"Pagado"), no arreglo — no puede compartir
            // el default "[]" de arriba. Mismo criterio (BD siempre gana), sin ese fallback:
            // si nunca se ha guardado, se queda ausente (no "[]").
            if (isset($before['estatusPagoFinal'])) {
                $proj['estatusPagoFinal'] = $before['estatusPagoFinal'];
            }
        }
        // Recalculate IVA = totalSinIva * 0.16
        if (isset($proj['totalSinIva']) && is_numeric($proj['totalSinIva'])) {
            $proj['iva'] = round((float)$proj['totalSinIva'] * 0.16, 2);
        }
    }
    unset($proj);

    // Purgar entradas expiradas (>120s) del rastreador de eliminaciones recientes
    $now = time();
    if (isset($_SESSION['recently_deleted'])) {
        foreach ($_SESSION['recently_deleted'] as $rid => $ts) {
            if ($now - (int)$ts > 120) {
                unset($_SESSION['recently_deleted'][$rid]);
            }
        }
    }
    $recentlyDeleted = array_keys($_SESSION['recently_deleted'] ?? []);

    // ── Protección cross-sesión via activity_logs ──────────────────────────────────────
    // $recentlyDeleted solo contiene IDs de la sesión ACTUAL que llamó delete_project.
    // Si otro admin/ingeniero llama save_state con el proyecto aún en su estado local,
    // su $recentlyDeleted está vacío y syncRows lo re-insertaría en la BD.
    // Solución: consultar activity_logs para obtener eliminaciones recientes de CUALQUIER sesión.
    try {
        $crossDeleted = db()->query(
            "SELECT entity_id FROM activity_logs
              WHERE action = 'deleted' AND entity_type = 'project'
                AND created_at > DATE_SUB(NOW(), INTERVAL 120 SECOND)
                AND entity_id IS NOT NULL"
        )->fetchAll(PDO::FETCH_COLUMN);
        if (!empty($crossDeleted)) {
            $recentlyDeleted = array_unique(array_merge($recentlyDeleted, $crossDeleted));
        }
    } catch (\Throwable $e) {
        // No bloquear save_state si la query de activity_logs falla
    }

    // Filtrar proyectos recién eliminados: evita que cualquier save_state los re-inserte
    if (!empty($recentlyDeleted)) {
        $projectsToSave = array_values(array_filter($projectsToSave,
            static fn($p) => !in_array($p['id'] ?? '', $recentlyDeleted, true)));
    }

    // ── Preservar proyectos de BD que el frontend aún no conoce (race condition multi-usuario) ──
    // SOLO aplica para sesiones de INGENIERO. El ingeniero no puede eliminar proyectos,
    // así que si un proyecto está en BD pero no en su payload, simplemente no lo conoce aún
    // (p.ej. admin acaba de aprobar su solicitud y crear el proyecto via apiUpdateProject).
    // Para admin/system_admin NO se aplica: su estado local es autoritativo — si un proyecto
    // no está en su payload es porque lo eliminó intencionalmente (handlePermanentDeleteProject).
    // Aplicar la guarda a admin causaría que save_state re-inserte proyectos recién borrados
    // antes de que apiDeleteProject complete (race condition en Hostinger).
    if (($sessionUser['role'] ?? '') === 'engineer') {
        $frontendProjectIds = array_column($projectsToSave, 'id');
        foreach ($beforeProjects as $bp) {
            $bpId = $bp['id'] ?? '';
            if ($bpId && !in_array($bpId, $frontendProjectIds, true)
                      && !in_array($bpId, $recentlyDeleted, true)) {
                $projectsToSave[] = $bp;  // conservar el proyecto de BD sin modificarlo
            }
        }
    }

    $pdo = db();
    $pdo->beginTransaction();
    syncProjectRows($pdo, $projectsToSave);
    // Requests NO se sincronizan aquí — ver nota arriba.
    // Usuarios NO se sincronizan aquí — ver nota arriba.
    // Notifications se gestionan por endpoints propios (create/delete/mark_read)
    // No se sincronizan aquí para evitar que múltiples sesiones se sobreescriban
    $pdo->commit();

    logCollectionChanges('project', $beforeProjects, $projectsToSave);

    echo json_encode(['ok' => true]);
    exit;
}
