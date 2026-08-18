# Cosecha de Maíz — Registro e Historial

Fecha: 2026-08-18

## Qué se construye

La pantalla `sc-maiz` está vacía hoy (un cartel de "módulo en blanco"). Se reemplaza por
un módulo de **Cosecha** con dos sub-pestañas, **Registro** e **Historial**, siguiendo la
estructura de navegación de Frambuesa.

El registro captura una venta de maíz a un intermediario: los datos del envío (fecha,
ciclo, intermediario, boleta, receptor de factura, chofer, placa, factura) y N partidas
por variedad, cada una con su parcela, hectáreas, peso, precio y total.

## Fuera de alcance

- **No genera cuentas por cobrar ni por pagar.** El registro no toca el módulo de deudas.
- **No genera gastos** ni movimientos `autoGen`.
- **No suma en reportes, EDR ni resumen por negocio.** Los reportes de maíz son una tarea
  posterior; este cambio solo deja los datos capturados y persistidos completos para que
  esa tarea pueda leerlos sin migraciones extra.
- **No hay filtros ni totales en el Historial** (ni por ciclo ni por intermediario).
- No hay pestaña de Finanzas ni de Nómina para maíz. La barra de pestaña principal se
  arma con "Cosecha" sola, dejando el lugar para agregar más después.

## Navegación

`#sc-maiz` replica el patrón de `#sc-fram`:

```
.fram-subnav-wrap > .fram-subnav#maiz-maintabs
    button.fram-tab.active #mzt-cosecha   -> maizMainTab('cosecha')
.fram-subnav-wrap > .fram-subnav.fram-subnav-sub#maiz-subtabs-cosecha
    button.fram-tab.active #mst-cosecha-reg  -> maizTab('nuevo')
    button.fram-tab        #mst-cosecha-hist -> maizTab('hist')
```

- Estado en `maizTabSel` (default `'nuevo'`).
- `maizTab(t)` alterna la clase `.active` de los dos botones y el `display` de las dos
  secciones (`#maiz-form-sec`, `#maiz-hist-sec`), y llama a `renderMaizHist()` al entrar
  a Historial.
- `maizMainTab('cosecha')` existe por simetría con `framMainTab` y para que agregar una
  segunda pestaña después sea trivial; hoy solo marca activa la única pestaña.
- `goSc('maiz')` llama `maizTab(maizTabSel)`. El resto de `goSc` no cambia: `sc-maiz` ya
  está en su arreglo de pantallas y ya cuenta como pantalla de cosechas.

## Constantes

```js
var MZ_VARIEDADES = ['Blanco','Antylope','Waxy'];
var MZ_PARCELAS   = ['Cuata Grande','Cuata Chica','Mesita','Camino'];
```

Lista fija en código, decisión del usuario. Si algún día cambia, se edita esa línea.

## Formulario de Registro (`#maiz-form-sec`)

### Paso 1 — "1. Datos del envío"

| Campo | id | Control |
|---|---|---|
| Fecha | `mz-fecha` | `input[type=date]`, default hoy |
| Ciclo | `mz-ciclo` | `select` poblado con `CICLOS`, default `cicloFromFecha(fecha)` |
| Intermediario | `mz-intermediario` | input + dropdown de catálogo (ver abajo) |
| N° de Boleta | `mz-boleta` | texto |
| Receptor Factura | `mz-receptor` | texto |
| Chofer | `mz-chofer` | texto |
| N° de Placa | `mz-placa` | texto |
| Factura | `mz-factura` | texto |

El ciclo lo elige el usuario a mano y se guarda tal cual, como en el resto de la app.
`cicloFromFecha` solo propone el default.

### Dropdown de Intermediario

Clon del dropdown de proveedores comer (`renderProveedorDropdown`, línea ~9459), con su
propio catálogo:

- `renderMzIntermediarioDropdown()` filtra `intermediarios` por lo escrito en el input y
  pinta una fila por nombre; la fila entera selecciona, y un botón **×** a la derecha
  borra ese intermediario del catálogo (`saveIntermediarios()` + `sbDeleteIntermediario()`),
  con `showToast('Intermediario eliminado')`.
- Al fondo, fila **"+ Agregar nuevo…"** que abre `abrirModalNuevoIntermediario()`, el modal
  único de la app con un campo de nombre; `confirmarNuevoIntermediario()` lo agrega y lo
  deja seleccionado en el input.
