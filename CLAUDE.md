# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

App de gestión agroindustrial de Golden Valley Farms: gastos, ventas/envíos, cosecha de frambuesa, almacén frío, cuentas por cobrar/pagar y reportes financieros. Todo en español (UI, datos, comentarios y nombres de funciones).

Es **un solo archivo**: `index.html` (~10,700 líneas). CSS en `<style>` (líneas ~14-554), markup del cuerpo (~555-1908), y toda la lógica en un `<script>` monolítico (~1909-10712).

## Desplegar y probar

No hay build, ni npm, ni tests. El repo se publica por **GitHub Pages** en <https://golden-valley-farms.github.io/Finanzas/>, servido desde `main`.

**Cada push a `main` sale en vivo.** No hay staging ni preview. Antes de pushear, abrir `index.html` local en el navegador y revisar la consola: debe aparecer `Supabase conectado ✅`. Los errores de la app se reportan por `console.error` y por `showToast()`.

Ojo: local y producción **comparten la misma base de Supabase**. Probar local no aísla los datos — cualquier cosa que guardes en la prueba se escribe en la base real. Por eso, al verificar desde el navegador, mirar y calcular está bien, pero **no completar guardados de prueba**: si hace falta probar un flujo de alta o edición, armar el objeto en memoria y quitarlo al terminar, sin llamar a `save*()` ni a `sbSave*()`.

Hay un `.claude/launch.json` con la configuración `gvf-local`, que sirve `index.html` por `python -m http.server 8777`. Es solo andamio de pruebas — no forma parte de la app y GitHub Pages lo ignora. Existe porque el navegador integrado no abre rutas `file://`, así que sin servidor no hay forma de revisar la consola ni el render.

Las tres dependencias llegan por CDN: `@supabase/supabase-js@2`, `Chart.js@4.4.1`, `html-to-image@1.11.13`.

## Supabase es la fuente de verdad — localStorage no es respaldo

**Regla dura: nada puede vivir solo en `localStorage`.** Todo campo de toda entidad tiene que estar respaldado en Supabase. Si el usuario después borra o edita registros en Supabase, es su decisión — lo que no se vale es que un dato quede flotando donde nadie lo respalda.

`localStorage` es **caché de arranque**, no almacenamiento. Se pierde al cambiar de equipo, de navegador o al limpiar datos del sitio. Y algo más traicionero: **`cargarDesdeSB()` sobrescribe las claves `cc_*` con lo que viene de Supabase**, así que cualquier campo que no viaje a Supabase se borra solo en la siguiente recarga — no hace falta ni cambiar de equipo.

Antes de dar por terminado un cambio que agrega o modifica un campo, verificar el **viaje redondo**: guardar → recargar desde Supabase → el campo sigue ahí. Si no sobrevive, falta la columna o falta el mapeo.

Este problema ya mordió una vez (ago-2026): la tabla `envios` no guardaba `gastoCosechaIds` ni `gastosCosechaTotales`. Al recargar, el envío perdía el vínculo con sus gastos de cosecha, así que reeditarlo **creaba gastos duplicados** en vez de actualizarlos, y los montos de cosecha desaparecían del formulario. Se corrigió agregando `total_venta`, `gastos_cosecha_totales`, `gasto_cosecha_ids`, `es_despacho_alm` y `lote_ids`. Auditadas todas las demás entidades: lotes, frambuesa (registros y finanzas), deudas, pagos y contrapartes ya persistían todo.

## Persistencia dual — la regla más importante

Cada entidad se guarda **en dos lugares**: un arreglo global en memoria espejado a `localStorage`, y una tabla de Supabase. Toda mutación tiene que escribir a ambos:

```js
gastos.unshift(gasto);
save();              // -> localStorage 'cc_gastos3'
sbSaveGasto(gasto);  // -> tabla 'gastos' (no-op si sbOnline es false)
```

Si agregas un campo nuevo a una entidad, hay que tocar **cuatro** lugares o el dato se pierde en el siguiente refresh (ver la regla de arriba: no basta con guardarlo en el arreglo en memoria):
1. el objeto que se construye al guardar
2. el `sbSaveX()` correspondiente (mapeo a snake_case)
3. el `.map()` de esa tabla dentro de `cargarDesdeSB()` (mapeo de vuelta a camelCase)
4. la columna en la tabla de Supabase

Los `sbSaveX`/`sbDeleteX` salen temprano si `!sbOnline || !sb`, así que la app funciona offline contra localStorage y simplemente no propaga.

### Convención de nombres entre capas

JS usa camelCase, Supabase usa snake_case: `fechaVal`↔`fecha`, `tipoCamote`↔`actividad`, `kgTotal`↔`kg_total`, `nominaCosechadores`↔`nomina_cosechadores`, `desc`↔`descripcion`. El mapeo se hace a mano en cada par `sbSaveX` / `cargarDesdeSB`.

`cargarDesdeSB()` lee de forma **tolerante**: acepta tanto el esquema nuevo (`negocio`/`actividad`/`fecha`/`categoria`) como el viejo (`loc`/`cultivo`/`fecha_val`/`cat`/`tipo_camote`). No romper ese fallback — hay datos históricos con el esquema viejo.

`fetchAllRows()` pagina de 1000 en 1000; usarla siempre en vez de un `.select()` pelón para tablas que crecen.

### Claves de localStorage

`cc_gastos3`, `cc_envios`, `cc_alm_lotes`, `cc_fram`, `cc_fram_fin`, `cc_deudas`, `cc_pagosdeuda`, `cc_contrapartes`, `cc_clientes`, `cc_proveedores`, `cc_proveedores_comer`, `cc_clientes_comer`, `cc_deudores`, `cc_acreedores`, `cc_bancos`, `cc_trabajadores`, `cc_cats`, `cc_presentaciones`.

