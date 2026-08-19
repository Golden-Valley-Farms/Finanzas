# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

App de gestión agroindustrial de Golden Valley Farms: gastos, ventas/envíos, cosecha de frambuesa, cosecha de maíz, almacén frío, cuentas por cobrar/pagar y reportes financieros. Todo en español (UI, datos, comentarios y nombres de funciones).

Es **un solo archivo**: `index.html` (~11,800 líneas). CSS en `<style>` (líneas ~14-554), markup del cuerpo (~555-1955), y toda la lógica en un `<script>` monolítico (~1956-11812).

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

`cc_gastos3`, `cc_envios`, `cc_alm_lotes`, `cc_fram`, `cc_fram_fin`, `cc_maiz`, `cc_intermediarios`, `cc_receptores_factura`, `cc_choferes`, `cc_deudas`, `cc_pagosdeuda`, `cc_contrapartes`, `cc_clientes`, `cc_proveedores`, `cc_proveedores_comer`, `cc_clientes_comer`, `cc_deudores`, `cc_acreedores`, `cc_bancos`, `cc_trabajadores`, `cc_cats`, `cc_presentaciones`.

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

**Catálogo único de clientes** (ago-2026). Cada cliente vive en `contrapartes` con `{nombre, tipo, clave, modo, moneda, tipoCambio}` y se busca **solo por nombre**: `getContraparte(nombre)`, `cpModo(nombre)`, `cpMoneda(nombre)`. **El mismo cliente sirve para cuentas por cobrar y por pagar**, con un solo ID, modo, moneda y tipo de cambio. La `clave` es un ID corto que asigna el usuario a mano (ej. `Clem`, `AgrLB`), único, con mayúsculas/minúsculas respetadas. Registrar deudas exige elegir un cliente del catálogo.

El `cobrar`/`pagar` **sigue existiendo, pero como dirección de cada movimiento** (`deuda.tipo`, `pago.tipo`), nunca como clasificación del cliente. Las pantallas Por cobrar / Por pagar no cambiaron.

**`contrapartes.tipo` ya no clasifica.** La tabla de Supabase está llaveada por `(nombre, tipo)`, así que la columna sigue ahí y se escribe siempre con la constante `CP_TIPO = 'cliente'`. Migración de ago-2026: se borró la ficha vacía de Clemente Duarte (era el único nombre en los dos lados, sin ID y sin movimientos) y se puso `tipo='cliente'` en las 10 restantes. Nada se huerfanó — ninguna tabla tiene FK a `contrapartes`, y las deudas/pagos enlazan por *nombre*.

Dos candados que **no hay que quitar**, porque un caché viejo de `localStorage` todavía trae fichas con `tipo:'cobrar'`/`'pagar'`:

- `sbSaveContraparte()` escribe **siempre** `CP_TIPO`, nunca `c.tipo`: con el tipo viejo crearía una segunda fila en Supabase junto a la unificada.
- `dedupContrapartes()` colapsa por nombre al leer (de localStorage y de `cargarDesdeSB`) y normaliza el tipo. Gana la ficha con ID, y entre esas la de modo `corriente` — la que alguien configuró a mano.

**`renderDeudas()` ya no siembra las pestañas desde el catálogo.** Antes agregaba las contrapartes de ese tipo aunque no tuvieran movimientos; con el catálogo unificado eso pondría los 10 clientes en **las dos** pestañas con saldo cero. Ahora una cuenta aparece cuando tiene su primer movimiento de esa dirección. Un cliente recién dado de alta se ve de inmediato en Clientes → Historial, no en las pestañas.

**"Registrar" tiene sub-pestañas: Deuda / Clientes** (`setDrSubTab()`, estado en `drSubTabSel`). En "Deuda", el selector de cliente es un `<select>` de solo elección (`dr-contraparte`, poblado por `renderDrContraparteSelect()`/`drContraparteLista()` con el catálogo completo) — ya no se puede escribir un nombre libre ni dar de alta desde ahí, y cambiar el tipo de deuda ya no vacía la selección. **Ese formulario solo registra cargos**: la caja "Movimiento" (Cargo / Abono-Pago) se quitó en ago-2026 porque su opción de abono llamaba exactamente a la misma `registrarPagoDeuda()` que el botón "Registrar pago" del modal de la cuenta, pero a ciegas —sin ver el saldo— y además tiraba el campo Factura, que los pagos no guardan. "Clientes" a su vez tiene sub-pestañas **Registro** / **Historial** (`setDrClientesTab()`, estado en `drClientesTabSel`): Registro (`registrarClienteForm()`) pide nombre e ID — crea con `modo:'fifo'`, `moneda:'MXN'` por defecto; Historial (`renderClientesHistorial()`) lista todos los clientes en orden alfabético, con modo y moneda pero **sin** etiqueta de deudor/acreedor, y botón ✏️ para editar vía `abrirEditarContraparte(nombre, 'clientes')`.

