<?php
declare(strict_types=1);

/* ── emergency_reset ── */
if ($action === 'emergency_reset') {
    requireSystemAdmin(); // Requiere sesión autenticada — llave pública eliminada
    ensureSeedUsers();
    $users = tableRows('app_users');
    $hash = password_hash('ASBT2026!', PASSWORD_BCRYPT, ['cost' => 10]);
    foreach ($users as &$u) {
        $u['password'] = $hash;
    }
    unset($u);
    $pdo = db();
    $pdo->beginTransaction();
    replaceRows($pdo, 'app_users', $users);
    $pdo->commit();
    echo json_encode(['ok' => true, 'reset' => count($users), 'msg' => 'Contraseñas restablecidas a ASBT2026!']);
    exit;
}

/* ── bootstrap ── */
if ($action === 'bootstrap') {
    ensureSeedUsers();
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['ok' => false, 'error' => 'session_required']);
        exit;
    }
    $bootstrapUserId = $_SESSION['user_id'] ?? '';
    session_write_close(); // solo lectura — liberar lock de sesión antes de las queries
    $state     = getUserNotifState($bootstrapUserId);
    $dismissed = array_flip($state['dismissedIds']);
    $readSet   = array_flip($state['readIds']);
    // Leer prefs del registro de usuario (fuente autoritativa)
    $stmtUser = db()->prepare("SELECT payload FROM app_users WHERE id = :id");
    $stmtUser->execute([':id' => $bootstrapUserId]);
    $currentUserData     = json_decode($stmtUser->fetchColumn() ?: '{}', true);
    $userDismissedKeys   = (array)($currentUserData['dismissedNotifKeys'] ?? []);
    $userReadKeys        = (array)($currentUserData['readNotifKeys'] ?? []);
    $allDismissedDateKeys = array_values(array_unique(array_merge($state['dismissedDateKeys'], $userDismissedKeys)));
    $allReadDateKeys      = array_values(array_unique(array_merge($state['readDateKeys'],      $userReadKeys)));
    // IDs de notificaciones regulares descartadas/leídas — guardados en user payload como respaldo
    $userDismissedIds = (array)($currentUserData['dismissedNotifIds'] ?? []);
    $userReadIds      = (array)($currentUserData['readNotifIds']      ?? []);
    // Combinar con los markers de la tabla de notificaciones
    if (!empty($userDismissedIds)) {
        $dismissed = array_merge($dismissed, array_flip($userDismissedIds));
    }
    if (!empty($userReadIds)) {
        $readSet = array_merge($readSet, array_flip($userReadIds));
    }
    $allNotifs = tableRows('notifications');
    $regularNotifs = [];
    foreach ($allNotifs as $n) {
        $nid = $n['id'] ?? '';
        // Excluir todos los markers internos
        if (!empty($n['isDismissMarker']) || !empty($n['isDismissedDateKey']) || !empty($n['isReadMarker'])) continue;
        // Excluir notificaciones que este usuario ya descartó
        if (isset($dismissed[$nid])) continue;
        // Calcular isRead por usuario
        $n['isRead'] = isset($readSet[$nid]) ? true : ($n['isRead'] ?? false);
        $regularNotifs[] = $n;
    }
    echo json_encode([
        'users'             => tableRowsUsers(),
        'projects'          => tableRows('projects'),
        'requests'          => tableRows('requests'),
        'notifications'     => $regularNotifs,
        'dismissedDateKeys' => $allDismissedDateKeys,
        'readDateKeys'      => $allReadDateKeys,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ── login ── */
if ($action === 'login') {
    ensureSeedUsers();
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $blocked = checkRateLimit($ip);
    if ($blocked) {
        http_response_code(429);
        echo json_encode(['error' => $blocked]);
        exit;
    }
    $data = readJson();
    $user = verifyCredentials($data['email'] ?? '', $data['password'] ?? '');
    if (!$user) {
        recordFailedLogin($ip);
        http_response_code(401);
        echo json_encode(['error' => 'Credenciales incorrectas.']);
        exit;
    }
    clearRateLimit($ip);
    unset($user['password']);
    $_SESSION['user_id']   = $user['id'];
    $_SESSION['user_role'] = $user['role'];
    if (!isset($_SESSION['authenticated_users'])) $_SESSION['authenticated_users'] = [];
    if (!in_array($user['id'], $_SESSION['authenticated_users'], true)) {
        $_SESSION['authenticated_users'][] = $user['id'];
    }
    logActivity('login', 'user', $user['id'] ?? null, $user['name'] ?? null, ['email' => $user['email'] ?? null], $user);
    echo json_encode(['ok' => true, 'user' => $user], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ── logout ── */
if ($action === 'logout') {
    $loggingOutId = $_SESSION['user_id'] ?? null;
    if ($loggingOutId && isset($_SESSION['authenticated_users'])) {
        $_SESSION['authenticated_users'] = array_values(
            array_filter($_SESSION['authenticated_users'], static fn($id) => $id !== $loggingOutId)
        );
    }
    unset($_SESSION['user_id'], $_SESSION['user_role']);
    echo json_encode(['ok' => true]);
    exit;
}

/* ── switch_session ── */
if ($action === 'switch_session') {
    $data     = readJson();
    $targetId = (string)($data['user_id'] ?? '');
    $allowed  = $_SESSION['authenticated_users'] ?? [];
    if (!$targetId || !in_array($targetId, $allowed, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Usuario no autenticado en esta sesión.']);
        exit;
    }
    $allUsers = tableRows('app_users');
    $found    = null;
    foreach ($allUsers as $u) {
        if (($u['id'] ?? '') === $targetId) { $found = $u; break; }
    }
    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'Usuario no encontrado.']);
        exit;
    }
    $_SESSION['user_id']   = $found['id'];
    $_SESSION['user_role'] = $found['role'];
    echo json_encode(['ok' => true]);
    exit;
}

