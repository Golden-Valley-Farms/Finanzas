# Metas de cajas en Reportes → Frambuesa → Cosecha

Fecha: 2026-09-01

## Contexto

En Reportes → Frambuesa → Cosecha hay dos vistas que reusan `renderRfrResumen()`:

- **Por ciclo**: muestra la tarjeta "Total cajas" con tres barras de avance contra
  meta — total y un par de sectores cada una (1-2 y 3-4).
- **Por cosecha**: hasta ahora pasaba `sinMetaCajas:true`, que ocultaba esas barras
  porque las metas del ciclo completo no aplican a media cosecha.

El usuario define metas nuevas:

- **Por ciclo**: meta por par de sectores = **9,000** (antes 8,000); total = **18,000**
  (antes 16,000).
- **Por cosecha**: cada cosecha (1 y 2) tiene meta por par de sectores = **4,500**;
  total por cosecha = **9,000**.

## Cambios

### 1. `renderRfrResumen()` (~línea 5988)

- `META_CAJAS_GRUPO`: `8000` → `9000`. `META_CAJAS_TOTAL` sigue derivándose como
  `META_CAJAS_GRUPO*2`, así que pasa a 18,000 sin tocar nada más.
- Nueva opción `opts.metaCajasGrupo`: si viene, `META_CAJAS_GRUPO = opts.metaCajasGrupo`.
- Se elimina la rama `sinMeta` (`opts.sinMetaCajas`, la variable `sinMeta`, el
  override de `colMeta*` a tinta neutra, `colAccCajas` y los tres `sinMeta?'':...`
  del markup). La tarjeta siempre pinta barras y semáforo.

### 2. `renderRfrCosecha()` (~línea 5907)

- La llamada a `renderRfrResumen()` deja de pasar `sinMetaCajas:true` y pasa
  `metaCajasGrupo:4500`.

### 3. Comentario del encabezado de `renderRfrResumen()` (~línea 5927)

- Actualizar: quitar la descripción de `sinMetaCajas`, documentar `metaCajasGrupo`.

### 4. `CLAUDE.md`

- Sección "Semáforo de las tarjetas KPI del mismo resumen": "16,000" → "18,000",
  "8,000" → "9,000".
- Sección "Pestaña «Por cosecha»": reemplazar la explicación de `sinMetaCajas` por
  `metaCajasGrupo` y las metas de media cosecha (9,000 / 4,500).

## Fuera de alcance

- Las demás tarjetas de Por cosecha (merma, costo/cubeta, precio/caja) ya llevan su
  semáforo por meta por unidad y no cambian.
- Ninguna gráfica de línea cambia.
- Sin cambios de esquema ni de persistencia — las metas son constantes en código.