**`abrirEditarContraparte(nombre, contexto, tipoRetorno)`** es el modal único de edición, reutilizado en dos contextos: `'cuenta'` (default, desde el ⚙️ del modal de una cuenta en Por cobrar/pagar — al cerrar vuelve a esa cuenta, y `tipoRetorno` es lo único que dice a cuál) y `'clientes'` (desde el Historial — al cerrar vuelve al Historial). `_ecTipo` guarda ese retorno y se satura a `cobrar`/`pagar`, porque `deudaTabSel` puede venir en `'registrar'` y `abrirDeudaContraparte('registrar')` no pinta nada. No editar el `nombre` de un cliente: es lo que enlaza con sus `deudas`/`pagos_deuda` existentes; cambiarlo huerfanaría esos movimientos.

**Dos modos por cuenta**, guardados en `contraparte.modo`:

- `fifo` (facturas con abonos): cada cargo es una factura; `calcContraparte()` aplica los abonos de la más antigua a la más reciente. En estas cuentas `monto` ya es el neto (cargo + interés − nota de crédito); `interes`/`nc` quedan informativos y desglosados en `items`.
- `corriente` (cargos y abonos): `calcCorriente()` lleva saldo corrido = Σ(monto + interes − nc) − Σ(abonos). Puede ser negativo (a favor de la contraparte, ej. Clemente Duarte). El detalle se pinta como estado de cuenta en `renderModalCorriente()`.

`calcSaldoCuenta()` despacha por modo y es lo que usan las tarjetas (`renderDeudas`), que muestran clave, insignia USD y una sección "Historial (saldadas)" al fondo. `abrirDeudaContraparte()` es el dispatcher del modal; `abrirEditarContraparte()` (⚙️ en el título) edita clave/modo/moneda/tipo de cambio.

**Moneda.** Cuentas USD (Bioterra): movimientos y saldo en dólares (`fmtMon`/`fmtUSD`); el equivalente MXN es informativo con `contraparte.tipoCambio` editable. Los KPIs convierten USD→MXN con ese tipo de cambio.

**Regla de negocio (fletes):** el flete de **compra** NO se carga a la cuenta por pagar del proveedor (se paga aparte); `sincronizarDeudasEnvio()` no lo incluye. El flete de **venta** SÍ se le carga siempre al cliente, en los tres negocios de camote — jal, nay y com por igual.

Ojo (ago-2026): hasta este cambio, la rama `com` de `sincronizarDeudasEnvio()` excluía el flete de venta, así que el envío sumaba el flete a su total pero la cuenta por cobrar salía sin él — **toda** operación de comercializadora cobraba de menos, no solo los despachos de almacén. No hubo migración: el único caso histórico con flete de venta ya estaba capturado bien.

**Folio Negocio junto al Folio Cliente en la cuenta.** `deudaFolioNegocio(d)` busca el envío por `d.refId` y devuelve su `e.num` (vacío si no hay envío, o si ya es igual al `folioExterno`). Se pinta en las dos vistas de cuenta — `abrirDeudaContraparte()` (fifo) y `renderModalCorriente()` (corriente) — porque el modo depende de la contraparte, no del origen del movimiento. Hace falta porque un despacho que cruza negocios crea **dos** cargos con el **mismo** Folio Cliente, y sin distinguirlos se leen como una captura duplicada. Es derivado: sin campos ni columnas nuevas.

**Histórico importado.** Los movimientos migrados del Excel original tienen `ref_kind:'importado'` e ids `9000000000000xx`. La migración fue única (ago-2026); no hay código de importación de Excel en la app.

## Módulo de maíz

Agregado en ago-2026 (spec en `docs/superpowers/specs/2026-08-18-cosecha-maiz-registro-historial-design.md`). Toda su lógica vive junta en el bloque `// ==== MÓDULO MAÍZ ====` al **final del `<script>`**, no repartida por el archivo. Funciona por hoisting y es lo único que lo mantiene legible.

**Captura, consulta y reporte de cosecha.** El módulo **no genera deudas, ni gastos, ni movimientos `autoGen`, ni suma en el EDR o el resumen por negocio.** Eso es deliberado: los ingresos de maíz no entran al financiero, solo se reportan como cosecha. Tampoco hay filtros ni totales en el Historial, ni pestañas de Finanzas o Nómina.

### Reporte de cosecha (Reportes → Maíz)

