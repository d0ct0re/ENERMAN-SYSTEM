<?php
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

// Borra una carpeta y todo su contenido — usada al eliminar en bloque los archivos
// subidos de un proyecto (uploads/projectra/{id}/). rmdir() nativo solo borra vacías.
function deleteDirRecursive(string $dir): void
{
    if (!is_dir($dir)) return;
    $items = scandir($dir);
    if ($items === false) return;
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . '/' . $item;
        if (is_dir($path)) {
            deleteDirRecursive($path);
        } else {
            @unlink($path);
        }
    }
    @rmdir($dir);
}

function readJson(): array
{
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw ?: '[]', true);
    if (!is_array($data)) {
        throw new RuntimeException('JSON invalido.');
    }
    return $data;
}

/**
 * Devuelve los IDs de notificaciones descartadas y leídas por un usuario específico.
 * Lee todos los markers de la tabla notifications y los clasifica.
 */
function getUserNotifState(string $userId): array {
    $stmt = db()->query("SELECT payload FROM notifications ORDER BY sort_order ASC, id ASC");
    $rows = array_filter(
        array_map(static fn(array $r) => json_decode($r['payload'], true), $stmt->fetchAll()),
        static fn($r) => is_array($r)
    );
    $dismissedIds      = [];
    $dismissedDateKeys = [];
    $readIds           = [];
    $readDateKeys      = [];
    foreach ($rows as $n) {
        if (($n['userId'] ?? '') !== $userId) continue;
        if (!empty($n['isDismissMarker'])) {
            if (!empty($n['originalId']))  $dismissedIds[]      = $n['originalId'];
            if (!empty($n['baseKey']))     $dismissedDateKeys[] = $n['baseKey'];
        } elseif (!empty($n['isDismissedDateKey'])) { // backward compat
            if (!empty($n['baseKey']))     $dismissedDateKeys[] = $n['baseKey'];
        } elseif (!empty($n['isReadMarker'])) {
            if (!empty($n['originalId']))  $readIds[]           = $n['originalId'];
            if (!empty($n['baseKey']))     $readDateKeys[]      = $n['baseKey'];
        }
    }
    return [
        'dismissedIds'      => array_unique($dismissedIds),
        'dismissedDateKeys' => array_unique($dismissedDateKeys),
        'readIds'           => array_unique($readIds),
        'readDateKeys'      => array_unique($readDateKeys),
    ];
}

// ── Visibilidad de datos por rol ────────────────────────────────────────────
// admin/system_admin/supervisor ven todo (regla de negocio ya usada en update_project
// y replicada en el frontend: engineerCalendarProjects en App.tsx filtra exactamente
// igual). engineer solo ve sus propios proyectos/solicitudes (creador o participante).
// Antes de esto, bootstrap/poll mandaban TODOS los proyectos (financieros, clientes,
// facturas) a CUALQUIER sesion autenticada y el frontend nomas los escondia — cualquiera
// con la pestaña de red abierta veia la base de datos completa. Filtrar aqui es lo que
// realmente protege el dato, no el filtro visual del cliente.
function canSeeProject(array $project, string $userId, string $userRole): bool
{
    if (in_array($userRole, ['admin', 'system_admin', 'supervisor'], true)) {
        return true;
    }
    if (($project['createdBy'] ?? '') === $userId) {
        return true;
    }
    return in_array($userId, $project['participants'] ?? [], true);
}

function canSeeRequest(array $request, string $userId, string $userRole): bool
{
    if (in_array($userRole, ['admin', 'system_admin', 'supervisor'], true)) {
        return true;
    }
    return ($request['createdBy'] ?? '') === $userId;
}

function tableRows(string $table): array
{
    $stmt = db()->query("SELECT payload FROM {$table} ORDER BY sort_order ASC, id ASC");
    $rows = array_map(static fn(array $row) => json_decode($row['payload'], true), $stmt->fetchAll());
    // Descartar filas cuyo payload no decodifico a un array (JSON corrupto/vacio) — bajo
    // strict_types un solo registro asi tumbaba con 500 a cualquier caller que espere array
    // (ej. tableRowsUsers, bootstrap), rompiendo la app entera por un solo registro malo.
    return array_values(array_filter($rows, static fn($r) => is_array($r)));
}

function tableRowsUsers(): array
{
    $rows = tableRows('app_users');
    return array_map(static function (array $u): array {
        unset($u['password']);
        return $u;
    }, $rows);
}

function activityRows(int $limit = 120): array
{
    $limit = max(1, min($limit, 300));
    $stmt = db()->query("SELECT id, user_id, user_name, user_role, action, entity_type, entity_id, entity_name, details, ip_address, user_agent, created_at FROM activity_logs ORDER BY created_at DESC LIMIT {$limit}");
    return array_map(static function (array $row): array {
        $row['details'] = $row['details'] ? json_decode($row['details'], true) : null;
        return $row;
    }, $stmt->fetchAll());
}

