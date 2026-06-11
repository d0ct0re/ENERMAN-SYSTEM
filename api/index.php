<?php
declare(strict_types=1);

// CORS — permite frontend en Vercel, ampr.site y localhost dev
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = ['https://ampr.site', 'http://localhost:5173', 'http://localhost:3000'];
$isVercel = (bool) preg_match('/^https:\/\/[a-z0-9-]+\.vercel\.app$/', $origin);
if ($isVercel || in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// SameSite=None para que las cookies de sesión funcionen cross-origin (Vercel → Hostinger)
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure', '1');
ini_set('session.cookie_samesite', 'None');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Falta api/config.php. Copia config.example.php y configura MySQL.']);
    exit;
}

require $configPath;

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
    $rows = array_map(static fn(array $r) => json_decode($r['payload'], true), $stmt->fetchAll());
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
    return array_map(static fn(array $row) => json_decode($row['payload'], true), $stmt->fetchAll());
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
// Tabla sequence_counters: { name VARCHAR(50) PK, value INT }
// Se crea automáticamente la primera vez que se use.

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

// F0-5: Auth helpers
function requireAuth(): void
{
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'No autenticado.', 'code' => 401]);
        exit;
    }
}

function requireAdmin(): void
{
    requireAuth();
    $role = $_SESSION['user_role'] ?? '';
    if (!in_array($role, ['admin', 'system_admin'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Acceso denegado.', 'code' => 403]);
        exit;
    }
}

function requireSystemAdmin(): void
{
    requireAuth();
    if (($_SESSION['user_role'] ?? '') !== 'system_admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Solo system_admin.', 'code' => 403]);
        exit;
    }
}

