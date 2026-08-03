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
require __DIR__ . '/core/functions.php';
require __DIR__ . '/core/auth_guards.php';

$action = $_GET['action'] ?? 'bootstrap';

// Garantiza que el directorio de uploads siempre tenga el .htaccess correcto.
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

/* ── Router principal ────────────────────────────────────────────────────── */
try {
    require __DIR__ . '/routes/auth.php';
    require __DIR__ . '/routes/state.php';
    require __DIR__ . '/routes/poll.php';
    require __DIR__ . '/routes/projects.php';
    require __DIR__ . '/routes/requests.php';
    require __DIR__ . '/routes/notifications.php';
    require __DIR__ . '/routes/uploads.php';
    require __DIR__ . '/routes/messages.php';
    require __DIR__ . '/routes/users.php';
    require __DIR__ . '/routes/sequences.php';
    require __DIR__ . '/routes/admin.php';

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