`renderRepMaiz()` (línea ~3599) es el **espejo de `renderRcmCosecha()`** (camote jal/nay) con el eje de agrupación cambiado de **sector a parcela**, que es como se captura el maíz. Mismas tres tarjetas KPI y mismas seis visualizaciones: Promedio Ton/Ha, Toneladas x Parcela, Hectáreas x Parcela, Eficiencia x Parcela (dispersión), Cosecha por Variedad (pastel) e Ingreso x Parcela.

**No lleva la tabla "Ganancias x Sector"** que sí tiene camote: esa tabla resta el costo prorrateado por sector (`rcmCostoPorSector`), y el maíz no tiene gastos prorrateables por parcela. Por eso "Ingreso x Parcela" va a ancho completo (`fin-chart-full`) en vez de compartir fila.

- **Reusa `mkRcmChart()`**, no un cuarto registro de gráficas: `rcmCharts` está llaveado por id y los de aquí van con prefijo `rmz-`, así que no colisionan con los `rcm-` de camote. Al alternar entre las pestañas Camote y Maíz cada una destruye y recrea las suyas.
- **El ingreso se calcula `pesoNeto × precio`**, no se lee de un campo: las partidas de maíz no guardan `total` (a diferencia de las de envíos de camote, que sí traen `p.total`).
- **El orden y el color de las parcelas salen de `MZ_PARCELAS`**, no del orden de aparición, para que el color de cada parcela no cambie entre ciclos. Lo mismo para las variedades con `MZ_VARIEDADES`. Una parcela fuera de esa lista cae al final.
- El selector de ciclo se puebla con los ciclos presentes en **gastos de maíz y en `maizRegistros`**: un ciclo con cosecha capturada pero sin gastos también tiene que poder verse.
- Las reglas CSS del breakout a ancho completo y de `.rcm-nay-charts-grid` están compartidas entre `#rep-cam-sec` y `#rep-maiz-sec`; al tocarlas hay que respetar los dos selectores.

**Pantalla.** `#sc-maiz` replica el patrón de `#sc-fram`: `maizMainTab('cosecha')` marca la única pestaña principal (existe por simetría, para que agregar una segunda sea trivial) y `maizTab(t, forceNew)` alterna Registro / Historial, con el estado en `maizTabSel`. `goSc('maiz')` llama `maizTab(maizTabSel)`.

`maizTab('nuevo')` solo reinicia el formulario si `!mzEditId || forceNew`. Por eso `editarMaizReg()` la llama **sin** `forceNew` y pone `initMaizForm(reg)` **después**: `mzEditId` todavía es `null` en ese momento, así que `maizTab` limpia y es `initMaizForm(reg)` quien deja el estado bueno.

**Listas fijas en código**, decisión del usuario — si cambian, se edita la línea:

```js
var MZ_VARIEDADES = ['Blanco','Antylope','Waxy','Sorgo'];
var MZ_PARCELAS   = ['Cuata Grande','Cuata Chica','Mesita','Camino'];
```

**Tres catálogos por nombre, un solo camino de código.** Intermediario, Receptor Factura y Chofer son catálogos propios del módulo — no reusan `clientes`, `proveedores` ni `contrapartes`. En vez de clonar el dropdown tres veces, los tres comparten `mzRenderCatDropdown(k)` / `mzShowCatDropdown(k)` / `mzHideCatDropdown(k)` / `mzOnCatInput(k)` / `mzAbrirModalNuevoCat(k)` / `mzConfirmarNuevoCat(k)` / `mzAgregarCatSiNuevo(k, nombre)`, donde `k` es `'intermediario'` | `'receptor'` | `'chofer'`.

`MZ_CATS` guarda por clave el `inputId` y los textos (título del modal, etiqueta, toasts). El **arreglo** no se guarda ahí: las mutaciones lo reasignan (`lista.filter(...)`), así que se accede por función — `mzCatGet(k)` / `mzCatSet(k,v)` / `mzCatSave(k)` / `mzCatSbSave(k,n)` / `mzCatSbDelete(k,n)`. Agregar un cuarto catálogo es agregar una línea a `MZ_CATS`, una rama a esas cinco funciones y el par input+dropdown en el markup.

| clave | arreglo | localStorage | tabla |
|---|---|---|---|
| `intermediario` | `intermediarios` | `cc_intermediarios` | `intermediarios` |
| `receptor` | `receptoresFactura` | `cc_receptores_factura` | `receptores_factura` |
| `chofer` | `choferes` | `cc_choferes` | `choferes` |

El markup usa el id del dropdown por convención: `<inputId>-dropdown`. Los handlers van en `onmousedown` con `preventDefault()` a propósito — con `onclick`, el `onblur` del input cierra el dropdown antes de que el clic llegue a la fila.

