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

    // Nuevos mensajes del proyecto abierto
    $messages = [];
    if ($projectId) {
        $stmt = db()->prepare(
            "SELECT payload FROM project_messages WHERE project_id = :pid AND created_at > :since ORDER BY created_at ASC"
        );
        $stmt->execute([':pid' => $projectId, ':since' => $sinceMySQL]);
        $messages = array_map(
            static fn(array $row): array => json_decode($row['payload'], true),
            $stmt->fetchAll()
        );
    }

    // Proyectos modificados desde `since`
    $stmt = db()->prepare("SELECT payload FROM projects WHERE updated_at > :since");
    $stmt->execute([':since' => $sinceMySQL]);
    $updatedProjects = array_map(
        static fn(array $row): array => json_decode($row['payload'], true),
        $stmt->fetchAll()
    );

    // IDs de todos los proyectos actuales (para detectar eliminados en el frontend)
    $allProjectIds = array_column(
        db()->query("SELECT id FROM projects")->fetchAll(),
        'id'
    );

    // Solicitudes modificadas desde `since`
    $stmt = db()->prepare("SELECT payload FROM requests WHERE updated_at > :since");
    $stmt->execute([':since' => $sinceMySQL]);
    $updatedRequests = array_map(
        static fn(array $row): array => json_decode($row['payload'], true),
        $stmt->fetchAll()
    );

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
    $rawNotifs = array_map(
        static fn(array $row): array => json_decode($row['payload'], true),
        $stmt->fetchAll()
    );
    $pollState    = getUserNotifState($userId);
    $pollDismissed = array_flip($pollState['dismissedIds']);
    $pollReadSet   = array_flip($pollState['readIds']);
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

    echo json_encode([
        'ok'              => true,
        'messages'        => $messages,
        'updatedProjects' => $updatedProjects,
        'allProjectIds'   => $allProjectIds,
        'updatedRequests' => $updatedRequests,
        'allRequestIds'   => $allRequestIds,
        'notifications'   => $newNotifications,
        'serverTime'      => gmdate('c'),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
