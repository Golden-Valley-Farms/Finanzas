# Rediseño del módulo de Deudas — Diseño

**Fecha:** 2026-08-07
**Estado:** aprobado por el usuario en conversación

## Objetivo

Convertir el módulo de deudas en un sistema simple y legible que integre todas las
cuentas por cobrar y por pagar del negocio, reemplazando el control que hoy vive en
Excel. Dos modos de cuenta, catálogo de contrapartes con ID, y migración única del
histórico.

## Decisiones tomadas (con el usuario)

1. **Una sola sección de Deudas** (Registrar / Por cobrar / Por pagar). No se separan
   las deudas de camote de las deudas "puras": una contraparte tiene UN saldo, venga
   de envíos o de capturas manuales.
2. **Clemente Duarte se maneja como cargos y abonos** en una sola cuenta cuyo saldo
   puede cambiar de signo (nos debe / le debemos).
3. **Migración: el Excel manda en las cuentas manuales.** Se borra lo que exista de
   esas cuentas en la app y se importa limpio. B&M no se importa: la generan los
   envíos.
4. **ID de contraparte manual**, estilo iniciales (ej. `CD-01`), lo asigna el usuario
   al dar de alta, con validación de unicidad.
5. **Intereses: solo histórico.** Se importan como monto por movimiento tal cual
   vienen del Excel. Sin tasas ni cálculo automático. (La Cañada ya está saldada;
   Arca sigue activa por un cobro pendiente de nivelación de suelo.)
6. **Bioterra es cuenta en USD:** se captura y se muestra en dólares; el equivalente
   MXN es informativo, con tipo de cambio que el usuario actualiza.

## Modelo de datos

### Catálogo de contrapartes (centro del sistema)

Cada contraparte se da de alta una vez con:

| Campo | Descripción |
|---|---|
| `clave` | ID manual, único (ej. `CD-01`) |
| `nombre` | Nombre visible (ej. `Clemente Duarte`) |
| `tipo` | `cobrar` o `pagar` (pestaña donde vive su cuenta) |
| `modo` | `fifo` (facturas con abonos) o `corriente` (cargos y abonos) |
| `moneda` | `MXN` o `USD` |

Al registrar deudas o abonos **solo se puede seleccionar una contraparte del
catálogo** (con botón "+ Nueva" para altas en el momento). Esto elimina duplicados
por nombre libre.

**Cambio en Supabase:** 3 columnas nuevas en `contrapartes`: `clave`, `modo`,
`moneda`. Espejo en `cc_contrapartes` (localStorage).

### Movimientos: se reutilizan las tablas existentes

- `deudas` = cargos (ya tiene `interes`, `nc`, `moneda`, `tipo_cambio`, `items`,
  `origen`, `ref_id` para el enlace con envíos).
- `pagos_deuda` = abonos (ya tiene `moneda`, `tipo_cambio`).

No hay tablas nuevas. El `modo` de la contraparte decide cómo se calculan y pintan
sus movimientos:

- **`fifo`:** comportamiento actual (`calcContraparte()`): cada cargo es una factura;
  los abonos se aplican de la más antigua a la más reciente.
- **`corriente`:** nuevo cálculo: saldo corrido = Σ(cargos + intereses − NC) −
  Σ(abonos). Sin aplicación a facturas. El saldo puede ser negativo (a favor de la
  contraparte).

### Acoplamiento con envíos (sin cambios de fondo)

`sincronizarDeudasEnvio()` sigue generando movimientos automáticos con
`refId`/`refKind`. Caen a la cuenta del cliente con etiqueta de origen visible
("auto · envío"). Si el cliente del envío no existe en el catálogo, se crea
automáticamente con modo `fifo` y clave vacía (el usuario le asigna ID después).

## Cuentas y configuración inicial