`guardarMaiz()` da de alta los tres al guardar, así que el catálogo se llena solo con lo que el usuario captura. El intermediario es obligatorio; receptor y chofer pueden ir vacíos y entonces no se agrega nada (`mzAgregarCatSiNuevo` sale temprano con cadena vacía).

`agregarIntermediarioSiNuevo()` se conserva como alias delgado de `mzAgregarCatSiNuevo('intermediario', …)`.

**Partidas.** Estado en `mzPartidasTemp`; se puede repetir una variedad, porque la misma puede venir de dos parcelas. Los `onchange` mutan el arreglo y solo tocan los tres nodos calculados (`mzAutoCalc`) — **no** repintan la lista, la misma trampa de foco que `dgSetKg()` y `recalcFramFin()`. `toneladas` es derivado (`pesoNeto/1000`) y va `readonly`.

**Modelo de datos y mapeo.** Los tres totales (`totalKg`/`totalTon`/`total`) se guardan aunque sean derivados, igual que `envios.total_venta`, para que los reportes futuros no tengan que recorrer el `jsonb`. Se recalculan íntegros en cada guardado. Las llaves *dentro* de `partidas` quedan en camelCase (`pesoNeto`), como `facturacion` de frambuesa: es un blob que solo lee y escribe el JS.

| JS | `maiz_registros` |
|---|---|
| `fechaVal` | `fecha` |
| `receptorFactura` | `receptor_factura` |
| `totalKg` / `totalTon` | `total_kg` / `total_ton` |
| `partidas` | `partidas` (jsonb) |
| resto | mismo nombre en minúsculas |

El precio por kg se pinta con `fmtDec()` (2 decimales solo si hay centavos), no con `fmt()`: en maíz el precio por kg trae centavos y `fmt()` redondearía $6.50 a $7. Los totales grandes sí usan `fmt()`, como en toda la app.

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

### Dona de control de calidad (Frambuesa → Cosecha)

Las tres vistas —Por día, Por semana y Por ciclo— comparten `rfrDonaCalidad(kgBuenos, kgProceso, defMap)` y `rfrDonaCalidadCfg(d)`. **Un solo anillo**: primero el tramo del proceso desglosado por defecto y al final los kg buenos. El anillo completo suma el total cosechado.

**El proceso va primero a propósito.** Chart.js arranca el primer segmento a las 12 en punto, así que los defectos —lo accionable— quedan arriba y los kg buenos cierran el anillo. El anillo va **parejo, sin offset**: la separación de "kg bueno" se hace en la leyenda.

**Leyenda propia (`rfrDonaLeyendaHtml`).** La nativa de Chart.js va desactivada (`legend.display:false`) porque sigue el orden de los datos —donde el proceso va primero— y no deja apartar un item del resto. La propia va **centrada** y pone **"kg bueno" al inicio, separado del resto por un borde**, aunque en el anillo ese tramo vaya al final; `d.idxBuenos` es lo que permite sacarlo de su posición sin tocar el orden de la dona.

En Por día la dona **no lleva título ni subtítulo propios**: la tarjeta ya abre con "Control de calidad" y repetir encabezado ahí sobraba. Se inserta como hermano del contenedor del canvas en las tres vistas — en Por semana y Por ciclo el canvas va envuelto en un flex column para que la leyenda quede debajo y no al lado de las filas de defectos.

Desactivar la leyenda nativa además le devolvió espacio a la dona (el radio pasó de 83 a 115 px en Por ciclo).

- **kg buenos = `totalKg`** (cajas × `KG_POR_CAJA`, o sea 2.4) · **kg de proceso = `merma`**. Es la misma pareja de campos en los registros importados y en los nuevos, así que no hace falta ramificar por origen: los importados no traen cubetas de proceso pero sí `merma` capturada directo, y los nuevos la autocalculan como `cubetas de proceso × 1.2` en `recalcMermaProceso()`.
- **Los defectos se escalan.** Se capturan sobre una muestra chica (`r.muestra`, ej. 3.6 kg), no sobre todo el proceso, así que su proporción dentro de la muestra se aplica a los kg de proceso reales. Sin ese escalado el anillo no sumaría el total y los dos tramos no serían comparables.
- Si hay proceso pero **ningún defecto capturado**, el tramo va entero como "Proceso" en `RFR_COL_PROCESO_SD`. Si no hay merma, solo se pinta "Buenos".
- Colores (`DEF_COLS_RFR`, definidos por el usuario): sobremadura morado `#7E57C2`, deforme rosa apagado `#C97B93`, irregular amarillo pollo `#E8D06A`, desgrane frambuesa `#ea3155`, hongos gris `#888780`; y `RFR_COL_BUENOS` es verde `#1baf7a`, con etiqueta `RFR_LBL_BUENOS` = "kg bueno". Esa constante alimenta tanto la dona como los puntitos de las filas de defectos, así que cambiarla actualiza los dos a la vez.
- El tramo de "kg bueno" va **sin borde** (`borderWidth:0` y `borderColor:'transparent'` solo en `d.idxBuenos`); los defectos llevan borde blanco de 2px (`RFR_COL_BORDE_DEF`), que es lo que los separa entre sí cuando son rebanadas delgadas y contiguas.
- La tarjeta **no lleva subtítulo** bajo "Control de calidad" en ninguna de las tres vistas.
- El porcentaje de proceso de la dona **coincide por construcción con la tarjeta de Merma** de esa misma vista (ambos son `merma / (totalKg + merma)`). Si algún día dejan de cuadrar, uno de los dos cambió de fórmula.

