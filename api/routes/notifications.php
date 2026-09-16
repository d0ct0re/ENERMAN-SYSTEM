<?php
declare(strict_types=1);

/* ── create_notification ── */
if ($action === 'create_notification') {
    requireAuth();
    $data  = readJson();
    $notif = $data['notification'] ?? null;
    if (!$notif || empty($notif['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'notification con id requerido.']);
        exit;
    }
    $stmt = db()->prepare(
        "INSERT INTO notifications (id, payload, sort_order)
         VALUES (:id, :payload, 0)
         ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = NOW()"
    );
    $stmt->execute([
        ':id'      => (string) $notif['id'],
        ':payload' => json_encode($notif, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    echo json_encode(['ok' => true]);
    exit;
}

/* ── set_notification_recipient — marca leído/descartado para MÍ en una notificación,
   de forma atómica con JSON_SET server-side (rediseño 2026-09). NUNCA usar create_notification
   (que sobreescribe el payload completo) para esto: dos admins actuando sobre la MISMA
   notificación compartida al mismo tiempo se pisarían el cambio uno al otro — cada quien
   mandaría su propia copia local de `recipients`, y la última en llegar borraría la del otro.
   JSON_SET modifica un solo campo dentro de la fila en el servidor, sin pisar el resto. ── */
if ($action === 'set_notification_recipient') {
    requireAuth();
    $data        = readJson();
    $notifId     = trim($data['id'] ?? '');
    $userId      = $_SESSION['user_id'] ?? '';
    $read        = !empty($data['read']);
    $dismissedAt = $data['dismissedAt'] ?? null;
    if (!$notifId || !$userId || !preg_match('/^[A-Za-z0-9_\-]+$/', $userId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Datos inválidos.']);
        exit;
    }
    // JSON_OBJECT() en vez de CAST(:value AS JSON): MariaDB (lo que corre Hostinger) no
    // soporta CAST(... AS JSON) igual que MySQL — eso tronaba con 500 en cada intento.
    // El JSON_SET anidado además garantiza que `$.recipients` exista como objeto antes de
    // escribir el miembro anidado: JSON_SET no crea el padre solo si falta, así que una
    // notificación vieja (creada antes del rediseño, sin `recipients`) quedaría intacta
    // sin este paso — con él, cualquier notificación gana `recipients` en su primer touch.
    $path = '$.recipients."' . $userId . '"';
    $stmt = db()->prepare(
        "UPDATE notifications SET payload = JSON_SET(
            JSON_SET(payload, '\$.recipients', COALESCE(JSON_EXTRACT(payload, '\$.recipients'), JSON_OBJECT())),
            :path,
            JSON_OBJECT('read', :read, 'dismissedAt', :dismissedAt)
        ), updated_at = NOW() WHERE id = :id"
    );
    $stmt->execute([
        ':path'        => $path,
        ':read'        => $read ? 1 : 0,
        ':dismissedAt' => $dismissedAt,
        ':id'          => $notifId,
    ]);
    if ($stmt->rowCount() === 0) {
        // Idempotente: si ya no existe (borrada/caducada), no es un error para el cliente.
        echo json_encode(['ok' => true, 'found' => false]);
        exit;
    }
    echo json_encode(['ok' => true, 'found' => true]);
    exit;
}

/* ── update_notif_prefs — guarda dismissed/read keys y ids en el registro del usuario ──
   Respaldo del marcado de leído/descartado — la vía principal de notificaciones normales es
   mark_notification_read/delete_notification (marcadores en su propia tabla); esto solo cubre
   el caso de fecha (importantDate, que no tiene fila propia) y sirve de red de seguridad para
   cuando esos otros endpoints fallan silenciosamente. Antes esto se hacía "de rebote" dejando
   el dato en el estado local de React para que save_state lo arrastrara — pero usuarios ya no
   pasan por save_state (2026-09-14), así que ahora cada llamador pega aquí directo. ── */
if ($action === 'update_notif_prefs') {
    requireAuth();
    $userId = $_SESSION['user_id'] ?? '';
    $data   = readJson();
    $newDismissed   = array_filter((array)($data['dismissedDateKeys'] ?? []), 'is_string');
    $newRead        = array_filter((array)($data['readDateKeys']      ?? []), 'is_string');
    $newDismissedId = array_filter((array)($data['dismissedNotifIds'] ?? []), 'is_string');
    $newReadId      = array_filter((array)($data['readNotifIds']      ?? []), 'is_string');
    if ($userId && (!empty($newDismissed) || !empty($newRead) || !empty($newDismissedId) || !empty($newReadId))) {
        $pdo = db();
        $stmt = $pdo->prepare("SELECT payload FROM app_users WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $currentData = json_decode($stmt->fetchColumn() ?: '{}', true);
        if (!empty($newDismissed)) {
            $currentData['dismissedNotifKeys'] = array_values(array_unique(array_merge(
                (array)($currentData['dismissedNotifKeys'] ?? []), $newDismissed
            )));
        }
        if (!empty($newRead)) {
            $currentData['readNotifKeys'] = array_values(array_unique(array_merge(
                (array)($currentData['readNotifKeys'] ?? []), $newRead
            )));
        }
        if (!empty($newDismissedId)) {
            $currentData['dismissedNotifIds'] = array_values(array_unique(array_merge(
                (array)($currentData['dismissedNotifIds'] ?? []), $newDismissedId
            )));
        }
        if (!empty($newReadId)) {
            $currentData['readNotifIds'] = array_values(array_unique(array_merge(
                (array)($currentData['readNotifIds'] ?? []), $newReadId
            )));
        }
        $pdo->prepare("UPDATE app_users SET payload = :p, updated_at = NOW() WHERE id = :id")
            ->execute([':p' => json_encode($currentData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $userId]);
    }
    echo json_encode(['ok' => true]);
    exit;
}

/* ── delete_notification — descarta para siempre, solo para este usuario ── */
if ($action === 'delete_notification') {
    requireAuth();
    $data   = readJson();
    $id     = trim($data['id'] ?? '');
    $userId = $_SESSION['user_id'] ?? '';
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'id requerido.']); exit; }
    $pdo = db();
    if ($userId) {
        $isDate  = str_starts_with($id, 'important-date-');
        $baseKey = $isDate ? preg_replace('/-\d{4}-\d{2}-\d{2}$/', '', $id) : null;
        $mid     = 'dismissed-' . $userId . '-' . md5($id);
        $mp      = json_encode([
            'id' => $mid, 'isDismissMarker' => true,
            'userId' => $userId, 'originalId' => $id, 'baseKey' => $baseKey,
            'userIds' => [$userId], 'role' => 'engineer',
            'isRead' => true, 'title' => '', 'description' => '', 'createdAt' => date('c'),
        ]);
        $pdo->prepare("INSERT INTO notifications (id, payload, sort_order) VALUES (:id,:p,0) ON DUPLICATE KEY UPDATE payload=:p2")
            ->execute([':id' => $mid, ':p' => $mp, ':p2' => $mp]);
    }
    // Solo eliminar el original si es una notificación estrictamente personal
    // (userIds con solo este usuario) para mantener BD limpia
    $row = db()->prepare("SELECT payload FROM notifications WHERE id=:id")->execute([':id'=>$id])
        ? db()->prepare("SELECT payload FROM notifications WHERE id=:id") : null;
    if ($row) { $row->execute([':id'=>$id]); $orig = json_decode($row->fetchColumn() ?: 'null', true); }
    else { $orig = null; }
    $uids = $orig['userIds'] ?? null;
    if ($uids && count($uids) === 1 && $uids[0] === $userId) {
        $pdo->prepare("DELETE FROM notifications WHERE id=:id")->execute([':id'=>$id]);
    }
    echo json_encode(['ok' => true]);
    exit;
}

/* ── mark_notification_read — marca leída solo para este usuario ── */
if ($action === 'mark_notification_read') {
    requireAuth();
    $data   = readJson();
    $id     = trim($data['id'] ?? '');
    $userId = $_SESSION['user_id'] ?? '';
    if (!$id || !$userId) { http_response_code(400); echo json_encode(['error' => 'id requerido.']); exit; }
    $pdo = db();
    $isDate  = str_starts_with($id, 'important-date-');
    $baseKey = $isDate ? preg_replace('/-\d{4}-\d{2}-\d{2}$/', '', $id) : null;
    $mid     = 'read-' . $userId . '-' . md5($id);
    $mp      = json_encode([
        'id' => $mid, 'isReadMarker' => true,
        'userId' => $userId, 'originalId' => $id, 'baseKey' => $baseKey,
        'userIds' => [$userId], 'role' => 'engineer',
        'isRead' => true, 'title' => '', 'description' => '', 'createdAt' => date('c'),
    ]);
    $pdo->prepare("INSERT INTO notifications (id, payload, sort_order) VALUES (:id,:p,0) ON DUPLICATE KEY UPDATE payload=:p2")
        ->execute([':id' => $mid, ':p' => $mp, ':p2' => $mp]);
    echo json_encode(['ok' => true]);
    exit;
}

/* ── mark_all_notifications_read — marca todas leídas para este usuario ── */
if ($action === 'mark_all_notifications_read') {
    requireAuth();
    $userId   = $_SESSION['user_id']   ?? '';
    $userRole = $_SESSION['user_role'] ?? '';
    if (!$userId) { echo json_encode(['ok' => true]); exit; }
    $state    = getUserNotifState($userId);
    $dismissed = array_flip($state['dismissedIds']);
    $alreadyRead = array_flip($state['readIds']);
    $allNotifs = tableRows('notifications');
    $pdo = db();
    $stmt = $pdo->prepare("INSERT INTO notifications (id, payload, sort_order) VALUES (:id,:p,0) ON DUPLICATE KEY UPDATE payload=:p2");
    foreach ($allNotifs as $n) {
        $nid = $n['id'] ?? '';
        if (empty($nid)) continue;
        if (!empty($n['isDismissMarker']) || !empty($n['isDismissedDateKey']) || !empty($n['isReadMarker'])) continue;
        // Rediseño: las notificaciones nuevas (con `recipients` embebido) ya se marcan leídas
        // una por una desde el frontend vía set_notification_recipient — si este endpoint
        // también les crea un marcador, reintroduce justo el problema que el rediseño elimina.
        if (isset($n['recipients'])) continue;
        if (isset($dismissed[$nid]) || isset($alreadyRead[$nid])) continue;
        $isForMe = isset($n['userIds']) && is_array($n['userIds'])
            ? in_array($userId, $n['userIds'], true)
            : ($n['role'] ?? '') === $userRole;
        if (!$isForMe) continue;
        $mid = 'read-' . $userId . '-' . md5($nid);
        $mp  = json_encode([
            'id' => $mid, 'isReadMarker' => true,
            'userId' => $userId, 'originalId' => $nid, 'baseKey' => null,
            'userIds' => [$userId], 'role' => 'engineer',
            'isRead' => true, 'title' => '', 'description' => '', 'createdAt' => date('c'),
        ]);
        $stmt->execute([':id' => $mid, ':p' => $mp, ':p2' => $mp]);
    }
    echo json_encode(['ok' => true]);
    exit;
}
