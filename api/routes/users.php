<?php
declare(strict_types=1);

/* ── update_user_role ── */
if ($action === 'update_user_role') {
    requireAdmin();
    $data    = readJson();
    $userId  = trim($data['user_id'] ?? '');
    $newRole = trim($data['new_role'] ?? '');
    $allowed = ['system_admin', 'supervisor', 'admin', 'engineer'];
    if (!$userId || !in_array($newRole, $allowed, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'user_id y new_role valido requeridos.']);
        exit;
    }
    $roleLabels = ['system_admin' => 'Gestor del sistema', 'supervisor' => 'Supervisor', 'admin' => 'Administracion', 'engineer' => 'Ingeniero'];
    $users   = tableRows('app_users');
    $updated = false;
    $updatedUserName = $userId;
    foreach ($users as &$user) {
        if ($user['id'] === $userId) {
            $user['role']      = $newRole;
            $user['roleLabel'] = $roleLabels[$newRole] ?? $newRole;
            $user['updatedAt'] = gmdate('c');
            $updatedUserName = $user['name'] ?? $userId;
            $updated = true;
            break;
        }
    }
    unset($user);
    if (!$updated) {
        http_response_code(404);
        echo json_encode(['error' => 'Usuario no encontrado.']);
        exit;
    }
    $pdo = db();
    $pdo->beginTransaction();
    replaceRows($pdo, 'app_users', $users);
    $pdo->commit();
    logActivity('role_updated', 'user', $userId, $updatedUserName, ['newRole' => $newRole]);
    echo json_encode(['ok' => true]);
    exit;
}

/* ── create_user ── */
if ($action === 'create_user') {
    requireSystemAdmin();
    $data = readJson();
    foreach (['id', 'firstName', 'lastName', 'email', 'role', 'password'] as $f) {
        if (empty($data[$f])) {
            http_response_code(400);
            echo json_encode(['error' => "Campo requerido: {$f}"]);
            exit;
        }
    }
    $allowed = ['system_admin', 'supervisor', 'admin', 'engineer'];
    if (!in_array($data['role'], $allowed, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Rol invalido.']);
        exit;
    }
    $email = strtolower(trim($data['email']));
    foreach (tableRows('app_users') as $u) {
        if (strtolower($u['email'] ?? '') === $email) {
            http_response_code(409);
            echo json_encode(['error' => 'Correo ya registrado.']);
            exit;
        }
    }
    $labels  = ['system_admin' => 'Gestor del sistema', 'supervisor' => 'Supervisor', 'admin' => 'Administracion', 'engineer' => 'Ingeniero'];
    $first   = trim($data['firstName']);
    $last    = trim($data['lastName']);
    $now     = gmdate('c');
    $user    = [
        'id'         => $data['id'],
        'firstName'  => $first,
        'lastName'   => $last,
        'name'       => trim("$first $last"),
        'email'      => $email,
        'role'       => $data['role'],
        'roleLabel'  => $labels[$data['role']],
        'avatar'     => strtoupper(substr($first, 0, 1) . substr($last, 0, 1)),
        'department' => trim($data['department'] ?? ''),
        'password'   => password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => 10]),
        'isActive'   => true,
        'createdAt'  => $now,
        'updatedAt'  => $now,
    ];
    $nextOrder = (int) db()->query('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM app_users')->fetchColumn();
    $stmt = db()->prepare(
        "INSERT INTO app_users (id, payload, sort_order)
         VALUES (:id, :payload, :so)
         ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = NOW()"
    );
    $stmt->execute([':id' => $user['id'], ':payload' => json_encode($user, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':so' => $nextOrder]);
    logActivity('created', 'user', $user['id'], $user['name'], ['role' => $user['role']]);
    unset($user['password']);
    echo json_encode(['ok' => true, 'user' => $user], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ── update_user ── */
if ($action === 'update_user') {
    requireSystemAdmin();
    $data   = readJson();
    $userId = trim($data['id'] ?? '');
    if (!$userId) {
        http_response_code(400);
        echo json_encode(['error' => 'id requerido.']);
        exit;
    }
    $existing = null;
    foreach (tableRows('app_users') as $u) {
        if ($u['id'] === $userId) { $existing = $u; break; }
    }
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'Usuario no encontrado.']);
        exit;
    }
    $labels  = ['system_admin' => 'Gestor del sistema', 'supervisor' => 'Supervisor', 'admin' => 'Administracion', 'engineer' => 'Ingeniero'];
    $role    = $data['role'] ?? $existing['role'];
    $first   = trim($data['firstName'] ?? $existing['firstName'] ?? '');
    $last    = trim($data['lastName']  ?? $existing['lastName']  ?? '');
    $merged  = array_merge($existing, [
        'firstName'  => $first,
        'lastName'   => $last,
        'name'       => trim("$first $last") ?: $existing['name'],
        'avatar'     => strtoupper(substr($first, 0, 1) . substr($last, 0, 1)) ?: ($existing['avatar'] ?? ''),
        'email'      => strtolower(trim($data['email'] ?? $existing['email'])),
        'role'       => $role,
        'roleLabel'  => $labels[$role] ?? $existing['roleLabel'],
        'department' => trim($data['department'] ?? $existing['department'] ?? ''),
        'isActive'   => $data['isActive'] ?? $existing['isActive'],
        'updatedAt'  => gmdate('c'),
    ]);
    if (!empty($data['password'])) {
        $merged['password'] = password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => 10]);
    }
    $stmt = db()->prepare("UPDATE app_users SET payload = :p, updated_at = NOW() WHERE id = :id");
    $stmt->execute([':p' => json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $userId]);
    logActivity('updated', 'user', $userId, $merged['name'], ['role' => $merged['role']]);
    unset($merged['password']);
    echo json_encode(['ok' => true, 'user' => $merged], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ── delete_user ── */
if ($action === 'delete_user') {
    requireSystemAdmin();
    $data   = readJson();
    $userId = trim($data['id'] ?? '');
    if (!$userId) {
        http_response_code(400);
        echo json_encode(['error' => 'id requerido.']);
        exit;
    }
    if ($userId === ($_SESSION['user_id'] ?? '')) {
        http_response_code(400);
        echo json_encode(['error' => 'No puedes eliminarte a ti mismo.']);
        exit;
    }
    $stmt = db()->prepare("DELETE FROM app_users WHERE id = :id");
    $stmt->execute([':id' => $userId]);
    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Usuario no encontrado.']);
        exit;
    }
    logActivity('deleted', 'user', $userId, $userId);
    echo json_encode(['ok' => true]);
    exit;
}
