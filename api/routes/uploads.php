<?php
declare(strict_types=1);

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
    $uploadDir = __DIR__ . '/../../uploads/projectra/' . $safeId . '/';
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
    $uploadDir   = __DIR__ . '/../../uploads/projectra/' . $safeProject . '/';
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
