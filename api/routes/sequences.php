<?php
declare(strict_types=1);

/* ── next_sequence — devuelve el siguiente consecutivo y avanza el contador ──
   Cualquier usuario autenticado puede pedir uno (no solo admin): las solicitudes
   creadas por ingenieros también necesitan folio desde que se crean, no solo al
   aprobarse. No expone datos sensibles, solo incrementa un contador atómico. */
if ($action === 'next_sequence') {
    requireAuth();
    getOrInitSequence(); // asegura que el registro exista antes del UPDATE
    // Autocorrección: si el contador quedó atrás del folio/secuencia más alta ya emitida
    // (proyectos aprobados O solicitudes pendientes que ya reservaron su número), nunca
    // dejar que emita un número ya usado o reservado.
    $maxIssued = maxIssuedSequence();
    if ($maxIssued > 0) {
        db()->prepare("UPDATE sequence_counters SET value = GREATEST(value, :m) WHERE name = 'projects'")
            ->execute([':m' => $maxIssued]);
    }
    // LAST_INSERT_ID(expr) es atómico por conexión — evita race condition entre usuarios concurrentes
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
    // Mismo autocorrectivo que next_sequence — que el panel nunca muestre un "siguiente
    // folio" que ya quedó atrás del máximo realmente emitido (proyectos + solicitudes).
    $maxIssued = maxIssuedSequence();
    if ($maxIssued > $current) {
        db()->prepare("UPDATE sequence_counters SET value = :m WHERE name = 'projects'")
            ->execute([':m' => $maxIssued]);
        $current = $maxIssued;
    }
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
    // $value es el nuevo "current"; el próximo folio asignado será $value + 1.
    // Si $value < lo ya emitido, el próximo folio podría colisionar con un proyecto YA
    // aprobado o con una solicitud pendiente que ya reservó ese número desde que se creó
    // (aunque todavía no sea proyecto) — maxIssuedSequence() cubre ambas fuentes.
    $maxIssued = maxIssuedSequence();
    if ($maxIssued > 0 && $value < $maxIssued) {
        http_response_code(409);
        echo json_encode([
            'error' => "No se puede retroceder el contador. El número más alto ya emitido (proyectos + solicitudes pendientes) es {$maxIssued}. Ingresa un valor ≥ {$maxIssued}.",
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    ensureSequenceTable();
    db()->prepare(
        "INSERT INTO sequence_counters (name, value) VALUES ('projects', :v)
         ON DUPLICATE KEY UPDATE value = :v2"
    )->execute([':v' => $value, ':v2' => $value]);
    logActivity('updated', 'sequence_counter', 'projects', "Consecutivo ajustado a {$value}", ['new_value' => $value, 'max_issued_at_change' => $maxIssued]);
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
