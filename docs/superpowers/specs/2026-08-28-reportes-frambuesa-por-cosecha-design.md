# Reportes → Frambuesa → Cosecha: pestaña "Por cosecha"

Fecha: 2026-08-28

## Problema

El ciclo `2025-2026` de frambuesa no fue una cosecha continua: hubo una pausa entre el
**18 de febrero** y el **8 de junio**. Verlo todo junto en "Por ciclo" mezcla dos cosechas
distintas — promedios, medianas y porcentajes salen contaminados por el hueco.

Hace falta poder ver el mismo análisis de "Por ciclo" pero acotado a cada cosecha.

## Solución

Una cuarta pestaña **"Por cosecha"**, a la derecha de "Por ciclo", con dos sub-pestañas
**Cosecha 1** y **Cosecha 2**. Cada una muestra **exactamente el mismo contenido que
Por ciclo** (8 tarjetas KPI con semáforo, 7 gráficas de línea, dona de control de calidad,
tablas), calculado sobre el subconjunto de registros de esa cosecha.

El corte se define con **una sola fecha por ciclo**, capturada por el usuario:

- Cosecha 1 = registros con `fecha < corte`
- Cosecha 2 = registros con `fecha >= corte`

## Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Cómo se define el corte | **Una sola fecha**, no dos rangos independientes | Un solo dato que mantener; las dos cosechas siempre cubren el ciclo completo sin huecos ni traslapes |
| Alcance del corte | **Por ciclo** | Cada ciclo puede pausarse en fechas distintas |
| Persistencia | **Supabase**, tabla nueva `fram_cosechas` | Regla dura del proyecto: nada vive solo en `localStorage` |
| Ciclo sin corte capturado | **Aviso, no auto-detección** | El usuario prefiere capturarlo a mano antes que corregir una propuesta automática |
| Meta de cajas | **Se quita** en Por cosecha | Las metas (16,000 / 8,000) son del ciclo completo; contra media cosecha no significan nada |
| Dónde va el campo de la fecha | **Arriba de las dos sub-pestañas**, compartido | Es un solo dato; duplicarlo en cada sub-pestaña lo desincronizaría |

## Interfaz

Sección `#rfr-sec-coh`, dentro de la pestaña, en este orden:

1. **Barra de corte** — `Cosecha 2 inicia el [fecha] [Guardar]`, centrada y compacta,
   con el mismo patrón visual que el selector de Ciclo de la pantalla. Sin leyendas ni
   texto derivado adicional (ago-2026: se agregó una línea con los rangos reales de cada
   lado y se quitó por pedido explícito del usuario — la app no agrega texto explicativo
   por iniciativa propia, ver `CLAUDE.md`).
2. **Sub-pestañas** Cosecha 1 / Cosecha 2 (estado en `rfrCohSel`, default `'c1'`).
3. **Contenedor** `#rfr-coh-detalle` con el render completo.

Sin fecha capturada para el ciclo, las sub-pestañas y el detalle no se pintan: solo el
aviso "Captura la fecha de corte de este ciclo para dividir las cosechas".

La pestaña respeta el selector de **Ciclo** de la pantalla: parte el ciclo seleccionado,
no lo ignora.

## Implementación

### `renderRfrResumen(data, opts)`

La función se parametriza sin cambiar su comportamiento actual: **sin `opts` se comporta
idéntico a hoy**, así que "Por ciclo" no cambia.

```js
opts = {
  contId: 'rfr-coh-detalle',   // default 'rfr-res-detalle'
  sinMetaCajas: true,          // default false
  vacioMsg: '...'              // texto del estado vacío
}
```

`sinMetaCajas` quita las tres barras de avance y sus porcentajes de la tarjeta Total
cajas; quedan las tres cifras (total, Sectores 1-2, Sectores 3-4) en color neutro
(`var(--text)`) y el acento de la tarjeta en `var(--fram)`. Las demás tarjetas conservan
su semáforo: sus cortes (merma, costo/cubeta, precio/caja) son metas **por unidad**, no
acumulados del ciclo, así que siguen siendo válidos en un rango más corto.

Las medianas de `rfrRefsHistoricas()` **no se filtran** por el rango: son la referencia
histórica completa contra la cual se compara, igual que en las otras vistas.

### Ids duplicados de canvas

Por ciclo y Por cosecha generan el **mismo markup**, o sea los mismos ids de canvas. Si
las dos secciones quedan pintadas a la vez, `getElementById` devuelve la de Por ciclo y
las gráficas se dibujan en la pestaña equivocada.

`rfrTab()` vacía el contenedor de la pestaña que se abandona (`#rfr-res-detalle` /
`#rfr-coh-detalle`), de modo que en todo momento existe un solo juego de ids.

La regla CSS de la línea ~440 (`#rfr-res-detalle .kpi-lbl,...{text-align:center}`) tiene
que incluir también `#rfr-coh-detalle`.

### Persistencia (regla de los cuatro lugares)

| Capa | Nombre |
|---|---|
| Arreglo en memoria | `framCosechas` — `[{ciclo, corte}]` |
| localStorage | `cc_fram_cosechas` (caché de arranque) |
| Supabase | tabla `fram_cosechas` (`ciclo` text PK, `corte` date) |
| Mapeo de ida | `sbSaveFramCosecha(c)` |
| Mapeo de vuelta | bloque `fcData` en `cargarDesdeSB()` |

Helpers: `framCorteDe(ciclo)` (lectura) y `guardarCorteCosecha()` (escritura desde la UI).
Nombres iguales en las dos capas (`ciclo`, `corte`), así que el mapeo es directo.

## Fuera de alcance

- Auto-detección de la pausa.
- Más de dos cosechas por ciclo.
- Insignias de variación entre cosechas (Por ciclo tampoco las tiene).
- Cambios a Por día, Por semana o Facturación.