## Modelo de negocios (`NEGOCIOS`)

Seis unidades de negocio, cada una definida por un par `(loc, cultivo)`. Esta indirección es la fuente de casi toda la confusión en el código:

| key | loc | cultivo | etiqueta en Supabase |
|---|---|---|---|
| `cam_jal` | jal | camote | Camote Jalisco |
| `cam_nay` | nay | camote | Camote Nayarit |
| `fram` | jal | fram | Frambuesa |
| `ofic` | ofic | ofic | Oficina |
| `com` | com | com | Comercializadora |
| `maiz` | maiz | maiz | Maíz |

- Un gasto **no guarda** su `negocio`; se deriva con `negKeyFromGasto(g)` a partir de `loc`+`cultivo`.
- Supabase **sí** guarda la etiqueta legible; el viaje redondo es `NEG_LABEL` (escribir) / `NEG_FROM_LABEL` + `NEG_LOCCULT` (leer).
- Solo camote tiene el eje extra `tipoCamote` (`'general'` | `'cosecha'`), que en Supabase se llama `actividad` (`'General'` | `'Cosecha'`).
- Ojo: `RSM_NEGOCIOS` (reportes) usa **otras** llaves (`camjal`, `camnay`) que no coinciden con `NEGOCIOS`.

## Ciclos agrícolas

El ciclo va del **1 de julio al 30 de junio** y se nombra por el año en que arranca: del 1-jul-2025 al 30-jun-2026 es el ciclo `2025-2026`. `CICLOS = ['2024-2025','2025-2026','2026-2027']`; si el negocio llega al 2027-2028 hay que agregarlo a mano a ese arreglo.

**El ciclo lo elige el usuario a mano, no lo calcula el código.** `registrar()` guarda tal cual lo que esté en el select `#f-ciclo`. Esto es intencional y se mantiene así por ahora.

Reglas que se derivan de eso:

- **Nunca recalcular ni sobrescribir `g.ciclo` a partir de la fecha.** Los registros conservan el ciclo con el que se guardaron, aunque no cuadre con lo que la fecha sugeriría. Un gasto de julio puede pertenecer legítimamente al ciclo anterior si así se capturó.
- `cicloFromFecha()` es solo un **fallback de lectura** para registros sin ciclo guardado, y el default que se propone en los formularios. No es la autoridad.
- No agregar migraciones ni "correcciones" masivas de ciclo. Si un registro se ve mal clasificado, se corrige a mano desde la UI.

Conceptualmente, **Oficina** es el único negocio cuyo ciclo corresponde limpio al calendario jul-jun (sus gastos no dependen de siembra ni cosecha), así que ahí la fecha sí lo determinaría bien. Pero en la práctica también se captura a mano, y **no existe ninguna rama de código que trate a `ofic` distinto al registrar**. Si algún día se automatiza, sería solo para ese negocio.

### Inconsistencia a tener presente

No todos los filtros tratan igual a un registro con ciclo vacío:

- **Estricto**, sin fallback (`g.ciclo===filtro`): Historial (`renderHis`), envíos, registros y finanzas de frambuesa. Un registro sin ciclo **no aparece** en ningún filtro que no sea `'todos'`.
- **Con fallback** (`g.ciclo || cicloFromFecha(g.fechaVal)`): reportes, EDR, resumen por negocio. Ahí el mismo registro **sí** aparece, clasificado por su fecha.

O sea: un registro sin ciclo puede estar invisible en Historial y a la vez sumando en el EDR. Al tocar filtros, revisar cuál de los dos estilos usa esa pantalla y no cambiarlo sin avisar.

### `finUsaCiclo()` está desactivado

`finUsaCiclo(neg)` (línea ~6548) es un stub que **siempre devuelve `false`**, así que el dashboard financiero agrupa por año calendario para todos los negocios, nunca por ciclo. Es el interruptor para volver a activar el agrupamiento por ciclo cuando se decida. No es un bug.

## Categorías

`CATS_DEFAULT` son solo semillas de fábrica. **La tabla `categorias` de Supabase manda**: si trae filas, sobreescribe `CATS`; si viene vacía, se siembra con los defaults. `catListaActual()` elige qué lista aplica según el negocio y `tipoCamote` seleccionados en el formulario.

Los colores de categoría (`catColor()`) buscan en `CAT_COLORS` por nombre normalizado (`normCat()` quita acentos y baja a minúsculas); si no existe, deriva un color estable hasheando el nombre contra `CAT_PALETTE`.

## Módulo de deudas

Rediseñado en ago-2026 (spec en `docs/superpowers/specs/2026-08-07-modulo-deudas-design.md`).

**Catálogo de contrapartes obligatorio.** Cada contraparte vive en `contrapartes` con `{nombre, tipo, clave, modo, moneda, tipoCambio}`. La `clave` es un ID corto que asigna el usuario a mano (ej. `Clem`, `AgrLB`), único, con mayúsculas/minúsculas respetadas. Registrar deudas o abonos exige elegir una contraparte del catálogo (`getContraparte()` valida).

