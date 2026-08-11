# Envíos cancelados

**Fecha:** 2026-08-11
**Estado:** aprobado por el usuario

## Problema

Un envío se canceló, pero ya tenía asignados Folio Negocio y Folio Cliente en el control de Excel, y al cliente ya se le mandó la relación con ese folio. Hay que poder registrarlo sin que cuente como ingreso.

Hoy la única salida es **Eliminar**, que no sirve:

- Se pierde el registro del folio que el cliente ya conoce.
- **El folio queda libre y se reasigna**: `getNextNumEnvio()` calcula el consecutivo escaneando los envíos existentes, así que borrar el envío hace que el siguiente tome ese número.

En el envío cancelado real: no se le pagó al proveedor ni el cliente pagó, pero **sí se pagó el flete de compra**. O sea: no todos los gastos autogenerados deben desaparecer.

## Decisiones tomadas con el usuario

1. El envío cancelado **se conserva** en `envios`, marcado, para reservar su folio.
2. Al cancelar se pregunta **gasto por gasto** cuáles borrar y cuáles conservar (casillas independientes, todas marcadas para borrar por defecto).
3. Las **deudas siempre se borran** — nadie cobra ni paga un envío cancelado. No se pregunta.
4. **El almacén NO se toca.** La ruta real es almacén → venta → cancelación: la mercancía ya salió físicamente, así que los kg siguen descontados del lote y el lote no se reabre.
5. El caso pendiente se captura normal y luego se cancela (no se agrega casilla "cancelado" al formulario de alta).

## Diseño

### Campos nuevos del envío

| JS (camelCase) | Supabase (snake_case) | tipo |
|---|---|---|
| `cancelado` | `cancelado` | boolean |
| `motivoCancelacion` | `motivo_cancelacion` | text |
| `fechaCancelacion` | `fecha_cancelacion` | text (ISO) |

Regla de los cuatro lugares: objeto al guardar, `sbSaveEnvio()`, `.map()` de `envios` en `cargarDesdeSB()`, columnas en Supabase.

### Flujo de cancelación

Botón **🚫 Cancelar envío** en `verEnvio()`, junto a Editar y Eliminar. Abre un modal (`abrirCancelarEnvio(id)`) con:

- Resumen: folio, cliente, total.
- Una casilla por cada gasto autogenerado **que exista** del envío (ver "Cómo se localizan los gastos"), con su categoría y monto. Marcada = borrar; desmarcada = conservar. Todas marcadas por defecto.
- Si no hay gastos, un texto que lo indica.
- Campo opcional de motivo.
- Botón confirmar.

Al confirmar (`confirmarCancelarEnvio(id)`):

1. `e.cancelado=true`, `e.motivoCancelacion`, `e.fechaCancelacion` (ISO de hoy).
2. `borrarDeudasDeEnvio(e.id)` — siempre.
3. Por cada gasto marcado: quitar de `gastos` + `sbDeleteGasto(id)`.
4. Por cada gasto conservado: `autoGen=false` y re-guardar, para que una reedición posterior del envío no lo pise (los gastos autoGen se regeneran al guardar el envío de origen). Quitar su id de `e.gastoCosechaIds`.
5. Persistir: `saveEnvios()`, `save()`, `sbSaveEnvio(e)`. Cerrar modal, `renderEnvios()`.

### Cómo se localizan los gastos: `gastosAutoGenDeEnvio(e)`

**No se puede usar `e.gastoCosechaIds`.** `sbSaveEnvio()` no lo guarda (la tabla `envios` solo persiste id, num, folio, fecha, fecha_lbl, loc, ciclo, cliente, proveedor, flete, flete_compra, factura, es_comer, total, partidas) y `cargarDesdeSB()` sobrescribe `cc_envios` con lo que viene de Supabase, así que la lista de ids desaparece en cada recarga. Se usa como **fuente adicional** cuando existe, nunca como única.

`gastosAutoGenDeEnvio(e)` devuelve la unión de:

1. Gastos cuyo id esté en `e.gastoCosechaIds` (cuando sobrevive en localStorage).
2. **Comercializadora paso directo** (`e.esComer`): `g.autoGen && g.loc==='com'` y `desc` en `['Compra mercancia op. '+num, 'Flete compra op. '+num]` — mismo criterio que ya usa `delEnvio()`. El `num` es único, así que no hay ambigüedad.
3. **Flete único de otros negocios**: `g.autoGen && desc === 'Flete compra envio '+num`.
4. **Cosecha jal/nay**: `g.autoGen && g.loc===e.loc && g.cultivo==='camote' && g.tipoCamote==='cosecha' && g.fechaVal===e.fecha && g.proveedor===e.cliente` y `g.cat` en `['Flete Cosecha','Cosecha','Arado','Desvarada']`. El `desc` de estos gastos (`'Cosecha Camote Jalisco Sector 1'`) NO es único entre envíos, por eso se combina con fecha y cliente.

Deduplicar por id antes de pintar el modal.

### Efecto en ingresos

`envioTotal(e)` devuelve `0` si `e.cancelado`. Es la única función que suman los 8 puntos donde aparecen ventas (reportes, EDR, resumen por negocio, ingresos por mes, ingresos por ciclo), así que un solo cambio los cubre todos.

`getNextNumEnvio()` no cambia: como el envío sigue en `envios`, su folio queda reservado.

### Presentación

- Lista (`renderEnvios`): insignia roja "🚫 Cancelado" en los tags y el total tachado con `text-decoration:line-through` y color apagado.
- Detalle (`verEnvio`): fila con el motivo y la fecha de cancelación; el botón Cancelar se sustituye por **Reactivar**.

### Reactivar

`reactivarEnvio(id)`: quita las tres marcas, vuelve a llamar `sincronizarDeudasEnvio(e)` para recrear las cuentas, persiste. Los gastos borrados **no** se recuperan (se avisa en el botón/toast).

## Lo que NO cambia

- Almacén: ni lotes ni despachos se tocan al cancelar.
- `getNextNumEnvio` / `buildNumEnvio`.
- La operación de paso directo y el despacho siguen creando sus envíos igual (nacen sin `cancelado`).

## Verificación

- Cancelar envío jal con 4 gastos de cosecha: borrar 3 y conservar 1 → el conservado queda con `autoGen:false` y fuera de `gastoCosechaIds`; deudas del envío en 0.
- Cancelar envío com (paso directo): mismos dos gastos disponibles.
- `envioTotal` del cancelado = 0; el total general de ingresos baja exactamente ese monto.
- Alta de un envío nuevo después de cancelar: **no** reutiliza el folio del cancelado.
- Reactivar: vuelven las cuentas por cobrar/pagar, `envioTotal` vuelve a su valor.
- Envío de despacho de almacén cancelado: el lote conserva sus kg despachados y su estado cerrado.
- Ida y vuelta a Supabase: las tres marcas sobreviven al refresh.
- Pruebas en navegador con persistencia bloqueada (local y producción comparten base).
