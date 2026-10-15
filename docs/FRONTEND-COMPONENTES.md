# Componentes de la interfaz

La pantalla se amplía mediante componentes con propiedades y callbacks. Las llamadas a la API y los permisos siguen en la capa de aplicación; los componentes visuales no consultan ni modifican el servidor por su cuenta.

## Header compartido

- `src/components/layout/top-bar.tsx`: conecta búsqueda, navegación a Inicio, tema y menú lateral. Es la misma instancia para los roles autenticados. No muestra perfil ni campana.
- `src/components/layout/app-header.tsx`: contenedor sticky, siempre visible, con alturas de 80 px en escritorio y 64 px en móvil.
- `src/components/layout/app-navigation.tsx`: secciones por rol y cuenta al final. Recibe elementos con clave, etiqueta, icono, estado activo y callback. En móvil usa un panel modal con fondo atenuado, Escape, restauración y contención de foco; el menú tiene desplazamiento interno.
- `src/components/layout/app-header.css`: apariencia común, tamaños y comportamiento responsivo de header y navegación. Respeta movimiento reducido.
- `src/components/layout/activity-feed.tsx`: actividad y acciones existentes de lectura y eliminación en el panel derecho. El header conecta los callbacks sin incorporar controles de notificación a su barra.

## Temas

`src/styles/theme.css` define las paletas semánticas oscuro y claro cálido. Los componentes y utilidades Tailwind consumen variables de fondo, superficie, borde y texto. Los colores de estado conservan su significado, con ajustes de contraste en claro. No se usan filtros de inversión.

`theme-toggle.tsx` ofrece un único control de texto Claro/Oscuro y etiqueta accesible. La preferencia se guarda en `enerman-theme`; el script inicial de `index.html` la aplica antes de cargar la interfaz. El logo existente conserva su rayo; en claro usa la silueta del mismo recurso con letras oscuras y acento amarillo, sin placa de fondo.

## Panel de ingeniería

`src/features/engineer/engineer-view.tsx` organiza las secciones, selecciona datos y conecta las acciones existentes. Los bloques del inicio se encuentran en `src/features/engineer/components/`:

- La navegación se conecta desde `App.tsx` al menú compartido; los cambios de sección conservan los estados y callbacks existentes de cada rol.
- `engineer-welcome.tsx`: saludo y acción principal.
- `engineer-metrics.tsx`: indicadores y navegación asociada.
- `engineer-insights.tsx`: notificaciones, compromisos y distribución de proyectos.

Las solicitudes, correcciones y calendario conservan sus flujos existentes. Para añadir un bloque nuevo, crear un componente en la carpeta de la funcionalidad y entregarle datos y callbacks explícitos desde la vista.

## Tarjetas

`src/components/cards/active-project-card.tsx` y su CSS contienen el nuevo resumen de proyectos activos, usado en Inicio y en la sección de activos. Se puede reutilizar pasando `project` y `onOpen`. Las fases representan datos registrados, no porcentajes de avance físico.

`project-card.tsx` conserva el diseño de las demás listas. No modificar el componente base `ui/card.tsx` para un cambio específico de un tipo de proyecto.

## Próximas ampliaciones

Agregar las funciones futuras, incluido el asistente digital, como funcionalidades separadas. Mantener conexiones con servicios fuera de los componentes de presentación y entregar solo los datos permitidos para cada rol.


## Criterio visual acordado

Aplicar cada cambio de pantalla a oscuro y claro c?lido y verificar ambos. Las tarjetas conservan su paleta al pasar el cursor o recibir foco; comparten elevaci?n, escala suave, sombra y borde amarillo, sin invertir fondos ni texto. Respetar movimiento reducido.

## Apertura del ingeniero

`project-opening-flow.tsx` divide F1 en Informaci?n, Ubicaci?n y Revisi?n, con vista previa y controles anterior/siguiente. Conserva los campos controlados montados al cambiar de paso; el guardado y permisos permanecen en el di?logo original. Ubicaci?n y contactos siguen usando sus campos originales. Las fechas importantes mantienen su guardado independiente. Para solo lectura se permite navegar aunque falten datos. Las tarjetas del ingeniero muestran ?nicamente F1 y F2; las fases financieras permanecen en los perfiles autorizados.
