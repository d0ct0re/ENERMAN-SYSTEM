<?php
declare(strict_types=1);

/* ── delete_project ── */
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
    // Extrae el número de folio de un structuredName tipo "0042-Nombre-Cliente".
    // Retorna null si el nombre no empieza con dígitos (proyecto sin folio aún).
    $extractFolio = static function (string $sn): ?int {
        if ($sn === '') return null;
        $first = explode('-', $sn)[0];
        return (ctype_digit($first) && (int)$first > 0) ? (int)$first : null;
    };

    // Verifica que el folio no esté ya asignado a otro proyecto distinto.
    $assertFolioUnique = static function (int $folio, string $selfId): void {
        $dup = db()->prepare("SELECT id FROM projects WHERE folio = :f AND id != :id LIMIT 1");
        $dup->execute([':f' => $folio, ':id' => $selfId]);
        if ($dup->fetch()) {
            throw new RuntimeException('folio_duplicado');
        }
    };

    $pdo = db();
    $pdo->beginTransaction();
    $newFolio = null;

    try {
        // Locking pesimista: bloquea la fila del proyecto (si existe) hasta el commit.
        // Si dos usuarios editan el mismo proyecto casi al mismo tiempo, el segundo
        // request espera a que el primero termine en vez de pisar sus cambios
        // (reemplaza el read-merge-write sin protección que había antes).
        $stmt = $pdo->prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1 FOR UPDATE");
        $stmt->execute([$projectId]);
        $row = $stmt->fetch();

        // Ingenieros y supervisores solo pueden modificar proyectos donde son creador o participante.
        // Admins y system_admin pueden modificar cualquier proyecto.
        if (!in_array($callerRole, ['admin', 'system_admin'], true)) {
            $source        = $row ? (json_decode($row['payload'], true) ?? []) : $fields;
            $isCreator     = ($source['createdBy'] ?? '') === $callerId;
            $isParticipant = in_array($callerId, $source['participants'] ?? [], true);
            if (!$isCreator && !$isParticipant) {
                $pdo->rollBack();
                http_response_code(403);
                echo json_encode(['error' => 'No tienes permiso para modificar este proyecto.'], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        if (!$row) {
            // El proyecto aún no existe en BD (p.ej. recién creado, pendiente de save_state)
            $fields['id'] = $projectId;
            $newFolio = $extractFolio($fields['structuredName'] ?? '');
            if ($newFolio !== null) $assertFolioUnique($newFolio, $projectId);
            $pdo->prepare(
                "INSERT INTO projects (id, payload, folio, sort_order, updated_at)
                 VALUES (:id, :payload, :folio, 0, NOW())"
            )->execute([
                ':id'      => $projectId,
                ':payload' => json_encode($fields, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':folio'   => $newFolio,
            ]);
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
            $pdo->prepare("UPDATE projects SET payload = :p, folio = :f, updated_at = NOW() WHERE id = :id")
               ->execute([
                   ':p'  => json_encode($updated, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                   ':f'  => $newFolio,
                   ':id' => $projectId,
               ]);
        }

        $pdo->commit();

    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();

        $isDupFolio = ($e instanceof \PDOException && $e->getCode() === '23000')
                   || $e->getMessage() === 'folio_duplicado';
        if ($isDupFolio) {
            http_response_code(409);
            echo json_encode(['error' => "El folio {$newFolio} ya está asignado a otro proyecto. Refresca e intenta de nuevo."], JSON_UNESCAPED_UNICODE);
            exit;
        }
        throw $e;
    }

    echo json_encode(['ok' => true]);
    exit;
}

/* ── add_project_comment — append atómico: evita que comentarios concurrentes se sobreescriban ── */
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
