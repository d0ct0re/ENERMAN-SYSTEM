CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  payload JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  -- Columna generada + índice único: última línea de defensa contra dos cuentas con el
  -- mismo correo. La app ya valida esto en create_user/update_user, pero una restricción a
  -- nivel de base de datos no depende de que el código de arriba se mantenga correcto para
  -- siempre — si algo se cuela, MySQL/MariaDB rechaza el INSERT/UPDATE en vez de aceptarlo.
  user_email VARCHAR(191) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.email'))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uniq_user_email (user_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  folio INT UNSIGNED NULL,
  payload JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uniq_folio (folio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contador atomico para el siguiente folio a asignar (ver api/routes/sequences.php).
-- Se crea tambien en caliente via ensureSequenceTable() si faltara, pero debe
-- vivir aca para que un setup nuevo (staging, disaster recovery) quede completo
-- sin depender de que la app la cree sola en su primer request.
CREATE TABLE IF NOT EXISTS sequence_counters (
  name  VARCHAR(50)  NOT NULL PRIMARY KEY,
  value INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Switches globales de "Funciones" que administra el Gestor del sistema (ver panel
-- Funciones en SystemAdminView). Una fila por switch; si no existe fila, se usa el
-- default en APP_SETTINGS_DEFAULTS (api/core/functions.php).
CREATE TABLE IF NOT EXISTS app_settings (
  name       VARCHAR(80) NOT NULL PRIMARY KEY,
  value      JSON        NOT NULL,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Red de seguridad para borrado permanente: copia completa de cada proyecto/solicitud
-- justo antes de eliminarlo para siempre (delete_project, delete_request,
-- bulk_delete_before_folio). Recuperable a mano desde phpMyAdmin (columna payload)
-- mientras no exista un respaldo local/físico real.
CREATE TABLE IF NOT EXISTS deleted_items_archive (
  id              VARCHAR(50)  NOT NULL PRIMARY KEY,
  entity_type     VARCHAR(20)  NOT NULL,
  entity_id       VARCHAR(80)  NOT NULL,
  payload         LONGTEXT     NOT NULL,
  deleted_by      VARCHAR(80)  NULL,
  deleted_by_name VARCHAR(255) NULL,
  deleted_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS requests (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  payload JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  payload JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_messages (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_id (project_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(80) NULL,
  user_name VARCHAR(255) NULL,
  user_role VARCHAR(50) NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(80) NULL,
  entity_name VARCHAR(255) NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at),
  INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
