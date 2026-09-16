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
    // Antes cualquier sesion autenticada podia subir archivos a CUALQUIER proyecto con
    // solo saber/adivinar el project_id. Ahora se checa pertenencia antes de aceptar el archivo.
    $accessStmt = db()->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
    $accessStmt->execute([$projectId]);
    $accessRow = $accessStmt->fetch();
    if (!$accessRow) {
        http_response_code(404);
        echo json_encode(['error' => 'Proyecto no encontrado.']);
        exit;
    }
    requireProjectAccess(json_decode($accessRow['payload'], true) ?? []);
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
    // subcontratados faltaba aqui: cualquier archivo subido con esa categoria caia al
    // "fotos" de abajo y quedaba mal etiquetado en el proyecto (bug preexistente,
    // encontrado al revisar este endpoint). cotizSolicitada se retiro del sistema.
    $validCats = ['fotos', 'estimacion', 'cotizacion', 'reporte', 'otros', 'subcontratados', 'subcontratadosFacturas', 'pagoComprobante'];
    if (!in_array($category, $validCats, true)) $category = 'fotos';
    // Nombre visible que el usuario asigna al subir (Fase 4 — comprobantes de pago).
    // Si no lo manda, se usa el nombre original del archivo (comportamiento previo).
    $displayName = trim($_POST['display_name'] ?? '');
    // Liga el archivo a un pago especifico dentro de project.pagosProyecto (solo pagoComprobante).
    $pagoId = trim($_POST['pago_id'] ?? '');

    $maxMB = ($category === 'reporte') ? 45 : 30;
    if ($file['size'] > $maxMB * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['error' => "El archivo excede el límite de {$maxMB} MB."]);
        exit;
    }
    if ($category === 'reporte') {
        // Solo PDF y Word (.docx) — igual que el frontend (REPORTE_ACCEPT). Ya no se acepta
        // Excel ni AutoCAD. Se valida extension Y tipo MIME real (finfo), no solo el nombre.
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $reporteAllowedExt  = ['pdf', 'docx'];
        $reporteAllowedMime = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        $finfo    = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        if (!in_array($ext, $reporteAllowedExt, true) || !in_array($mimeType, $reporteAllowedMime, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Reporte solo acepta PDF (.pdf) o Word (.docx).']);
            exit;
        }
    } elseif ($category === 'subcontratados') {
        // Cotizaciones de subcontratado: Excel (.xlsx/.xlsm) o PDF — igual que el frontend
        // (SUBCONTRATADOS_ACCEPT). .xlsm se sniffa casi siempre con el mismo MIME que .xlsx
        // (ambos son contenedores OOXML), por eso comparten entrada en el allowlist.
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $cotizAllowedExt  = ['xlsx', 'xlsm', 'pdf'];
        $cotizAllowedMime = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel.sheet.macroEnabled.12',
            'application/vnd.ms-excel',
        ];
        $finfo    = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        if (!in_array($ext, $cotizAllowedExt, true) || !in_array($mimeType, $cotizAllowedMime, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Subcontratados-Cotizaciones solo acepta Excel (.xlsx, .xlsm) o PDF.']);
            exit;
        }
    } elseif ($category === 'subcontratadosFacturas') {
        // Facturas de subcontratado: PDF o XML (CFDI) — igual que el frontend
        // (SUBCONTRATADOS_FACTURAS_ACCEPT).
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $facturaAllowedExt  = ['pdf', 'xml'];
        $facturaAllowedMime = [
            'application/pdf',
            'text/xml',
            'application/xml',
        ];
        $finfo    = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        if (!in_array($ext, $facturaAllowedExt, true) || !in_array($mimeType, $facturaAllowedMime, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Subcontratados-Facturas solo acepta PDF o XML.']);
            exit;
        }
    } elseif ($category === 'pagoComprobante') {
        // Comprobantes de pago (Fase 4): PDF o XML — mismo allowlist que Subcontratados-Facturas.
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $comprobanteAllowedExt  = ['pdf', 'xml'];
        $comprobanteAllowedMime = [
            'application/pdf',
            'text/xml',
            'application/xml',
        ];
        $finfo    = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        if (!in_array($ext, $comprobanteAllowedExt, true) || !in_array($mimeType, $comprobanteAllowedMime, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Comprobante de pago solo acepta PDF o XML.']);
            exit;
        }
        if ($pagoId === '') {
            http_response_code(400);
            echo json_encode(['error' => 'pago_id requerido para comprobantes de pago.']);
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
        // Si el usuario asignó un nombre (Fase 4 — comprobantes), se guarda ese en vez
        // del nombre original del archivo subido.
        'name'       => $displayName !== '' ? $displayName : $file['name'],
        'sizeLabel'  => $sizeLabel,
        'sizeBytes'  => $bytes,
        'uploadedAt' => gmdate('c'),
        'url'        => $fileUrl,
        'category'   => $category,
    ];
    // Subcontratados-Cotizaciones y Subcontratados-Facturas: aprobacion por archivo individual
    // (la hace Administracion). Entra en revision desde que se sube, no arranca en "no" (eso
    // es solo el estado de carpeta vacia).
    if ($category === 'subcontratados' || $category === 'subcontratadosFacturas') {
        $fileData['status'] = 'en-revision';
    }
    if ($category === 'pagoComprobante') {
        $fileData['pagoId'] = $pagoId;
    }
    // ── Append atómico del archivo al array files del proyecto en DB ──────────────────────
    // Esto evita que el frontend tenga que enviar la lista completa de archivos via update_project,
    // eliminando el race condition donde un upload tardío sobreescribía archivos previos en DB.
    // FOR UPDATE + transacción: sin esto, dos subidas casi simultáneas al mismo proyecto (o una
    // subida y otro cambio cualquiera) leen el mismo payload viejo y la segunda en escribir
    // pisa por completo lo que dejó la primera — el archivo físico quedaría en disco pero
    // desaparecido de la lista que ve el usuario.
    $pdo = db();
    $pdo->beginTransaction();
    $stmt = $pdo->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1 FOR UPDATE");
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
    $pdo->commit();
    logActivity('uploaded', 'file', $fileId, $fileData['name'], ['projectId' => $projectId, 'size' => $sizeLabel]);
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
    $accessStmt = db()->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1");
    $accessStmt->execute([$projectId]);
    $accessRow = $accessStmt->fetch();
    if (!$accessRow) {
        http_response_code(404);
        echo json_encode(['error' => 'Proyecto no encontrado.']);
        exit;
    }
    requireProjectAccess(json_decode($accessRow['payload'], true) ?? []);
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
    // FOR UPDATE + transacción — ver nota en upload_file.
    $pdo = db();
    $pdo->beginTransaction();
    $stmt = $pdo->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1 FOR UPDATE");
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
    $pdo->commit();
    logActivity('deleted', 'file', $fileId, $fileId, ['projectId' => $projectId, 'physicallyDeleted' => $deleted]);
    echo json_encode(['ok' => true, 'deleted' => $deleted]);
    exit;
}

/* ── set_file_status — aprueba/rechaza UN archivo individual (no toda la carpeta).
   Hoy solo lo usa Subcontratados-Facturas: el ingeniero sube el archivo, pero
   solo Administracion (admin/system_admin) puede aprobarlo/rechazarlo — es lo que
   alimenta el filtro "Facturas subcont." de Admin/Supervisor. ── */
if ($action === 'set_file_status') {
    requireAuth();
    $role = $_SESSION['user_role'] ?? '';
    if (!in_array($role, ['admin', 'system_admin'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Solo Administración puede aprobar estos archivos.']);
        exit;
    }
    $data      = readJson();
    $projectId = trim($data['project_id'] ?? '');
    $fileId    = trim($data['file_id']    ?? '');
    $status    = trim($data['status']     ?? '');
    $validStatuses = ['no', 'en-revision', 'si', 'rechazado'];
    if (!$projectId || !$fileId || !in_array($status, $validStatuses, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'project_id, file_id y status válido requeridos.']);
        exit;
    }
    // FOR UPDATE + transacción — ver nota en upload_file.
    $pdo = db();
    $pdo->beginTransaction();
    $stmt = $pdo->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1 FOR UPDATE");
    $stmt->execute([$projectId]);
    $projRow = $stmt->fetch();
    if (!$projRow) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(['error' => 'Proyecto no encontrado.']);
        exit;
    }
    $proj  = json_decode($projRow['payload'], true) ?? [];
    $files = $proj['files'] ?? [];
    $found = false;
    foreach ($files as &$f) {
        if (($f['id'] ?? '') === $fileId) {
            $f['status'] = $status;
            $found = true;
            break;
        }
    }
    unset($f);
    if (!$found) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(['error' => 'Archivo no encontrado.']);
        exit;
    }
    $proj['files']     = $files;
    $proj['updatedAt'] = gmdate('c');
    $pdo->prepare("UPDATE projects SET payload = :p, updated_at = NOW() WHERE id = :id")
        ->execute([':p' => json_encode($proj, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $projectId]);
    $pdo->commit();
    logActivity('updated', 'file_status', $fileId, $fileId, ['projectId' => $projectId, 'status' => $status]);
    echo json_encode(['ok' => true]);
    exit;
}
  