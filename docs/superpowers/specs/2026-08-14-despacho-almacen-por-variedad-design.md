# Despacho de almacén por variedad, con reparto FIFO

Fecha: 2026-08-14

## El problema

Hoy el despacho de almacén se captura **por lote**: marcas cada lote y escribes cuántos kg
sacas de él y a qué precio. Eso te obliga a traducir de tu cabeza al almacén — tú sabes que
vendiste 1,500 kg de camote blanco, y tienes que averiguar tú solo cuánto había en cada lote
y hacer la resta.

El caso que lo hace evidente: entran 1,000 kg de camote blanco de Comercializadora, después
otros 1,000 kg de camote blanco de Camote Jalisco, y se venden 1,500 kg a un cliente, al
mismo precio. Para el cliente es **una sola venta**. Para la contabilidad tienen que ser
**dos envíos**, uno por negocio, porque si no el margen de un negocio se come al del otro.

Revisando ese caso salieron tres huecos:

1. El precio se captura por lote, así que la misma venta se puede terminar guardando a dos
   precios distintos por un descuido.
2. Los dos envíos no tienen nada que los relacione: el campo **Folio Cliente** existe en la
   pantalla de Ventas pero el despacho de almacén nunca lo captura.
3. **El flete de venta no se le cobra al cliente en Comercializadora.** Esto no es del
   despacho mezclado: pasa hoy en *toda* operación de comercializadora. El envío suma el
   flete a su total pero `sincronizarDeudasEnvio()` lo excluye de la cuenta por cobrar, así
   que el envío dice $30,000 y la cuenta del cliente dice $27,000.

## Decisiones de negocio

- **El flete de venta siempre se le carga al cliente**, en toda venta de camote — Jalisco,
  Nayarit y Comercializadora por igual. El que nunca se le carga al proveedor es el flete de
  **compra**, que se paga aparte. Esa segunda regla ya está bien implementada.
- **El reparto es FIFO puro**: manda la fecha de entrada al almacén, sin importar el negocio.
  Es lo correcto con producto en frío — sale primero lo que lleva más tiempo guardado.
- **La fecha del gasto y de la cuenta por pagar sigue siendo la de entrada al almacén**, no
  la de la venta. Es lo correcto: le debes al proveedor desde que recibiste. Consecuencia
  aceptada: si la entrada y la venta caen en ciclos distintos, el gasto y el ingreso se
  reportan en periodos distintos.
- **No hay migración de datos.** Solo existe un envío de comercializadora histórico con flete
  de venta cobrado, y quedó registrado bien. El arreglo aplica de aquí en adelante.

## Alcance

Seis cambios, en orden de riesgo de menor a mayor:

### 1. Flete de venta a la cuenta por cobrar de Comercializadora

En `sincronizarDeudasEnvio()` (~8005), rama `esCom` → bloque `if(e.cliente)` (~8025-8035):
agregar el item `Fletes` con `e.flete`, igual a como ya lo hace la rama `jal/nay` (~8043).
Quitar el comentario que dice que comercializadora va sin flete.

Aplica solo, sin cambios adicionales, a las dos rutas que crean envíos com: la pantalla de
operación comer (`guardarOperacionComer()`, ~9557) y el despacho de almacén
(`confirmarDespachoGeneral()`, ~11714).

También hay que corregir la regla en `CLAUDE.md`, que hoy documenta lo contrario.

### 2. Folio Negocio visible en la cuenta del cliente

Con el mismo Folio Cliente en dos envíos, la cuenta muestra dos cargos con etiqueta idéntica
y se lee como una captura duplicada.

En `abrirDeudaContraparte()` (~8444), debajo de la fecha del cargo, agregar una línea chica
con el Folio Negocio del envío, buscándolo por `d.refId` en `envios` (`e.num`). Solo cuando
el envío exista; los movimientos manuales e importados no muestran nada.

Aplicar lo mismo en `renderModalCorriente()` (~8489), porque el modo de la cuenta depende de
la contraparte, no del origen del movimiento: un cliente en modo corriente ve el mismo
problema.

Sin campos ni columnas nuevas: se deriva de `refId`.

### 3. Folio Cliente en el despacho

Agregar el campo `dg-folio` al encabezado del modal de `abrirDespachoGeneral()` (~11588),
con el mismo placeholder que usa Ventas (`B&M/2026/017`).

En `confirmarDespachoGeneral()`, asignar ese valor a `folio` en **todos** los envíos que
genere el despacho. Es lo que los amarra como una sola venta.

Opcional, no obligatorio: el campo puede quedar vacío. `sincronizarDeudasEnvio()` ya tiene el
fallback `(e.folio||'').trim() || (e.num||'')`.

### 4. Captura por variedad

Reemplazar la lista de lotes con checkbox por renglones de venta, uno por variedad. El modal
queda:

```
Fecha · Cliente · Folio Cliente · Flete de venta

Venta — por variedad
  Camote blanco · 1,500 kg · $18.00/kg · $27,000     [+ agregar variedad]

  De dónde sale                                        [ajustar]
    🏬 Comercializadora · entró 3-ago  · 1,000 kg
    🌾 Camote Jalisco   · entró 10-ago ·   500 kg

TOTAL VENTA $27,000 · FLETE $3,000 · TOTAL $30,000
```

Detalles:

- El menú de variedad se arma con las variedades que tengan existencia en almacén
  (`!l.cerrado && almKgDisponibles(l)>0.009`), **unificando negocios**: "Camote blanco"
  aparece una sola vez aunque esté en lotes de dos negocios distintos.