**"Registrar" tiene sub-pestañas: Deuda / Clientes** (`setDrSubTab()`, estado en `drSubTabSel`). En "Deuda", el selector de contraparte es un `<select>` de solo elección (`dr-contraparte`, poblado por `renderDrContraparteSelect()`/`drContraparteLista()` según el tipo cobrar/pagar) — ya no se puede escribir un nombre libre ni dar de alta desde ahí. "Clientes" a su vez tiene sub-pestañas **Registro** / **Historial** (`setDrClientesTab()`, estado en `drClientesTabSel`): Registro (`registrarClienteForm()`) solo pide nombre, ID y tipo — crea con `modo:'fifo'`, `moneda:'MXN'` por defecto; Historial (`renderClientesHistorial()`) lista todas las contrapartes con botón ✏️ para editar clave/modo/moneda/tipo de cambio vía `abrirEditarContraparte(tipo, nombre, 'clientes')`.

**`abrirEditarContraparte(tipo, nombre, contexto)`** es el modal único de edición, reutilizado en dos contextos: `'cuenta'` (default, desde el ⚙️ del modal de una cuenta en Por cobrar/pagar — al cerrar vuelve a esa cuenta) y `'clientes'` (desde el Historial — al cerrar vuelve al Historial). No editar el `tipo` ni el `nombre` de una contraparte: son la clave compuesta que enlaza con sus `deudas`/`pagos_deuda` existentes; cambiarlos huerfanaría esos movimientos.

**Dos modos por cuenta**, guardados en `contraparte.modo`:

- `fifo` (facturas con abonos): cada cargo es una factura; `calcContraparte()` aplica los abonos de la más antigua a la más reciente. En estas cuentas `monto` ya es el neto (cargo + interés − nota de crédito); `interes`/`nc` quedan informativos y desglosados en `items`.
- `corriente` (cargos y abonos): `calcCorriente()` lleva saldo corrido = Σ(monto + interes − nc) − Σ(abonos). Puede ser negativo (a favor de la contraparte, ej. Clemente Duarte). El detalle se pinta como estado de cuenta en `renderModalCorriente()`.

`calcSaldoCuenta()` despacha por modo y es lo que usan las tarjetas (`renderDeudas`), que muestran clave, insignia USD y una sección "Historial (saldadas)" al fondo. `abrirDeudaContraparte()` es el dispatcher del modal; `abrirEditarContraparte()` (⚙️ en el título) edita clave/modo/moneda/tipo de cambio.

**Moneda.** Cuentas USD (Bioterra): movimientos y saldo en dólares (`fmtMon`/`fmtUSD`); el equivalente MXN es informativo con `contraparte.tipoCambio` editable. Los KPIs convierten USD→MXN con ese tipo de cambio.

**Regla de negocio (fletes):** el flete de compra NO se carga a la cuenta por pagar del proveedor (se paga aparte); `sincronizarDeudasEnvio()` ya no lo incluye. Solo el flete de venta de camote jal/nay va a la cuenta por cobrar del cliente.

**Histórico importado.** Los movimientos migrados del Excel original tienen `ref_kind:'importado'` e ids `9000000000000xx`. La migración fue única (ago-2026); no hay código de importación de Excel en la app.

## Navegación

`goSc(nombre)` es el router: alterna la clase `.active` entre los divs `sc-resultados`, `sc-reg`, `sc-his`, `sc-rep`, `sc-ven`, `sc-fram`, `sc-maiz`, `sc-deudas`, ajusta la barra inferior y dispara el render de esa pantalla. Las variables `lastFinSc` y `lastCosSc` recuerdan en qué sub-pestaña se quedó cada grupo.

## Convenciones del código

- **ES5 puro**: `var`, `function`, callbacks. Nada de `let`/`const`/arrow/clases/módulos. Mantener el estilo.
- **Sin framework**: el render es concatenación de strings a `innerHTML`, con `onclick="funcion(...)"` inline en el markup generado. Por eso **toda función invocada desde HTML debe ser global de nivel superior** — si la metes dentro de un IIFE o de otra función, el onclick truena en runtime sin error de sintaxis.
- **Estilos inline** por todos lados, apoyados en variables CSS (`var(--green)`, `var(--fram)`, `var(--surface2)`, `var(--mono)`, `var(--radius)`). Usar las variables, no hex crudo.
- **Confirmación de borrado en dos toques**: el botón se marca `dataset.confirm='1'`, cambia de texto, y se revierte solo a los ~2.5 s. Ver `confirmDelLote()` como modelo.
- **Modal único**: un solo `#overlay` + `#mo-title` + `#mo-body` reutilizado por toda la app; se llena con `innerHTML` y se abre con `.classList.add('open')`.

## Chart.js

Tres registros separados de instancias — `finCharts`, `rfrCharts`, `rcmCharts` — con sus helpers `mkFinChart()`, `mkRfrChart()`, `mkRcmChart()`. **Siempre crear gráficas por esos helpers**: destruyen la instancia previa del mismo id antes de crear la nueva. Instanciar `new Chart()` directo deja canvas huérfanos que fugan memoria y provocan tooltips fantasma.

`mkRfrChart()` además fuerza un `resize()` en el siguiente frame porque el contenedor a veces todavía no tiene altura definitiva cuando Chart.js mide.

Para gráficas anchas con scroll horizontal existe el patrón de "eje congelado" (`mkFinFrozenAxisLineChart`, `mkFrozenAxisLineChart`): se dibuja un segundo canvas fijo con solo el eje Y mientras el principal hace scroll.

Los colores de las gráficas se resuelven por tema en runtime: `isDark()`, `dashGridColor()`, `dashTextColor()`, `rfrGridCol()`, `rfrLabelInk()`.

### Semáforo de las gráficas de línea en Frambuesa → Cosecha → Por ciclo

