# Facturación con varios precios por caja — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.
>
> **No despachar subagentes en este repo.** `index.html` pesa 624 KB; un subagente arranca en frío y tiene que releerlo, lo que gasta más cuota de la que ahorra (ver `CLAUDE.md` → "Cuidar el consumo de contexto").

**Objetivo:** Que el paso "2. Facturación" de Frambuesa → Finanzas → Registro acepte varios renglones de cajas/precio con un botón **+**, sumando el total facturado y ponderando el precio por caja.

**Arquitectura:** El registro de `framFinanzas` gana un arreglo `facturacion:[{cajas,precio}]`. Los campos `cajas` y `precio` que ya existen se conservan como **derivados** — suma y promedio ponderado sin redondear — de modo que `cajas × precio` reconstruye el total exacto y los ocho lugares que hoy calculan `(f.cajas||0)*(f.precio||0)` siguen dando el número correcto sin tocarse.

**Stack:** ES5 puro dentro de `index.html`, sin framework ni build. Persistencia dual `localStorage` + Supabase.

**Spec:** [`docs/superpowers/specs/2026-08-17-facturacion-multiples-precios-frambuesa-design.md`](../specs/2026-08-17-facturacion-multiples-precios-frambuesa-design.md)

## Restricciones globales

- **ES5 puro.** `var`, `function`, callbacks. Nada de `let`/`const`/arrow/clases/plantillas literales.
- **Toda función invocada desde un `onclick` inline debe ser global de nivel superior.** Si queda dentro de otra función, el `onclick` truena en runtime sin error de sintaxis.
- **Estilos por variables CSS** (`var(--fram)`, `var(--surface2)`, `var(--border)`, `var(--text3)`, `var(--mono)`, `var(--radius)`), nunca hex crudo.
- **Persistencia dual, cuatro lugares.** Un campo nuevo exige tocar: el objeto que se construye al guardar, `sbSaveFramFinanza()`, el `.map()` de `fram_finanzas` en `cargarDesdeSB()`, y la columna en Supabase.
- **Local y producción comparten la base de Supabase.** Al verificar en el navegador se puede mirar y calcular, pero **no completar guardados de prueba**: nada de invocar `guardarRegistroFinanzasFram()`, `saveFramFinanzas()` ni `sbSaveFramFinanza()` desde la consola.
- **No tocar** los cortes del semáforo (`RFR_CORTES_PRECIO_CAJA = [220,200,180]`) ni ninguna gráfica o tarjeta KPI.
- **Antes de modificar cualquier función, `grep` por `function <nombre>(`** para confirmar que no exista una segunda definición más abajo que gane por hoisting.
- **No pushear hasta la Tarea 6.** Cada push a `main` sale en vivo.

**Números de línea:** los que aparecen abajo corresponden al estado del archivo antes de empezar y se recorren conforme se editan. Ubicar siempre por el texto ancla, no por el número.

---

### Tarea 1: Columna `facturacion` en Supabase

**Archivos:**
- Ninguno. Cambio de esquema en la base de producción.

**Interfaces:**
- Produce: la columna `fram_finanzas.facturacion` (jsonb, default `'[]'`), que consumen las Tareas 4 y 5.

- [ ] **Paso 1: Confirmar con el usuario antes de aplicar**

Es la base de producción. El cambio es aditivo y no toca datos existentes, pero se pide visto bueno explícito antes de correrlo.

- [ ] **Paso 2: Aplicar la migración**

Con la herramienta MCP de Supabase `apply_migration`, nombre `add_facturacion_to_fram_finanzas`:

```sql
alter table fram_finanzas
  add column if not exists facturacion jsonb not null default '[]'::jsonb;
```

- [ ] **Paso 3: Verificar que la columna existe**

Con `list_tables` sobre el esquema `public`, confirmar que `fram_finanzas` ahora reporta `facturacion` de tipo `jsonb`.

Esperado: la columna aparece; las filas existentes traen `[]`.

- [ ] **Paso 4: Sin commit**

No hay archivos que commitear en esta tarea.

---

### Tarea 2: Estado y helpers de las partidas de facturación