| Cuenta | Tipo | Modo | Notas |
|---|---|---|---|
| B&M | cobrar | fifo | Auto desde envíos. **No se importa del Excel.** |
| Arca | pagar | corriente | Intereses históricos por cargo. Activa. |
| Asciende | pagar | corriente | Préstamo. Activa. |
| Clemente Duarte | cobrar | corriente | Fusiona pestaña "Clemente". Saldo puede voltear. |
| Agroproductos los Blancas | pagar | fifo | Fusiona "Los Blancas". |
| Carlos | pagar | corriente | Saldada (historial). |
| Nacho | pagar | corriente | Activa. |
| Bioterra | pagar | corriente | **USD.** Saldada (historial). |
| La Cañada | pagar | fifo | Intereses y notas de crédito históricos. Saldada. |

Las claves (IDs) las asigna el usuario al momento de la migración o después.

## Interfaz

- **Pestañas** Registrar / Por cobrar / Por pagar con KPIs (total, cuentas abiertas),
  como hoy.
- **Tarjetas de cuenta:** `ID · Nombre`, saldo, nº de movimientos. Insignia USD donde
  aplique (saldo en USD + equivalente MXN informativo). Las cuentas con saldo 0 se
  agrupan al fondo en una sección "Historial" en gris.
- **Detalle (modal):**
  - Modo corriente: estado de cuenta — fecha, concepto, cargo, interés, abono, saldo
    corrido; saldo final destacado.
  - Modo fifo: lo actual — facturas con estatus (pendiente/parcial/liquidada) y
    abonos aplicados.
- **Registrar:** contraparte (select del catálogo), tipo de movimiento (cargo/abono),
  fecha, concepto, monto; opcionales: interés (solo cargos en modo corriente),
  folio/factura. En cuentas USD se captura en dólares.

## Migración (una sola vez, fuera de la app)

Ejecutada por Claude leyendo `prueba deudas.xlsx` con Python y escribiendo directo a
Supabase (MCP). La app no carga código de importación.

1. Borrar movimientos manuales actuales de las 8 cuentas manuales en `deudas` y
   `pagos_deuda` (Supabase y, al recargar, localStorage).
2. Importar el histórico: Arca, Asciende, Clemente Duarte (+pestaña Clemente),
   Agroproductos los Blancas (+pestaña Los Blancas), Carlos, Nacho, Bioterra (USD),
   La Cañada (cargos con interés y NC, abonos).
3. **Verificación obligatoria:** tabla comparativa saldo app vs. saldo final del
   Excel por cuenta; deben cuadrar centavo por centavo.

**Riesgo identificado:** si una cuenta "manual" tiene movimientos con `refId`
(generados por envíos) — sospecha: Los Blancas aparece dos veces en la app — se
reporta la colisión al usuario y se resuelve antes de borrar/importar, para no
duplicar compras registradas por ambas vías.

## Manejo de errores

- Alta de contraparte: clave duplicada o vacía → rechazo con toast.
- Registro de movimiento: sin contraparte seleccionada, monto ≤ 0 o sin fecha →
  rechazo con toast (patrón actual).
- Persistencia dual: todo cambio escribe arreglo + `save()` + `sbSaveX()` (regla de
  los cuatro lugares del proyecto).
- `cargarDesdeSB()` debe seguir leyendo tolerante: contrapartes sin `clave`/`modo`
  (datos viejos o creadas por envíos) reciben `modo:'fifo'`, `moneda:'MXN'`,
  `clave:''` por defecto.

## Pruebas

Sin framework de tests en el proyecto. Verificación manual local (misma base de
Supabase que producción — capturar datos de prueba con cuidado y borrarlos):

1. Consola limpia + `Supabase conectado ✅`.
2. Cuadre de saldos post-migración contra el Excel (tabla comparativa).
3. Alta de contraparte con clave duplicada → rechazada.
4. Registrar cargo y abono en cuenta corriente → saldo corrido correcto.
5. Registrar abono en cuenta fifo → se aplica a la factura más antigua.
6. Editar/borrar un envío → sus movimientos auto se regeneran/limpian en la cuenta
   correcta.
7. Cuenta USD: captura en dólares, equivalente MXN se muestra informativo.

## Fuera de alcance

- Cálculo automático de intereses o tasas.
- Estados de cuenta imprimibles/PDF.
- Separar secciones por origen (camote vs. puras).
- Migrar o tocar B&M (queda como está, generada por envíos).