Las 7 gráficas de línea de `renderRfrResumen()` usan **línea neutra + punto de color**: la línea va en `RFR_LINEA_NEUTRA` y el color de cada punto lo da `rfrPuntoCols(datos, cortes, altoBueno)` según el estado de esa semana (`RFR_SEM_COLS`: bien / vigilar / preocupa / problema / sin dato).

La etiqueta de valor toma el color de su propio punto: los plugins leen `ds.pointBackgroundColor[i]` y lo pasan por `rfrTintaPunto()`, que en tema oscuro devuelve el color tal cual y en tema claro lo cambia por el paso oscuro del mismo tono (`RFR_SEM_COLS_TXT`) — los tonos saturados del semáforo no alcanzan contraste como texto sobre fondo blanco, el amarillo queda casi invisible. `rfrLabelInk()` queda solo como respaldo para etiquetas sin punto asociado.

**Cada serie se compara contra su propia métrica**, nunca contra la de otra serie — si no, una semana con más kg puede acabar peor pintada que una con menos (ese bug existió: la línea de Kg cosechados se pintaba con el semáforo de merma).

Hay dos orígenes de cortes:

- **Metas reales del negocio** (fijas, definidas por el usuario): tres constantes al inicio del bloque del semáforo — `RFR_CORTES_MERMA=[3,7,10]`, `RFR_CORTES_COSTO_COSECH=[15,18,20]` y `RFR_CORTES_PRECIO_CAJA=[220,200,180]`. **Son parámetros de negocio: no tocarlos salvo que el usuario dé nuevos números.** Cada una la comparten tarjeta y gráfica, así que están declaradas una sola vez y nunca en duro en la llamada del dataset.

| métrica | verde | amarillo | naranja | rojo | helper |
|---|---|---|---|---|---|
| % de merma | `<=3` | `(3,7)` | `[7,10)` | `>=10` | `rfrColMerma()` / `rfrColsMerma()` |
| Costo/cubeta cosechadores | `<=15` | `(15,18)` | `[18,20)` | `>=20` | `rfrColCostoCosech()` / `rfrColsCostoCosech()` |
| Precio por caja | `>=220` | `[200,220)` | `[180,200)` | `<180` | `rfrPuntoCol(v, RFR_CORTES_PRECIO_CAJA, true)` |

La merma aplica en las **tres** vistas (Por día, Por semana y Por ciclo); las otras dos en Por semana y Por ciclo.

La tarjeta de Merma lleva el mismo trato en las tres vistas: valor a un decimal (`pctKgMerma` se redondea con `*1000)/10` y se pinta con `.toFixed(1)`) y color por `rfrColMerma()`. Se pasó a un decimal porque con entero un 6.6% se mostraba como "7%" y salía rojo cuando le tocaba naranja. Ojo: las tres vistas tienen su **propia** variable `pctKgMerma` en funciones distintas — al tocar una hay que tocar las tres.

**Merma y costo/cubeta cosechadores no usan `rfrPuntoCol()`**, tienen helper propio. `rfrPuntoCol` corta con `<=` en las tres bandas, y estas dos se pidieron con el primer límite **inclusivo** y los otros dos **exclusivos** (verde `<=3`, pero el 7 y el 10 caen en la banda de arriba). No cambiar el operador de `rfrPuntoCol` para arreglar esto: lo comparten todas las demás series y movería también los límites de precio por caja.

Precio por caja sí pasa por `rfrPuntoCol` con `altoBueno=true`, que corta con `>=` y da exactamente los límites pedidos.
- **Mediana histórica** (`rfrRefsHistoricas()` + `rfrCortesDesde(ref, altoBueno)`) para las demás, porque no hay meta definida. `rfrRefsHistoricas()` agrega por semana **todo** `framRegistros` (todos los ciclos, no solo el filtrado) y saca la mediana. Se usa mediana y no promedio porque la temporada alta lo jala mucho hacia arriba (677 kg contra 470 de mediana) y dejaría casi todo en rojo. `rfrCortesDesde` abre las bandas en proporción: `[ref, ref×0.6, ref×0.35]` cuando más alto es mejor, `[ref, ref×1.5, ref×2.5]` cuando más alto es peor.

| Gráfica | referencia | sentido |
|---|---|---|
| % de merma | **meta `RFR_CORTES_MERMA` vía `rfrColMerma()`** | más alto es peor |
| Kg cosechados | mediana `refs.kg` | más alto es mejor |
| Kg de proceso | mediana `refs.proceso` | más alto es peor |
| Cajas por semana | mediana `refs.cajas` | más alto es mejor |
| Costo/cubeta general | mediana `refs.costoGen` | más alto es peor |
| Costo/cubeta cosechadores | **meta `RFR_CORTES_COSTO_COSECH`** | más alto es peor |
| Precio por caja | **meta `RFR_CORTES_PRECIO_CAJA`** | más alto es mejor |
| Total facturado | mediana `refs.facturado` | más alto es mejor |

La gráfica de Kg conserva el color propio de sus dos líneas (es lo que las distingue en su leyenda del markup) y cada una lleva su propio semáforo. "Por día" y "Por semana" no llevan semáforo: siguen con color sólido por serie.

**Las 7 gráficas de línea pasan por `mkFrozenAxisLineChart()`, que fija `layout.padding.right` en 40px.** Ese margen no es estético: la etiqueta de valor se dibuja centrada sobre su punto, y con el área de trazo pegada al borde derecho la del último punto salía cortada a la mitad. Si algún día se alargan las etiquetas (más decimales, un prefijo), hay que subir ese número.

### Semáforo de las tarjetas KPI del mismo resumen