**Archivos:**
- Modificar: `index.html` — junto a `var framFinEditId = null;` (~línea 9754)

**Interfaces:**
- Produce:
  - `ffFactTemp` — arreglo global `[{cajas:Number, precio:Number}]`, estado temporal de la captura.
  - `ffFactTotales()` → `{cajas:Number, monto:Number, precio:Number}` — suma de cajas, total facturado y promedio ponderado (`0` si no hay cajas).
  - `renderFramFactRows()` — repinta `#ff-fact-list` desde `ffFactTemp` y llama `recalcFramFin()`.
  - `agregarFramFactRow()` — agrega un renglón vacío y le da foco.
  - `removeFramFactRow(idx)` — quita el renglón `idx`, garantizando que siempre quede al menos uno.

- [ ] **Paso 1: Agregar el estado y los helpers**

Localizar:

```js
var framFinEditId = null;
```

y agregar **justo debajo**:

```js
var ffFactTemp = [];

function ffFactTotales(){
  var cajas=0, monto=0;
  ffFactTemp.forEach(function(p){
    var c=parseFloat(p.cajas)||0, pr=parseFloat(p.precio)||0;
    cajas+=c; monto+=c*pr;
  });
  return {cajas:cajas, monto:monto, precio: cajas>0 ? monto/cajas : 0};
}

function renderFramFactRows(){
  var cont = document.getElementById('ff-fact-list');
  if(!cont) return;
  cont.innerHTML='';
  ffFactTemp.forEach(function(p, idx){
    var row = document.createElement('div');
    row.style.cssText='display:grid;grid-template-columns:1fr 1fr 28px;gap:8px;align-items:center;margin-bottom:6px';
    row.innerHTML =
      '<input type="number" value="'+(p.cajas||'')+'" placeholder="0" min="0" step="1"'+
      ' oninput="ffFactTemp['+idx+'].cajas=parseFloat(this.value)||0;recalcFramFin()"'+
      ' style="width:100%;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);font-size:14px;font-weight:600;color:var(--text);font-family:var(--mono);outline:none">'+
      '<div class="monto-wrap"><span class="monto-prefix">$</span>'+
      '<input type="number" value="'+(p.precio||'')+'" placeholder="0" min="0" step="0.01"'+
      ' oninput="ffFactTemp['+idx+'].precio=parseFloat(this.value)||0;recalcFramFin()"'+
      ' style="padding-left:24px"></div>'+
      (idx>0
        ? '<button onclick="removeFramFactRow('+idx+')" title="Eliminar"'+
          ' style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;flex-shrink:0">×</button>'
        : '<span></span>');
    cont.appendChild(row);
  });
  recalcFramFin();
}

function agregarFramFactRow(){
  ffFactTemp.push({cajas:0, precio:0});
  renderFramFactRows();
  setTimeout(function(){
    var inps = document.querySelectorAll('#ff-fact-list input[type="number"]');
    var i = (ffFactTemp.length-1)*2;
    if(inps[i]) inps[i].focus();
  }, 50);
}

function removeFramFactRow(idx){
  ffFactTemp.splice(idx,1);
  if(!ffFactTemp.length) ffFactTemp.push({cajas:0, precio:0});
  renderFramFactRows();
}
```

Notas de por qué está escrito así:

- Los `oninput` mutan `ffFactTemp[idx]` y llaman `recalcFramFin()`, que **no repinta la lista**. Repintar en cada tecla le quitaría el foco al input — es la misma trampa documentada en `dgSetKg()` del despacho de almacén.
- La `×` solo se pinta desde `idx>0`; el primer renglón lleva un `<span></span>` para que la rejilla de 3 columnas no se desalinee.
- `removeFramFactRow()` reinyecta un renglón vacío si se quedó sin ninguno, para que la lista nunca desaparezca.

- [ ] **Paso 2: Sin commit todavía**

Este código referencia `#ff-fact-list` y `recalcFramFin()` en su forma nueva; se commitea junto con la Tarea 3.

---

### Tarea 3: Markup del paso "2. Facturación" y `recalcFramFin()`