Las filas de texto al lado (`defRows`) muestran **el mismo porcentaje que la dona**: el de cada concepto sobre el total cosechado, vía `rfrPctPorDefecto(dona)` y `dona.pctBuenos`. No muestran los kg de la muestra. Por eso en las tres vistas la dona **se calcula antes que `defRows`** — si se mueve después, los porcentajes salen en cero.

La lista abre con **"kg bueno"** —separado de los defectos por un `margin-bottom`— y sigue con los defectos. Cada cifra va teñida del color de lo que representa (`RFR_COL_BUENOS` / `DEF_COLS_RFR[k]`), sin `text-shadow`. Las tres vistas comparten `rfrFilaCalidadComp()` y el mismo layout: un flex row con los porcentajes a la izquierda y la dona (canvas de 240px) + su leyenda a la derecha.

**Estos porcentajes van sin decimales**, a diferencia de la tarjeta de Merma y del resto de gráficas, que sí llevan uno. Son cinco cifras juntas y los decimales estorban. Al redondear a entero la suma puede quedar en 99% o 101%; es esperado.

**Por día** tiene más alto de tarjeta que contenido. Su fila va en `align-items:stretch` para repartir el sobrante: la columna de porcentajes lleva `justify-content:center` y la de la dona un `padding-top` fijo de 28px. Ese padding fijo —en vez de centrar— es lo que permite bajar la leyenda (con su propio `padding-top`) **sin mover el dibujo**: con `justify-content:center` cualquier margen extra en la leyenda empuja la dona hacia arriba. El canvas mantiene los 240px de las otras dos vistas. Dos cosas que rompen esa igualdad si se reintroducen: `flex:1` en el canvas (la dona crece a radio 145) y `margin-top:auto` en la leyenda (se despega a 47px).

Dos sumas cruzadas útiles para detectar regresiones: **el total de las filas debe dar 100%**, y los defectos solos deben sumar el porcentaje de la tarjeta de Merma de esa vista (en el ciclo 2025-2026, 3.9+2.1+1.5+0.9 = 8.4%).

**Insignia de variación en las filas (solo Por día y Por semana).** Cada fila lleva flechas contra el periodo anterior, con el mismo criterio de magnitud que las tarjetas (1 flecha ≤25%, 2 ≤50%, 3 arriba). El sentido se invierte según el concepto: en **"kg bueno" subir es verde** (`altoBueno=true`) y en los **defectos subir es rojo**. Por ciclo no las lleva: no hay "ciclo anterior" en el selector.

La lógica común vive en `rfrWowCalc()`, y hay dos renderizadores: `rfrWowBadge()` para las tarjetas (usa `.kpi-wow`, que es `position:absolute` y solo funciona dentro de una `.kpi-card`) y `rfrWowInline()` para estas filas, en flujo normal. Los porcentajes del periodo anterior salen de `pctCalidad`, que devuelven `rfrComputeDiaMetrics()` y `rfrComputeSemMetrics()` vía `rfrPctCalidad()`.

Ojo al leerlas: comparan **porcentajes, no kilos**. Un defecto que pasa de 1% a 2% marca ▲▲▲100% aunque sean dos puntos porcentuales — es el mismo criterio relativo de las tarjetas.

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

### Cero significa "sin capturar" en cuatro tarjetas de Por semana

`costoCubetaGeneral`, `costoCubetaCosechadores`, `precioCajaSem` y `totalFacturadoSem` se pasan a **`null` cuando dan 0**, para que la tarjeta pinte `—` en vez de `$0.00`. No existe una semana con cosecha y nómina de $0, ni una caja facturada a $0: un cero ahí siempre es que el dato no se ha capturado todavía.