function sessionUser(): ?array
{
    // Caché a nivel de request: evita múltiples SELECT por petición
    static $cached  = false;
    static $hasRun  = false;
    if ($hasRun) {
        return $cached;
    }
    $hasRun = true;

    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) {
        $cached = null;
        return null;
    }

    // Consulta directa por id — sin escanear toda la tabla
    $stmt = db()->prepare("SELECT payload FROM app_users WHERE id = ? LIMIT 1");
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    $cached = $row ? json_decode($row['payload'], true) : null;
    return $cached;
}

function logActivity(string $action, string $entityType, ?string $entityId = null, ?string $entityName = null, array $details = [], ?array $actor = null): void
{
    try {
        $actor = $actor ?? sessionUser();
        $stmt = db()->prepare(
            "INSERT INTO activity_logs (id, user_id, user_name, user_role, action, entity_type, entity_id, entity_name, details, ip_address, user_agent)
             VALUES (:id, :user_id, :user_name, :user_role, :action, :entity_type, :entity_id, :entity_name, :details, :ip_address, :user_agent)"
        );
        $stmt->execute([
            ':id'          => 'log-' . bin2hex(random_bytes(12)),
            ':user_id'     => $actor['id'] ?? null,
            ':user_name'   => $actor['name'] ?? null,
            ':user_role'   => $actor['role'] ?? null,
            ':action'      => $action,
            ':entity_type' => $entityType,
            ':entity_id'   => $entityId,
            ':entity_name' => $entityName,
            ':details'     => json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':ip_address'  => $_SERVER['REMOTE_ADDR'] ?? null,
            ':user_agent'  => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
        ]);
    } catch (Throwable) {
        // Activity logging should never block the operational flow.
    }
}

function itemName(array $item): string
{
    return (string) ($item['structuredName'] ?? $item['name'] ?? $item['baseName'] ?? $item['title'] ?? $item['id'] ?? '');
}

function itemSummary(array $item): array
{
    return [
        'name'          => itemName($item),
        'status'        => $item['status'] ?? null,
        'paymentStatus' => $item['paymentStatus'] ?? null,
        'total'         => $item['totalContratado'] ?? null,
        'updatedAt'     => $item['updatedAt'] ?? null,
    ];
}

function logCollectionChanges(string $entityType, array $before, array $after): void
{
    $beforeById = [];
    $afterById = [];
    foreach ($before as $item) {
        if (isset($item['id'])) {
            $beforeById[(string) $item['id']] = $item;
        }
    }
    foreach ($after as $item) {
        if (isset($item['id'])) {
            $afterById[(string) $item['id']] = $item;
        }
    }

    foreach ($afterById as $id => $item) {
        if (!isset($beforeById[$id])) {
            logActivity('created', $entityType, $id, itemName($item), ['after' => itemSummary($item)]);
            continue;
        }
        if (json_encode($beforeById[$id]) !== json_encode($item)) {
            logActivity('updated', $entityType, $id, itemName($item), [
                'before' => itemSummary($beforeById[$id]),
                'after'  => itemSummary($item),
            ]);
        }
    }

    foreach ($beforeById as $id => $item) {
        if (!isset($afterById[$id])) {
            logActivity('deleted', $entityType, $id, itemName($item), ['before' => itemSummary($item)]);
        }
    }
}

function replaceRows(PDO $pdo, string $table, array $items): void
{
    $pdo->exec("DELETE FROM {$table}");
    $stmt = $pdo->prepare("INSERT INTO {$table} (id, payload, sort_order) VALUES (:id, :payload, :sort_order)");
    foreach (array_values($items) as $index => $item) {
        if (!isset($item['id'])) {
            throw new RuntimeException("Elemento sin id en {$table}.");
        }
        $stmt->execute([
            ':id'         => (string) $item['id'],
            ':payload'    => json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':sort_order' => $index,
        ]);
    }
}

// Upsert por fila + borra solo las filas ausentes. Evita el DELETE masivo que borra todo ante un fallo parcial.
function syncRows(PDO $pdo, string $table, array $items): void
{
    $ids  = [];
    $stmt = $pdo->prepare(
        "INSERT INTO {$table} (id, payload, sort_order)
         VALUES (:id, :payload, :sort_order)
         ON DUPLICATE KEY UPDATE payload = VALUES(payload), sort_order = VALUES(sort_order), updated_at = NOW()"
    );
    foreach (array_values($items) as $i => $item) {
        if (!isset($item['id'])) {
            throw new RuntimeException("Elemento sin id en {$table}.");
        }
        $ids[] = (string) $item['id'];
        $stmt->execute([
            ':id'         => (string) $item['id'],
            ':payload'    => json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':sort_order' => $i,
        ]);
    }
    if (!empty($ids)) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("DELETE FROM {$table} WHERE id NOT IN ({$ph})")->execute($ids);
    } else {
        $pdo->exec("DELETE FROM {$table}");
    }
}