**Archivos:**
- Modificar: `index.html:1767-1779` (markup del paso 2)
- Modificar: `index.html` — `recalcFramFin()` (~línea 9891)
- Modificar: `index.html` — `initFramFinForm()` (~líneas 9875-9876 y el `recalcFramFin();` final)

**Interfaces:**
- Consume: `ffFactTemp`, `ffFactTotales()`, `renderFramFactRows()`, `agregarFramFactRow()` (Tarea 2).
- Produce: los ids `#ff-fact-list`, `#ff-fact-resumen`, `#ff-fact-total-cajas`, `#ff-fact-precio-pond`. Desaparecen `#ff-cajas` y `#ff-precio`.

- [ ] **Paso 1: Reemplazar el markup del paso 2**

Localizar el bloque completo que empieza en `<div class="step-label">2. Facturación</div>` y termina en el `</div>` de su `card` (hoy contiene el `field-row` con `ff-cajas` y `ff-precio`), y sustituirlo por:

```html
      <div class="step-label">2. Facturación</div>
      <div class="card" style="margin-bottom:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr 28px;gap:8px;margin-bottom:6px;padding:0 2px">
          <span style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Cajas facturadas</span>
          <span style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Precio por caja</span>
          <span></span>
        </div>
        <div id="ff-fact-list"></div>
        <div style="margin-top:6px">
          <button onclick="agregarFramFactRow()" title="Agregar precio"
            style="width:28px;height:28px;border-radius:50%;border:none;background:var(--fram);color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">+</button>
        </div>
        <div id="ff-fact-resumen" style="display:none;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0">
            <span style="color:var(--text2);font-weight:500">Total cajas</span>
            <span id="ff-fact-total-cajas" style="font-family:var(--mono);color:var(--text);font-weight:700">0</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0">
            <span style="color:var(--text2);font-weight:500">Precio promedio ponderado</span>
            <span id="ff-fact-precio-pond" style="font-family:var(--mono);color:var(--fram);font-weight:700">$0.00</span>
          </div>
        </div>
      </div>
```

- [ ] **Paso 2: Reescribir `recalcFramFin()`**

Reemplazar la función completa por:

```js
function recalcFramFin(){
  var t = ffFactTotales();
  var dPrestamo = parseFloat(document.getElementById('ff-desc-prestamo').value)||0;
  var dIntereses = parseFloat(document.getElementById('ff-desc-intereses').value)||0;
  var dPlanta = parseFloat(document.getElementById('ff-desc-planta').value)||0;
  var dInocuidad = parseFloat(document.getElementById('ff-desc-inocuidad').value)||0;
  var dMaterial = parseFloat(document.getElementById('ff-desc-material').value)||0;
  var totalDescuentos = dPrestamo+dIntereses+dPlanta+dInocuidad+dMaterial;
  var res = document.getElementById('ff-fact-resumen');
  if(res){
    if(ffFactTemp.length>1){
      res.style.display='block';
      document.getElementById('ff-fact-total-cajas').textContent = t.cajas.toLocaleString('es-MX');
      document.getElementById('ff-fact-precio-pond').textContent = '$'+t.precio.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
    } else {
      res.style.display='none';
    }
  }
  document.getElementById('ff-total-facturado').textContent = '$'+t.monto.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('ff-total-descuentos').textContent = '$'+totalDescuentos.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
}
```

- [ ] **Paso 3: Sembrar `ffFactTemp` en `initFramFinForm()`**

Localizar estas dos líneas:

```js
  document.getElementById('ff-cajas').value = editF ? (editF.cajas||'') : '';
  document.getElementById('ff-precio').value = editF ? (editF.precio||'') : '';
```

y reemplazarlas por:

```js
  ffFactTemp = (editF && editF.facturacion && editF.facturacion.length)
    ? editF.facturacion.map(function(p){ return {cajas:parseFloat(p.cajas)||0, precio:parseFloat(p.precio)||0}; })
    : (editF ? [{cajas:parseFloat(editF.cajas)||0, precio:parseFloat(editF.precio)||0}] : [{cajas:0, precio:0}]);
```

La rama de en medio es la que abre los registros anteriores: sin ella la caja de Facturación aparecería vacía para todo lo ya capturado y guardar lo borraría.