La causa está en el origen — `nominaFramSemana()` suma gastos y devuelve `0` (no `null`) cuando no hay ninguno, y `framFinanzas` puede tener el registro de la semana creado pero sin facturación. No se cambió esa función porque la usan otros cálculos que sí esperan un número; el `>0` se aplica en el consumidor.

Hay que mantenerlo en **los dos lugares**: `rfrComputeSemMetrics()` (alimenta las insignias de variación) y `renderRfrSemDetalle()` (pinta). Si solo se corrige el segundo, la tarjeta muestra `—` pero la insignia sigue calculando un "▼100%" contra un cero falso.

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
- **Envío → deudas.** `sincronizarDeudasEnvio()` crea/actualiza las deudas del envío (cobrar en camote jal/nay; cobrar + pagar en comercializadora, esta última sin flete de compra); `borrarDeudasDeEnvio()` las limpia. Si el cliente/proveedor no existe en el catálogo de contrapartes, se crea solo con modo `fifo` y clave vacía. La cuenta por cobrar lleva el flete de venta en los tres negocios (ver "Regla de negocio (fletes)").
- **Almacén → envíos.** Un despacho de lotes puede generar **varios** envíos de golpe, uno por negocio de origen, con el flete prorrateado entre ellos.

  El campo del lote se sigue llamando `loc` en los datos, pero en la UI la etiqueta es **Negocio** y acepta tres valores: `jal`, `nay` y `com` (Comercializadora, agregada en ago-2026). **`ALM_LOC_LBL` es la fuente única**: de ahí salen la etiqueta con emoji (`almLocLbl()`), la clase CSS del chip y del color de kg (`almLocCls()`) y los chips del reparto del despacho (`dgRepartoHtml()`). Agregar un negocio al almacén es agregar una línea a ese objeto — antes la etiqueta se resolvía con un ternario `loc==='nay'?Nayarit:Jalisco` repetido en tres lugares, que rotulaba como Jalisco cualquier valor nuevo.

  Comercializadora no tiene sectores propios: `SECTORES` no trae `com_camote`, así que `buildAlmSectorSelect()` deja solo "— Sin sector —". La numeración de sus envíos ya funcionaba (`PREFIJOS.com='Comer'`).

  **El formulario del lote tiene dos formas distintas según el negocio** (ago-2026), y `onAlmLocChange()` es el interruptor. El modelo mental del usuario: *el almacén es una compra/venta de comercializadora partida en dos* — la compra entra al almacén ahora, la venta ocurre después al despachar. Por eso la captura de com clona la pantalla de operación comer (`comer-form-sec`) **menos todo lo de la venta**: no hay cliente, ni precio de venta, ni flete de venta (eso se captura hasta el despacho).

  - **com** → `#af-com-fields`: encabezado (negocio, fecha, ciclo, **proveedor**) + "Compra — por variedad" + flete de compra + resumen. El proveedor vive en `#af-proveedor-field`, que ocupa en el encabezado el hueco donde jal/nay ponen `#af-variedad-field`.
  - **jal/nay** → `#af-simple-fields`: la captura de siempre, un lote de una variedad con kg, precio estimado, hectáreas y sector.

  Los campos de cosecha propia se limpian al cambiar a com, y `guardarCompraAlm()` fuerza `hectareas:0`/`sector:''`. Hacen falta las dos cosas: `editarLote()` asigna valores *después* de `onAlmLocChange()`, así que sin el candado un lote viejo los reguardaría solo.

  El resumen (`#af-resumen`) **reusa los colores exactos** de la operación comer: TOTAL COMPRA en `--fram-bg`, VALOR ESTIMADO en `--green-bg`, MARGEN ESTIMADO en `--surface2`. Las dos primeras solo aparecen en com; en jal/nay queda únicamente VALOR ESTIMADO a ancho completo (`grid-column:span 2`).

  **Una compra = varios lotes.** Cada variedad de `almPartidasTemp` se guarda como su **propio lote** (para poder despacharla por separado), pero todas comparten `compraId`. Ese campo es lo que amarra la compra: los gastos y la cuenta por pagar son **de la compra, no del lote**. Columnas nuevas en `alm_lotes`: `compra_id`, `kg_pagar`, `desc_pct`.

  - `kgTotal` = kg recibidos (lo que físicamente entra al almacén); `kgPagar` = kg recibidos − % de descuento (lo que se le paga al proveedor). **El costo se calcula con `kgPagar`, no con `kgTotal`.**
  - El flete de compra se **prorratea por kg** entre los lotes de la compra, así sumarlos de vuelta da el total y ninguno lo cuenta entero.
  - `loteCompraId(l)` devuelve `l.compraId || l.id`: los lotes creados antes de este cambio no tienen `compraId` y su deuda quedó con `refId = lote.id`, así que el fallback los mantiene funcionando.
  - `almNuevoId(ocupados)` evita que dos lotes creados en el mismo milisegundo compartan `Date.now()` como id.

  **Editar un lote com abre la compra completa**, no ese lote suelto (`editarLote()` carga todos sus hermanos por `compraId` y el título dice "Editar compra"). Es obligatorio: recalcular el gasto y la cuenta por pagar viendo una sola variedad los dejaría incompletos. Quitar una variedad que ya tiene despachos está bloqueado — la mercancía ya salió del almacén.

  **El despacho se captura por variedad, no por lote** (ago-2026, spec en `docs/superpowers/specs/2026-08-14-despacho-almacen-por-variedad-design.md`). El usuario escribe lo que *vendió* — variedad, kg, precio — y la app resuelve de qué lotes sale. Estado en `dgVentas` (`[{variedad, kg, precio, reparto:[{loteId,kg}], manual}]`).

  El reparto es **FIFO puro**: `dgLotesDeVariedad()` ordena por `fecha` ascendente **sin importar el negocio** (empates por `id`, o sea por orden de captura) y `dgRepartoFifo()` va llenando hasta completar los kg. Es lo correcto con producto en frío: sale primero lo que lleva más tiempo guardado. El reparto se pinta siempre y es editable; tocarlo pone `manual:true` y aparece un botón "↺ automático" para volver al FIFO.

  `dgVariedadesDisp()` **unifica negocios**: una variedad que está en un lote de com y en otro de jal aparece una sola vez, con la suma de sus kg. Esa unificación es el punto del cambio — el usuario piensa "vendí 1,500 kg de blanco", no "500 de este lote y 1,000 del otro".

  **Dos renglones de la misma variedad están bloqueados**: cada uno repartiría sobre los mismos lotes y se descontarían kg de más.

  El precio se sugiere con el `precioEst` del lote más viejo (`dgPrecioSugerido()`), que es el primero que va a salir, y queda editable. El precio es **por variedad**, uno solo para toda la venta aunque salga de varios lotes.

  **`dgSetKg()` repinta solo el bloque del reparto** (`renderDgReparto`), no la línea completa, y `dgSetRepartoKg()` solo el aviso: repintar todo en cada tecla le quitaría el foco al input que se está escribiendo. Mismo motivo por el que el precio se muta inline con `dgVentas[i].precio=this.value;recalcDespachoGeneral()`, como ya hacía el formulario comer.

  **El despacho captura Folio Cliente** (`dg-folio`) y lo escribe **igual en todos** los envíos que genere. Es lo único que amarra como una sola venta a los dos envíos que salen cuando el reparto cruza negocios.