// Igual que syncRows pero para proyectos: NO sobreescribe si la BD tiene un updatedAt más reciente.
// Esto protege los cambios atómicos de apiUpdateProject cuando save_state llega con datos viejos
// (ej. ingeniero en grace period que aún no recibió el cambio del admin por polling).
//
// La comparación se hace en PHP con strtotime(), NO como string en SQL: PHP emite
// '...+00:00' (gmdate('c')) y JS emite '...123Z' (toISOString()), y comparar esos strings
// crudos (ya sea en SQL con JSON_EXTRACT o con '>' en PHP) hacía que el timestamp de JS
// "ganara" por formato cuando ambos caían en el mismo segundo, aunque el de PHP fuera en
// realidad el más reciente — revirtiendo silenciosamente ediciones atómicas recientes.
function syncProjectRows(PDO $pdo, array $items): void
{
    $ids = [];
    $selectStmt = $pdo->prepare("SELECT payload FROM projects WHERE id = :id LIMIT 1");
    $upsertStmt = $pdo->prepare(
        "INSERT INTO projects (id, payload, sort_order, updated_at)
         VALUES (:id, :payload, :sort_order, NOW())
         ON DUPLICATE KEY UPDATE
           payload    = VALUES(payload),
           sort_order = VALUES(sort_order),
           updated_at = NOW()"
    );
    foreach (array_values($items) as $i => $item) {
        if (!isset($item['id'])) {
            throw new RuntimeException("Proyecto sin id.");
        }
        $id = (string) $item['id'];
        $ids[] = $id;

        $selectStmt->execute([':id' => $id]);
        $currentPayloadRaw = $selectStmt->fetchColumn();
        $payloadToWrite = $item;
        if ($currentPayloadRaw !== false) {
            $current = json_decode($currentPayloadRaw, true);
            $currentUpdatedAt  = is_array($current) ? ($current['updatedAt'] ?? '') : '';
            $incomingUpdatedAt = $item['updatedAt'] ?? '';
            $currentTs  = $currentUpdatedAt  ? strtotime($currentUpdatedAt)  : false;
            $incomingTs = $incomingUpdatedAt ? strtotime($incomingUpdatedAt) : false;
            if ($currentTs !== false && $incomingTs !== false && $currentTs > $incomingTs) {
                $payloadToWrite = $current; // BD más reciente — conservar, no revertir
            }
        }

        $upsertStmt->execute([
            ':id'         => $id,
            ':payload'    => json_encode($payloadToWrite, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':sort_order' => $i,
        ]);
    }
    // save_state NUNCA borra proyectos. El único mecanismo de borrado es delete_project (endpoint atómico).
    // Cualquier DELETE aquí crea race conditions: save_state puede llegar con estado React viejo
    // que no incluye un proyecto recién creado por otro usuario, y lo borraría de la BD.
}

function verifyCredentials(string $email, string $password): ?array
{
    $email = strtolower(trim($email));
    foreach (tableRows('app_users') as $user) {
        if (strtolower($user['email'] ?? '') !== $email || ($user['isActive'] ?? true) === false) {
            continue;
        }
        $stored = $user['password'] ?? 'ASBT2026!';
        $isHash = str_starts_with($stored, '$2y$') || str_starts_with($stored, '$2b$');
        $valid  = $isHash ? password_verify($password, $stored) : ($password === $stored);
        if ($valid && !$isHash) {
            $user['password'] = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);
            $user['updatedAt'] = gmdate('c');
            $stmt = db()->prepare("UPDATE app_users SET payload = :p, updated_at = NOW() WHERE id = :id");
            $stmt->execute([':p' => json_encode($user, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $user['id']]);
        }
        return $valid ? $user : null;
    }
    return null;
}

function allHistory(array $projects): array
{
    $history = [];
    foreach ($projects as $project) {
        foreach ($project['history'] ?? [] as $entry) {
            $history[] = [
                'id'          => $entry['id'] ?? '',
                'createdAt'   => $entry['createdAt'] ?? '',
                'action'      => $entry['action'] ?? '',
                'author'      => $entry['author'] ?? '',
                'projectId'   => $project['id'] ?? '',
                'projectName' => $project['structuredName'] ?? ($project['baseName'] ?? ''),
                'client'      => $project['client'] ?? '',
            ];
        }
    }
    usort($history, static fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
    return $history;
}

// ── Seguridad: crea un directorio y lo protege con .htaccess inmediatamente ──
function secureMkdir(string $dir, string $htaccessContent): void
{
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    $htFile = $dir . '.htaccess';
    @file_put_contents($htFile, $htaccessContent, LOCK_EX);
}

// ── Rate limiting por IP usando archivos temporales ──
function rlFilePath(string $ip): string
{
    return sys_get_temp_dir() . '/ampr_rl_' . md5($ip) . '.json';
}

function checkRateLimit(string $ip): ?string
{
    $file = rlFilePath($ip);
    if (!file_exists($file)) return null;
    $data = json_decode(file_get_contents($file), true);
    if (!is_array($data)) return null;
    if (isset($data['until']) && time() < (int)$data['until']) {
        $wait = ceil(((int)$data['until'] - time()) / 60);
        return "Demasiados intentos fallidos. Espera {$wait} minuto(s).";
    }
    // Limpiar ventana expirada (>10 min desde primer intento)
    if (isset($data['window_start']) && time() - (int)$data['window_start'] > 600) {
        @unlink($file);
    }
    return null;
}

function recordFailedLogin(string $ip): void
{
    $file = rlFilePath($ip);
    $data = file_exists($file) ? (json_decode(file_get_contents($file), true) ?: []) : [];
    if (empty($data) || (isset($data['window_start']) && time() - (int)$data['window_start'] > 600)) {
        $data = ['count' => 0, 'window_start' => time()];
    }
    $data['count'] = ($data['count'] ?? 0) + 1;
    if ((int)$data['count'] >= 5) {
        $data['until'] = time() + 900; // bloqueado 15 minutos
        $data['count'] = 0;
        $data['window_start'] = time();
    }
    @file_put_contents($file, json_encode($data), LOCK_EX);
}

function clearRateLimit(string $ip): void
{
    @unlink(rlFilePath($ip));
}

function ensureSeedUsers(): void
{
    $count = (int) db()->query('SELECT COUNT(*) FROM app_users')->fetchColumn();
    if ($count > 0) {
        return;
    }
    $now  = gmdate('c');
    // Contraseña hasheada desde el seed — nunca texto plano en MySQL
    $hash = password_hash('ASBT2026!', PASSWORD_BCRYPT, ['cost' => 10]);
    replaceRows(db(), 'app_users', [
        ['id' => 'user-system-admin', 'firstName' => 'Gestor', 'lastName' => 'Sistema', 'name' => 'Gestor Sistema', 'role' => 'system_admin', 'roleLabel' => 'Gestor del sistema', 'avatar' => 'GS', 'email' => 'amper.enerman@gmail.com', 'password' => $hash, 'department' => 'Gestor del sistema', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-carlos', 'firstName' => 'Gerardo', 'lastName' => 'Tovar', 'name' => 'Gerardo Tovar', 'role' => 'supervisor', 'roleLabel' => 'Supervisor', 'avatar' => 'GT', 'email' => 'gerencia@enerman.com.mx', 'password' => $hash, 'department' => 'Supervisores', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-maria', 'firstName' => 'Ariana', 'lastName' => 'Padilla', 'name' => 'Ariana Padilla', 'role' => 'admin', 'roleLabel' => 'Administracion', 'avatar' => 'AP', 'email' => 'administracion@enerman.com.mx', 'password' => $hash, 'department' => 'Administracion', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-adan', 'firstName' => 'Adan', 'lastName' => 'Montoya', 'name' => 'Adan Montoya', 'role' => 'admin', 'roleLabel' => 'Administracion', 'avatar' => 'AM', 'email' => 'ventas@enerman.com.mx', 'password' => $hash, 'department' => 'Administracion', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-alessandra-soto', 'firstName' => 'Alessandra', 'lastName' => 'Soto', 'name' => 'Alessandra Soto', 'role' => 'admin', 'roleLabel' => 'Administracion', 'avatar' => 'AS', 'email' => 'alessandra.soto@enerman.com.mx', 'password' => $hash, 'department' => 'Administracion', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-alan', 'firstName' => 'Alan', 'lastName' => 'Sanchez', 'name' => 'Alan Sanchez', 'role' => 'supervisor', 'roleLabel' => 'Supervisor', 'avatar' => 'AS', 'email' => 'medicion@enerman.com.mx', 'password' => $hash, 'department' => 'Supervisores', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-jesus', 'firstName' => 'Jesus', 'lastName' => 'Plata', 'name' => 'Jesus Plata', 'role' => 'supervisor', 'roleLabel' => 'Supervisor', 'avatar' => 'JP', 'email' => 'operacion@enerman.com.mx', 'password' => $hash, 'department' => 'Supervisores', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-gabriel-padilla', 'firstName' => 'Gabriel', 'lastName' => 'Padilla', 'name' => 'Gabriel Padilla', 'role' => 'supervisor', 'roleLabel' => 'Supervisor', 'avatar' => 'GP', 'email' => 'gabriel.padilla@enerman.com.mx', 'password' => $hash, 'department' => 'Supervisores', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-jorge-becerra', 'firstName' => 'Jorge', 'lastName' => 'Becerra', 'name' => 'Jorge Becerra', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'JB', 'email' => 'jorge.becerra@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-benjamin-tejada', 'firstName' => 'Benjamin', 'lastName' => 'Tejada', 'name' => 'Benjamin Tejada', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'BT', 'email' => 'benjamin.tejada@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-luis-garcia', 'firstName' => 'Luis', 'lastName' => 'Garcia', 'name' => 'Luis Garcia', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'LG', 'email' => 'luis.garcia@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-angel-saucedo', 'firstName' => 'Angel', 'lastName' => 'Saucedo', 'name' => 'Angel Saucedo', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'AS', 'email' => 'angel.saucedo@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-roberto-hernandez', 'firstName' => 'Roberto', 'lastName' => 'Hernandez', 'name' => 'Roberto Hernandez', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'RH', 'email' => 'roberto.hernandez@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-gabriel-colunga', 'firstName' => 'Gabriel', 'lastName' => 'Colunga', 'name' => 'Gabriel Colunga', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'GC', 'email' => 'gabriel.colunga@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-cesar-gonzalez', 'firstName' => 'Cesar', 'lastName' => 'Gonzalez', 'name' => 'Cesar Gonzalez', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'CG', 'email' => 'cesar.gonzalez@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-raul-martinez', 'firstName' => 'Raul', 'lastName' => 'Martinez', 'name' => 'Raul Martinez', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'RM', 'email' => 'raul.martinez@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-joahan-castillo', 'firstName' => 'Joahan', 'lastName' => 'Castillo', 'name' => 'Joahan Castillo', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'JC', 'email' => 'joahan.castillo@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-luis-banda', 'firstName' => 'Luis', 'lastName' => 'Banda', 'name' => 'Luis Banda', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'LB', 'email' => 'luis.banda@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-servando-ramirez', 'firstName' => 'Servando', 'lastName' => 'Ramirez', 'name' => 'Servando Ramirez', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'SR', 'email' => 'servando.ramirez@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-oscar-noriega', 'firstName' => 'Oscar', 'lastName' => 'Noriega', 'name' => 'Oscar Noriega', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'ON', 'email' => 'oscar.noriega@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-roberto-ferretiz', 'firstName' => 'Roberto', 'lastName' => 'Ferretiz', 'name' => 'Roberto Ferretiz', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'RF', 'email' => 'roberto.ferretiz@enerman.com.mx', 'password' => $hash, 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
    ]);
}

// ── Contador de consecutivos ──────────────────────────────────────────────────

function ensureSequenceTable(): void
{
    db()->exec(
        "CREATE TABLE IF NOT EXISTS sequence_counters (
            name    VARCHAR(50)   NOT NULL PRIMARY KEY,
            value   INT UNSIGNED  NOT NULL DEFAULT 0
        )"
    );
}

/**
 * Devuelve el valor actual del contador 'projects'.
 * Si no existe aún lo inicializa con el máximo de los proyectos existentes en BD
 * (o 3999 como piso, para que el primer número sea ≥ 4000).
 */
function getOrInitSequence(): int
{
    ensureSequenceTable();
    $stmt = db()->prepare("SELECT value FROM sequence_counters WHERE name = 'projects'");
    $stmt->execute();
    $row = $stmt->fetch();
    if ($row !== false) {
        return (int)$row['value'];
    }
    // Primera vez: calcular el máximo de los structuredName actuales en BD
    $maxFromDb = 0;
    $rows = db()->query("SELECT payload FROM projects")->fetchAll();
    foreach ($rows as $r) {
        $p = json_decode($r['payload'], true);
        $parts = explode('-', $p['structuredName'] ?? '');
        if (!empty($parts[0]) && ctype_digit($parts[0])) {
            $maxFromDb = max($maxFromDb, (int)$parts[0]);
        }
    }
    $initial = max(3999, $maxFromDb); // primer next_sequence devuelve max+1 ≥ 4000
    db()->prepare("INSERT INTO sequence_counters (name, value) VALUES ('projects', :v)")
        ->execute([':v' => $initial]);
    return $initial;
}

/**
 * Folio/consecutivo más alto que YA se emitió alguna vez, considerando las dos fuentes:
 * proyectos aprobados (columna `folio`, indexada) Y solicitudes que reservaron su número
 * desde que se crearon pero todavía no son proyecto (`requests.payload->sequence`) —
 * incluye solicitudes en revisión, en corrección o rechazadas, porque un número ya
 * asignado nunca debe reutilizarse aunque esa solicitud nunca llegue a aprobarse.
 * `next_sequence`, `get_sequence_info` y `set_sequence_counter` usan esto como piso — así
 * ningún ajuste manual del Gestor puede hacer que se vuelva a repartir un número que una
 * solicitud pendiente ya tiene reservado.
 */
function maxIssuedSequence(): int
{
    $maxFolio = (int) db()->query("SELECT COALESCE(MAX(folio), 0) FROM projects")->fetchColumn();
    $maxReq   = (int) db()->query(
        "SELECT COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '\$.sequence')) AS UNSIGNED)), 0) FROM requests"
    )->fetchColumn();
    return max($maxFolio, $maxReq);
}

// ── Switches globales de "Funciones" (panel del Gestor del sistema) ───────────

// Defaults centralizados — agregar un switch nuevo solo requiere una entrada aca
// y su fila correspondiente en el panel "Funciones" de SystemAdminView.
const APP_SETTINGS_DEFAULTS = [
    'facturasEnabled'           => false,
    'cobrosEnabled'             => false,
    'kpiEmailEnabled'           => false,
    'kpiRecipients'             => [],
    'approvalEmailEnabled'      => false,
    'approvalEmailRecipients'   => [],
    'rejectedEmailEnabled'      => false,
    'rejectedEmailRecipients'   => [],
    'correctionEmailEnabled'    => false,
    'correctionEmailRecipients' => [],
];

function ensureSettingsTable(): void
{
    db()->exec(
        "CREATE TABLE IF NOT EXISTS app_settings (
            name       VARCHAR(80) NOT NULL PRIMARY KEY,
            value      JSON        NOT NULL,
            updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )"
    );
}

/** Devuelve todos los switches con sus valores actuales, incluyendo los que aún no tienen fila (default). */
function getAppSettings(): array
{
    ensureSettingsTable();
    $settings = APP_SETTINGS_DEFAULTS;
    $rows = db()->query("SELECT name, value FROM app_settings")->fetchAll();
    foreach ($rows as $row) {
        $settings[$row['name']] = json_decode($row['value'], true);
    }
    return $settings;
}

function setAppSetting(string $name, $value): void
{
    ensureSettingsTable();
    $encoded = json_encode($value);
    db()->prepare(
        "INSERT INTO app_settings (name, value) VALUES (:n, :v)
         ON DUPLICATE KEY UPDATE value = :v2"
    )->execute([':n' => $name, ':v' => $encoded, ':v2' => $encoded]);
}

// ── Red de seguridad para borrado permanente ──────────────────────────────────

function ensureDeletedArchiveTable(): void
{
    db()->exec(
        "CREATE TABLE IF NOT EXISTS deleted_items_archive (
            id              VARCHAR(50)  NOT NULL PRIMARY KEY,
            entity_type     VARCHAR(20)  NOT NULL,
            entity_id       VARCHAR(80)  NOT NULL,
            payload         LONGTEXT     NOT NULL,
            deleted_by      VARCHAR(80)  NULL,
            deleted_by_name VARCHAR(255) NULL,
            deleted_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_entity (entity_type, entity_id)
        )"
    );
}