Las tarjetas de `renderRfrResumen()` usan **el mismo `rfrPuntoCol()` y los mismos cortes que su gráfica equivalente**, para que tarjeta y gráfica de una métrica nunca se contradigan. El color tiñe la cifra y la franja de acento de la tarjeta.

Por eso `var refs=rfrRefsHistoricas()` se calcula **antes** de armar `cont.innerHTML` (antes estaba después, junto a las gráficas). Los colores se calculan justo antes del markup, ya que dependen de los ponderados (`costoGeneralPonderado`, `precioCajaPonderado`, etc.) que se arman más arriba en la función.

`rfrRefsHistoricas()` devuelve además `cajasDia` (mediana de cajas por día, agregando por `fecha`) y `costoCosech` (mediana semanal de nómina de cosechadores / cubetas), que no existían cuando solo la usaban las gráficas.

**Meta de cajas: 8,000 por conjunto de sectores**, o sea 16,000 el total del ciclo. La tarjeta de Total cajas lleva tres barras de avance — total contra 16,000, y una por cada conjunto (sectores 1-2 y 3-4) contra 8,000 — cada una con su propio color. Los cortes de meta van al 100/75/50% (`cortesMeta()`), no por `rfrCortesDesde`.

Esa tarjeta se **reparte en dos columnas solo en escritorio**: `.rfr-cajas-row` es `display:block` por defecto (móvil apila total arriba y sectores abajo, que es como se quiere ver ahí) y pasa a `flex` dentro del `@media (min-width:700px)`, con el total a la izquierda (`.rfr-cajas-total`, 34%) y el `.kpi-split` de los dos conjuntos a la derecha separado por un borde. Al tocar el markup hay que respetar que `.rfr-cajas-total` y `.kpi-split` sean **hermanos directos** de `.rfr-cajas-row`.

| Tarjeta | cortes | sentido |
|---|---|---|
| Total cajas | meta **16,000** al 100/75/50% | más alto es mejor |
| Sectores 1 y 2 / 3 y 4 | meta **8,000** cada uno | más alto es mejor |
| Prom. cajas/día | mediana `refs.cajasDia` | más alto es mejor |
| Prom. cajas/semana | mediana `refs.cajas` | más alto es mejor |
| Merma | **meta `RFR_CORTES_MERMA` vía `rfrColMerma()`** | más alto es peor |
| Promedio costo/cubeta general | derivado de la meta de cosechadores (ver abajo) | más alto es peor |
| Promedio costo/cubeta cosechadores | **meta `RFR_CORTES_COSTO_COSECH`** | más alto es peor |
| Promedio precio/caja | **meta `RFR_CORTES_PRECIO_CAJA`** | más alto es mejor |
| Promedio facturado | mediana `refs.facturado` | más alto es mejor |

**Costo/cubeta general no tiene meta propia**, y es la misma métrica que la de cosechadores más el resto de la nómina. Su meta se **convierte** desde los $15 de cosechadores: `razon = refs.costoGen / refs.costoCosech` (≈1.84 hoy) y `metaCostoGen = 15 × razon` (≈$27.64), con bandas `[meta, meta×20/15, meta×2]`. Ojo: esas proporciones vienen de los cortes viejos `[15,20,30]` de cosechadores y **ya no coinciden** con los `[15,18,20]` actuales; se dejaron así a propósito porque el general no tiene meta pedida y reapretar sus bandas lo pintaría casi siempre en rojo. Si algún día se define una meta real para el general, sustituir toda esa conversión por el número duro.

Ojo: la tarjeta antes llamada "Promedio costo/caja" ahora se llama **"Promedio precio/caja"** — es un precio de venta, no un costo, y por eso más alto es mejor.

**No es bug que la tarjeta de Merma y su gráfica muestren números muy distintos.** La tarjeta es el ponderado de todo el ciclo (`totalMerma / (totalKgCosechados + totalMerma)`), mientras la gráfica es semana por semana. En el ciclo 2025-2026 la tarjeta da 7.2% y las últimas semanas de la gráfica dan 24-28%: esas semanas traen mucha merma sobre un volumen chico, y el grueso de los 21,238 kg del ciclo viene de semanas anteriores con merma baja. La fórmula es la misma en ambos lados, cambia el alcance.

`refs.mermaPct` quedó sin uso al pasar la merma a meta fija; se conserva en `rfrRefsHistoricas()` por si vuelve a ocuparse.

### Mismo semáforo en Por día y Por semana, más variación contra el periodo anterior

**Por día** (`renderRfrDiaDetalle`) y **Por semana** (`renderRfrSemDetalle`) llevan el mismo semáforo que Por ciclo, contra la mediana histórica del **mismo nivel** (día compara con día, semana con semana) — nunca contra la mediana semanal usada por Por ciclo, que es una escala distinta. `rfrRefsHistoricas()` por eso trae, además de lo semanal: `cubetas` (mediana semanal de cubetas, para "Cubetas cosechadas" en Por semana), y a nivel día `cubetasDia`, `kgDia`, `mermaKgDia` (para las 4 tarjetas de Por día que no tienen equivalente semanal que usar). Costo/cubeta general usa el mismo truco de conversión que Por ciclo, factorizado en `rfrMetaCostoGen(refs)` / `rfrColCostoGen(valor, refs)` para que las tres vistas no se desincronicen si cambia la meta de cosechadores.