- El precio se sugiere con el `precioEst` del lote **más viejo** de esa variedad, y queda
  editable. Conserva el espíritu de lo que hace hoy `dgToggleLote()`.
- Si los kg pedidos superan los disponibles de esa variedad, no deja confirmar y dice
  cuántos hay.
- La estructura sigue el patrón de `almPartidasTemp` / `comerPartidasTemp`, que ya existen
  para la captura por variedad de la compra.

### 5. El reparto FIFO

Función nueva que, dada una variedad y una cantidad de kg, devuelve el reparto:

- Toma los lotes con existencia de esa variedad y los ordena por `fecha` ascendente
  (más viejo primero), **sin importar `loc`**. Empates de fecha se desempatan por `id`, o
  sea por orden de captura.
- Los va llenando hasta completar los kg pedidos.

El reparto se muestra siempre, con negocio, fecha de entrada y kg, y se puede editar. Si se
edita y la suma no coincide con los kg de la venta, se avisa y no deja confirmar.

De ahí en adelante `confirmarDespachoGeneral()` sigue igual que hoy: agrupa por `loc`, crea
un envío por negocio con su consecutivo (`getNextNumEnvio`/`buildNumEnvio`), reparte el flete
entre los envíos según su valor, empuja los despachos a cada lote, y llama a
`sincronizarDeudasEnvio()`. Esa parte no cambia.

### 6. Origen del envío en su detalle

En `verEnvio()` (~7746), cuando el envío traiga `esDespachoAlm`, mostrar de qué lotes salió,
derivándolo de `loteIds`:

```
Origen: Almacén
  🏬 Comercializadora · entró 3-ago · 1,000 kg · Proveedor X
  🌾 Camote Jalisco   · entró 10-ago ·  500 kg
```

Etiqueta y color del negocio por `almLocLbl()` / `almLocCls()`. El proveedor sale de
`lote.proveedor` y solo aplica a lotes com. Si un lote ya no existe, se omite ese renglón.

Esto funciona hacia atrás con los despachos ya guardados, porque `loteIds` ya se persiste
(columna `lote_ids`).

## Lo que NO se hace, y por qué

- **No se guarda `proveedor` en el envío del despacho.** Con reparto FIFO, un solo envío de
  Comercializadora puede traer camote de varias compras a proveedores distintos, así que un
  campo de un solo valor no puede guardar la respuesta. Además, `sincronizarDeudasEnvio()`
  genera la cuenta por pagar con solo ver que el envío traiga `proveedor`, y esa cuenta ya
  nació con la compra al almacén (`sincronizarCompra`): agregarlo dispararía una **segunda
  cuenta por pagar al mismo proveedor por el mismo monto**. El punto 6 resuelve la
  trazabilidad completa sin tocar esa función.
- **No se unifican los dos envíos en uno.** Cada negocio necesita su propio ingreso; un solo
  envío con `loc` ambiguo rompería los reportes por negocio.
- **No se corrigen las cuentas por cobrar históricas.** Ver "no hay migración" arriba.

## Cómo se verifica que la venta queda limpia

El objetivo declarado: si entran 1,000 kg de Comercializadora al almacén y se le venden esos
mismos 1,000 kg a un cliente, el resultado debe ser idéntico al de una operación comer normal
capturada directo, como si nunca hubiera pasado por almacén.

Ejemplo de control: 1,000 kg de camote blanco, comprados a $80/kg, vendidos a $110/kg, con
$5,000 de flete de compra y $12,000 de flete de venta.

| | Ruta directa | Ruta almacén |
|---|---|---|
| Gasto *Compra Mercancía* | $80,000 | $80,000 |
| Gasto *Fletes* (compra) | $5,000 | $5,000 |
| Por pagar al proveedor | $80,000, sin flete | $80,000, sin flete |
| Por cobrar al cliente | $122,000 | $122,000 |
| Envío en Ventas | `Comer/…`, total $122,000 | `Comer/…`, total $122,000 |
| Margen del negocio | $37,000 | $37,000 |

Verificado que ningún reporte calcula el margen leyendo las partidas del envío: `precioCompra`
solo se usa en `sincronizarDeudasEnvio()` (rama `com_pagar`, a la que el despacho no entra
por no traer `proveedor`) y dentro del propio formulario comer. Los márgenes salen de gastos
contra ingresos, y ahí las dos rutas coinciden.

La única diferencia esperada es la fecha del gasto y de la cuenta por pagar, aceptada arriba.

## Pruebas

Contra la regla del proyecto: probar en local **sin completar guardados**, porque local y
producción comparten la misma base de Supabase.

1. Venta mezclada de 1,500 kg con lotes de com y jal: verificar que el reparto FIFO proponga
   1,000/500, que salgan dos envíos con folios negocio distintos y el mismo Folio Cliente, y
   que la suma de las dos cuentas por cobrar sea la venta **más el flete completo**.
2. Venta limpia de 1,000 kg de un solo lote com: comparar contra la tabla de control de
   arriba.
3. Editar el reparto a mano hasta que no sume y confirmar que no deja guardar.
4. Pedir más kg de los que hay y confirmar que no deja guardar.
5. Operación comer capturada directo (sin almacén) con flete de venta: verificar que ahora sí
   llega a la cuenta por cobrar del cliente.
6. Abrir un despacho de almacén ya existente y verificar que el bloque "Origen" se pinta con
   sus lotes.

## Archivos

- `index.html` — único archivo de la app.
- `CLAUDE.md` — actualizar la regla del flete de venta en comercializadora, que hoy dice lo
  contrario, y documentar la captura por variedad del despacho.