/**
 * Guarda una copia completa de un proyecto/solicitud ANTES de borrarlo para siempre.
 * Mientras no exista un respaldo local/físico real, esta es la única forma de
 * recuperar algo que se borró por error — se consulta a mano desde phpMyAdmin
 * (tabla deleted_items_archive, columna payload).
 */
function archiveDeletedItem(string $entityType, string $entityId, array $payload): void
{
    ensureDeletedArchiveTable();
    $actor = sessionUser();
    db()->prepare(
        "INSERT INTO deleted_items_archive (id, entity_type, entity_id, payload, deleted_by, deleted_by_name)
         VALUES (:id, :type, :eid, :payload, :by, :byname)"
    )->execute([
        ':id'      => 'arch-' . bin2hex(random_bytes(12)),
        ':type'    => $entityType,
        ':eid'     => $entityId,
        ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':by'      => $actor['id'] ?? null,
        ':byname'  => $actor['name'] ?? null,
    ]);
}

/**
 * Borra las notificaciones que apuntan a un proyecto/solicitud ya eliminado para
 * siempre. Sin esto queda una "notificación fantasma": un ingeniero la ve, le hace
 * clic, y el proyecto/solicitud ya no existe — la app no navega a ningún lado.
 * $field es un nombre de campo fijo controlado en el código ('relatedProjectId' /
 * 'relatedRequestId'), nunca input de usuario.
 */
