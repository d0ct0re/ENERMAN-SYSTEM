<?php
declare(strict_types=1);

/* ── poll — devuelve cambios desde `since` para tiempo real ── */
if ($action === 'poll') {
    requireAuth();
    // Liberar el lock de sesión inmediatamente: poll es de solo lectura y el lock
    // que mantiene session_start() bloquea concurrentemente las peticiones de imágenes.
    $since      = trim($_GET['since'] ?? '1970-01-01T00:00:00Z');
    $projectId  = trim($_GET['project_id'] ?? '');
    $userId     = $_SESSION['user_id']   ?? '';
    $userRole   = $_SESSION['user_role'] ?? '';
    session_write_close();

    $sinceMySQL = date('Y-m-d H:i:s', strtotime($since));

    // Retención: barrido probabilístico (~1 de cada 200 polls) que borra notificaciones de
    // más de 60 días — evita correr un DELETE en cada poll de cada usuario cada 4s, pero
    // mantiene la tabla acotada sin depender de un cron aparte. Parte del rediseño 2026-09
    // que reemplaza filas-marcador por `recipients` embebido en la propia notificación.
    if (random_int(1, 200) === 1) {
        // updated_at (no created_at): una notificación agrupada que sigue recibiendo eventos
        // nuevos actualiza su updated_at en cada merge — no debe caducar mientras siga activa.
        db()->exec("DELETE FROM notifications WHERE updated_at < (NOW() - INTERVAL 60 DAY)");
    }

    // Decodifica payloads y descarta los que no dieron un array (JSON corrupto/vacio) — bajo
    // strict_types, un solo registro asi tumbaba con 500 CADA poll (cada 4s, para todos).
    $decodeRows = static function (array $rows): array {
        $decoded = array_map(static fn(array $row) => json_decode($row['payload'], true), $rows);
        return array_values(array_filter($decoded, static fn($r) => is_array($r)));
    };

    // Nuevos mensajes del proyecto abierto — solo si el usuario tiene acceso a ese proyecto.
    // Antes se mandaba el chat de CUALQUIER project_id que el cliente pidiera, sin checar
    // que el usuario en sesion realmente perteneciera a ese proyecto.
    $messages = [];
    if ($projectId) {
        $projStmt = db()->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
        $projStmt->execute([$projectId]);
        $projRow = $projStmt->fetch();
        $projForAccess = $projRow ? (json_decode($projRow['payload'], true) ?? []) : null;
        if ($projForAccess && canSeeProject($projForAccess, $userId, $userRole)) {
            $stmt = db()->prepare(
                "SELECT payload FROM project_messages WHERE project_id = :pid AND created_at > :since ORDER BY created_at ASC"
            );
            $stmt->execute([':pid' => $projectId, ':since' => $sinceMySQL]);
            $messages = $decodeRows($stmt->fetchAll());
        }
    }

    // Proyectos modificados desde `since` — filtrados por rol (ver canSeeProject). Antes se
    // mandaba el payload completo de TODOS los proyectos a cualquier sesion autenticada, y el
    // frontend nomas lo escondia visualmente: cualquiera con la pestaña de red del navegador
    // abierta podia ver clientes, montos y facturas de proyectos ajenos.
    $stmt = db()->prepare("SELECT payload FROM projects WHERE updated_at > :since");
    $stmt->execute([':since' => $sinceMySQL]);
    $updatedProjects = array_values(array_filter(
        $decodeRows($stmt->fetchAll()),
        static fn(array $p): bool => canSeeProject($p, $userId, $userRole)
    ));

    // IDs de todos los proyectos VISIBLES para este usuario (para detectar eliminados en el
    // frontend). admin/supervisor/system_admin ven todo — consulta ligera de solo IDs, igual
    // que antes. engineer necesita el payload (createdBy/participants) para poder filtrar,
    // asi que solo ESE caso paga el costo de decodificar la tabla completa cada poll.
    $isPrivilegedRole = in_array($userRole, ['admin', 'system_admin', 'supervisor'], true);
    if ($isPrivilegedRole) {
        $allProjectIds = array_column(db()->query("SELECT id FROM projects")->fetchAll(), 'id');
    } else {
        $allProjectIds = array_column(
            array_values(array_filter(
                tableRows('projects'),
                static fn(array $p): bool => canSeeProject($p, $userId, $userRole)
            )),
            'id'
        );
    }

    // Solicitudes modificadas desde `since` — mismo filtro por rol.
    $stmt = db()->prepare("SELECT payload FROM requests WHERE updated_at > :since");
    $stmt->execute([':since' => $sinceMySQL]);
    $updatedRequests = array_values(array_filter(
        $decodeRows($stmt->fetchAll()),
        static fn(array $r): bool => canSeeRequest($r, $userId, $userRole)
    ));

    // IDs de todas las solicitudes VISIBLES para este usuario
    $allRequestIds = array_column(
        array_values(array_filter(
            tableRows('requests'),
            static fn(array $r): bool => canSeeRequest($r, $userId, $userRole)
        )),
        'id'
    );

    // Nuevas notificaciones desde `since`, filtradas por usuario
    $stmt = db()->prepare(
        "SELECT payload FROM notifications WHERE created_at > :since ORDER BY created_at DESC LIMIT 50"
    );
    $stmt->execute([':since' => $sinceMySQL]);
    $rawNotifs = $decodeRows($stmt->fetchAll());
    $pollState    = getUserNotifState($userId);
    $pollDismissed = array_flip($pollState['dismissedIds']);
    $pollReadSet   = array_flip($pollState['readIds']);
    // Respaldo: IDs descartados/leídos guardados en el payload del usuario.
    // Fallback para cuando apiDeleteNotification o apiMarkNotificationRead fallaron silenciosamente.
    $stmtPollUser = db()->prepare("SELECT payload FROM app_users WHERE id = :id");
    $stmtPollUser->execute([':id' => $userId]);
    $pollUserData = json_decode($stmtPollUser->fetchColumn() ?: '{}', true);
    $pollUserDismissedIds = (array)($pollUserData['dismissedNotifIds'] ?? []);
    $pollUserReadIds      = (array)($pollUserData['readNotifIds']      ?? []);
    // Claves de notificaciones de fecha (compromiso/fin/fecha importante) descartadas/leídas
    // por este usuario — se mandan completas en cada poll (son un set chico y solo crece) para
    // que otras pestañas/sesiones del mismo usuario se enteren sin esperar un refresh manual.
    $pollUserDismissedDateKeys = (array)($pollUserData['dismissedNotifKeys'] ?? []);
    $pollUserReadDateKeys      = (array)($pollUserData['readNotifKeys']      ?? []);
    if (!empty($pollUserDismissedIds)) {
        $pollDismissed = array_merge($pollDismissed, array_flip($pollUserDismissedIds));
    }
    if (!empty($pollUserReadIds)) {
        $pollReadSet = array_merge($pollReadSet, array_flip($pollUserReadIds));
    }
    $newNotifications = array_values(array_filter($rawNotifs, function (array $n) use ($userId, $userRole, $pollDismissed, $pollReadSet): bool {
        if (!empty($n['isDismissMarker']) || !empty($n['isDismissedDateKey']) || !empty($n['isReadMarker'])) return false;
        $nid = $n['id'] ?? '';
        if ($nid && isset($pollDismissed[$nid])) return false;
        // Aplicar isRead por usuario
        if ($nid && isset($pollReadSet[$nid])) $n['isRead'] = true;
        if (isset($n['userIds']) && is_array($n['userIds'])) {
            return in_array($userId, $n['userIds'], true);
        }
        return ($n['role'] ?? '') === $userRole;
    }));

    // Marcadores de leído/descartado creados desde `since` por ESTE usuario — se usan para
    // que otras pestañas/computadoras donde tenga sesión abierta se enteren de inmediato
    // (via el siguiente poll) de que algo ya se marcó/borró aquí, sin depender de un refresh
    // manual. Antes esto solo se aplicaba al pedir la lista completa (bootstrap).
    $dismissedNow = [];
    $readNow = [];
    foreach ($rawNotifs as $n) {
        if (($n['userId'] ?? '') !== $userId) continue;
        if (!empty($n['isDismissMarker']) && !empty($n['originalId'])) $dismissedNow[] = $n['originalId'];
        if (!empty($n['isReadMarker']) && !empty($n['originalId'])) $readNow[] = $n['originalId'];
    }

    echo json_encode([
        'ok'                        => true,
        // Identidad real de la sesión del servidor — el frontend la compara contra la cuenta
        // que cree tener activa. Si difieren, esta pestaña quedó "vieja" (otra pestaña del mismo
        // navegador inició sesión con otra cuenta y, al compartir cookie, cambió la sesión de
        // TODAS las pestañas). Evita que se actúe por error con los permisos de otra cuenta.
        'sessionUserId'             => $userId,
        'messages'                  => $messages,
        'updatedProjects'           => $updatedProjects,
        'allProjectIds'             => $allProjectIds,
        'updatedRequests'           => $updatedRequests,
        'allRequestIds'             => $allRequestIds,
        'notifications'             => $newNotifications,
        'dismissedNotificationIds'  => array_values(array_unique($dismissedNow)),
        'readNotificationIds'       => array_values(array_unique($readNow)),
        'dismissedDateKeys'         => array_values(array_unique($pollUserDismissedDateKeys)),
        'readDateKeys'              => array_values(array_unique($pollUserReadDateKeys)),
        'settings'                  => getAppSettings(),
        'serverTime'                => gmdate('c'),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
