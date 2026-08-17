# Facturación con varios precios por caja — Frambuesa → Finanzas → Registro

**Fecha:** 17-ago-2026
**Pantalla:** Cosecha → Frambuesa → Finanzas → Registro (`#fram-fin-sec`), paso "2. Facturación"

## Problema

El paso de Facturación captura un solo par **Cajas facturadas / Precio por caja**. Esta semana el cliente pagó las cajas en dos montos con precios distintos, y el formulario no lo puede representar: hay que promediar a mano y se pierde el desglose.

Es la primera vez que ocurre, así que no hay registros históricos con varios precios que rescatar.

## Objetivo

Poder capturar **N renglones de facturación**, cada uno con sus cajas y su precio, con un botón **+** como el de Cosecha → Registro → Cajas y el de Nómina cosechadores.

Efecto pedido sobre los reportes:

- **Total facturado** → suma de todos los renglones.
- **Precio por caja** → **promedio ponderado** por cajas.

## Modelo de datos

El registro de `framFinanzas` gana un arreglo y sus dos campos actuales pasan a ser **derivados**:

```js
reg.facturacion = [{cajas:1000, precio:220}, {cajas:500, precio:180}];
reg.cajas  = 1500;                 // Σ cajas
reg.precio = 206.66666666666666;   // Σ(cajas×precio) / Σcajas — SIN redondear
```

Es el mismo patrón que ya usa la nómina de cosechadores (`nominaCosechadores` total + `nominaCosechadoresDetalle` arreglo).

### Por qué no se toca ninguna gráfica

Con el ponderado guardado sin redondear, `cajas × precio` reconstruye exactamente `Σ(cajasᵢ × precioᵢ)`. Los **ocho** lugares del archivo que hoy calculan `(f.cajas||0)*(f.precio||0)` siguen dando el número correcto sin cambiar una línea:

| Línea aprox. | Qué calcula |
|---|---|
| 3650 | Ingresos del dashboard financiero de frambuesa |
| 3803 | Ingresos por mes/ciclo |
| 4233 | `rfrComputeSemMetrics()` → total facturado de la semana (insignias de variación) |
| 4333 | Tarjeta KPI "Total facturado" de Por semana |
| 4725 | `rfrRefsHistoricas()` → mediana de facturado |
| 4882 / 4890 | Tarjetas de Por ciclo (ponderado) y gráfica de Total facturado |
| 5494 | Resumen por negocio / EDR |
| 10194 | Historial de Finanzas |

Suma donde se suma, ponderado donde se pondera. El semáforo de "Precio por caja" (`RFR_CORTES_PRECIO_CAJA = [220,200,180]`) y las insignias `.kpi-wow` operan igual, sobre el ponderado.

**Precisión.** Reconstruir el total como `cajas × precio` con el ponderado en flotante puede diferir del original en los últimos bits. Verificado con el caso real (1,000 × $220 + 500 × $180): `1500 × 206.66666666666666` da **exactamente** 310,000, sin desviación. Aun cuando la hubiera, todo se imprime redondeado a 2 decimales — `toLocaleString` o `Math.round(x*100)/100` — así que un error del orden de 1e-9 nunca sería visible. Se descartó la alternativa de guardar el total y cambiar los 8 sitios a un helper: es exacta por construcción pero mucho más riesgosa para lo que gana.

Lo que **sí** importa es no redondear `precio` al guardarlo: con el ponderado truncado a 2 decimales, `1500 × 206.67` daría 310,005 y el total facturado se desviaría en las ocho pantallas a la vez.

### Registros anteriores

No traen `facturacion`. Al editarlos, `initFramFinForm()` siembra `ffFactTemp = [{cajas: editF.cajas, precio: editF.precio}]` desde los escalares. Sin esa siembra, la caja de Facturación abriría vacía para todo lo ya capturado y guardar lo borraría.

No hay migración de datos ni recálculo masivo.

## Formulario

