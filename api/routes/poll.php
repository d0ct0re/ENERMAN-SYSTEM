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

    // Decodifica payloads y descarta los que no dieron un array (JSON corrupto/vacio) — bajo
    // strict_types, un solo registro asi tumbaba con 500 CADA poll (cada 4s, para todos).
    $decodeRows = static function (array $rows): array {
        $decoded = array_map(static fn(array $row) => json_decode($row['payload'], true), $rows);
        return array_values(array_filter($decoded, static fn($r) => is_array($r)));
    };

    // Nuevos mensajes del proyecto abierto
    $messages = [];
    if ($projectId) {
        $stmt = db()->prepare(
            "SELECT payload FROM project_messages WHERE project_id = :pid AND created_at > :since ORDER BY created_at ASC"
        );
        $stmt->execute([':pid' => $projectId, ':since' => $sinceMySQL]);
        $messages = $decodeRows($stmt->fetchAll());
    }

    // Proyectos modificados desde `since`
    $stmt = db()->prepare("SELECT payload FROM projects WHERE updated_at > :since");
    $stmt->execute([':since' => $sinceMySQL]);
    $updatedProjects = $decodeRows($stmt->fetchAll());

    // IDs de todos los proyectos actuales (para detectar eliminados en el frontend)
    $allProjectIds = array_column(
        db()->query("SELECT id FROM projects")->fetchAll(),
        'id'
    );

    // Solicitudes modificadas desde `since`
    $stmt = db()->prepare("SELECT payload FROM requests WHERE updated_at > :since");
    $stmt->execute([':since' => $sinceMySQL]);
    $updatedRequests = $decodeRows($stmt->fetchAll());

    // IDs de todas las solicitudes actuales
    $allRequestIds = array_column(
        db()->query("SELECT id FROM requests")->fetchAll(),
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
        'serverTime'                => gmdate('c'),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
