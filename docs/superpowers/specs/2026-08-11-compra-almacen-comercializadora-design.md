# Compra a almacén y venta posterior en Comercializadora

**Fecha:** 2026-08-11
**Estado:** aprobado por el usuario (opción A de tres propuestas)

## Problema

La app cubre dos flujos de comercializadora que no empatan con el caso real nuevo:

- **Operación de paso directo** (Ventas → Comercializadora, `guardarOperacionComer`): compra y venta se capturan juntas, el mismo día. Genera envío, gastos autoGen (Compra Mercancia + Fletes) y deudas (pagar al proveedor, cobrar al cliente).
- **Almacén**: guarda lotes y los despacha después, pero el formulario de lote no conoce proveedor ni costo de compra, no genera gastos ni deudas, y el despacho no genera cuentas por cobrar (para ningún negocio).

El caso nuevo: se compra mercancía (se paga flete aparte; la mercancía queda a crédito con el proveedor), entra al almacén, y se vende después — posiblemente en partes. Es un movimiento recurrente.

## Decisiones tomadas con el usuario

1. **La compra se captura en Almacén** — el lote ES la compra (opción A). La operación de paso directo queda intacta para compra-venta el mismo día.
2. **Las compras son siempre a crédito**: además de los gastos, se crea la cuenta por pagar al proveedor. El flete de compra NUNCA va a la cuenta del proveedor (regla existente del negocio) — se registra solo como gasto.
3. **Todo despacho de almacén genera la cuenta por cobrar del cliente**, para los tres negocios (jal, nay, com). Hoy no la genera para ninguno.

## Diseño

### 1. Formulario de lote (Almacén → Nuevo lote)

Cuando `af-loc` = `com`, se muestran tres campos extra (ocultos para jal/nay, y se ignoran sus valores si el negocio no es com):

- **Proveedor** — catálogo `proveedoresComer` (el de la operación de paso directo), con alta automática vía `agregarProveedorComerSiNuevo()`.
- **Precio compra $/kg** — nuevo campo. El "Precio est. $/kg" actual (`precioEst`) conserva su significado de precio estimado de VENTA (es el placeholder del despacho).
- **Flete de compra $**.

El mostrar/ocultar va en el mismo `onchange` de `af-loc` que ya llama `buildAlmSectorSelect()`.

### 2. Campos nuevos del lote (regla de los cuatro lugares)

| JS (camelCase) | Supabase (snake_case) | tipo |
|---|---|---|
| `proveedor` | `proveedor` | text |
| `precioCompra` | `precio_compra` | numeric |
| `fleteCompra` | `flete_compra` | numeric |
| `gastoIds` | `gasto_ids` | jsonb (array de ids) |

Tocar: `guardarLote()` (construcción del objeto, ramas nueva y edición), `sbSaveAlmLote()`, el `.map()` de `alm_lotes` en `cargarDesdeSB()`, y migración en Supabase (4 columnas nuevas, nullables). Lotes viejos quedan con los campos vacíos y siguen funcionando igual.

### 3. Sincronización compra → gastos + deuda: `sincronizarCompraLote(lote)`

Se llama al guardar el lote (alta y edición). Patrón espejo de `sincronizarDeudasEnvio`:

1. Borra los gastos cuyos ids estén en `lote.gastoIds` (memoria + `sbDeleteGasto`) y la deuda con `refId === lote.id` y `refKind === 'alm_compra_pagar'`.
2. Si `loc === 'com'` y hay `proveedor` y `precioCompra > 0`, crea:
   - Gasto **Compra Mercancia** = `kgTotal × precioCompra`, `loc:'com'`, `cultivo:'com'`, `autoGen:true`.
   - Gasto **Fletes** = `fleteCompra` (solo si > 0), mismos atributos.
   - Ids de ambos → `lote.gastoIds`.
   - Deuda por pagar: `{id: lote.id*10+1, tipo:'pagar', contraparte: proveedor, origen:'comercializadora', refId: lote.id, refKind:'alm_compra_pagar', items:[{concepto:'Compra '+variedad, monto}], monto: kgTotal×precioCompra}` — sin flete. `registrarContraparte(proveedor,'pagar')` como ya hace `sincronizarDeudasEnvio` (alta automática con modo fifo).

`confirmDelLote()` ejecuta el paso 1 antes de borrar el lote (nada de gastos ni deudas huérfanos).

Los gastos autoGen del lote siguen la regla existente: no editarlos a mano, se regeneran al guardar el lote.

### 4. Despacho → cuenta por cobrar

En `confirmarDespachoGeneral()`:

- El `envioObj` de un grupo `com` lleva `esComer:true` (clasificación en Ventas/reportes igual que el paso directo). Sin `proveedor` — la cuenta por pagar ya nació con el lote.
- Cada envío creado pasa por `sincronizarDeudasEnvio(envioObj)`. Con la lógica existente: jal/nay → cobrar con flete de venta incluido; com (`esComer`) → cobrar sin flete y sin lado pagar (no hay proveedor en el envío). Las partidas del despacho ya traen `pesoNeto`/`precio`, que son los campos que esa función lee.
- `delEnvio()` ya llama `borrarDeudasDeEnvio()`, así que borrar el envío del despacho limpia su cuenta por cobrar sin código nuevo.

### 5. Lo que NO cambia

- Operación de paso directo (`guardarOperacionComer`): intacta.
- Lotes jal/nay: sin gastos ni deudas desde el lote (sus gastos nacen del envío vía `generarGastosCosechaDesdeEnvio`).
- Ventas parciales de un lote: ya soportadas por el almacén.
- `precioEst` conserva su semántica actual.

## Flujo resultante para el usuario

1. **Compra**: Almacén → Nuevo lote → Negocio: Comercializadora, kg, proveedor, precio compra, flete. Guardar. (Se generan solos: 2 gastos + cuenta por pagar.)
2. **Venta** (cuando sea, en partes si hace falta): Almacén → Despachar → elegir lote, cliente, kg, precio venta. (Se generan solos: envío Comer/... + cuenta por cobrar.)
3. **Cobros/abonos**: módulo Deudas, como siempre.

## Verificación

- Alta/edición/borrado de lote com: gastos y deuda aparecen, se actualizan y desaparecen; sin duplicados tras editar varias veces.
- Lote jal/nay: no genera nada nuevo.
- Despacho de lote com: envío con `esComer`, numeración `Comer/`, cobrar sin flete; despacho jal/nay: cobrar con flete.
- Borrar envío de despacho: limpia la cobrar.
- Refresh tras guardar (ida y vuelta a Supabase): los campos nuevos sobreviven.
- Pruebas en navegador con persistencia bloqueada (local y producción comparten base).