function deleteNotificationsFor(string $field, string $entityId): void
{
    db()->prepare(
        "DELETE FROM notifications WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, :path)) = :id"
    )->execute([':path' => '$.' . $field, ':id' => $entityId]);
}

// ── Correo KPI diario — mailer SMTP mínimo + armado del digest ────────────────
// Sin librerías (no hay Composer/vendor en este backend): un cliente SMTP a mano
// via socket TLS, suficiente para el volumen bajo de este envío (unos pocos
// destinatarios, una vez al dia). Las credenciales viven en config.php del
// servidor (SMTP_HOST/PORT/USER/PASS/FROM), nunca en el repo.

function encodeMailHeader(string $text): string
{
    return '=?UTF-8?B?' . base64_encode($text) . '?=';
}

/**
 * Manda un correo HTML por SMTP autenticado (TLS implícito) a uno o más destinatarios
 * en una sola conexión. Lanza RuntimeException con el detalle si algún paso del
 * protocolo falla — el caller decide qué hacer (ej. responder 500 en el cron).
 */
function sendSmtpMail(array $recipients, string $subject, string $htmlBody): void
{
    if (!defined('SMTP_HOST') || !defined('SMTP_USER') || !defined('SMTP_PASS') || !defined('SMTP_FROM')) {
        throw new RuntimeException('SMTP no configurado en config.php (faltan constantes SMTP_*).');
    }
    $recipients = array_values(array_filter($recipients, static fn($r) => is_string($r) && filter_var($r, FILTER_VALIDATE_EMAIL)));
    if (empty($recipients)) {
        throw new RuntimeException('Sin destinatarios válidos.');
    }

    $host     = SMTP_HOST;
    $port     = defined('SMTP_PORT') ? (int) SMTP_PORT : 465;
    $fromMail = SMTP_FROM;
    $fromName = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'ENERMAN-SYSTEM';

    $ctx  = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $sock = @stream_socket_client("ssl://{$host}:{$port}", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$sock) {
        throw new RuntimeException("No se pudo conectar a SMTP {$host}:{$port} — {$errstr} ({$errno})");
    }

    $readLine = static function () use ($sock): string {
        $data = '';
        while (($line = fgets($sock, 515)) !== false) {
            $data .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') break; // "250 " = última línea, "250-" = sigue
        }
        return $data;
    };
    $expect = static function (string $code) use ($readLine): void {
        $data = $readLine();
        if (strncmp($data, $code, strlen($code)) !== 0) {
            throw new RuntimeException("SMTP: se esperaba {$code}, llegó: " . trim($data));
        }
    };
    $cmd = static function (string $line) use ($sock): void {
        fwrite($sock, $line . "\r\n");
    };

    try {
        $expect('220');
        $cmd('EHLO ' . (parse_url('https://' . $host, PHP_URL_HOST) ?: 'localhost'));
        $expect('250');
        $cmd('AUTH LOGIN');
        $expect('334');
        $cmd(base64_encode(SMTP_USER));
        $expect('334');
        $cmd(base64_encode(SMTP_PASS));
        $expect('235');

        $cmd('MAIL FROM:<' . $fromMail . '>');
        $expect('250');
        foreach ($recipients as $to) {
            $cmd('RCPT TO:<' . $to . '>');
            $expect('250');
        }

        $cmd('DATA');
        $expect('354');

        $headers = [
            'From: ' . encodeMailHeader($fromName) . ' <' . $fromMail . '>',
            'To: <' . implode('>, <', $recipients) . '>',
            'Subject: ' . encodeMailHeader($subject),
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'Date: ' . date('r'),
        ];
        // Punto solo al inicio de línea hay que duplicarlo — es el fin-de-DATA del protocolo (RFC 5321 4.5.2).
        $escapedBody = preg_replace('/^\./m', '..', $htmlBody);
        $cmd(implode("\r\n", $headers) . "\r\n\r\n" . $escapedBody . "\r\n.");
        $expect('250');

        $cmd('QUIT');
    } finally {
        fclose($sock);
    }
}

