<?php
declare(strict_types=1);

// Copia este archivo como config.php y coloca los datos de MySQL de Hostinger.
const DB_HOST = 'localhost';
const DB_NAME = 'u000000000_projectra';
const DB_USER = 'u000000000_projectra';
const DB_PASS = 'CAMBIA_ESTA_CONTRASENA';
const DB_CHARSET = 'utf8mb4';

// Clave secreta para acciones de cron sin sesión (backup automático, digest de KPIs).
// Hostinger cron llama: https://tu-dominio/api/index.php?action=cron_backup&key=...
const CRON_SECRET = 'CAMBIA_ESTA_CLAVE';

// SMTP del buzón remitente para el digest diario de KPIs (hPanel → Correo → crea una
// cuenta, ej. alertas@tu-dominio, y usa esas credenciales aquí). Los destinatarios se
// configuran desde el panel "Funciones" de la app, no aquí.
const SMTP_HOST      = 'smtp.hostinger.com';
const SMTP_PORT      = 465;
const SMTP_USER      = 'alertas@tu-dominio.com';
const SMTP_PASS      = 'CAMBIA_ESTA_CONTRASENA';
const SMTP_FROM      = 'alertas@tu-dominio.com';
const SMTP_FROM_NAME = 'ENERMAN-SYSTEM';

