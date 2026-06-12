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

/* ── update_notif_prefs — guarda dismissed/read keys de fecha en el registro del usuario ── */
if ($action === 'update_notif_prefs') {
    requireAuth();
    $userId = $_SESSION['user_id'] ?? '';
    $data   = readJson();
    $newDismissed = array_filter((array)($data['dismissedDateKeys'] ?? []), 'is_string');
    $newRead      = array_filter((array)($data['readDateKeys']      ?? []), 'is_string');
    if ($userId && (!empty($newDismissed) || !empty($newRead))) {
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