/**
 * Arma los 3 bloques del digest diario de KPIs. Solo lee la BD, nunca escribe nada
 * — si algo sale mal aquí, en el peor caso el correo sale vacío o falla, jamás
 * corrompe un registro.
 */
function buildKpiDigest(): array
{
    $terminalStatuses = ['completed', 'no-autorizado', 'cierre-por-sistema'];
    $todayTs = strtotime('today');

    $paidCount   = 0;
    $unpaidCount = 0;
    $overdue     = [];

    foreach (tableRows('projects') as $p) {
        $status = $p['status'] ?? '';
        if (in_array($status, ['no-autorizado', 'cierre-por-sistema'], true)) {
            continue; // cancelados/cerrados no cuentan para los KPIs de pago
        }
        if (($p['paymentStatus'] ?? 'unpaid') === 'paid') {
            $paidCount++;
        } else {
            $unpaidCount++;
        }
        $commitment = $p['commitmentDate'] ?? null;
        if ($commitment && !in_array($status, $terminalStatuses, true)) {
            $ts = strtotime((string) $commitment);
            if ($ts !== false && $ts < $todayTs) {
                $overdue[] = [
                    'name'       => $p['structuredName'] ?? ($p['baseName'] ?? ($p['id'] ?? '')),
                    'client'     => $p['client'] ?? '',
                    'commitment' => $commitment,
                    'daysLate'   => (int) floor(($todayTs - $ts) / 86400),
                ];
            }
        }
    }
    usort($overdue, static fn($a, $b) => $b['daysLate'] <=> $a['daysLate']);

    $approved = [];
    $stmt = db()->query(
        "SELECT payload FROM requests
         WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '\$.status')) = 'approved'
           AND updated_at >= (NOW() - INTERVAL 1 DAY)"
    );
    foreach ($stmt->fetchAll() as $row) {
        $r = json_decode($row['payload'], true);
        if (!is_array($r)) continue;
        $approved[] = [
            'name'   => $r['structuredName'] ?? ($r['baseName'] ?? ($r['id'] ?? '')),
            'client' => $r['client'] ?? '',
        ];
    }

    return [
        'paidCount'   => $paidCount,
        'unpaidCount' => $unpaidCount,
        'overdue'     => $overdue,
        'approved'    => $approved,
        'generatedAt' => gmdate('c'),
    ];
}