**Por semana y Por día llevan una insignia de variación contra el periodo anterior**, estilo precio de acción: flechas + % en la esquina superior derecha de la tarjeta (`.kpi-wow`, generado por `rfrWowBadge(actual, anterior, altoBueno)`) — las 8 tarjetas de Por semana (contra la semana anterior) y las 5 de Por día (contra el registro anterior). Verde/rojo nada más, sin banda intermedia — sube+altoBueno o baja+¬altoBueno es verde, lo contrario es rojo.

El **número de flechas marca la magnitud**: 1 hasta 25%, 2 hasta 50%, 3 arriba de 50%. El conteo va contra el porcentaje **ya redondeado**, el mismo que se imprime; si se usa el crudo, un 25.4% se muestra como "25%" pero sale con dos flechas y se lee como error.

Las flechas se apilan en **vertical y encimadas, con forma de pino** (así se pidieron): cada una es un `<i>` dentro de `.kpi-wow-fls`, que es un `inline-flex` en columna con `line-height:.4`. El traslape lo produce ese `line-height` menor que 1 — la caja de línea queda más baja que el glifo, así que cada triángulo se monta sobre el anterior. Es relativo al `font-size`, por eso **una sola regla sirve para móvil y escritorio**; no hace falta override en el `@media`. Valores probados: arriba de ~.5 los triángulos se separan y dejan de leerse como un solo símbolo; abajo de ~.35 se funden y ya no se pueden contar.

Cada vista tiene su par de helpers, con la misma forma: `rfrSemAnteriorKey(sk)`/`rfrComputeSemMetrics(sk)` y `rfrDiaAnteriorKey(fecha)`/`rfrComputeDiaMetrics(fecha)`. Los dos `…AnteriorKey` sacan el periodo previo de las opciones **ya pobladas** del `<select>` (mismo ciclo/negocio que se está viendo, y es el mismo al que llevaría el botón "◀") — no de `framRegistros` crudo, que ignoraría el filtro. Si no hay periodo anterior (o a esa métrica le falta dato, ej. `precioCaja` sin captura en Finanzas), `rfrWowBadge` regresa `''` y no se pinta nada — no inventa una variación con dato faltante.

Ojo con el orden en el markup: la insignia tiene que ir **antes** del `.kpi-lbl` porque la regla `.kpi-wow~.kpi-lbl{padding-right:…}` (la que evita que un título largo se meta debajo de la insignia) usa el combinador de hermano posterior.

**Trampa en la que ya se cayó una vez:** los colores/insignias de Por semana se calculan usando `precioCajaSem`/`totalFacturadoSem`/`costoCubetaGeneral`/etc., variables `var` que la función declara **más abajo**, junto al `finRegSem`. Por hoisting no truena, pero si el bloque de colores se pone *antes* de esa declaración quedan todas `undefined` y el semáforo sale "sin dato" aunque sí haya cifra en pantalla (pasó con "Precio por caja": mostraba $77.16 pero en gris). El bloque de colores/insignias de Por semana tiene que ir **después** de que `finRegSem`/`precioCajaSem`/`totalFacturadoSem` ya estén asignados.

## Acoplamientos entre módulos

- **Envío → gastos.** `generarGastosCosechaDesdeEnvio()` crea gastos con `autoGen:true` a partir de un envío de camote, prorrateando flete/cosecha/arado/desvarada por hectáreas de cada sector. Los ids resultantes se guardan en el envío para poder actualizarlos o borrarlos al reeditar. **No editar a mano un gasto con `autoGen:true`**: se sobreescribe al guardar el envío de origen.
- **Envío → deudas.** `sincronizarDeudasEnvio()` crea/actualiza las deudas del envío (cobrar en camote jal/nay; cobrar + pagar en comercializadora, esta última sin flete de compra); `borrarDeudasDeEnvio()` las limpia. Si el cliente/proveedor no existe en el catálogo de contrapartes, se crea solo con modo `fifo` y clave vacía.
- **Almacén → envíos.** Un despacho de lotes puede generar **varios** envíos de golpe, uno por negocio de origen, con el flete prorrateado entre ellos.

  El campo del lote se sigue llamando `loc` en los datos, pero en la UI la etiqueta es **Negocio** y acepta tres valores: `jal`, `nay` y `com` (Comercializadora, agregada en ago-2026). **`ALM_LOC_LBL` es la fuente única**: de ahí salen la etiqueta con emoji (`almLocLbl()`), la clase CSS del chip y del color de kg (`almLocCls()`) y los grupos del modal de despacho (`renderDgLotesList()`). Agregar un negocio al almacén es agregar una línea a ese objeto — antes la etiqueta se resolvía con un ternario `loc==='nay'?Nayarit:Jalisco` repetido en tres lugares, que rotulaba como Jalisco cualquier valor nuevo, y la lista del despacho tenía los grupos en duro, así que los lotes del negocio faltante quedaban **invisibles para despachar** aunque estuvieran en almacén.

  Comercializadora no tiene sectores propios: `SECTORES` no trae `com_camote`, así que `buildAlmSectorSelect()` deja solo "— Sin sector —". La numeración de sus envíos ya funcionaba (`PREFIJOS.com='Comer'`).

  **El formulario del lote cambia de forma según el negocio** (ago-2026). Está partido en secciones con `step-label` + `card`, igual que la pantalla de operación de Comercializadora (`comer-form-sec`), para que las dos se vean como la misma app: Encabezado → Compra (solo com) → Entrada al almacén → Resumen.

  `onAlmLocChange()` es el interruptor: muestra `#af-com-fields` (proveedor, precio y flete de compra) y **oculta `#af-cosecha-fields`** (hectáreas y sector) cuando el negocio es `com`, porque ahí la mercancía se compra, no se cosecha. Al ocultarlos **también los limpia**, y `guardarLote()` además fuerza `hectareas:0`/`sector:''` cuando `esCom` — las dos cosas hacen falta: `editarLote()` asigna hectáreas *después* de llamar a `onAlmLocChange()`, así que un lote com viejo con hectáreas guardadas las deja en el input oculto y sin ese candado se reguardarían solas.

  Ojo al restaurar `#af-cosecha-fields`: `.field-row` es `display:grid`, no `flex`. Devolverlo como `flex` apila los campos en una sola columna en jal/nay.

  El resumen (`#af-resumen`) imita al de la operación comer y **reusa sus mismos colores**: TOTAL COMPRA en `--fram-bg`, VALOR ESTIMADO en `--green-bg` y MARGEN ESTIMADO en `--surface2`. Las dos primeras tarjetas solo aparecen en com; en jal/nay queda únicamente VALOR ESTIMADO a ancho completo (`grid-column:span 2`), que es como se veía antes.

