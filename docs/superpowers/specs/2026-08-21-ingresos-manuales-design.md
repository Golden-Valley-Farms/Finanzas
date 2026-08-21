# Ingresos manuales en Registrar

Fecha: 2026-08-21

## Problema

La app solo sabe registrar gastos a mano. Los ingresos existen únicamente como derivados de
otra captura: envíos (camote), `fram_finanzas` (frambuesa) y `maiz_registros` (cosecha de
maíz). No hay forma de capturar un ingreso suelto — el caso que lo destapó fue un apoyo de
gobierno para maíz, que no es una venta y no cabe en un registro de cosecha.

## Decisión de fondo: arreglo y tabla propios

Un ingreso tiene **exactamente la misma forma que un gasto** (mismos campos, misma captura),
pero vive en `ingresos` / `cc_ingresos` / tabla `ingresos`, **no** dentro de `gastos` con una
marca de tipo.

El motivo es de riesgo, no de elegancia: **47 lugares del código leen el arreglo `gastos`**
(reportes, EDR, resumen, la pestaña Gastos, nómina de frambuesa, historial, encabezado).
Guardar ingresos ahí obligaría a auditar y filtrar los 47; el que se escapara contaría un
ingreso como gasto y descuadraría un reporte **en silencio**, sin error en consola. Con
arreglo aparte, ninguno de esos 47 lugares se toca.

## Alcance

| Pantalla | Cambio |
|---|---|
| Registrar | Sección **1. Tipo** (Gasto / Ingreso); el resto del formulario, idéntico |
| Historial | Pestaña propia de Ingresos |
| Resultados → Resumen | Los ingresos suman en la columna Ingresos de su negocio |
| Resultados → Estado de Resultados | Suman en los seis negocios; Oficina estrena Ingresos y Utilidad |
| Resultados → **Gastos** | **Sin cambios** — es un reporte de gastos y así se queda |

El total del encabezado sigue siendo solo de gastos.

## Categorías

Estructura espejo de la de gastos: `CATS_ING` con las mismas siete llaves de lista
(`camote_general`, `camote_cosecha`, `fram`, `campo_general`, `ofic`, `com`, `maiz`), espejo
en `cc_cats_ing` y tabla `categorias_ingresos` con llave compuesta `(lista, nombre)`. Espejar
las listas permite reusar `catListaActual()` sin tocarlo.

**Arrancan vacías**, por decisión del usuario. Consecuencia aceptada: en un negocio sin
categorías dadas de alta, el formulario exige crear la primera antes de poder guardar (el
dropdown ya trae la fila "+ Agregar nueva...").

Consecuencia de espejar: en camote las categorías de ingreso también quedan partidas en
General y Cosecha, porque la sección Actividad sigue apareciendo.

## Formulario

`regTipo` (`'gasto'` | `'ingreso'`) es el estado. Al cambiarlo:

- el dropdown de categoría lee `CATS_ING` en vez de `CATS`;
- el alta y el borrado de categoría escriben en `categorias_ingresos`;
- el botón dice "Registrar ingreso".

`updateStepNumbers()` numera desde Tipo: Tipo 1, Negocio 2, Actividad 3, Sector 4, Detalle 5.
Actividad y Sector siguen apareciendo solo en camote, así que la numeración se sigue
ajustando sola.

## Persistencia

Tabla `ingresos`: espejo de `gastos` salvo `auto_gen` (un ingreso nunca se autogenera). Se
crea **sin RLS**, igual que las otras 16 tablas: activarlo sin políticas dejaría a la app sin
acceso con la clave publicable.

Los cuatro lugares de la regla de persistencia dual, para cada campo: el objeto que se arma
en `registrar()`, `sbSaveIngreso()`, el `.map()` de `ingresos` dentro de `cargarDesdeSB()` y
la columna en Supabase.

## Verificación

- Un ingreso capturado sobrevive el viaje redondo (guardar → recargar desde Supabase).
- El mismo monto aparece en el Resumen y en el EDR de su negocio, y **no** aparece en la
  pestaña Gastos ni en el total del encabezado.
- Un gasto capturado sigue comportándose igual que antes en las dos pantallas.
