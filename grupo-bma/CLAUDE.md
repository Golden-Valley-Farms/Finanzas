# CLAUDE.md

Guía para Claude Code en la app de **Grupo BMA**. Todo en español (UI, datos, comentarios y nombres de funciones), igual que la app de GVF.

**Regla de mantenimiento:** cada cambio significativo al código de la app se documenta aquí en el mismo commit. El proyecto se está definiendo poco a poco; lo que todavía no se sabe se marca como *pendiente* en vez de suponerlo.

## Qué es

App web en HTML, parecida a la de GVF (`../../Aplicación GVF`), para administrar las cinco empresas del grupo:

| Empresa | Clave | Giro | Notas |
|---|---|---|---|
| SUNL | `sunl` | Importación y venta de motos | También se le dice "Motos con Fuerza" (así aparece en su constancia fiscal) |
| Alzator | `alzator` | Importación y venta de maquinaria pesada | Razón social Alzator SA de CV |
| Pastito | `pastito` | Importación y venta de follaje artificial | |
| Rocket | `rocket` | Venta de canchas de pádel | Modelo de negocio por confirmar |
| Melamina | `melamina` | Importación y venta de melamina en paquetes grandes | No es empresa formal; presentación (rollos o tablas) por confirmar |

La clave es la que se guardará en los registros. El catálogo vive en el arreglo `EMPRESAS` de `index.html`.

Módulos previstos (se construyen uno por uno): **Inventario**, **Cuentas por cobrar y pagar**, **Gastos**.

## Estado actual (24-oct-2026)

Solo estructura: `index.html` con encabezado, selector de empresa (Todas + las cinco, un color por empresa) y tres pestañas con tarjetas "En construcción". No guarda nada, no se conecta a Supabase y no tiene inicio de sesión.

- `selEmpresa(key)` / `renderEmpresas()`: estado en `empresaSel` (`'todas'` o una clave). Todavía no filtra nada.
- `selModulo(mod)`: muestra la sección `#mod-<mod>`; estado en `moduloSel`.
- Estilo copiado de GVF: fuentes DM Sans / DM Mono, mismas variables de color base y modo oscuro por `prefers-color-scheme`. Colores por empresa en `--<clave>` y `--<clave>-bg`.

## Repositorio y despliegue

- Vive en la carpeta `grupo-bma/` del repo `Golden-Valley-Farms/Finanzas`, el mismo de GVF. Se publica por GitHub Pages desde `main` en <https://golden-valley-farms.github.io/Finanzas/grupo-bma/>. **Cada push a `main` sale en vivo** y el repo es **público**.
- **Clon local propio:** `OneDrive\Claude Code\Grupo BMA` es un clon *sparse* del repo que solo trae `grupo-bma/` (`git sparse-checkout set --no-cone '/grupo-bma/'`). Así no se descarga la app de GVF ni se carga su CLAUDE.md (128 KB) al trabajar aquí. Abrir las sesiones de Claude en `Grupo BMA\grupo-bma`.
- **No tocar archivos fuera de `grupo-bma/`**: la raíz del repo es la app de GVF en producción.
- Flujo igual que GVF: editar, commit descriptivo, `git push origin main`, y decirle al usuario dónde mirar en la página en vivo.

## Datos y seguridad (pendiente)

Decisión del usuario (24-oct-2026): **por ahora no hay inicio de sesión ni Supabase**; se arma la estructura primero. Antes de capturar el primer dato real:

1. Mismo proyecto de Supabase que GVF (`jlfendrdwptwmttrahre`), pero con las tablas **separadas** de GVF (esquema propio, nombre tentativo `bma`; hay que exponerlo en la API de Supabase).
2. **Inicio de sesión propio**: no usar el correo ni la contraseña de GVF.
3. RLS en todas las tablas, compuerta de sesión al arrancar y candado de escrituras en `localhost`, como en GVF.
4. Supabase es la fuente de verdad: nada vive solo en `localStorage`.

Como el repo es público, **no capturar datos reales** mientras no exista ese inicio de sesión.

## Reglas de negocio

### Gastos: dos tipos de registro, sin duplicar

Hay dos clases de salida de dinero:

- **Gasto normal:** dinero que sale y es gasto (compra, servicio, etc.).
- **Pago a deuda:** dinero que sale para abonar a algo que se debe.

Ejemplo: se compra algo a crédito por $10,000 y después se abonan $5,000. La compra de $10,000 ya es el gasto. Los $5,000 **sí** deben verse como dinero que salió, pero marcados como pago a la deuda; **no** se suman otra vez como gasto. Si se sumaran, el gasto quedaría duplicado ($15,000 en vez de $10,000).

Consecuencia para los reportes: "gasto" y "salida de efectivo" son totales distintos y no se mezclan.

GVF tiene una regla parecida: el préstamo no genera gasto automático y los abonos van por el módulo de Deudas.

## Fuentes de datos

La información llega en Excels que el equipo deja en Google Drive. Google Drive para escritorio está instalado en la computadora secundaria como unidad `G:`:

- `G:\Mi unidad\ADMINISTRACION GRUPO BMA\` — carpetas `Alzator`, `SUNL`, `Pastito` (al 24-oct-2026 solo documentos fiscales en PDF).
- `G:\Mi unidad\SUNL\` — `Gastos_Fijos.xlsx`, `Organigrama.xlsx`.

La letra de unidad puede cambiar en la computadora principal.