- [ ] **Paso 4: Pintar la lista al final de `initFramFinForm()`**

En la misma función, cambiar la última línea:

```js
  recalcFramFin();
```

por:

```js
  renderFramFactRows();
```

`renderFramFactRows()` ya llama a `recalcFramFin()` al terminar. El orden importa: así los campos de descuento ya tienen valor cuando se calculan los totales.

- [ ] **Paso 5: Confirmar que no quedaron referencias huérfanas**

Buscar en el archivo `ff-cajas` y `ff-precio`.

Esperado: **cero** resultados. Si aparece alguno, es una lectura que quedó apuntando a un elemento que ya no existe y reventaría en runtime.

- [ ] **Paso 6: Verificar en el navegador**

1. `preview_start` con la configuración `gvf-local`.
2. Confirmar en consola `Supabase conectado ✅` y **cero** errores.
3. Ir a Cosecha → Frambuesa → Finanzas → Registro.
4. Con un solo renglón: escribir 1,000 cajas y 220 de precio → "Total facturado (ingreso)" debe decir `$220,000.00`, y el sub-resumen debe estar **oculto**.
5. Presionar **+**: aparece un segundo renglón con su **×**, y el sub-resumen se hace visible.
6. Escribir 500 cajas y 180 en el segundo renglón → Total cajas `1,500`, Precio promedio ponderado `$206.67`, Total facturado `$310,000.00`.
7. Escribir dentro de un input sin que se pierda el foco entre teclas.
8. Presionar la **×** del segundo renglón → vuelve a un solo renglón, el sub-resumen se oculta y el total regresa a `$220,000.00`.

**No presionar "Guardar registro"** — escribe en la base de producción.

- [ ] **Paso 7: Commit**

```bash
git add index.html && git commit -m "Capturar varios precios por caja en finanzas de frambuesa"
```

---

### Tarea 4: Guardado y persistencia dual

**Archivos:**
- Modificar: `index.html` — `guardarRegistroFinanzasFram()` (~líneas 9911-9912 y 9928)
- Modificar: `index.html` — `sbSaveFramFinanza()` (~línea 9815)
- Modificar: `index.html` — el `.map()` de `fram_finanzas` en `cargarDesdeSB()` (~línea 2168)

**Interfaces:**
- Consume: `ffFactTemp` (Tarea 2), la columna `fram_finanzas.facturacion` (Tarea 1).
- Produce: `framFinanzas[i].facturacion` — arreglo `[{cajas,precio}]` presente tanto en memoria como en Supabase.

- [ ] **Paso 1: Calcular los derivados al guardar**

En `guardarRegistroFinanzasFram()`, localizar:

```js
  var cajas = parseFloat(document.getElementById('ff-cajas').value)||0;
  var precio = parseFloat(document.getElementById('ff-precio').value)||0;
```

y reemplazar por:

```js
  var facturacion = ffFactTemp.filter(function(p){
    return (parseFloat(p.cajas)||0)>0 || (parseFloat(p.precio)||0)>0;
  }).map(function(p){
    return {cajas:parseFloat(p.cajas)||0, precio:parseFloat(p.precio)||0};
  });
  var montoFacturado = facturacion.reduce(function(a,p){ return a+p.cajas*p.precio; },0);
  var cajas = facturacion.reduce(function(a,p){ return a+p.cajas; },0);
  var precio = cajas>0 ? montoFacturado/cajas : 0;
```

`precio` se guarda **sin redondear** a propósito: es lo que hace que `cajas × precio` reconstruya el total exacto en las ocho pantallas que lo calculan así.

- [ ] **Paso 2: Guardar el arreglo en el registro**

Localizar:

```js
  reg.ciclo = ciclo; reg.semanaKey = semanaKey; reg.cliente = cliente; reg.cajas = cajas; reg.precio = precio;
```

y reemplazar por:

```js
  reg.ciclo = ciclo; reg.semanaKey = semanaKey; reg.cliente = cliente; reg.cajas = cajas; reg.precio = precio;
  reg.facturacion = facturacion;
```

- [ ] **Paso 3: Mapear a Supabase**

En `sbSaveFramFinanza()`, localizar:

```js
    cajas:f.cajas||0, precio:f.precio||0, nomina_cosechadores:f.nominaCosechadores||0,
```

y reemplazar por:

```js
    cajas:f.cajas||0, precio:f.precio||0, facturacion:f.facturacion||[],
    nomina_cosechadores:f.nominaCosechadores||0,
```

- [ ] **Paso 4: Mapear de vuelta en `cargarDesdeSB()`**

En el `.map()` de `ffData`, localizar:

```js
        cajas:f.cajas||0, precio:f.precio||0, nominaCosechadores:f.nomina_cosechadores||0,
```

y reemplazar por:

```js
        cajas:f.cajas||0, precio:f.precio||0, facturacion:f.facturacion||[],
        nominaCosechadores:f.nomina_cosechadores||0,
```

- [ ] **Paso 5: Verificar la forma del objeto sin guardar**

Con la app cargada y el formulario lleno con los dos renglones del Paso 6 de la Tarea 3, evaluar en la consola del navegador:

```js
ffFactTemp.filter(function(p){return (parseFloat(p.cajas)||0)>0||(parseFloat(p.precio)||0)>0;}).map(function(p){return {cajas:parseFloat(p.cajas)||0,precio:parseFloat(p.precio)||0};})
```

Esperado: `[{cajas:1000,precio:220},{cajas:500,precio:180}]`.

Y comprobar la reconstrucción del total:

```js
(function(){var t=ffFactTotales();return [t.cajas, t.precio, t.cajas*t.precio];})()
```

Esperado: `[1500, 206.66666666666666, 309999.99999999994]`, que impreso a dos decimales da `$310,000.00`. Ese error de 1e-9 es el que documenta el spec y es esperado, no un defecto.

**Esta verificación es de solo lectura: no llamar a `guardarRegistroFinanzasFram()`, `saveFramFinanzas()` ni `sbSaveFramFinanza()`.**

- [ ] **Paso 6: Commit**

```bash
git add index.html && git commit -m "Persistir el desglose de facturacion de frambuesa"
```

---

### Tarea 5: Desglose en el Historial de Finanzas

**Archivos:**
- Modificar: `index.html` — `renderFramFinHist()` (~líneas 10206-10207)

**Interfaces:**
- Consume: `framFinanzas[i].facturacion` (Tarea 4).

- [ ] **Paso 1: Pintar una etiqueta por renglón cuando hay más de uno**

Localizar, dentro del `data.forEach`, la línea:

```js
    var totalFacturado = (f.cajas||0)*(f.precio||0);
```

y agregar **justo debajo**:

```js
    var factRows = (f.facturacion && f.facturacion.length>1) ? f.facturacion : null;
    var tagsFact = factRows
      ? factRows.map(function(p){
          return '<span class="tag fram">📦 '+(p.cajas||0).toLocaleString('es-MX')+' cajas · $'+(p.precio||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})+'</span>';
        }).join('')
      : '<span class="tag fram">📦 '+(f.cajas||0)+' cajas</span>'+
        '<span class="tag general">$'+(f.precio||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})+'/caja</span>';
```

- [ ] **Paso 2: Usar `tagsFact` en el markup**

Localizar estas dos líneas del `item.innerHTML`:

```js
        '<span class="tag fram">📦 '+(f.cajas||0)+' cajas</span>'+
        '<span class="tag general">$'+(f.precio||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})+'/caja</span>'+
```

y reemplazar ambas por una sola:

```js
        tagsFact+
```

- [ ] **Paso 3: Verificar en el navegador**

1. Recargar la app.
2. Ir a Cosecha → Frambuesa → Finanzas → Historial.
3. Los registros existentes (un solo precio) se ven exactamente igual que antes: `📦 N cajas` y `$X/caja`.
4. Consola sin errores.

Como todavía no existe ningún registro con dos precios, verificar la otra rama sin guardar, evaluando en consola:

```js
(function(){var f=framFinanzas[0]; if(!f) return 'sin registros'; var c=f.facturacion; f.facturacion=[{cajas:1000,precio:220},{cajas:500,precio:180}]; renderFramFinHist(); var t=document.getElementById('fram-finhist-list').textContent.indexOf('1,000 cajas · $220.00')>=0; f.facturacion=c; renderFramFinHist(); return t;})()
```