`ffFactTemp` es el arreglo temporal de la captura, espejo de `cajasTemp` / `nominaTemp`.

Caja "2. Facturación":

- Encabezado de columnas: **CAJAS · PRECIO POR CAJA · (hueco de 28px para la ×)**, con el mismo estilo que las otras dos pantallas (`font-size:11px`, `--text3`, mayúsculas).
- Lista de renglones en `#ff-fact-list`, pintada por `renderFramFactRows()`.
- Arranca con **un renglón editable**: capturar un solo precio se siente idéntico a hoy, sin clics extra.
- La **×** solo aparece del segundo renglón en adelante; nunca se puede quedar en cero renglones.
- Debajo de la lista, botón redondo **+** de 28px en `var(--fram)`, igual al de `agregarFramNominaRow()`. Agrega un renglón vacío y le da foco a su campo de cajas.
- Cuando hay 2 o más renglones, aparece dentro de la caja un sub-resumen con **Total cajas** y **Precio promedio ponderado**, para que se vea el número que van a recibir las gráficas. Con un solo renglón no se pinta.

Los inputs mutan `ffFactTemp[i]` inline y llaman `recalcFramFin()`, que **solo actualiza los totales, no repinta la lista** — repintar en cada tecla le quitaría el foco al input, la misma trampa que ya documenta `dgSetKg()` en el despacho de almacén.

`recalcFramFin()` deja de leer `#ff-cajas` / `#ff-precio` (que desaparecen) y suma sobre `ffFactTemp`.

## Persistencia dual — los cuatro lugares

1. **`guardarRegistroFinanzasFram()`** — arma `reg.facturacion` con los renglones que tengan cajas > 0 o precio > 0, y de ahí calcula `reg.cajas` (suma) y `reg.precio` (ponderado; `0` si no hay cajas).
2. **`sbSaveFramFinanza()`** — agrega `facturacion: f.facturacion||[]`.
3. **`cargarDesdeSB()`**, el `.map()` de `fram_finanzas` (~línea 2166) — agrega `facturacion: f.facturacion||[]`.
4. **Supabase** — columna nueva en `fram_finanzas`:

```sql
alter table fram_finanzas add column if not exists facturacion jsonb not null default '[]'::jsonb;
```

Cambio aditivo sobre la base de producción (local y producción comparten Supabase). No toca datos existentes. Se aplica con confirmación del usuario.

**Verificación obligatoria del viaje redondo:** guardar un registro con dos precios → recargar desde Supabase → los dos renglones siguen ahí al editarlo.

## Historial de Finanzas

`renderFramFinHist()` decide por número de renglones:

- **Dos o más** → una etiqueta por renglón, más la de facturado total:

  ```
  📦 1,000 cajas · $220.00    📦 500 cajas · $180.00    Facturado $310,000.00
  ```

- **Uno o ninguno** (todo lo capturado hasta hoy) → exactamente las etiquetas de siempre: `📦 1,500 cajas`, `$220.00/caja`, `Facturado $330,000.00`.

## Fuera de alcance

- Recalcular o migrar registros anteriores.
- Tocar el semáforo, los cortes de meta o las insignias de variación.
- Meter el desglose de precios a la nómina, a los descuentos o a los gastos `autoGen` que genera esta pantalla.

## Verificación

1. Abrir `index.html` local por `gvf-local` y confirmar `Supabase conectado ✅` en consola.
2. Capturar con un solo precio: la caja se comporta como antes, el resumen da `cajas × precio`.
3. Agregar un segundo renglón con **+**: el sub-resumen muestra el total de cajas y el ponderado.
4. Quitar el segundo con **×**: vuelve al estado de un renglón, sin ×.
5. Guardar, recargar y reeditar: los dos renglones sobreviven (viaje redondo).
6. Por semana y Por ciclo: la tarjeta de Precio por caja muestra el ponderado y Total facturado la suma; los colores del semáforo corresponden a esos valores.
