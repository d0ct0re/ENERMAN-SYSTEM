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
function syncProjectRows(PDO $pdo, array $items): void
{
    $ids  = [];
    $stmt = $pdo->prepare(
        "INSERT INTO projects (id, payload, sort_order, updated_at)
         VALUES (:id, :payload, :sort_order, NOW())
         ON DUPLICATE KEY UPDATE
           payload    = IF(
             COALESCE(JSON_UNQUOTE(JSON_EXTRACT(VALUES(payload), '$.updatedAt')), '') >=
             COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload,         '$.updatedAt')), ''),
             VALUES(payload),
             payload
           ),
           sort_order = VALUES(sort_order),
           updated_at = NOW()"
    );
    foreach (array_values($items) as $i => $item) {
        if (!isset($item['id'])) {
            throw new RuntimeException("Proyecto sin id.");
        }
        $ids[] = (string) $item['id'];
        $stmt->execute([
            ':id'         => (string) $item['id'],
            ':payload'    => json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
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