- **Almacén: lote com = compra de comercializadora** (ago-2026, spec en `docs/superpowers/specs/2026-08-11-compra-almacen-comercializadora-design.md`). El lote lleva campos extra — `proveedor`, `precioCompra`, `fleteCompra`, `gastoIds`, más `compraId`/`kgPagar`/`descPct` — visibles solo cuando el Negocio es `com` (`onAlmLocChange()` muestra/oculta `#af-com-fields`; en jal/nay se ignoran al guardar). Persistencia dual cableada en los cuatro lugares (columnas `proveedor`/`precio_compra`/`flete_compra`/`gasto_ids`/`compra_id`/`kg_pagar`/`desc_pct` en `alm_lotes`).

  `sincronizarCompra(compraId, soloLimpiar, idsHuerfanos)` — espejo de `sincronizarDeudasEnvio` — trabaja **por compra, no por lote**: genera UN gasto "Compra Mercancia" (Σ `kgPagar` × `precioCompra` de todas sus variedades), UN gasto "Fletes" (Σ del flete prorrateado) y UNA **cuenta por pagar** al proveedor (`refKind:'alm_compra_pagar'`, `refId: compraId`, con un item por variedad) que lleva SOLO la mercancía — el flete de compra nunca va a la cuenta del proveedor. Limpia y recrea en cada guardado. Va **antes** de `sbSaveAlmLote()` porque muta `gastoIds`, y escribe el **mismo arreglo de ids en todos los lotes** de la compra, para que cualquiera de ellos alcance a limpiarla completa. No editar a mano esos gastos `autoGen`: se regeneran al guardar la compra.

  **`idsHuerfanos` no es opcional cuando se borra un lote.** La función junta los `gastoIds` recorriendo los lotes vivos de la compra; si se borra el **último**, no queda de dónde sacarlos y sus gastos sobrevivirían para siempre (la deuda sí se limpia, va por `refId`). Por eso `confirmDelLote()` captura `loteDel.gastoIds` *antes* de quitarlo y los pasa. Ese bug existió y se corrigió al detectarlo probando.

  **Todo despacho de almacén genera la cuenta por cobrar del cliente** vía `sincronizarDeudasEnvio(envioObj)`, **con el flete de venta en los tres negocios**. Los envíos de lotes com llevan `esComer:true` (se clasifican como operación comer en Ventas/reportes) y **sin** `proveedor` — la por pagar nació con el lote. Borrar el envío limpia su cobrar (`delEnvio` → `borrarDeudasDeEnvio`, ya existía).

  **No agregarle `proveedor` al envío de un despacho**, por dos razones: con reparto FIFO un envío puede traer camote de varias compras a proveedores distintos, así que un campo de un solo valor mentiría; y `sincronizarDeudasEnvio()` dispara la cuenta por pagar con solo ver que el envío traiga `proveedor`, así que crearía una **segunda** por pagar por el mismo monto. El origen se **deriva** de `loteIds` en `envioOrigenHtml()`, que lo pinta en el detalle del envío (negocio, fecha de entrada, kg y proveedor si es com). `partidas[k]` corresponde a `loteIds[k]` — `confirmarDespachoGeneral()` los arma juntos.

  **La venta por almacén queda idéntica a una operación comer directa.** Verificado con 1,000 kg a $80 de compra y $110 de venta: mismos gastos (Compra Mercancía $80,000 + Fletes $5,000), misma por pagar ($80,000 sin flete de compra), misma por cobrar ($122,000 con flete de venta), mismo folio `Comer/…` y mismo margen. La única diferencia es que el gasto y la por pagar llevan la **fecha de entrada al almacén**, no la de la venta — es lo correcto (se debe desde que se recibió), pero si la entrada y la venta caen en ciclos distintos, gasto e ingreso se reportan en periodos distintos.
