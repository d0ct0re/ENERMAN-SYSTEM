<?php
declare(strict_types=1);

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