/** Convierte el digest en el HTML del correo — tabla simple, sin dependencias externas. */
function renderKpiDigestHtml(array $digest): string
{
    $esc = static fn($s): string => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

    $rowsOverdue = '';
    foreach ($digest['overdue'] as $o) {
        $rowsOverdue .= '<tr>'
            . '<td style="padding:4px 8px;border-bottom:1px solid #333">' . $esc($o['name']) . '</td>'
            . '<td style="padding:4px 8px;border-bottom:1px solid #333">' . $esc($o['client']) . '</td>'
            . '<td style="padding:4px 8px;border-bottom:1px solid #333">' . $esc($o['commitment']) . '</td>'
            . '<td style="padding:4px 8px;border-bottom:1px solid #333;color:#c62828">' . (int) $o['daysLate'] . 'd</td>'
            . '</tr>';
    }
    if ($rowsOverdue === '') {
        $rowsOverdue = '<tr><td colspan="4" style="padding:8px;color:#888">Ningún proyecto vencido.</td></tr>';
    }

    $rowsApproved = '';
    foreach ($digest['approved'] as $a) {
        $rowsApproved .= '<tr>'
            . '<td style="padding:4px 8px;border-bottom:1px solid #333">' . $esc($a['name']) . '</td>'
            . '<td style="padding:4px 8px;border-bottom:1px solid #333">' . $esc($a['client']) . '</td>'
            . '</tr>';
    }
    if ($rowsApproved === '') {
        $rowsApproved = '<tr><td colspan="2" style="padding:8px;color:#888">Sin aprobaciones en las últimas 24h.</td></tr>';
    }

    $fecha      = $esc(date('d/m/Y'));
    $paidCount  = (int) $digest['paidCount'];
    $unpaidCount = (int) $digest['unpaidCount'];

    return <<<HTML
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
      <h2 style="margin-bottom:4px">Resumen diario — ENERMAN-SYSTEM</h2>
      <p style="color:#666;margin-top:0">{$fecha}</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr>
          <td style="padding:12px;background:#e8f5e9;border-radius:6px;text-align:center">
            <div style="font-size:24px;font-weight:bold;color:#2e7d32">{$paidCount}</div>
            <div style="font-size:12px;color:#555">Proyectos pagados</div>
          </td>
          <td style="width:12px"></td>
          <td style="padding:12px;background:#fff3e0;border-radius:6px;text-align:center">
            <div style="font-size:24px;font-weight:bold;color:#e65100">{$unpaidCount}</div>
            <div style="font-size:12px;color:#555">Proyectos no pagados</div>
          </td>
        </tr>
      </table>

      <h3>Proyectos vencidos (fecha de compromiso ya pasó)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="text-align:left;color:#888"><th>Proyecto</th><th>Cliente</th><th>Compromiso</th><th>Atraso</th></tr>
        {$rowsOverdue}
      </table>

      <h3 style="margin-top:24px">Solicitudes aprobadas (últimas 24h)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="text-align:left;color:#888"><th>Proyecto</th><th>Cliente</th></tr>
        {$rowsApproved}
      </table>

      <p style="color:#999;font-size:11px;margin-top:24px">Generado automáticamente por ENERMAN-SYSTEM. No respondas a este correo.</p>
    </div>
    HTML;
}