- **Almacén: lote com = compra de comercializadora** (ago-2026, spec en `docs/superpowers/specs/2026-08-11-compra-almacen-comercializadora-design.md`). El lote lleva 4 campos extra — `proveedor`, `precioCompra`, `fleteCompra`, `gastoIds` — visibles solo cuando el Negocio es `com` (`onAlmLocChange()` muestra/oculta `#af-com-fields`; en jal/nay se ignoran al guardar). Persistencia dual ya cableada en los cuatro lugares (columnas `proveedor`/`precio_compra`/`flete_compra`/`gasto_ids` en `alm_lotes`).

  `sincronizarCompraLote(lote, soloLimpiar)` — espejo de `sincronizarDeudasEnvio` — genera al guardar el lote: gasto "Compra Mercancia" (kg × precio compra), gasto "Fletes" (si hay), ambos `autoGen` con ids en `lote.gastoIds`, y la **cuenta por pagar** al proveedor (`refKind:'alm_compra_pagar'`, `refId: lote.id`) con SOLO la mercancía — el flete de compra nunca va a la cuenta del proveedor. Limpia y recrea en cada guardado; con `soloLimpiar=true` la usa `confirmDelLote()`. En `guardarLote()` va **antes** de `sbSaveAlmLote()` porque muta `gastoIds`. No editar a mano los gastos `autoGen` del lote: se regeneran al guardarlo.

  **Todo despacho de almacén genera la cuenta por cobrar del cliente** vía `sincronizarDeudasEnvio(envioObj)` (jal/nay con flete de venta; com sin flete). Los envíos de lotes com llevan `esComer:true` (se clasifican como operación comer en Ventas/reportes) y **sin** `proveedor` — la por pagar nació con el lote. Borrar el envío limpia su cobrar (`delEnvio` → `borrarDeudasDeEnvio`, ya existía).
- **Frambuesa: registros → nómina → finanzas.** `framFinanzas` guarda en `gastoIds` las referencias a los gastos que generó, para el mismo ciclo de vida que arriba.

- **Envíos cancelados** (ago-2026, spec en `docs/superpowers/specs/2026-08-11-envios-cancelados-design.md`). El envío lleva `cancelado` / `motivoCancelacion` / `fechaCancelacion` (persistencia dual completa). Un envío cancelado **no se borra**: conserva sus dos folios y, sobre todo, **mantiene el consecutivo reservado** — `getNextNumEnvio()` saca el siguiente número escaneando los envíos existentes, así que borrarlo haría que otro envío heredara ese folio.

  **`envioTotal(e)` devuelve `0` si `e.cancelado`.** Ese `return` temprano es el único punto de corte: los ocho lugares donde se suman ventas (reportes, EDR, resumen por negocio, ingresos por mes/ciclo) pasan todos por ahí, así que no hay que filtrar cancelados pantalla por pantalla. Si algún día se suma `e.total` directo en vez de `envioTotal(e)`, ese lugar contará los cancelados.

  `abrirCancelarEnvio()` / `confirmarCancelarEnvio()` / `reactivarEnvio()`. Al cancelar: las **deudas siempre se borran** (nadie cobra ni paga un envío cancelado, no se pregunta), y de los gastos `autoGen` se elige uno por uno cuáles borrar — hay casos reales donde el flete de compra sí se pagó aunque la venta se cancelara. Los gastos conservados **pierden `autoGen`** para que una reedición del envío no los regenere encima. **Cancelar no toca el almacén**: la ruta real es almacén → venta → cancelación, o sea que la mercancía ya salió y los kg siguen descontados del lote.

  **`gastosAutoGenDeEnvio(e)` no depende solo de `e.gastoCosechaIds`.** Ese campo ya se persiste (columna `gasto_cosecha_ids`, ago-2026), pero los envíos guardados antes de esa migración no lo traen, así que la función lo usa como fuente adicional y además identifica por criterios propios: `desc` exacto en comercializadora y en el flete único (el `num` los hace únicos), y en jal/nay `desc` + `fechaVal` + `proveedor`/cliente, porque ahí el `desc` (`'Cosecha Camote Jalisco Sector 1'`) se repite entre envíos. Mantener las dos vías: la heurística cubre el histórico.

## Trampas conocidas (no son bugs a "arreglar" sin avisar)

Hay **definiciones duplicadas**; por hoisting gana siempre la última:

- `fmt()` en 2369 y **8465** — gana la de 8465 (`parseFloat(n)||0`, tolera basura; la primera hace `Number(n)` y da `$NaN`).
- `updateClientesDatalist()` en 8014 y **8294** — gana la de 8294, que **está vacía**. Las llamadas a esa función no hacen nada. Si necesitas ese comportamiento, el código real está en 8014.
- `VARIEDADES` en 6809 y 8073 — mismo contenido, inofensivo por ahora, pero editar solo uno no surte efecto.

