<?php
declare(strict_types=1);

/* ── delete_request ── */
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