Esperado: `true`. El objeto se restaura en la misma expresión y **no se llama a ninguna función de guardado**, así que nada de esto toca Supabase ni `localStorage`.

- [ ] **Paso 4: Commit**

```bash
git add index.html && git commit -m "Desglosar los precios por caja en el historial de finanzas"
```

---

### Tarea 6: Documentación y publicación

**Archivos:**
- Modificar: `CLAUDE.md`

**Interfaces:**
- Consume: todo lo anterior.

- [ ] **Paso 1: Documentar el cambio en `CLAUDE.md`**

En la sección de acoplamientos entre módulos, junto a la línea de **Frambuesa: registros → nómina → finanzas**, agregar:

```markdown
- **Frambuesa: facturación con varios precios por caja** (ago-2026, spec en `docs/superpowers/specs/2026-08-17-facturacion-multiples-precios-frambuesa-design.md`). El registro de `framFinanzas` guarda `facturacion:[{cajas,precio}]` (columna `facturacion` jsonb en `fram_finanzas`) y **`cajas`/`precio` pasaron a ser derivados**: `cajas` = Σ cajas y `precio` = **promedio ponderado sin redondear**. Esa elección es la que mantiene funcionando, sin tocarlas, las ocho pantallas que calculan el facturado como `(f.cajas||0)*(f.precio||0)` — dashboard financiero, ingresos por mes/ciclo, `rfrComputeSemMetrics()`, tarjeta de Por semana, `rfrRefsHistoricas()`, tarjetas y gráfica de Por ciclo, resumen por negocio/EDR e historial. Si algún día se redondea `precio` al guardar, el total facturado se desviaría por centavos en todas ellas a la vez.

  El formulario captura los renglones en `ffFactTemp` (`renderFramFactRows()` / `agregarFramFactRow()` / `removeFramFactRow()`); siempre queda al menos un renglón y la `×` solo aparece del segundo en adelante. Los `oninput` mutan `ffFactTemp` y llaman `recalcFramFin()`, que **no repinta la lista** — repintar por tecla le quitaría el foco al input. Los registros anteriores no traen `facturacion`: `initFramFinForm()` los siembra desde `cajas`/`precio`, y sin ese fallback la caja de Facturación abriría vacía y guardar los borraría.
```

- [ ] **Paso 2: Verificación final en el navegador**

Recargar la app con la consola abierta y confirmar `Supabase conectado ✅` sin errores, revisando las tres pantallas afectadas:

- Finanzas → Registro (formulario con uno y con dos renglones)
- Finanzas → Historial
- Cosecha → Por ciclo y Por semana: la tarjeta de Precio por caja y la gráfica de Total facturado siguen mostrando los mismos valores que antes del cambio, con los mismos colores de semáforo.

- [ ] **Paso 3: Commit y push**

```bash
git add CLAUDE.md && git commit -m "Documentar la facturacion con varios precios por caja" && git push origin main
```

- [ ] **Paso 4: Avisar al usuario del viaje redondo pendiente**

La verificación de ida y vuelta contra Supabase — guardar la semana real con dos precios, recargar y reeditarla — **la tiene que hacer el usuario**, porque exige un guardado real contra la base de producción. Pedirle que capture esa semana y confirme que al reabrirla siguen los dos renglones.

---

## Resumen de verificación

| Qué | Cómo | Cuándo |
|---|---|---|
| Columna creada | `list_tables` sobre `public` | Tarea 1 |
| Sin referencias a `#ff-cajas`/`#ff-precio` | búsqueda en el archivo | Tarea 3 |
| Formulario: un renglón, dos renglones, ponderado, foco, `×` | navegador, `gvf-local` | Tarea 3 |
| Forma del objeto y reconstrucción del total | consola, solo lectura | Tarea 4 |
| Historial en sus dos ramas | consola, con restauración inmediata | Tarea 5 |
| Gráficas y tarjetas sin cambios | navegador, Por ciclo y Por semana | Tarea 6 |
| Viaje redondo contra Supabase | **el usuario**, con la captura real | después del push |