// ── Correo inmediato al aprobar una solicitud ──────────────────────────────────

/** Resuelve el nombre para mostrar de un usuario por id — para correos/logs que solo tienen el id. */
function resolveUserName(?string $userId): string
{
    if (!$userId) return 'Desconocido';
    $stmt = db()->prepare("SELECT payload FROM app_users WHERE id = ? LIMIT 1");
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row) return $userId;
    $u = json_decode($row['payload'], true);
    return is_array($u) ? ($u['name'] ?? $userId) : $userId;
}

/** Filtra un array a solo los valores que son direcciones de correo válidas. */
function validEmails(array $list): array
{
    return array_values(array_filter($list, static fn($e) => is_string($e) && filter_var($e, FILTER_VALIDATE_EMAIL)));
}

/**
 * Correo inmediato genérico para UN evento puntual de UNA solicitud (aprobada, rechazada,
 * necesita corrección, etc.) — encabezado fijo (proyecto/cliente/folio) más los campos
 * específicos de ese evento en $fields (label => valor, en el orden dado). A propósito NO
 * incluye métricas globales del sistema (eso es el resumen diario, no esto) — cada correo de
 * este tipo habla de UN proyecto puntual, nada más.
 */
function renderRequestEventEmailHtml(string $title, array $request, array $fields): string
{
    $esc = static fn($s): string => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

    $name   = $esc($request['structuredName'] ?? ($request['baseName'] ?? ($request['id'] ?? '')));
    $client = $esc($request['client'] ?? '');
    $folio  = $esc($request['sequence'] ?? '—');
    $hora   = $esc(date('d/m/Y H:i'));
    $titleEsc = $esc($title);

    $rows = '<tr><td style="padding:4px 0;color:#888;width:160px">Proyecto</td><td style="padding:4px 0;font-weight:bold">' . $name . '</td></tr>'
          . '<tr><td style="padding:4px 0;color:#888">Cliente</td><td style="padding:4px 0">' . $client . '</td></tr>'
          . '<tr><td style="padding:4px 0;color:#888">Folio</td><td style="padding:4px 0">' . $folio . '</td></tr>';
    foreach ($fields as $label => $value) {
        $rows .= '<tr><td style="padding:4px 0;color:#888">' . $esc((string) $label) . '</td><td style="padding:4px 0">' . $esc((string) $value) . '</td></tr>';
    }

    return <<<HTML
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin-bottom:4px">{$titleEsc}</h2>
      <p style="color:#666;margin-top:0">{$hora}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        {$rows}
      </table>
      <p style="color:#999;font-size:11px;margin-top:24px">Generado automáticamente por ENERMAN-SYSTEM. No respondas a este correo.</p>
    </div>
    HTML;
}