- **Frambuesa: registros → nómina → finanzas.** `framFinanzas` guarda en `gastoIds` las referencias a los gastos que generó, para el mismo ciclo de vida que arriba.

- **Frambuesa: facturación con varios precios por caja** (ago-2026, spec en `docs/superpowers/specs/2026-08-17-facturacion-multiples-precios-frambuesa-design.md`). El paso "2. Facturación" del Registro de Finanzas captura N renglones en vez de un solo par de campos. El registro guarda `facturacion:[{cajas,precio}]` (columna `facturacion` jsonb en `fram_finanzas`) y **`cajas`/`precio` pasaron a ser derivados**: `cajas` = Σ cajas y `precio` = **promedio ponderado, guardado sin redondear**.

  Esa elección es lo que mantiene funcionando, sin tocarlas, las ocho pantallas que calculan el facturado como `(f.cajas||0)*(f.precio||0)`: dashboard financiero, ingresos por mes/ciclo, `rfrComputeSemMetrics()`, tarjeta de Por semana, `rfrRefsHistoricas()`, tarjetas y gráfica de Por ciclo, resumen por negocio/EDR e historial. Suma donde se suma, ponderado donde se pondera. **No redondear `precio` al guardar**: con 206.67 en vez de 206.66666…, `1500 × precio` daría 310,005 en lugar de 310,000 y el total facturado se desviaría en las ocho a la vez.

  El formulario captura en `ffFactTemp`, con `renderFramFactRows()` / `agregarFramFactRow()` / `removeFramFactRow()` y el helper `ffFactTotales()`. Siempre queda al menos un renglón y la `×` solo aparece del segundo en adelante; el sub-resumen con total de cajas y ponderado solo se pinta con dos o más. Los `oninput` mutan `ffFactTemp` y llaman `recalcFramFin()`, que **no repinta la lista** — repintar por tecla le quitaría el foco al input, la misma trampa que `dgSetKg()`.

  Los registros anteriores no traen `facturacion`: `initFramFinForm()` los siembra desde `cajas`/`precio`. **No quitar ese fallback**, o la caja de Facturación abriría vacía para todo lo ya capturado y guardar lo borraría. En el Historial, un registro con dos o más renglones pinta una etiqueta por precio; con uno o ninguno conserva las etiquetas de siempre.

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

Tablas: `gastos`, `envios`, `alm_lotes`, `fram_registros`, `fram_finanzas`, `maiz_registros`, `intermediarios`, `receptores_factura`, `choferes`, `deudas`, `pagos_deuda`, `contrapartes`, `clientes`, `proveedores`, `proveedores_comer`, `clientes_comer`, `deudores`, `acreedores`, `bancos`, `trabajadores`, `categorias`.

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