Antes de modificar cualquier función, `grep` por `function nombre(` para confirmar que no exista otra definición más abajo.

## Supabase

URL y clave publicable están en duro al inicio del script (líneas ~1911-1912). La clave es *publishable*, no secreta — la seguridad real depende de las políticas RLS del proyecto, no de ocultarla. El repo es público, así que ese archivo es visible para cualquiera: **RLS es la única defensa real de los datos.**

Tablas: `gastos`, `envios`, `alm_lotes`, `fram_registros`, `fram_finanzas`, `deudas`, `pagos_deuda`, `contrapartes`, `clientes`, `proveedores`, `proveedores_comer`, `clientes_comer`, `deudores`, `acreedores`, `bancos`, `trabajadores`, `categorias`.

Si una tabla regresa vacía teniendo datos, casi siempre es RLS — el código ya avisa esto por consola para `fram_registros`.

**Ojo (ago-2026): el advisor de Supabase reporta RLS DESACTIVADO en 12 tablas** (gastos, envios, deudas, pagos_deuda, contrapartes, etc.). Mientras no se active RLS con autenticación, cualquiera con la clave publishable puede leer y escribir esos datos. Hay una tarea pendiente para agregar login + políticas RLS.

## Flujo de trabajo

**Claude publica los cambios; el usuario no sube archivos a mano.** El ciclo completo de cada cambio es:

1. Editar `index.html` en este clon local.
2. Verificar el cambio (ver "Desplegar y probar").
3. `git add` + commit descriptivo.
4. **`git push origin main` automáticamente** — GitHub Pages despliega solo.

No dejar cambios sin commitear, y **siempre hacer push a GitHub al finalizar** (no dejar commits en local). Cada tarea termina cuando está en `main` remoto y desplegado en vivo.

### Recomendar el modelo antes de empezar

El usuario tiene **plan mensual**: no paga por token, pero sí consume cuota, y no quiere gastar cuota de un modelo pesado en tareas simples. Claude **no puede cambiar el modelo de la sesión** — eso lo hace el usuario en el selector de la app.

Por eso: **al inicio de cada tarea, antes de tocar código, decir en una línea qué nivel de modelo conviene.** Si es más bajo que el actual, el usuario decide si baja antes de que arranque el trabajo. Nada de recomendar a media tarea.

| Nivel | Cuándo | Ejemplos en esta app |
|---|---|---|
| **Haiku 4.5** | Cambio localizado, sin lógica: texto, color, emoji, agregar un elemento a un arreglo existente | Renombrar una categoría, sumar una variedad a `VARIEDADES`, corregir una etiqueta, ajustar un `var(--color)` |
| **Sonnet 5** | Cambio autocontenido en una función o pantalla, siguiendo un patrón que ya existe | Agregar un campo a un formulario que ya guarda bien, un filtro más en Historial, una columna a una tabla, reestilizar una tarjeta |
| **Opus 5** | Cualquier cosa que cruce módulos o toque invariantes | La regla de los cuatro lugares (persistencia dual), acoplamientos envío→gastos/deudas, almacén→envíos, frambuesa→nómina→finanzas, lógica de ciclos, gráficas de Chart.js, o cualquier cambio que exija leer partes grandes del archivo para no romper algo |

Ante la duda entre dos niveles, recomendar el más alto: repetir el trabajo por un modelo corto gasta más cuota que haberlo hecho bien la primera vez.

### Cuidar el consumo de contexto

`index.html` pesa 624 KB. **Leerlo completo son ~150-200 mil tokens** — más que decenas de tareas normales juntas, en cualquier modelo. Es el mayor consumidor de cuota del proyecto, muy por encima del nivel del modelo.

- **Nunca leer el archivo entero.** Ubicar con `grep` y leer solo la ventana de líneas relevante.
- **Editar quirúrgicamente**, no reescribir bloques grandes.
- **No lanzar subagentes aquí.** Arrancan en frío y tienen que releer el archivo para entender el contexto: se paga la lectura otra vez a cambio de un modelo más barato. Es falsa economía salvo que el usuario lo pida.

### Mantener este archivo al día

**Después de cualquier cambio importante al código, actualizar `CLAUDE.md` en el mismo commit.** "Importante" significa cualquier cosa que vuelva obsoleto algo escrito aquí:

- Se agrega, quita o renombra un negocio, ciclo, categoría o pantalla.
- Cambia el esquema de una tabla de Supabase, o se agrega/quita una tabla o clave de localStorage.
- Cambia una convención (helpers de Chart.js, patrón de render, manejo de ciclos).
- Se resuelve una de las "trampas conocidas" — hay que borrarla de esa lista.
- Se agrega un acoplamiento nuevo entre módulos.
- Se mueven mucho las líneas: los números de línea citados aquí dejan de servir.

Un arreglo puntual que no altere nada de lo documentado no requiere tocar este archivo.

## Git

Todo el proyecto es un archivo de 10,700 líneas, así que un diff que mezcla varios cambios es ilegible. Hacer **commits chicos y descriptivos**, uno por cambio lógico.

`main` es producción y sale en vivo al instante. Pushear solo cuando el cambio esté probado.

`core.autocrlf=true` en este equipo: el archivo en disco usa CRLF y git lo normaliza a LF al commitear. Es transparente — si `git status` marca `index.html` como modificado sin que hayas tocado nada, es señal de otra cosa, no de finales de línea.
