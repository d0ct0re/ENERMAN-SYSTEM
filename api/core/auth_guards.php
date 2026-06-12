<?php
declare(strict_types=1);

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
