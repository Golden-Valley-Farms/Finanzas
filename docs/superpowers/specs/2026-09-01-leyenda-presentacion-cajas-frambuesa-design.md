# Leyenda de presentación (6 oz / 12 oz) en la tarjeta Total cajas

Fecha: 2026-09-01

## Contexto

En Reportes → Frambuesa → Cosecha, las vistas **Por día** y **Por semana** tienen una
tarjeta KPI "Total cajas" que muestra solo el número total. Cada partida de cajas de un
registro guarda `presentacion` (`'6 oz'` o `'12 oz'`, catálogo `PRESENTACIONES_CAJA`).
El usuario quiere ver, a modo de leyenda en esa tarjeta, cuántas cajas fueron de cada
presentación.

`rfrSemanaAcum()` ya acumula `s.c6oz` / `s.c12oz` (nunca se mostraban). Por día no lo
calcula todavía.

## Cambios

### 1. `renderRfrDiaDetalle()` (~línea 5042)

- Junto a `secMapDia`, acumular desde `r.cajas`: `c6ozDia`, `c12ozDia` y
  `cOtrasDia` (todo lo que no sea `'6 oz'` ni `'12 oz'`).

### 2. Tarjeta "Total cajas" de Por día (~línea 5056)

- Bajo el `.kpi-val`, agregar un `<div class="kpi-sub">` con:
  `6 oz · <n>` · `12 oz · <n>` y, **solo si `cOtrasDia > 0`**, ` · otras · <n>`.
- Números con `toLocaleString('es-MX')`.

### 3. Tarjeta "Total cajas" de Por semana (~línea 5503)

- Misma línea `.kpi-sub`, leyendo `s.c6oz` / `s.c12oz`. El bucket "otras" se deriva
  como `s.cajas - s.c6oz - s.c12oz` y solo se pinta si es `> 0`.

## Fuera de alcance

- El número grande, su color de semáforo y la insignia de variación no cambian.
- Por ciclo y Por cosecha no llevan esta leyenda (el usuario pidió solo Por día y
  Por semana).
- Sin cambios de esquema ni de persistencia.

## Nota

Rompe la regla "sin leyendas por iniciativa propia" de `CLAUDE.md` — pero es a
pedido explícito del usuario, que es la excepción que la propia regla contempla.
