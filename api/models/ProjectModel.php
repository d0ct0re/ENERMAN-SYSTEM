<?php
declare(strict_types=1);

class ProjectModel
{
    private PDO $db; // Conexion a la base de datos, inyectada en el constructor

    public function __construct(PDO $db)
    {
        $this->db = $db; // $this = referencia al objeto actual
    }

    public function findById(string $id): ?array
    {
        // Prepara la consulta con ? como placeholder seguro contra SQL Injection
        $stmt = $this->db->prepare(
            "SELECT payload FROM projects WHERE id = ? LIMIT 1"
        );
        $stmt->execute([$id]); // Sustituye el ? por el valor real de $id
        $row = $stmt->fetch(); // Obtiene la fila resultado o false si no existe

        // Si encontró el proyecto, decodifica el JSON a array PHP. Si no, devuelve null.
        return $row ? json_decode($row['payload'], true) : null;
    }

    public function update(string $id, array $fields): void
    {
        // Bloqueamos la fila mientras la leemos y la actualizamos, para que
        // si dos personas editan el mismo proyecto casi al mismo tiempo, la
        // segunda espere en vez de pisar los cambios de la primera.
        $this->db->beginTransaction();

        try {
            $stmt = $this->db->prepare(
                "SELECT payload FROM projects WHERE id = ? LIMIT 1 FOR UPDATE"
            );
            $stmt->execute([$id]);
            $row = $stmt->fetch();

            if (!$row) {
                $this->db->rollBack();
                throw new RuntimeException("Proyecto no encontrado: $id");
            }

            $existing = json_decode($row['payload'], true);
            $updated = array_merge($existing, $fields);
            $updated['id'] = $id;

            // Campos protegidos: nunca se sobreescriben una vez asignados,
            // aunque lleguen en $fields por error o por un request incompleto.
            if (isset($existing['fechaSolicitud'])) {
                $updated['fechaSolicitud'] = $existing['fechaSolicitud'];
            }
            if (isset($existing['sectionStatusFields'])) {
                $updated['sectionStatusFields'] = $existing['sectionStatusFields'];
            }

            $this->db->prepare("UPDATE projects SET payload = :p, updated_at = NOW() WHERE id = :id")
                ->execute([
                    ':p'  => json_encode($updated, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    ':id' => $id,
                ]);

            $this->db->commit();

        } catch (Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack(); // suelta el lock inmediatamente, no espera al timeout
            }
            throw $e; // re-lanza para que el controller sepa que fallo
        }
    }

    public function delete(string $id): bool
    {
        $stmt = $this->db->prepare(
            "DELETE FROM projects WHERE id = :id"
        );
        $stmt->execute([':id' => $id]);

        // Devuelve true si se elimino algo, false si el id no existe
        // rowCount() devuelve el numero de filas afectadas, si elimina alguna devuelve true,
        // de lo contrario false
        return $stmt->rowCount() > 0;
    }

    public function findAll(): array
    {
        // Prepara la consulta con ? como placeholder seguro contra SQL Injection
        $stmt = $this->db->prepare(
            "SELECT payload FROM projects ORDER BY sort_order ASC"
        );
        // No hay filtros en finAll, el execute va vacio
        $stmt->execute([]);
        $rows = $stmt->fetchAll(); // Obtiene todos los proyectos
        // array_map aplica una funcion a cada elemento del array
        return array_map(
            static fn(array $row) => json_decode($row['payload'], true),
            $rows
        );
    }

    public function create(array $data): void
    {
        try {
            $this->db->prepare(
                "INSERT INTO projects(id, payload, sort_order, updated_at) 
                VALUES (:id, :payload, 0, NOW())"
            )->execute([
                ':id'      => $data['id'],
                ':payload' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
        } catch (PDOException $e) {
            // Codigo 23000 = violacion de UNIQUE/PRIMARY KEY (id o folio duplicado)
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Folio o ID duplicado: {$data['id']}");
            }
            throw $e; // cualquier otro error, se re-lanza tal cual
        }
    }
}
