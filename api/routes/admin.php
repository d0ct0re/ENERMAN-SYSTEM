<?php
declare(strict_types=1);

/* ── get_app_settings — switches de "Funciones" (lectura para cualquier sesión,
   ya que admin/supervisor necesitan saber si una sección está habilitada o no) ── */
if ($action === 'get_app_settings') {
    requireAuth();
    echo json_encode(['ok' => true, 'settings' => getAppSettings()], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ── set_app_setting — solo el Gestor del sistema puede prender/apagar switches ── */
if ($action === 'set_app_setting') {
    requireSystemAdmin();
    $data = readJson();
    $name = (string)($data['name'] ?? '');
    if (!array_key_exists($name, APP_SETTINGS_DEFAULTS)) {
        http_response_code(400);
        echo json_encode(['error' => 'Switch desconocido.']);
        exit;
    }
    $value = $data['value'] ?? null;
    setAppSetting($name, $value);
    logActivity('updated', 'app_setting', $name, $name, ['value' => $value]);
    echo json_encode(['ok' => true, 'settings' => getAppSettings()], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ── admin_dashboard ── */
if ($action === 'admin_dashboard') {
    requireSystemAdmin();
    $projects      = tableRows('projects');
    $users         = tableRowsUsers();
    $requests      = tableRows('requests');
    $notifications = tableRows('notifications');

    $activeStatuses = ['en-concurso', 'en-programacion', 'in-progress', 'pendiente-aprobacion', 'pendiente-autorizar', 'reasignado', 'cierre-por-sistema', 'comparativa'];
    $activeCount    = count(array_filter($projects, static fn($p) => in_array($p['status'] ?? '', $activeStatuses, true)));
    $unpaidCount    = count(array_filter($projects, static fn($p) => ($p['paymentStatus'] ?? '') === 'unpaid'));
    $reviewCount    = count(array_filter($requests,  static fn($r) => ($r['status'] ?? '') === 'under-review'));

    echo json_encode([
        'ok'          => true,
        'counts'      => [
            'projects'      => count($projects),
            'users'         => count($users),
            'requests'      => count($requests),
            'notifications' => count($notifications),
            'active'        => $activeCount,
            'unpaid'        => $unpaidCount,
            'underReview'   => $reviewCount,
        ],
        'projects'      => $projects,
        'users'         => $users,
        'requests'      => $requests,
        'recentHistory' => array_slice(allHistory($projects), 0, 50),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

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

/* ── bulk_delete_before_folio — limpieza de datos de prueba: borra proyectos sin folio o con
   folio menor al umbral (y sus mensajes + archivos subidos), más las solicitudes que no
   quedaron vinculadas a un proyecto sobreviviente. Irreversible — requiere confirmación. ── */
if ($action === 'bulk_delete_before_folio') {
    requireSystemAdmin();
    $data      = readJson();
    $threshold = (int)($data['folio'] ?? 0);
    $confirm   = (string)($data['confirm'] ?? '');
    if ($threshold < 1 || $threshold > 999999) {
        http_response_code(400);
        echo json_encode(['error' => 'Folio inválido.']);
        exit;
    }
    if ($confirm !== 'ELIMINAR_PROYECTOS_ANTERIORES') {
        http_response_code(400);
        echo json_encode(['error' => 'Confirmación inválida.']);
        exit;
    }

    $pdo = db();

    // Proyectos a eliminar: sin folio asignado o con folio menor al umbral.
    // Se trae el payload completo (no solo el id) para poder respaldarlo antes de borrar.
    $stmt = $pdo->prepare("SELECT id, payload FROM projects WHERE folio IS NULL OR folio < :t");
    $stmt->execute([':t' => $threshold]);
    $deleteProjectRows = $stmt->fetchAll();
    $deleteProjectIds  = array_column($deleteProjectRows, 'id');

    // Solicitudes huérfanas: las que NO quedan vinculadas a un proyecto que sobrevive
    // (folio >= umbral). Cubre tanto las nunca aprobadas como las ligadas a un proyecto
    // que se está borrando en este mismo paso.
    $survStmt = $pdo->prepare("SELECT id FROM projects WHERE folio >= :t");
    $survStmt->execute([':t' => $threshold]);
    $survivingProjectIds = array_flip(array_column($survStmt->fetchAll(), 'id'));

    $deleteRequestIds = [];
    $deleteRequestRows = [];
    foreach (tableRows('requests') as $r) {
        $rid = $r['id'] ?? '';
        if (!$rid) continue;
        $linked = $r['linkedProjectId'] ?? null;
        if (!$linked || !isset($survivingProjectIds[$linked])) {
            $deleteRequestIds[] = $rid;
            $deleteRequestRows[] = $r;
        }
    }

    // Respaldo completo de cada proyecto/solicitud ANTES de borrar para siempre —
    // recuperable a mano en caso de error, igual que delete_project/delete_request.
    foreach ($deleteProjectRows as $row) {
        $payload = json_decode($row['payload'], true);
        if (is_array($payload)) archiveDeletedItem('project', $row['id'], $payload);
    }
    foreach ($deleteRequestRows as $r) {
        archiveDeletedItem('request', $r['id'], $r);
    }

    if (!empty($deleteProjectIds)) {
        $placeholders = implode(',', array_fill(0, count($deleteProjectIds), '?'));
        $pdo->prepare("DELETE FROM projects WHERE id IN ($placeholders)")->execute($deleteProjectIds);
        $pdo->prepare("DELETE FROM project_messages WHERE project_id IN ($placeholders)")->execute($deleteProjectIds);
        foreach ($deleteProjectIds as $pid) {
            $dir = __DIR__ . '/../../uploads/projectra/' . $pid . '/';
            if (is_dir($dir)) deleteDirRecursive($dir);
            // Notificaciones que apuntaban a este proyecto — mismo fix que delete_project.
            deleteNotificationsFor('relatedProjectId', $pid);
        }
    }
    if (!empty($deleteRequestIds)) {
        $placeholdersR = implode(',', array_fill(0, count($deleteRequestIds), '?'));
        $pdo->prepare("DELETE FROM requests WHERE id IN ($placeholdersR)")->execute($deleteRequestIds);
        foreach ($deleteRequestIds as $rid) {
            deleteNotificationsFor('relatedRequestId', $rid);
        }
    }

    logActivity(
        'bulk_deleted',
        'projects',
        null,
        "Limpieza masiva: folio < {$threshold}",
        ['threshold' => $threshold, 'deleted_projects' => count($deleteProjectIds), 'deleted_requests' => count($deleteRequestIds)],
    );

    echo json_encode([
        'ok'              => true,
        'deletedProjects' => count($deleteProjectIds),
        'deletedRequests' => count($deleteRequestIds),
    ], JSON_UNESCAPED_UNICODE);
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

/* ── cron_daily_kpi_email — digest diario (pagados/no pagados, proyectos vencidos,
   solicitudes aprobadas) por correo. Sin sesión, protegido por CRON_SECRET igual que
   cron_backup. Solo lee la BD — nunca escribe nada, así que en el peor caso el correo
   sale mal formado, jamás corrompe un registro. ── */
if ($action === 'cron_daily_kpi_email') {
    $key = $_GET['key'] ?? '';
    if (!defined('CRON_SECRET') || $key !== CRON_SECRET) {
        http_response_code(403);
        echo json_encode(['error' => 'Clave incorrecta.']);
        exit;
    }

    $settings = getAppSettings();
    if (empty($settings['kpiEmailEnabled'])) {
        echo json_encode(['ok' => true, 'skipped' => 'kpiEmailEnabled esta apagado']);
        exit;
    }
    $recipients = validEmails((array) ($settings['kpiRecipients'] ?? []));
    if (empty($recipients)) {
        echo json_encode(['ok' => true, 'skipped' => 'sin destinatarios configurados']);
        exit;
    }

    $digest = buildKpiDigest();
    $html   = renderKpiDigestHtml($digest);

    try {
        sendSmtpMail($recipients, 'Resumen diario ENERMAN — ' . date('d/m/Y'), $html);
    } catch (\Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Fallo el envio: ' . $e->getMessage()]);
        exit;
    }

    echo json_encode([
        'ok'          => true,
        'sentTo'      => count($recipients),
        'paidCount'   => $digest['paidCount'],
        'unpaidCount' => $digest['unpaidCount'],
        'overdue'     => count($digest['overdue']),
        'approved'    => count($digest['approved']),
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
