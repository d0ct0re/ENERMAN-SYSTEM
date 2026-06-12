<?php
declare(strict_types=1);

/* ── save_state ── */
if ($action === 'save_state') {
    requireAuth();
    $data = readJson();
    foreach (['users', 'projects', 'requests', 'notifications'] as $key) {
        if (!isset($data[$key]) || !is_array($data[$key])) {
            throw new RuntimeException("Falta arreglo {$key}.");
        }
    }

    // Preserve passwords — bootstrap strips them so they don't come back from the frontend
    $beforeUsers = tableRows('app_users');
    $beforeProjects = tableRows('projects');
    // NOTA: requests NO se sincronizan aquí. save_state hace DELETE masivo ("id NOT IN ?")
    // lo que en un entorno multi-usuario destruye solicitudes de otros usuarios antes de que
    // el polling las traiga. Las solicitudes se gestionan sólo por endpoints atómicos:
    // create_request / update_request / delete_request.

    // Ingenieros no pueden crear proyectos nuevos — se filtran silenciosamente
    // (no rechazar con 403 porque el debounce del frontend dispara bajo sesión ingeniero
    //  después de que el admin ya guardó el proyecto vía save inmediato; rechazar rompe apiReady)
    $sessionUser = sessionUser();
    if (($sessionUser['role'] ?? '') === 'engineer') {
        $existingIds = array_column($beforeProjects, 'id');
        $data['projects'] = array_values(array_filter($data['projects'], function($p) use ($existingIds) {
            return in_array($p['id'] ?? '', $existingIds, true);
        }));
    }

    $existingUsers = tableRows('app_users');
    $pwMap        = [];
    $roleMap      = [];
    $notifPrefsMap = [];
    foreach ($existingUsers as $eu) {
        $eid = $eu['id'] ?? null;
        if (!$eid) continue;
        if (isset($eu['password']))  $pwMap[$eid]   = $eu['password'];
        if (isset($eu['role']))      $roleMap[$eid]  = ['role' => $eu['role'], 'roleLabel' => $eu['roleLabel'] ?? ''];
        $notifPrefsMap[$eid] = [
            'dismissedNotifKeys' => (array)($eu['dismissedNotifKeys'] ?? []),
            'readNotifKeys'      => (array)($eu['readNotifKeys'] ?? []),
            'dismissedNotifIds'  => (array)($eu['dismissedNotifIds']  ?? []),
            'readNotifIds'       => (array)($eu['readNotifIds']       ?? []),
        ];
    }
    $usersToSave = $data['users'];
    foreach ($usersToSave as &$u) {
        $uid = $u['id'] ?? '';
        // Preservar contraseña desde la BD
        if ($uid && isset($pwMap[$uid])) {
            $u['password'] = $pwMap[$uid];
        }
        // Preservar rol desde la BD — los roles SOLO cambian via update_user_role
        // Evita escalación de privilegios: cualquier usuario podría enviarse como system_admin
        if ($uid && isset($roleMap[$uid])) {
            $u['role']      = $roleMap[$uid]['role'];
            $u['roleLabel'] = $roleMap[$uid]['roleLabel'];
        }
        // Fusionar prefs de notificación: BD + cliente → nunca perder claves ya guardadas
        if ($uid && isset($notifPrefsMap[$uid])) {
            $u['dismissedNotifKeys'] = array_values(array_unique(array_merge(
                $notifPrefsMap[$uid]['dismissedNotifKeys'],
                (array)($u['dismissedNotifKeys'] ?? [])
            )));
            $u['readNotifKeys'] = array_values(array_unique(array_merge(
                $notifPrefsMap[$uid]['readNotifKeys'],
                (array)($u['readNotifKeys'] ?? [])
            )));
            $u['dismissedNotifIds'] = array_values(array_unique(array_merge(
                $notifPrefsMap[$uid]['dismissedNotifIds'],
                (array)($u['dismissedNotifIds'] ?? [])
            )));
            $u['readNotifIds'] = array_values(array_unique(array_merge(
                $notifPrefsMap[$uid]['readNotifIds'],
                (array)($u['readNotifIds'] ?? [])
            )));
        }
    }
    unset($u);

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
            $frontendUpdatedAt = $proj['updatedAt'] ?? '';
            $dbUpdatedAt       = $before['updatedAt'] ?? '';
            if (!empty($dbUpdatedAt) && !empty($frontendUpdatedAt) && $dbUpdatedAt > $frontendUpdatedAt) {
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
        }
        // Recalculate IVA = totalSinIva * 0.16
        if (isset($proj['totalSinIva']) && is_numeric($proj['totalSinIva'])) {
            $proj['iva'] = round((float)$proj['totalSinIva'] * 0.16, 2);
        }
    }
    unset($proj);

    // ── Guardia anti-vaciado: rechaza solo si usuarios desaparecen (bug crítico) ──
    // Los proyectos pueden llegar a 0 legítimamente cuando el gestor borra todos los de prueba.
    // La eliminación real se hace vía delete_project (DELETE atómico por id), no por save_state.
    if (count($usersToSave) === 0) {
        http_response_code(400);
        echo json_encode(['error' => 'SEGURIDAD: no se permite guardar 0 usuarios.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

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
    syncRows($pdo, 'app_users', $usersToSave);
    syncProjectRows($pdo, $projectsToSave);
    // Requests NO se sincronizan aquí — ver nota arriba.
    // Notifications se gestionan por endpoints propios (create/delete/mark_read)
    // No se sincronizan aquí para evitar que múltiples sesiones se sobreescriban
    $pdo->commit();

    logCollectionChanges('user', $beforeUsers, $usersToSave);
    logCollectionChanges('project', $beforeProjects, $projectsToSave);

    echo json_encode(['ok' => true]);
    exit;
}