- `showMzIntermediarioDropdown()` / `hideMzIntermediarioDropdown()` / `onMzIntermediarioInput()`
  como en el original; los handlers usan `onmousedown` con `preventDefault` para que el
  blur del input no cierre el dropdown antes del click.
- `agregarIntermediarioSiNuevo(nombre)` normaliza, evita duplicados, ordena con
  `localeCompare(...,'es')`, guarda y propaga a Supabase.

El catálogo es propio: no reusa `clientes`, `proveedores` ni `contrapartes`.

### Paso 2 — "2. Partidas por variedad"

Estado en `mzPartidasTemp`, arreglo de:

```js
{ variedad:'', parcela:'', hectareas:'', pesoNeto:'', toneladas:'', precio:'' }
```

- Select `mz-var-select` con las tres variedades y botón "+ Agregar variedad"
  (`addMzPartidaDesdeSelect()`). El select queda **siempre visible**: la misma variedad
  puede venir de dos parcelas distintas, así que se permite repetirla.
- `renderMzPartidas()` pinta una `.partida-card` por partida, con:
  - encabezado con el nombre de la variedad y una **×** que llama `removeMzPartida(idx)`;
  - fila 1: **Parcela** (`select` con `MZ_PARCELAS`), **Hectáreas**, **Peso Neto (kg)**;
  - fila 2: **Toneladas** (`readonly`, fondo `var(--surface2)`), **Precio x kg** (con
    prefijo `$` en `.monto-wrap`), **Total** (div calculado, fondo `var(--green-bg)`).
- `mzAutoCalc(idx)`: `toneladas = pesoNeto/1000` a 3 decimales, `total = pesoNeto*precio`
  vía `fmt()`, y llama `recalcMzResumen()`.
- Los `onchange` mutan `mzPartidasTemp[idx]` directamente y **no** repintan la lista
  completa — repintar por tecla le quita el foco al input, la trampa ya conocida de
  `dgSetKg()` y `recalcFramFin()`.

### Paso 3 — "3. Resumen"

Tarjeta con tres cifras derivadas de `mzPartidasTemp`, actualizada por `recalcMzResumen()`:

- `mz-resumen-kg` — Σ pesoNeto
- `mz-resumen-ton` — Σ toneladas (3 decimales)
- `mz-resumen-total` — Σ (pesoNeto × precio), en `var(--green-bg)`

### Guardar

`guardarMaiz()`:

1. Valida: fecha, intermediario y al menos una partida con peso y precio. Si falta algo,
   `showToast()` y no guarda.
2. Arma el objeto (ver "Modelo de datos"). Si `mzEditId` está puesto, reemplaza ese
   registro en `maizRegistros` conservando su `id`; si no, `unshift()` uno nuevo con
   `id: Date.now()`.
3. `saveMaiz()` + `sbSaveMaizReg(reg)`.
4. Limpia el formulario (`resetMaizForm()`), suelta `mzEditId`, `showToast('Registro guardado')`
   y deja al usuario en Registro.

## Historial (`#maiz-hist-sec`)

`renderMaizHist()` pinta `maizRegistros` ordenado por `fechaVal` descendente. Vacío
muestra el bloque `.empty` con el ícono 🌽.

Cada tarjeta muestra:

- fecha y ciclo;
- intermediario (destacado) y N° de boleta;
- una línea por partida: variedad · parcela · kg · $/kg;
- total del registro;
- botones **✏️** (`editarMaizReg(id)`) y **🗑** (`confirmDelMaiz(id)`).

`editarMaizReg(id)` carga los campos y `mzPartidasTemp` desde el registro, pone `mzEditId`,
cambia el texto del botón a "Actualizar registro" y salta a la sub-pestaña Registro.

`confirmDelMaiz(id)` usa la confirmación de dos toques ya establecida (`dataset.confirm='1'`,
el botón cambia de texto y se revierte solo a los ~2.5 s), modelada en `confirmDelLote()`.
Al confirmar: quita de `maizRegistros`, `saveMaiz()`, `sbDeleteMaizReg(id)` y repinta.

## Modelo de datos

```js
{
  id: 1755500000000,
  fechaVal: '2026-08-18',
  ciclo: '2026-2027',
  intermediario: 'Nombre',
  boleta: '1234',
  receptorFactura: 'Razón social',
  chofer: 'Nombre',
  placa: 'ABC-123',
  factura: 'F-001',
  partidas: [
    { variedad:'Blanco', parcela:'Cuata Grande', hectareas:12, pesoNeto:24000,
      toneladas:24, precio:6.5 }
  ],
  totalKg: 24000,
  totalTon: 24,
  total: 156000,
  ts: 1755500000000
}
```

