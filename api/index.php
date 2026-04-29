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
    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) {
        return null;
    }

    foreach (tableRows('app_users') as $user) {
        if (($user['id'] ?? '') === $userId) {
            return $user;
        }
    }

    return null;
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

function ensureSeedUsers(): void
{
    $count = (int) db()->query('SELECT COUNT(*) FROM app_users')->fetchColumn();
    if ($count > 0) {
        return;
    }
    $now = gmdate('c');
    replaceRows(db(), 'app_users', [
        ['id' => 'user-system-admin', 'firstName' => 'Gestor', 'lastName' => 'Sistema', 'name' => 'Gestor Sistema', 'role' => 'system_admin', 'roleLabel' => 'Gestor del sistema', 'avatar' => 'GS', 'email' => 'amper.enerman@gmail.com', 'password' => 'ASBT2026!', 'department' => 'Gestor del sistema', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-carlos', 'firstName' => 'Gerardo', 'lastName' => 'Tovar', 'name' => 'Gerardo Tovar', 'role' => 'supervisor', 'roleLabel' => 'Supervisor', 'avatar' => 'GT', 'email' => 'gerencia@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Supervisores', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-maria', 'firstName' => 'Ariana', 'lastName' => 'Padilla', 'name' => 'Ariana Padilla', 'role' => 'admin', 'roleLabel' => 'Administracion', 'avatar' => 'AP', 'email' => 'administracion@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Administracion', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-adan', 'firstName' => 'Adan', 'lastName' => 'Montoya', 'name' => 'Adan Montoya', 'role' => 'admin', 'roleLabel' => 'Administracion', 'avatar' => 'AM', 'email' => 'ventas@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Administracion', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-alessandra-soto', 'firstName' => 'Alessandra', 'lastName' => 'Soto', 'name' => 'Alessandra Soto', 'role' => 'admin', 'roleLabel' => 'Administracion', 'avatar' => 'AS', 'email' => 'alessandra.soto@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Administracion', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-alan', 'firstName' => 'Alan', 'lastName' => 'Sanchez', 'name' => 'Alan Sanchez', 'role' => 'supervisor', 'roleLabel' => 'Supervisor', 'avatar' => 'AS', 'email' => 'medicion@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Supervisores', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-jesus', 'firstName' => 'Jesus', 'lastName' => 'Plata', 'name' => 'Jesus Plata', 'role' => 'supervisor', 'roleLabel' => 'Supervisor', 'avatar' => 'JP', 'email' => 'operacion@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Supervisores', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-gabriel-padilla', 'firstName' => 'Gabriel', 'lastName' => 'Padilla', 'name' => 'Gabriel Padilla', 'role' => 'supervisor', 'roleLabel' => 'Supervisor', 'avatar' => 'GP', 'email' => 'gabriel.padilla@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Supervisores', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-jorge-becerra', 'firstName' => 'Jorge', 'lastName' => 'Becerra', 'name' => 'Jorge Becerra', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'JB', 'email' => 'jorge.becerra@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-benjamin-tejada', 'firstName' => 'Benjamin', 'lastName' => 'Tejada', 'name' => 'Benjamin Tejada', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'BT', 'email' => 'benjamin.tejada@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-luis-garcia', 'firstName' => 'Luis', 'lastName' => 'Garcia', 'name' => 'Luis Garcia', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'LG', 'email' => 'luis.garcia@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-angel-saucedo', 'firstName' => 'Angel', 'lastName' => 'Saucedo', 'name' => 'Angel Saucedo', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'AS', 'email' => 'angel.saucedo@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-roberto-hernandez', 'firstName' => 'Roberto', 'lastName' => 'Hernandez', 'name' => 'Roberto Hernandez', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'RH', 'email' => 'roberto.hernandez@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-gabriel-colunga', 'firstName' => 'Gabriel', 'lastName' => 'Colunga', 'name' => 'Gabriel Colunga', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'GC', 'email' => 'gabriel.colunga@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-cesar-gonzalez', 'firstName' => 'Cesar', 'lastName' => 'Gonzalez', 'name' => 'Cesar Gonzalez', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'CG', 'email' => 'cesar.gonzalez@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-raul-martinez', 'firstName' => 'Raul', 'lastName' => 'Martinez', 'name' => 'Raul Martinez', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'RM', 'email' => 'raul.martinez@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-joahan-castillo', 'firstName' => 'Joahan', 'lastName' => 'Castillo', 'name' => 'Joahan Castillo', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'JC', 'email' => 'joahan.castillo@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-luis-banda', 'firstName' => 'Luis', 'lastName' => 'Banda', 'name' => 'Luis Banda', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'LB', 'email' => 'luis.banda@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-servando-ramirez', 'firstName' => 'Servando', 'lastName' => 'Ramirez', 'name' => 'Servando Ramirez', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'SR', 'email' => 'servando.ramirez@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-oscar-noriega', 'firstName' => 'Oscar', 'lastName' => 'Noriega', 'name' => 'Oscar Noriega', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'ON', 'email' => 'oscar.noriega@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
        ['id' => 'user-roberto-ferretiz', 'firstName' => 'Roberto', 'lastName' => 'Ferretiz', 'name' => 'Roberto Ferretiz', 'role' => 'engineer', 'roleLabel' => 'Ingeniero', 'avatar' => 'RF', 'email' => 'roberto.ferretiz@enerman.com.mx', 'password' => 'ASBT2026!', 'department' => 'Ingenieria', 'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now],
    ]);
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

    /* ── bootstrap ── */
    if ($action === 'bootstrap') {
        ensureSeedUsers();
        if (!isset($_SESSION['user_id'])) {
            echo json_encode(['ok' => false, 'error' => 'session_required']);
            exit;
        }
        echo json_encode([
            'users'         => tableRowsUsers(),
            'projects'      => tableRows('projects'),
            'requests'      => tableRows('requests'),
            'notifications' => tableRows('notifications'),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /* ── login ── */
    if ($action === 'login') {
        $data = readJson();
        $user = verifyCredentials($data['email'] ?? '', $data['password'] ?? '');
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Credenciales incorrectas.']);
            exit;
        }
        unset($user['password']);
        $_SESSION['user_id']   = $user['id'];
        $_SESSION['user_role'] = $user['role'];
        logActivity('login', 'user', $user['id'] ?? null, $user['name'] ?? null, ['email' => $user['email'] ?? null], $user);
        echo json_encode(['ok' => true, 'user' => $user], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /* ── logout ── */
    if ($action === 'logout') {
        unset($_SESSION['user_id'], $_SESSION['user_role']);
        echo json_encode(['ok' => true]);
        exit;
    }

    /* ── admin_login ── */
    if ($action === 'admin_login') {
        $data = readJson();
        $user = verifyCredentials($data['email'] ?? '', $data['password'] ?? '');
        if (!$user || ($user['role'] ?? '') !== 'system_admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Acceso restringido a system_admin.']);
            exit;
        }
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
        $projects = tableRows('projects');
        $project = null;
        foreach ($projects as $candidate) {
            if (($candidate['id'] ?? '') === $projectId) {
                $project = $candidate;
                break;
            }
        }
        $filtered = array_values(array_filter($projects, static fn($p) => $p['id'] !== $projectId));
        if (count($filtered) === count($projects)) {
            http_response_code(404);
            echo json_encode(['error' => 'Proyecto no encontrado.']);
            exit;
        }
        $pdo = db();
        $pdo->beginTransaction();
        replaceRows($pdo, 'projects', $filtered);
        $pdo->commit();
        logActivity('deleted', 'project', $projectId, $project ? itemName($project) : $projectId, ['source' => 'delete_project']);
        echo json_encode(['ok' => true, 'deleted' => $projectId]);
        exit;
    }

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
        ];
        $finfo    = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        if (!in_array($mimeType, $allowedMimes, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Tipo no permitido. Acepta: PNG, JPG, GIF, WEBP, PDF, Word, Excel.']);
            exit;
        }
        if ($file['size'] > 10 * 1024 * 1024) {
            http_response_code(400);
            echo json_encode(['error' => 'El archivo excede el límite de 10 MB.']);
            exit;
        }
        $safeId    = preg_replace('/[^a-zA-Z0-9\-_]/', '', $projectId);
        $uploadDir = __DIR__ . '/../uploads/projectra/' . $safeId . '/';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
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
        $scheme    = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host      = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $fileUrl   = $scheme . '://' . $host . '/uploads/projectra/' . $safeId . '/' . $stored;
        $bytes     = $file['size'];
        $sizeLabel = $bytes < 1048576
            ? round($bytes / 1024, 1) . ' KB'
            : round($bytes / 1048576, 1) . ' MB';
        $fileData  = [
            'id'         => $fileId,
            'name'       => $file['name'],
            'sizeLabel'  => $sizeLabel,
            'uploadedAt' => gmdate('c'),
            'url'        => $fileUrl,
        ];
        logActivity('uploaded', 'file', $fileId, $file['name'], ['projectId' => $projectId, 'size' => $sizeLabel]);
        echo json_encode(['ok' => true, 'file' => $fileData], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
        $beforeRequests = tableRows('requests');
        $beforeNotifications = tableRows('notifications');

        $existingUsers = tableRows('app_users');
        $pwMap = [];
        foreach ($existingUsers as $eu) {
            if (isset($eu['id'], $eu['password'])) {
                $pwMap[$eu['id']] = $eu['password'];
            }
        }
        $usersToSave = $data['users'];
        foreach ($usersToSave as &$u) {
            if (isset($u['id'], $pwMap[$u['id']])) {
                $u['password'] = $pwMap[$u['id']];
            }
        }
        unset($u);

        $pdo = db();
        $pdo->beginTransaction();
        replaceRows($pdo, 'app_users', $usersToSave);
        replaceRows($pdo, 'projects', $data['projects']);
        replaceRows($pdo, 'requests', $data['requests']);
        replaceRows($pdo, 'notifications', $data['notifications']);
        $pdo->commit();

        logCollectionChanges('user', $beforeUsers, $usersToSave);
        logCollectionChanges('project', $beforeProjects, $data['projects']);
        logCollectionChanges('request', $beforeRequests, $data['requests']);
        logCollectionChanges('notification', $beforeNotifications, $data['notifications']);

        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(404);
    echo json_encode(['error' => 'Accion no encontrada.']);

} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => $error->getMessage()]);
}
