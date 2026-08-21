# Ingresos de maíz en Resumen y Estado de Resultados

Fecha: 2026-08-21

## Problema

Los registros de cosecha de maíz (`maizRegistros`) ya guardan lo que se vendió —variedad,
peso neto y precio por kg— pero ese dinero no aparecía en ningún lado del financiero.
`rsmFilas()` ponía `maiz.ing = 0` en duro y la rama de maíz de `renderRsltEDR()` traía el
comentario "por ahora solo gastos (los ingresos/cosecha se agregan después)".

Resultado: el Resumen mostraba a Maíz con utilidad negativa por el puro gasto, y el EDR de
Maíz solo pintaba la gráfica de Gastos x Categoría.

## Alcance

Los ingresos de maíz pasan a sumar en:

1. **Resultados → Resumen** — renglón de Maíz con Ingresos y Utilidad reales, y por lo tanto
   también en las tarjetas de Ingresos / Utilidad Total y en la gráfica "Utilidad x Negocio",
   que ya leen todas de `rsmFilas()`.
2. **Resultados → Estado de Resultados → Maíz** — tarjetas de Ingresos, Gastos y Utilidad.

**El maíz sigue sin generar gastos, deudas ni cuentas por cobrar.** El ingreso solo se
*reporta*; no hay movimientos `autoGen` ni sincronización con el módulo de deudas.

## Definición del ingreso

Ingreso de un registro = **total bruto** = Σ (`pesoNeto` × `precio`) de sus partidas, que es
exactamente lo que `guardarMaiz()` ya persiste en el campo `total`.

No se le resta nada. Cualquier comisión o descuento se captura aparte como gasto de maíz y
entra por el lado de gastos, como en los demás negocios.

`maizIngresoReg(r)` devuelve `r.total` y, si falta, recalcula desde `partidas` — mismo criterio
tolerante que usa `renderRepMaiz()`, que nunca lee `total`.

## Ciclo

Se filtra con `r.ciclo || cicloFromFecha(r.fechaVal)`, el estilo **con fallback**, porque es el
que ya usan el Resumen (`rsmEnCiclo`) y el EDR. Un registro sin ciclo capturado se clasifica por
su fecha en vez de desaparecer.

## Cambios

Sin columnas nuevas ni cambios en Supabase: todo es derivado de `maiz_registros`, que ya
persiste `total` y `partidas`.

| Lugar | Cambio |
|---|---|
| Bloque `MÓDULO MAÍZ` | Nuevos `maizIngresoReg(r)` y `maizIngresoCiclo(ciclo)` |
| `rsmFilas()` | `maiz.ing` pasa de `0` a `maizIngresoCiclo(ciclo)` |
| `renderRsltEDR()`, rama `maiz` | Tarjetas Ingresos / Gastos / Utilidad; estado vacío checa las dos cosas |
| `rsltCiclo()` | El selector también toma los ciclos de `maizRegistros` |

El selector de ciclo hacía falta porque se poblaba solo con envíos, frambuesa y gastos: un
ciclo con cosecha de maíz capturada pero sin gastos no habría aparecido. Es el mismo criterio
que `renderRepMaiz()` ya aplicaba en Reportes.

## Verificación

- El renglón de Maíz en el Resumen cuadra con el total de "Ingreso x Parcela" de
  Reportes → Maíz para el mismo ciclo (las dos suman `pesoNeto × precio`).
- La utilidad del EDR de Maíz es igual a la del renglón de Maíz en el Resumen.
- Un ciclo con registros de maíz pero sin gastos aparece en el selector.