`mzPartidasTemp` guarda lo que teclea el usuario, o sea cadenas; al guardar, cada campo
numérico de la partida se convierte con `parseFloat(x)||0`, de modo que lo que llega a
Supabase son números y no `"24000"`. El total por partida no se guarda: es `pesoNeto ×
precio` y se recalcula al pintar.

Los tres totales del registro sí se guardan aunque sean derivados, igual que `envios.total_venta`: los
reportes que vienen después los leen directo sin recorrer el `jsonb`. Se recalculan
íntegros en cada guardado, así que no pueden divergir de las partidas.

## Persistencia dual

| Capa | Registros | Catálogo |
|---|---|---|
| Memoria | `maizRegistros` | `intermediarios` |
| localStorage | `cc_maiz` | `cc_intermediarios` |
| Supabase | `maiz_registros` | `intermediarios` |

Funciones nuevas, siguiendo la convención de las que ya existen:

- `saveMaiz()` / `saveIntermediarios()` — escriben a localStorage.
- `sbSaveMaizReg(reg)` / `sbDeleteMaizReg(id)` — `upsert` / `delete` en `maiz_registros`.
- `sbSaveIntermediario(nombre)` / `sbDeleteIntermediario(nombre)` — en `intermediarios`.
- Todas salen temprano con `if(!sbOnline || !sb) return;`.
- Carga en `cargarDesdeSB()`: dos bloques nuevos con `fetchAllRows()` que mapean de vuelta
  a camelCase y escriben tanto el arreglo global como su clave de localStorage.

### Mapeo entre capas

| JS | Supabase |
|---|---|
| `fechaVal` | `fecha` |
| `receptorFactura` | `receptor_factura` |
| `totalKg` / `totalTon` | `total_kg` / `total_ton` |
| `partidas` | `partidas` (jsonb) |
| resto | mismo nombre en minúsculas |

Dentro del `jsonb` las llaves quedan en camelCase (`pesoNeto`), como en `facturacion` de
frambuesa: es un blob que solo lee y escribe el JS.

## Esquema de Supabase

Migración nueva, dos tablas. No toca ninguna tabla existente.

```sql
create table public.maiz_registros (
  id bigint primary key,
  fecha date,
  ciclo text,
  intermediario text,
  boleta text,
  receptor_factura text,
  chofer text,
  placa text,
  factura text,
  partidas jsonb default '[]'::jsonb,
  total_kg numeric default 0,
  total_ton numeric default 0,
  total numeric default 0,
  ts bigint
);

create table public.intermediarios (
  nombre text primary key
);
```

**RLS queda desactivado**, igual que las otras 12 tablas del proyecto. Con RLS activo y
sin políticas la app no podría leer ni escribir estas tablas. Esto no empeora la postura
de seguridad actual pero tampoco la arregla: sigue vigente el pendiente de agregar login
y políticas RLS a todo el proyecto de una vez.

## Verificación

El viaje redondo es la prueba que importa, y hay que hacerla sin escribir datos de prueba
en la base real (local y producción comparten Supabase). Plan:

1. Abrir la app local y confirmar `Supabase conectado ✅` en consola.
2. Revisar que las dos tablas nuevas existen y que un `select` contra ellas no da error de
   RLS.
3. Navegar a Cosechas → Maíz: se ve la pestaña Cosecha con Registro e Historial, se cambia
   entre ellas, el formulario pinta los 8 campos y el dropdown de intermediario abre.
4. Agregar partidas en memoria y verificar los cálculos (toneladas, total por partida,
   resumen) sin llamar a `guardarMaiz()`.
5. El viaje redondo real (guardar → recargar desde Supabase → el campo sigue ahí) lo
   confirma el usuario con su primer registro real; el mapeo de ida y vuelta se revisa
   campo por campo contra esta tabla antes de cerrar el cambio.

## Actualización de CLAUDE.md

En el mismo commit hay que documentar: la pantalla de maíz deja de estar vacía, las dos
claves nuevas de localStorage (`cc_maiz`, `cc_intermediarios`), las dos tablas nuevas de
Supabase, y el catálogo de intermediarios como cuarto catálogo de contrapartes-por-nombre.
