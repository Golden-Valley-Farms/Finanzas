# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

App de gestión agroindustrial de Golden Valley Farms: gastos, ventas/envíos, cosecha de frambuesa, almacén frío, cuentas por cobrar/pagar y reportes financieros. Todo en español (UI, datos, comentarios y nombres de funciones).

Es **un solo archivo**: `index.html` (~10,700 líneas). CSS en `<style>` (líneas ~14-554), markup del cuerpo (~555-1908), y toda la lógica en un `<script>` monolítico (~1909-10712).

## Desplegar y probar

No hay build, ni npm, ni tests. El repo se publica por **GitHub Pages** en <https://golden-valley-farms.github.io/Finanzas/>, servido desde `main`.

**Cada push a `main` sale en vivo.** No hay staging ni preview. Antes de pushear, abrir `index.html` local en el navegador y revisar la consola: debe aparecer `Supabase conectado ✅`. Los errores de la app se reportan por `console.error` y por `showToast()`.

Ojo: local y producción **comparten la misma base de Supabase**. Probar local no aísla los datos — cualquier cosa que guardes en la prueba se escribe en la base real.

Las tres dependencias llegan por CDN: `@supabase/supabase-js@2`, `Chart.js@4.4.1`, `html-to-image@1.11.13`.

## Persistencia dual — la regla más importante

Cada entidad se guarda **en dos lugares**: un arreglo global en memoria espejado a `localStorage`, y una tabla de Supabase. Toda mutación tiene que escribir a ambos:

```js
gastos.unshift(gasto);
save();              // -> localStorage 'cc_gastos3'
sbSaveGasto(gasto);  // -> tabla 'gastos' (no-op si sbOnline es false)
```

Si agregas un campo nuevo a una entidad, hay que tocar **cuatro** lugares o el dato se pierde en el siguiente refresh:
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

Los colores de las gráficas se resuelven por tema en runtime: `isDark()`, `dashGridColor()`, `dashTextColor()`, `rfrGridCol()`.

## Acoplamientos entre módulos

- **Envío → gastos.** `generarGastosCosechaDesdeEnvio()` crea gastos con `autoGen:true` a partir de un envío de camote, prorrateando flete/cosecha/arado/desvarada por hectáreas de cada sector. Los ids resultantes se guardan en el envío para poder actualizarlos o borrarlos al reeditar. **No editar a mano un gasto con `autoGen:true`**: se sobreescribe al guardar el envío de origen.
- **Envío → deudas.** `sincronizarDeudasEnvio()` crea/actualiza la cuenta por cobrar; `borrarDeudasDeEnvio()` la limpia.
- **Almacén → envíos.** Un despacho de lotes puede generar **varios** envíos de golpe, uno por ubicación de origen, con el flete prorrateado entre ellos.
- **Frambuesa: registros → nómina → finanzas.** `framFinanzas` guarda en `gastoIds` las referencias a los gastos que generó, para el mismo ciclo de vida que arriba.

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

## Flujo de trabajo

**Claude publica los cambios; el usuario no sube archivos a mano.** El ciclo completo de cada cambio es:

1. Editar `index.html` en este clon local.
2. Verificar el cambio (ver "Desplegar y probar").
3. `git add` + commit descriptivo.
4. `git push origin main` — GitHub Pages despliega solo.

No dejar cambios sin commitear al terminar una tarea, ni pedirle al usuario que suba el archivo por la web de GitHub.

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
