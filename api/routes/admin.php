<?php
declare(strict_types=1);

/* ── reset_active_passwords ── */
if ($action === 'reset_active_passwords') {
    requireSystemAdmin();
    $data = readJson();
    $password = (string) ($data['password'] ?? '');
    $confirm = (string) ($data['confirm'] ?? '');
    if ($password !== 'ASBT2026!' || $confirm !== 'RESET_ACTIVE_PASSWORDS') {
        http_response_code(400);
        echo json_encode(['error' => 'Confirmacion invalida.']);
        exit;
    }

    $users = tableRows('app_users');
    $updated = 0;
    foreach ($users as &$user) {
        if (($user['isActive'] ?? true) === false) {
            continue;
        }
        $user['password'] = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);
        $user['updatedAt'] = gmdate('c');
        $updated++;
    }
    unset($user);

    $pdo = db();
    $pdo->beginTransaction();
    replaceRows($pdo, 'app_users', $users);
    $pdo->commit();
    logActivity('password_reset_all', 'user', null, 'Usuarios activos', ['updated' => $updated]);
    echo json_encode(['ok' => true, 'updated' => $updated]);
    exit;
}

/* ── activity_logs ── */
if ($action === 'activity_logs') {
    requireSystemAdmin();
    $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 120;
    echo json_encode([
        'ok' => true,
        'activity' => activityRows($limit),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/*
 * ⚠️  ATENCIÓN — SI AGREGAS UN JOB DE LIMPIEZA DE activity_logs:
 *
 * Los registros con action = 'deleted' Y entity_type = 'project' contienen
 * el payload completo del proyecto en details.payload_backup.
 * Son el ÚNICO backup de proyectos eliminados — sin ellos, la recuperación
 * es imposible. Cualquier purga de logs DEBE excluirlos:
 *
 *   DELETE FROM activity_logs
 *   WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
 *     AND NOT (action = 'deleted' AND entity_type = 'project');  ← obligatorio
 *
 * Los logs de tipo 'updated'/'created' sí se pueden purgar sin problema.
 */

/* ── cron_backup — backup automático sin sesión, protegido por clave secreta ── */
if ($action === 'cron_backup') {
    $key = $_GET['key'] ?? '';
    if (!defined('CRON_SECRET') || $key !== CRON_SECRET) {
        http_response_code(403);
        echo json_encode(['error' => 'Clave incorrecta.']);
        exit;
    }
    $backup = [
        'version'       => 1,
        'timestamp'     => gmdate('c'),
        'generatedBy'   => 'cron',
        'users'         => tableRowsUsers(),
        'projects'      => tableRows('projects'),
        'requests'      => tableRows('requests'),
        'notifications' => tableRows('notifications'),
    ];
    $backupDir = __DIR__ . '/../../backups/';
    secureMkdir($backupDir, "Require all denied\n");
    $fname = $backupDir . 'auto-' . date('Y-m-d') . '.json';
    file_put_contents($fname, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    // Limpiar backups automáticos de más de 30 días
    $autoFiles = glob($backupDir . 'auto-*.json') ?: [];
    rsort($autoFiles);
    foreach (array_slice($autoFiles, 30) as $old) { @unlink($old); }
    echo json_encode([
        'ok'       => true,
        'saved'    => $fname,
        'projects' => count($backup['projects']),
        'users'    => count($backup['users']),
        'requests' => count($backup['requests']),
    ]);
    exit;
}

/* ── restore — restaura el sistema desde un backup JSON ── */
if ($action === 'restore') {
    requireAuth();
    $actor = sessionUser();
    if (($actor['role'] ?? '') !== 'system_admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Solo el Gestor del Sistema puede restaurar.']);
        exit;
    }
    $data = readJson();
    // Validar estructura mínima
    if (empty($data['version']) || empty($data['users']) || !is_array($data['users'])
        || !isset($data['projects']) || !is_array($data['projects'])
        || !isset($data['requests']) || !is_array($data['requests'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Backup inválido o incompleto.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (count($data['users']) === 0) {
        http_response_code(400);
        echo json_encode(['error' => 'El backup no contiene usuarios — abortado por seguridad.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    // Guardar snapshot pre-restore como respaldo
    $snap = [
        'version' => 1, 'timestamp' => gmdate('c'), 'generatedBy' => 'pre-restore-snapshot',
        'users' => tableRowsUsers(), 'projects' => tableRows('projects'),
        'requests' => tableRows('requests'), 'notifications' => tableRows('notifications'),
    ];
    $backupDir = __DIR__ . '/../../backups/';
    if (!is_dir($backupDir)) mkdir($backupDir, 0750, true);
    file_put_contents($backupDir . 'pre-restore-' . date('Y-m-d-His') . '.json',
        json_encode($snap, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    // Preservar contraseñas actuales para los usuarios que existan en la DB
    $existingUsers = tableRows('app_users');
    $pwMap = [];
    foreach ($existingUsers as $eu) {
        if (isset($eu['id'], $eu['password'])) $pwMap[$eu['id']] = $eu['password'];
    }
    $usersToRestore = $data['users'];
    foreach ($usersToRestore as &$u) {
        if (isset($u['id'], $pwMap[$u['id']])) {
            $u['password'] = $pwMap[$u['id']]; // mantener contraseña actual
        } elseif (empty($u['password'])) {
            $u['password'] = password_hash('ASBT2026!', PASSWORD_BCRYPT, ['cost' => 10]);
        }
    }
    unset($u);

    $pdo = db();
    $pdo->beginTransaction();
    syncRows($pdo, 'app_users', $usersToRestore);
    syncRows($pdo, 'projects',  $data['projects']); // restore: overwrite total, sin checar timestamps
    syncRows($pdo, 'requests',  $data['requests']);
    if (!empty($data['notifications']) && is_array($data['notifications'])) {
        syncRows($pdo, 'notifications', $data['notifications']);
    }
    $pdo->commit();

    logActivity('restored', 'system', null, null, [
        'backupTimestamp' => $data['timestamp'] ?? 'unknown',
        'projects'  => count($data['projects']),
        'users'     => count($usersToRestore),
        'requests'  => count($data['requests']),
        'restoredBy' => $actor['name'] ?? 'unknown',
    ]);
    echo json_encode([
        'ok'       => true,
        'restored' => [
            'users'    => count($usersToRestore),
            'projects' => count($data['projects']),
            'requests' => count($data['requests']),
        ],
    ]);
    exit;
}

/* ── backup_files — descarga ZIP con todos los archivos subidos (solo gestor) ── */
if ($action === 'backup_files') {
    requireSystemAdmin();
    $uploadsDir = __DIR__ . '/../../uploads/projectra/';
    if (!is_dir($uploadsDir) || !class_exists('ZipArchive')) {
        http_response_code(204); exit;
    }
    $tmpFile = sys_get_temp_dir() . '/enerman-files-' . date('Ymd-His') . '.zip';
    $zip = new ZipArchive();
    if ($zip->open($tmpFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        http_response_code(500);
        echo json_encode(['error' => 'No se pudo crear el ZIP.']);
        exit;
    }
    $iter = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($uploadsDir, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    $fileCount = 0;
    foreach ($iter as $file) {
        if ($file->isFile()) {
            $localPath = ltrim(str_replace($uploadsDir, '', $file->getPathname()), DIRECTORY_SEPARATOR . '/');
            $zip->addFile($file->getPathname(), $localPath);
            $fileCount++;
        }
    }
    $zip->close();
    if ($fileCount === 0) { @unlink($tmpFile); http_response_code(204); exit; }
    logActivity('backup', 'files', null, null, ['files' => $fileCount]);
    $filename = 'enerman-archivos-' . date('Ymd-His') . '.zip';
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($tmpFile));
    readfile($tmpFile);
    @unlink($tmpFile);
    exit;
}

/* ── backup — descarga JSON con todo el estado actual ── */
if ($action === 'backup') {
    requireAuth();
    $actor = sessionUser();
    if (!in_array($actor['role'] ?? '', ['admin', 'system_admin'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Solo admin puede hacer backup.']);
        exit;
    }
    $backup = [
        'version'       => 1,
        'timestamp'     => gmdate('c'),
        'generatedBy'   => $actor['name'] ?? 'unknown',
        'users'         => tableRowsUsers(),
        'projects'      => tableRows('projects'),
        'requests'      => tableRows('requests'),
        'notifications' => tableRows('notifications'),
    ];
    // Guardar copia en el servidor (hasta 10 backups, borra los más antiguos)
    $backupDir = __DIR__ . '/../../backups/';
    secureMkdir($backupDir, "Require all denied\n");
    if (true) {
        $fname = $backupDir . 'backup-' . date('Y-m-d-His') . '.json';
        file_put_contents($fname, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $files = glob($backupDir . 'backup-*.json') ?: [];
        rsort($files);
        foreach (array_slice($files, 10) as $old) { @unlink($old); }
    }
    logActivity('backup', 'system', null, null, ['generatedBy' => $actor['name'] ?? '']);
    // Devolver como descarga directa
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="enerman-backup-' . date('Y-m-d-His') . '.json"');
    echo json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ── export_backup — descarga completa de la BD en JSON (solo system_admin) ── */
if ($action === 'export_backup') {
    requireSystemAdmin();
    $pdo = db();
    $tables = ['app_users', 'projects', 'requests', 'notifications'];
    $export = ['exportedAt' => gmdate('c'), 'version' => '1.0', 'tables' => []];
    foreach ($tables as $table) {
        $rows = $pdo->query("SELECT payload FROM {$table} ORDER BY sort_order ASC, updated_at DESC")->fetchAll();
        $export['tables'][$table] = array_map(static fn($r) => json_decode($r['payload'], true), $rows);
    }
    // Ocultar contraseñas del backup por seguridad
    foreach ($export['tables']['app_users'] as &$u) { unset($u['password']); }
    unset($u);
    $filename = 'enerman-backup-' . gmdate('Ymd-His') . '.json';
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store');
    echo json_encode($export, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}