/* ─── ROUTER ─────────────────────────────────────────────────────────── */
try {
    $action = $_GET['action'] ?? 'bootstrap';

    /* Garantiza que el directorio de uploads siempre tenga el .htaccess correcto. */
    $noExecHtaccessGlobal = "<FilesMatch \"\\.(php[0-9]?|phtml|phar|pl|py|jsp|asp|sh|cgi)$\">\n  Require all denied\n</FilesMatch>\nOptions -Indexes -ExecCGI\n";
    secureMkdir(__DIR__ . '/../uploads/', $noExecHtaccessGlobal);
    secureMkdir(__DIR__ . '/../uploads/projectra/', $noExecHtaccessGlobal);

    /* ── serve_file — sirve archivos físicos a través del API, bypass de .htaccess ── */
    if ($action === 'serve_file') {
        // Los IDs de archivo son bin2hex(random_bytes(10)) — imposibles de adivinar sin
        // conocer también el project_id (UUID). La seguridad es por oscuridad de URL,
        // como funciona S3 presigned URLs o cualquier CDN con IDs aleatorios.
        // Las descargas (documentos) aún verifican sesión para mayor protección.
        $isDownload = (($_GET['download'] ?? '') === '1');
        if ($isDownload) {
            requireAuth();
        }
        // Liberar el lock de sesión cuanto antes: serve_file nunca escribe la sesión y
        // servir un archivo grande bloquearía el polling y demás peticiones concurrentes.
        session_write_close();

        $fileId    = preg_replace('/[^a-zA-Z0-9\-]/', '', $_GET['file_id']    ?? '');
        $projectId = preg_replace('/[^a-zA-Z0-9\-_]/', '', $_GET['project_id'] ?? '');
        if (!$fileId || !$projectId) {
            http_response_code(400);
            header('Content-Type: text/plain', true);
            echo 'Parámetros requeridos.';
            exit;
        }
        $uploadDir = __DIR__ . '/../uploads/projectra/' . $projectId . '/';
        $matches   = glob($uploadDir . $fileId . '.*') ?: [];
        if (empty($matches) || !is_file($matches[0])) {
            http_response_code(404);
            header('Content-Type: text/plain', true);
            echo 'Archivo no encontrado.';
            exit;
        }
        $path  = $matches[0];
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime  = $finfo->file($path) ?: 'application/octet-stream';
        $origName = basename($path);
        header('Content-Type: ' . $mime, true);
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: ' . ($isDownload ? 'attachment' : 'inline') . '; filename*=UTF-8\'\'' . rawurlencode($origName));
        header('Cache-Control: public, max-age=3600');
        header('X-Content-Type-Options: nosniff');
        readfile($path);
        exit;
    }

    /* ── emergency_reset — solo system_admin con sesión activa ── */
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

    /* ── admin_login ── */
    if ($action === 'admin_login') {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $blocked = checkRateLimit($ip);
        if ($blocked) {
            http_response_code(429);
            echo json_encode(['error' => $blocked]);
            exit;
        }
        $data = readJson();
        $user = verifyCredentials($data['email'] ?? '', $data['password'] ?? '');
        if (!$user || ($user['role'] ?? '') !== 'system_admin') {
            recordFailedLogin($ip);
            http_response_code(403);
            echo json_encode(['error' => 'Acceso restringido a system_admin.']);
            exit;
        }
        clearRateLimit($ip);
        unset($user['password']);
        $_SESSION['user_id']   = $user['id'];
        $_SESSION['user_role'] = $user['role'];
        logActivity('admin_login', 'user', $user['id'] ?? null, $user['name'] ?? null, ['email' => $user['email'] ?? null], $user);
        echo json_encode(['ok' => true, 'user' => $user], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /* ── admin_logout ── */
    if ($action === 'admin_logout') {
        session_destroy();
        echo json_encode(['ok' => true]);
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

    /* ── delete_project ── */
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

    if ($action === 'activity_logs') {
        requireSystemAdmin();
        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 120;
        echo json_encode([
            'ok' => true,
            'activity' => activityRows($limit),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($action === 'delete_project') {
        requireAdmin();
        $data      = readJson();
        $projectId = trim($data['project_id'] ?? '');
        if (!$projectId) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id requerido.']);
            exit;
        }
        // Buscar nombre para log antes de borrar
        $project = null;
        foreach (tableRows('projects') as $candidate) {
            if (($candidate['id'] ?? '') === $projectId) { $project = $candidate; break; }
        }
        // DELETE atómico por id — sin replaceRows para evitar condición de carrera
        $stmt = db()->prepare("DELETE FROM projects WHERE id = :id");
        $stmt->execute([':id' => $projectId]);
        // Idempotente: si no estaba en BD, igualmente se considera eliminado (puede ser dato huérfano del estado local)
        // Desvincula solicitudes que apuntaban a este proyecto (UPDATE individual)
        $pdo = db();
        $reqRows = $pdo->query("SELECT id, payload FROM requests")->fetchAll();
        $updStmt = $pdo->prepare("UPDATE requests SET payload = :p, updated_at = NOW() WHERE id = :id");
        foreach ($reqRows as $row) {
            $req = json_decode($row['payload'], true);
            if (($req['linkedProjectId'] ?? null) === $projectId) {
                unset($req['linkedProjectId']);
                $updStmt->execute([':p' => json_encode($req, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $row['id']]);
            }
        }
        logActivity('deleted', 'project', $projectId, $project ? itemName($project) : $projectId, ['source' => 'delete_project']);
        // Marcar como recién eliminado para que save_state no lo re-inserte si llega tarde
        if (!isset($_SESSION['recently_deleted'])) $_SESSION['recently_deleted'] = [];
        $_SESSION['recently_deleted'][$projectId] = time();
        echo json_encode(['ok' => true, 'deleted' => $projectId]);
        exit;
    }

    /* ── update_user_role ── */
    if ($action === 'delete_request') {
        requireAdmin();
        $data      = readJson();
        $requestId = trim($data['request_id'] ?? '');
        if (!$requestId) {
            http_response_code(400);
            echo json_encode(['error' => 'request_id requerido.']);
            exit;
        }
        // Buscar nombre para log antes de borrar
        $request = null;
        foreach (tableRows('requests') as $candidate) {
            if (($candidate['id'] ?? '') === $requestId) { $request = $candidate; break; }
        }
        // DELETE atómico por id — idempotente: si no estaba en BD, igualmente se considera eliminado
        $stmt = db()->prepare("DELETE FROM requests WHERE id = :id");
        $stmt->execute([':id' => $requestId]);
        logActivity('deleted', 'request', $requestId, $request ? itemName($request) : $requestId, ['source' => 'delete_request']);
        // Marcar como recién eliminado para que save_state no lo re-inserte si llega tarde
        if (!isset($_SESSION['recently_deleted'])) $_SESSION['recently_deleted'] = [];
        $_SESSION['recently_deleted'][$requestId] = time();
        echo json_encode(['ok' => true, 'deleted' => $requestId]);
        exit;
    }

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

    /* ── get_full_history ── */
    if ($action === 'get_full_history') {
        requireAdmin();
        $projects = tableRows('projects');
        echo json_encode([
            'ok'      => true,
            'history' => allHistory($projects),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /* ── upload_file ── */
    if ($action === 'upload_file') {
        requireAuth();
        // Liberar lock de sesión — el upload puede tardar varios segundos y no necesita la sesión
        session_write_close();
        $projectId = trim($_POST['project_id'] ?? '');
        if (!$projectId) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id requerido.']);
            exit;
        }
        if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['error' => 'Archivo no recibido o con error.']);
            exit;
        }
        $file         = $_FILES['file'];
        $allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/bmp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
        ];
        $category  = trim($_POST['category'] ?? 'fotos');
        $validCats = ['fotos', 'estimacion', 'cotizacion', 'reporte', 'otros'];
        if (!in_array($category, $validCats, true)) $category = 'fotos';

        $maxMB = ($category === 'reporte') ? 45 : 30;
        if ($file['size'] > $maxMB * 1024 * 1024) {
            http_response_code(400);
            echo json_encode(['error' => "El archivo excede el límite de {$maxMB} MB."]);
            exit;
        }
        if ($category === 'reporte') {
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['xls', 'xlsx', 'doc', 'docx', 'dwg', 'dxf'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Reporte solo acepta: Excel (.xlsx), Word (.docx), AutoCAD (.dwg, .dxf).']);
                exit;
            }
        } else {
            $finfo    = new finfo(FILEINFO_MIME_TYPE);
            $mimeType = $finfo->file($file['tmp_name']);
            if (!in_array($mimeType, $allowedMimes, true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Tipo no permitido. Acepta: PNG, JPG, GIF, WEBP, PDF, Word, Excel.']);
                exit;
            }
        }

        $safeId    = preg_replace('/[^a-zA-Z0-9\-_]/', '', $projectId);
        $uploadDir = __DIR__ . '/../uploads/projectra/' . $safeId . '/';
        secureMkdir($uploadDir, $noExecHtaccessGlobal);
        if (!is_dir($uploadDir)) {
            http_response_code(500);
            echo json_encode(['error' => 'No se pudo crear el directorio de subida.']);
            exit;
        }
        $ext    = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $fileId = 'file-' . bin2hex(random_bytes(10));
        $stored = $fileId . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], $uploadDir . $stored)) {
            http_response_code(500);
            echo json_encode(['error' => 'No se pudo guardar el archivo en el servidor.']);
            exit;
        }
        // Detectar HTTPS correctamente en Hostinger (load balancer / proxy SSL).
        // $_SERVER['HTTPS'] puede ser 'off' o vacío detrás del proxy aunque el usuario
        // acceda por HTTPS — verificar también X-Forwarded-Proto / X-Forwarded-SSL.
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
                || (($_SERVER['HTTP_X_FORWARDED_SSL']   ?? '') === 'on');
        $scheme  = $isHttps ? 'https' : 'http';
        $host    = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $fileUrl = $scheme . '://' . $host . '/api/index.php?action=serve_file'
                 . '&project_id=' . urlencode($projectId)
                 . '&file_id='    . urlencode($fileId);
        $bytes     = $file['size'];
        $sizeLabel = $bytes < 1048576
            ? round($bytes / 1024, 1) . ' KB'
            : round($bytes / 1048576, 1) . ' MB';
        $fileData  = [
            'id'         => $fileId,
            'name'       => $file['name'],
            'sizeLabel'  => $sizeLabel,
            'sizeBytes'  => $bytes,
            'uploadedAt' => gmdate('c'),
            'url'        => $fileUrl,
            'category'   => $category,
        ];
        // ── Append atómico del archivo al array files del proyecto en DB ──────────────────────
        // Esto evita que el frontend tenga que enviar la lista completa de archivos via update_project,
        // eliminando el race condition donde un upload tardío sobreescribía archivos previos en DB.
        $pdo = db();
        $stmt = $pdo->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
        $stmt->execute([$projectId]);
        $projRow = $stmt->fetch();
        if ($projRow) {
            $proj = json_decode($projRow['payload'], true) ?? [];
            $existingFiles = $proj['files'] ?? [];
            $existingFiles[] = $fileData;
            $proj['files']     = $existingFiles;
            $proj['updatedAt'] = gmdate('c');
            $pdo->prepare("UPDATE projects SET payload = :p, updated_at = NOW() WHERE id = :id")
                ->execute([':p' => json_encode($proj, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $projectId]);
        }
        logActivity('uploaded', 'file', $fileId, $file['name'], ['projectId' => $projectId, 'size' => $sizeLabel]);
        echo json_encode(['ok' => true, 'file' => $fileData], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /* ── delete_file — elimina el archivo físico y lo quita del array files del proyecto ── */
    if ($action === 'delete_file') {
        requireAuth();
        $data      = readJson();
        $fileId    = trim($data['file_id']    ?? '');
        $projectId = trim($data['project_id'] ?? '');
        if (!$fileId || !$projectId) {
            http_response_code(400);
            echo json_encode(['error' => 'file_id y project_id requeridos.']);
            exit;
        }
        $safeProject = preg_replace('/[^a-zA-Z0-9\-_]/', '', $projectId);
        $safeFile    = preg_replace('/[^a-zA-Z0-9\-_]/', '', $fileId);
        $uploadDir   = __DIR__ . '/../uploads/projectra/' . $safeProject . '/';
        $deleted     = false;
        if (is_dir($uploadDir)) {
            foreach (glob($uploadDir . $safeFile . '.*') ?: [] as $filePath) {
                if (is_file($filePath) && unlink($filePath)) {
                    $deleted = true;
                }
            }
        }
        // ── Quitar atómicamente el archivo del array files del proyecto en DB ───────────────
        $pdo = db();
        $stmt = $pdo->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
        $stmt->execute([$projectId]);
        $projRow = $stmt->fetch();
        if ($projRow) {
            $proj = json_decode($projRow['payload'], true) ?? [];
            $proj['files'] = array_values(array_filter(
                $proj['files'] ?? [],
                static fn(array $f): bool => ($f['id'] ?? '') !== $fileId
            ));
            $proj['updatedAt'] = gmdate('c');
            $pdo->prepare("UPDATE projects SET payload = :p, updated_at = NOW() WHERE id = :id")
                ->execute([':p' => json_encode($proj, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $projectId]);
        }
        logActivity('deleted', 'file', $fileId, $fileId, ['projectId' => $projectId, 'physicallyDeleted' => $deleted]);
        echo json_encode(['ok' => true, 'deleted' => $deleted]);
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
        $backupDir = __DIR__ . '/../backups/';
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
        $backupDir = __DIR__ . '/../backups/';
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
        $uploadsDir = __DIR__ . '/../uploads/projectra/';
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
        $backupDir = __DIR__ . '/../backups/';
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

    /* ── save_state ── */
    if ($action === 'save_state') {
        requireAuth();
        $data = readJson();
        foreach (['users', 'projects', 'requests', 'notifications'] as $key) {
            if (!isset($data[$key]) || !is_array($data[$key])) {
                throw new RuntimeException("Falta arreglo {$key}.");
            }
        }

        // Preserve passwords — bootstrap strips them so they don't come back from the frontend
        $beforeUsers = tableRows('app_users');
        $beforeProjects = tableRows('projects');
        $beforeNotifications = tableRows('notifications');
        // NOTA: requests NO se sincronizan aquí. save_state hace DELETE masivo ("id NOT IN ?")
        // lo que en un entorno multi-usuario destruye solicitudes de otros usuarios antes de que
        // el polling las traiga. Las solicitudes se gestionan sólo por endpoints atómicos:
        // create_request / update_request / delete_request.

        // Ingenieros no pueden crear proyectos nuevos — se filtran silenciosamente
        // (no rechazar con 403 porque el debounce del frontend dispara bajo sesión ingeniero
        //  después de que el admin ya guardó el proyecto vía save inmediato; rechazar rompe apiReady)
        $sessionUser = sessionUser();
        if (($sessionUser['role'] ?? '') === 'engineer') {
            $existingIds = array_column($beforeProjects, 'id');
            $data['projects'] = array_values(array_filter($data['projects'], function($p) use ($existingIds) {
                return in_array($p['id'] ?? '', $existingIds, true);
            }));
        }

        $existingUsers = tableRows('app_users');
        $pwMap        = [];
        $roleMap      = [];
        $notifPrefsMap = [];
        foreach ($existingUsers as $eu) {
            $eid = $eu['id'] ?? null;
            if (!$eid) continue;
            if (isset($eu['password']))  $pwMap[$eid]   = $eu['password'];
            if (isset($eu['role']))      $roleMap[$eid]  = ['role' => $eu['role'], 'roleLabel' => $eu['roleLabel'] ?? ''];
            $notifPrefsMap[$eid] = [
                'dismissedNotifKeys' => (array)($eu['dismissedNotifKeys'] ?? []),
                'readNotifKeys'      => (array)($eu['readNotifKeys'] ?? []),
            ];
        }
        $usersToSave = $data['users'];
        foreach ($usersToSave as &$u) {
            $uid = $u['id'] ?? '';
            // Preservar contraseña desde la BD
            if ($uid && isset($pwMap[$uid])) {
                $u['password'] = $pwMap[$uid];
            }
            // Preservar rol desde la BD — los roles SOLO cambian via update_user_role
            // Evita escalación de privilegios: cualquier usuario podría enviarse como system_admin
            if ($uid && isset($roleMap[$uid])) {
                $u['role']      = $roleMap[$uid]['role'];
                $u['roleLabel'] = $roleMap[$uid]['roleLabel'];
            }
            // Fusionar prefs de notificación: BD + cliente → nunca perder claves ya guardadas
            if ($uid && isset($notifPrefsMap[$uid])) {
                $u['dismissedNotifKeys'] = array_values(array_unique(array_merge(
                    $notifPrefsMap[$uid]['dismissedNotifKeys'],
                    (array)($u['dismissedNotifKeys'] ?? [])
                )));
                $u['readNotifKeys'] = array_values(array_unique(array_merge(
                    $notifPrefsMap[$uid]['readNotifKeys'],
                    (array)($u['readNotifKeys'] ?? [])
                )));
            }
        }
        unset($u);

        // Preserve fechaSolicitud (immutable) and recalculate IVA server-side
        $beforeProjectMap = [];
        foreach ($beforeProjects as $bp) {
            if (isset($bp['id'])) $beforeProjectMap[$bp['id']] = $bp;
        }
        $projectsToSave = $data['projects'];
        foreach ($projectsToSave as &$proj) {
            $pid = $proj['id'] ?? '';
            if ($pid && isset($beforeProjectMap[$pid])) {
                $before = $beforeProjectMap[$pid];

                // ── Merge con protección de concurrencia por updatedAt ───────────────────────
                // Si la BD tiene un updatedAt MÁS RECIENTE que el frontend, otro usuario
                // (p.ej. admin via update_project) modificó este proyecto después del último
                // sync del cliente actual. En ese caso la BD gana para no revertir sus cambios.
                // Si el frontend es igual o más reciente, el frontend gana (caso normal).
                $frontendUpdatedAt = $proj['updatedAt'] ?? '';
                $dbUpdatedAt       = $before['updatedAt'] ?? '';
                if (!empty($dbUpdatedAt) && !empty($frontendUpdatedAt) && $dbUpdatedAt > $frontendUpdatedAt) {
                    // BD más reciente — preservar datos del otro usuario intactos
                    $proj = $before;
                } else {
                    // Frontend es actual — merge normal, frontend sobreescribe BD
                    $merged = array_merge($before, $proj);
                    foreach ($merged as $k => $v) {
                        if ($v === null) unset($merged[$k]);
                    }
                    $proj = $merged;
                }

                // ── BD siempre gana para estos campos de solo lectura / atómicos ────────────
                // Preserve original fechaSolicitud (inmutable)
                if (!empty($before['fechaSolicitud'])) {
                    $proj['fechaSolicitud'] = $before['fechaSolicitud'];
                }
                // Campos de estado de sección — solo cambian via upload_file/delete_file
                $sectionStatusFields = ['fotosStatus', 'estimacionFileStatus', 'cotizacionFileStatus', 'reporteFileStatus', 'otrosFileStatus'];
                foreach ($sectionStatusFields as $stField) {
                    $proj[$stField] = $before[$stField] ?? 'no';
                }
                // Archivos — solo via upload_file / delete_file
                if (isset($before['files'])) {
                    $proj['files'] = $before['files'];
                } else {
                    if (empty($proj['files'])) {
                        $proj['files'] = [];
                    }
                }
            }
            // Recalculate IVA = totalSinIva * 0.16
            if (isset($proj['totalSinIva']) && is_numeric($proj['totalSinIva'])) {
                $proj['iva'] = round((float)$proj['totalSinIva'] * 0.16, 2);
            }
        }
        unset($proj);

        // ── Guardia anti-vaciado: rechaza solo si usuarios desaparecen (bug crítico) ──
        // Los proyectos pueden llegar a 0 legítimamente cuando el gestor borra todos los de prueba.
        // La eliminación real se hace vía delete_project (DELETE atómico por id), no por save_state.
        if (count($usersToSave) === 0) {
            http_response_code(400);
            echo json_encode(['error' => 'SEGURIDAD: no se permite guardar 0 usuarios.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Purgar entradas expiradas (>120s) del rastreador de eliminaciones recientes
        $now = time();
        if (isset($_SESSION['recently_deleted'])) {
            foreach ($_SESSION['recently_deleted'] as $rid => $ts) {
                if ($now - (int)$ts > 120) {
                    unset($_SESSION['recently_deleted'][$rid]);
                }
            }
        }
        $recentlyDeleted = array_keys($_SESSION['recently_deleted'] ?? []);

        // ── Protección cross-sesión via activity_logs ──────────────────────────────────────
        // $recentlyDeleted solo contiene IDs de la sesión ACTUAL que llamó delete_project.
        // Si otro admin/ingeniero llama save_state con el proyecto aún en su estado local,
        // su $recentlyDeleted está vacío y syncRows lo re-insertaría en la BD.
        // Solución: consultar activity_logs para obtener eliminaciones recientes de CUALQUIER sesión.
        try {
            $crossDeleted = db()->query(
                "SELECT entity_id FROM activity_logs
                  WHERE action = 'deleted' AND entity_type = 'project'
                    AND created_at > DATE_SUB(NOW(), INTERVAL 120 SECOND)
                    AND entity_id IS NOT NULL"
            )->fetchAll(PDO::FETCH_COLUMN);
            if (!empty($crossDeleted)) {
                $recentlyDeleted = array_unique(array_merge($recentlyDeleted, $crossDeleted));
            }
        } catch (\Throwable $e) {
            // No bloquear save_state si la query de activity_logs falla
        }

        // Filtrar proyectos recién eliminados: evita que cualquier save_state los re-inserte
        if (!empty($recentlyDeleted)) {
            $projectsToSave = array_values(array_filter($projectsToSave,
                static fn($p) => !in_array($p['id'] ?? '', $recentlyDeleted, true)));
        }

        // ── Preservar proyectos de BD que el frontend aún no conoce (race condition multi-usuario) ──
        // SOLO aplica para sesiones de INGENIERO. El ingeniero no puede eliminar proyectos,
        // así que si un proyecto está en BD pero no en su payload, simplemente no lo conoce aún
        // (p.ej. admin acaba de aprobar su solicitud y crear el proyecto via apiUpdateProject).
        // Para admin/system_admin NO se aplica: su estado local es autoritativo — si un proyecto
        // no está en su payload es porque lo eliminó intencionalmente (handlePermanentDeleteProject).
        // Aplicar la guarda a admin causaría que save_state re-inserte proyectos recién borrados
        // antes de que apiDeleteProject complete (race condition en Hostinger).
        if (($sessionUser['role'] ?? '') === 'engineer') {
            $frontendProjectIds = array_column($projectsToSave, 'id');
            foreach ($beforeProjects as $bp) {
                $bpId = $bp['id'] ?? '';
                if ($bpId && !in_array($bpId, $frontendProjectIds, true)
                          && !in_array($bpId, $recentlyDeleted, true)) {
                    $projectsToSave[] = $bp;  // conservar el proyecto de BD sin modificarlo
                }
            }
        }

        $pdo = db();
        $pdo->beginTransaction();
        syncRows($pdo, 'app_users', $usersToSave);
        syncProjectRows($pdo, $projectsToSave);
        // Requests NO se sincronizan aquí — ver nota arriba.
        // Notifications se gestionan por endpoints propios (create/delete/mark_read)
        // No se sincronizan aquí para evitar que múltiples sesiones se sobreescriban
        $pdo->commit();

        logCollectionChanges('user', $beforeUsers, $usersToSave);
        logCollectionChanges('project', $beforeProjects, $projectsToSave);

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

    /* ── send_message — guarda mensaje de chat en project_messages ── */
    if ($action === 'send_message') {
        requireAuth();
        $data       = readJson();
        $projectId  = trim($data['project_id'] ?? '');
        $message    = trim($data['message'] ?? '');
        $isPriority = (bool) ($data['isPriority'] ?? false);

        if (!$projectId || !$message) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id y message requeridos.']);
            exit;
        }

        $user  = sessionUser();
        $now   = gmdate('c');
        $msgId = 'msg-' . bin2hex(random_bytes(12));

        $payload = [
            'id'         => $msgId,
            'projectId'  => $projectId,
            'authorId'   => $user['id']   ?? '',
            'authorName' => $user['name'] ?? 'Usuario',
            'authorRole' => $user['role'] ?? 'engineer',
            'message'    => $message,
            'isPriority' => $isPriority,
            'createdAt'  => $now,
        ];

        $stmt = db()->prepare(
            "INSERT INTO project_messages (id, project_id, payload) VALUES (:id, :pid, :payload)"
        );
        $stmt->execute([
            ':id'      => $msgId,
            ':pid'     => $projectId,
            ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);

        echo json_encode(['ok' => true, 'message' => $payload], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /* ── get_messages — carga historial de mensajes de un proyecto ── */
    if ($action === 'get_messages') {
        requireAuth();
        $projectId  = trim($_GET['project_id'] ?? '');
        $since      = trim($_GET['since'] ?? '1970-01-01T00:00:00Z');

        if (!$projectId) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id requerido.']);
            exit;
        }

        $sinceMySQL = date('Y-m-d H:i:s', strtotime($since));
        $stmt = db()->prepare(
            "SELECT payload FROM project_messages WHERE project_id = :pid AND created_at > :since ORDER BY created_at ASC LIMIT 200"
        );
        $stmt->execute([':pid' => $projectId, ':since' => $sinceMySQL]);
        $messages = array_map(
            static fn(array $row): array => json_decode($row['payload'], true),
            $stmt->fetchAll()
        );

        echo json_encode(['ok' => true, 'messages' => $messages], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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

    /* ── update_project — mutación atómica de un proyecto (reemplaza save_state masivo) ── */
    if ($action === 'update_project') {
        requireAuth();
        $callerRole = $_SESSION['user_role'] ?? '';
        $callerId   = $_SESSION['user_id']   ?? '';
        $data      = readJson();
        $projectId = (string)($data['project_id'] ?? '');
        $fields    = $data['fields'] ?? null;
        if (!$projectId || !is_array($fields)) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id y fields requeridos.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stmt = db()->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
        $stmt->execute([$projectId]);
        $row = $stmt->fetch();

        // Ingenieros y supervisores solo pueden modificar proyectos donde son creador o participante.
        // Admins y system_admin pueden modificar cualquier proyecto.
        if (!in_array($callerRole, ['admin', 'system_admin'], true)) {
            $source        = $row ? (json_decode($row['payload'], true) ?? []) : $fields;
            $isCreator     = ($source['createdBy'] ?? '') === $callerId;
            $isParticipant = in_array($callerId, $source['participants'] ?? [], true);
            if (!$isCreator && !$isParticipant) {
                http_response_code(403);
                echo json_encode(['error' => 'No tienes permiso para modificar este proyecto.'], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        // Extrae el número de folio de un structuredName tipo "0042-Nombre-Cliente".
        // Retorna null si el nombre no empieza con dígitos (proyecto sin folio aún).
        $extractFolio = static function (string $sn): ?int {
            if ($sn === '') return null;
            $first = explode('-', $sn)[0];
            return (ctype_digit($first) && (int)$first > 0) ? (int)$first : null;
        };

        // Verifica que el folio no esté ya asignado a otro proyecto distinto.
        $assertFolioUnique = static function (int $folio, string $selfId) use ($extractFolio): void {
            $dup = db()->prepare("SELECT id FROM projects WHERE folio = :f AND id != :id LIMIT 1");
            $dup->execute([':f' => $folio, ':id' => $selfId]);
            if ($dup->fetch()) {
                http_response_code(409);
                echo json_encode(
                    ['error' => "El folio {$folio} ya está asignado a otro proyecto. Refresca e intenta de nuevo."],
                    JSON_UNESCAPED_UNICODE
                );
                exit;
            }
        };

        if (!$row) {
            // El proyecto aún no existe en BD (p.ej. recién creado, pendiente de save_state)
            $fields['id'] = $projectId;
            $newFolio = $extractFolio($fields['structuredName'] ?? '');
            if ($newFolio !== null) $assertFolioUnique($newFolio, $projectId);
            try {
                db()->prepare(
                    "INSERT INTO projects (id, payload, folio, sort_order, updated_at)
                     VALUES (:id, :payload, :folio, 0, NOW())"
                )->execute([
                    ':id'      => $projectId,
                    ':payload' => json_encode($fields, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    ':folio'   => $newFolio,
                ]);
            } catch (\PDOException $e) {
                if ($e->getCode() === '23000') {
                    http_response_code(409);
                    echo json_encode(['error' => "El folio {$newFolio} ya está asignado a otro proyecto. Refresca e intenta de nuevo."], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                throw $e;
            }
        } else {
            // Fusión quirúrgica: preserva campos que el frontend no envió (archivos, comentarios, etc.)
            $current = json_decode($row['payload'], true) ?? [];
            $updated = array_merge($current, $fields);
            $updated['id'] = $projectId;
            // Preserve original fechaSolicitud (inmutable — igual que en save_state)
            if (!empty($current['fechaSolicitud'])) {
                $updated['fechaSolicitud'] = $current['fechaSolicitud'];
            }
            // Campos enviados como null se eliminan del payload (semántica de "unset")
            // p.ej. deletedAt: null al restaurar un proyecto de la papelera
            foreach ($updated as $key => $val) {
                if ($val === null) unset($updated[$key]);
            }
            $newFolio = $extractFolio($updated['structuredName'] ?? '');
            if ($newFolio !== null) $assertFolioUnique($newFolio, $projectId);
            try {
                db()->prepare("UPDATE projects SET payload = :p, folio = :f, updated_at = NOW() WHERE id = :id")
                   ->execute([
                       ':p'  => json_encode($updated, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                       ':f'  => $newFolio,
                       ':id' => $projectId,
                   ]);
            } catch (\PDOException $e) {
                if ($e->getCode() === '23000') {
                    http_response_code(409);
                    echo json_encode(['error' => "El folio {$newFolio} ya está asignado a otro proyecto. Refresca e intenta de nuevo."], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                throw $e;
            }
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    /* ── update_request — mutación atómica de una solicitud ── */
    if ($action === 'update_request') {
        requireAuth();
        $data      = readJson();
        $requestId = (string)($data['request_id'] ?? '');
        $fields    = $data['fields'] ?? null;
        if (!$requestId || !is_array($fields)) {
            http_response_code(400);
            echo json_encode(['error' => 'request_id y fields requeridos.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stmt = db()->prepare("SELECT payload FROM requests WHERE id = ? LIMIT 1");
        $stmt->execute([$requestId]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Solicitud no encontrada.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $current = json_decode($row['payload'], true) ?? [];
        $updated = array_merge($current, $fields);
        $updated['id'] = $requestId;
        db()->prepare("UPDATE requests SET payload = :p, updated_at = NOW() WHERE id = :id")
           ->execute([':p' => json_encode($updated, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $requestId]);
        echo json_encode(['ok' => true]);
        exit;
    }

    /* ── add_project_comment — append atómico: evita que comentarios concurrentes se sobreescriban ──
     * array_merge sobreescribiría el array completo si dos usuarios comentan al mismo tiempo.
     * Este endpoint lee → apendiza → escribe solo los arrays de comments e history.            */
    if ($action === 'add_project_comment') {
        requireAuth();
        $data      = readJson();
        $projectId = (string)($data['project_id'] ?? '');
        $comment   = $data['comment']  ?? null;   // CommentItem completo (id, authorId, message, createdAt, isPriority)
        $histEntry = $data['history']  ?? null;   // ProjectHistoryItem (id, createdAt, action, author)
        if (!$projectId || !is_array($comment) || empty($comment['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id y comment.id requeridos.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stmt = db()->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
        $stmt->execute([$projectId]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Proyecto no encontrado.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $payload = json_decode($row['payload'], true) ?? [];
        // Append al inicio (orden cronológico inverso, igual que el frontend)
        $comments = is_array($payload['comments'] ?? null) ? $payload['comments'] : [];
        array_unshift($comments, $comment);
        $payload['comments']   = $comments;
        $payload['updatedAt']  = gmdate('c');
        if (is_array($histEntry) && !empty($histEntry['id'])) {
            $history = is_array($payload['history'] ?? null) ? $payload['history'] : [];
            array_unshift($history, $histEntry);
            $payload['history'] = $history;
        }
        db()->prepare("UPDATE projects SET payload = :p, updated_at = NOW() WHERE id = :id")
           ->execute([':p' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $projectId]);
        echo json_encode(['ok' => true]);
        exit;
    }

    /* ── create_request ── */
    if ($action === 'create_request') {
        requireAuth();
        $data = readJson();
        $req  = $data['request'] ?? null;
        if (!$req || empty($req['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'request con id requerido.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stmt = db()->prepare(
            "INSERT INTO requests (id, payload, sort_order, updated_at)
             VALUES (:id, :payload, 0, NOW())
             ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = NOW()"
        );
        $stmt->execute([
            ':id'      => (string) $req['id'],
            ':payload' => json_encode($req, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        echo json_encode(['ok' => true]);
        exit;
    }

    /* ── add_project_expense — append atómico: evita que gastos concurrentes se sobreescriban ── */
    if ($action === 'add_project_expense') {
        requireAuth();
        $data      = readJson();
        $projectId = (string)($data['project_id'] ?? '');
        $expense   = $data['expense']  ?? null;
        $histEntry = $data['history']  ?? null;
        if (!$projectId || !is_array($expense) || empty($expense['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id y expense.id requeridos.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stmt = db()->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
        $stmt->execute([$projectId]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Proyecto no encontrado.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $payload  = json_decode($row['payload'], true) ?? [];
        $expenses = is_array($payload['expenses'] ?? null) ? $payload['expenses'] : [];
        // Idempotencia: no duplicar si el mismo expense_id ya fue apendizado (reintento del cliente)
        $existingIds = array_column($expenses, 'id');
        if (!in_array($expense['id'], $existingIds, true)) {
            $expenses[] = $expense;  // append al final (orden cronológico)
        }
        $payload['expenses']  = $expenses;
        $payload['updatedAt'] = gmdate('c');
        if (is_array($histEntry) && !empty($histEntry['id'])) {
            $history = is_array($payload['history'] ?? null) ? $payload['history'] : [];
            array_unshift($history, $histEntry);
            $payload['history'] = $history;
        }
        db()->prepare("UPDATE projects SET payload = :p, updated_at = NOW() WHERE id = :id")
           ->execute([':p' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $projectId]);
        echo json_encode(['ok' => true]);
        exit;
    }

    /* ── delete_project_expense — elimina un gasto por id (array_filter atómico) ── */
    if ($action === 'delete_project_expense') {
        requireAuth();
        $data      = readJson();
        $projectId = (string)($data['project_id'] ?? '');
        $expenseId = (string)($data['expense_id'] ?? '');
        if (!$projectId || !$expenseId) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id y expense_id requeridos.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stmt = db()->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
        $stmt->execute([$projectId]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Proyecto no encontrado.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $payload  = json_decode($row['payload'], true) ?? [];
        $expenses = is_array($payload['expenses'] ?? null) ? $payload['expenses'] : [];
        $payload['expenses']  = array_values(array_filter($expenses, fn($e) => ($e['id'] ?? '') !== $expenseId));
        $payload['updatedAt'] = gmdate('c');
        db()->prepare("UPDATE projects SET payload = :p, updated_at = NOW() WHERE id = :id")
           ->execute([':p' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $projectId]);
        echo json_encode(['ok' => true]);
        exit;
    }

    /* ── add_project_invoice — append atómico al array invoices ── */
    if ($action === 'add_project_invoice') {
        requireAuth();
        $data      = readJson();
        $projectId = (string)($data['project_id'] ?? '');
        $invoice   = $data['invoice']  ?? null;
        $histEntry = $data['history']  ?? null;
        if (!$projectId || !is_array($invoice) || empty($invoice['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id y invoice.id requeridos.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stmt = db()->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
        $stmt->execute([$projectId]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Proyecto no encontrado.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $payload  = json_decode($row['payload'], true) ?? [];
        $invoices = is_array($payload['invoices'] ?? null) ? $payload['invoices'] : [];
        // Idempotencia: no duplicar en reintento del cliente
        $existingIds = array_column($invoices, 'id');
        if (!in_array($invoice['id'], $existingIds, true)) {
            $invoices[] = $invoice;
        }
        $payload['invoices']  = $invoices;
        $payload['updatedAt'] = gmdate('c');
        if (is_array($histEntry) && !empty($histEntry['id'])) {
            $history = is_array($payload['history'] ?? null) ? $payload['history'] : [];
            array_unshift($history, $histEntry);
            $payload['history'] = $history;
        }
        db()->prepare("UPDATE projects SET payload = :p, updated_at = NOW() WHERE id = :id")
           ->execute([':p' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $projectId]);
        echo json_encode(['ok' => true]);
        exit;
    }

    /* ── update_project_invoice — merge quirúrgico de una factura por id ── */
    if ($action === 'update_project_invoice') {
        requireAuth();
        $data      = readJson();
        $projectId = (string)($data['project_id'] ?? '');
        $invoiceId = (string)($data['invoice_id'] ?? '');
        $updates   = $data['updates']   ?? null;
        if (!$projectId || !$invoiceId || !is_array($updates)) {
            http_response_code(400);
            echo json_encode(['error' => 'project_id, invoice_id y updates requeridos.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stmt = db()->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
        $stmt->execute([$projectId]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Proyecto no encontrado.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $payload  = json_decode($row['payload'], true) ?? [];
        $invoices = is_array($payload['invoices'] ?? null) ? $payload['invoices'] : [];
        $found = false;
        foreach ($invoices as &$inv) {
            if (($inv['id'] ?? '') === $invoiceId) {
                $inv   = array_merge($inv, $updates);
                $found = true;
                break;
            }
        }
        unset($inv);
        if (!$found) {
            http_response_code(404);
            echo json_encode(['error' => 'Factura no encontrada.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $payload['invoices']  = $invoices;
        $payload['updatedAt'] = gmdate('c');
        db()->prepare("UPDATE projects SET payload = :p, updated_at = NOW() WHERE id = :id")
           ->execute([':p' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $projectId]);
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

    /* ── next_sequence — devuelve el siguiente consecutivo y avanza el contador ── */
    if ($action === 'next_sequence') {
        requireAdmin();
        getOrInitSequence(); // asegura que el registro exista antes del UPDATE
        // LAST_INSERT_ID(expr) es atómico por conexión — evita race condition entre admins concurrentes
        db()->exec("UPDATE sequence_counters SET value = LAST_INSERT_ID(value + 1) WHERE name = 'projects'");
        $next = (int) db()->query("SELECT LAST_INSERT_ID()")->fetchColumn();
        if ($next === 0) {
            // LAST_INSERT_ID devolvió 0: driver no lo soporta o hubo concurrencia extrema.
            // SELECT FOR UPDATE serializa dos conexiones concurrentes para que nunca devuelvan el mismo folio.
            $pdo = db();
            try {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare("SELECT value FROM sequence_counters WHERE name = 'projects' FOR UPDATE");
                $stmt->execute();
                $row  = $stmt->fetch();
                $next = ($row !== false ? (int)$row['value'] : 3999) + 1;
                // INSERT ... ON DUPLICATE KEY UPDATE garantiza persistencia aunque la fila no exista.
                $pdo->prepare(
                    "INSERT INTO sequence_counters (name, value) VALUES ('projects', :v)
                     ON DUPLICATE KEY UPDATE value = :v2"
                )->execute([':v' => $next, ':v2' => $next]);
                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
        }
        echo json_encode([
            'ok'       => true,
            'sequence' => str_pad((string)$next, 4, '0', STR_PAD_LEFT),
            'value'    => $next,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /* ── get_sequence_info — info del contador (solo gestor) ── */
    if ($action === 'get_sequence_info') {
        requireSystemAdmin();
        $current = getOrInitSequence();
        echo json_encode([
            'ok'      => true,
            'current' => $current,
            'next'    => $current + 1,
            'display' => str_pad((string)($current + 1), 4, '0', STR_PAD_LEFT),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /* ── set_sequence_counter — ajuste manual del contador (solo gestor) ── */
    if ($action === 'set_sequence_counter') {
        requireSystemAdmin();
        $data  = readJson();
        $value = (int)($data['value'] ?? 0);
        if ($value < 1 || $value > 999999) {
            http_response_code(400);
            echo json_encode(['error' => 'value debe ser un entero entre 1 y 999999.']);
            exit;
        }
        // Folio máximo usando la columna indexada — O(1) en lugar de escanear todos los payloads.
        $maxFolio = (int) db()->query("SELECT COALESCE(MAX(folio), 0) FROM projects")->fetchColumn();
        // $value es el nuevo "current"; el próximo folio asignado será $value + 1.
        // Si $value < $maxFolio, el próximo folio podría colisionar con uno ya existente.
        if ($maxFolio > 0 && $value < $maxFolio) {
            http_response_code(409);
            echo json_encode([
                'error' => "No se puede retroceder el contador. El folio más alto en BD es {$maxFolio}. Ingresa un valor ≥ {$maxFolio}.",
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        ensureSequenceTable();
        db()->prepare(
            "INSERT INTO sequence_counters (name, value) VALUES ('projects', :v)
             ON DUPLICATE KEY UPDATE value = :v2"
        )->execute([':v' => $value, ':v2' => $value]);
        logActivity('updated', 'sequence_counter', 'projects', "Consecutivo ajustado a {$value}", ['new_value' => $value, 'max_folio_at_change' => $maxFolio]);
        echo json_encode(['ok' => true, 'value' => $value], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /* ── bump_sequence_counter — sube el contador a max(actual, minimum) — usado tras creación manual ── */
    if ($action === 'bump_sequence_counter') {
        requireAdmin();
        $data    = readJson();
        $minimum = (int)($data['minimum'] ?? 0);
        if ($minimum < 1) {
            echo json_encode(['ok' => true]);
            exit;
        }
        ensureSequenceTable();
        // GREATEST asegura que nunca baje — solo sube
        db()->prepare(
            "INSERT INTO sequence_counters (name, value) VALUES ('projects', :v)
             ON DUPLICATE KEY UPDATE value = GREATEST(value, :v2)"
        )->execute([':v' => $minimum, ':v2' => $minimum]);
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(404);
    echo json_encode(['error' => 'Accion no encontrada.']);

} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    // Loguear internamente con detalle, pero no exponer al cliente
    error_log('[AMPR] ' . $error->getMessage() . ' in ' . $error->getFile() . ':' . $error->getLine());
    http_response_code(500);
    echo json_encode(['error' => 'Error interno del servidor. Intenta de nuevo.']);
}
