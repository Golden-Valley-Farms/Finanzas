# Rediseño del módulo de Deudas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (En este proyecto NO se usan subagentes — ver CLAUDE.md.)

**Goal:** Módulo de deudas con dos modos por cuenta (facturas FIFO / cargos y abonos), catálogo de contrapartes con ID manual, soporte USD, y migración única del histórico desde Excel a Supabase.

**Architecture:** Todo vive en `index.html` (ES5, sin build). El `modo` se guarda en el catálogo `contrapartes` y decide cómo se calcula y pinta cada cuenta. Se reutilizan las tablas `deudas` (cargos) y `pagos_deuda` (abonos) sin tablas nuevas. La migración corre fuera de la app: Python lee el Excel y se escribe a Supabase vía MCP.

**Tech Stack:** ES5 vanilla, localStorage + Supabase (persistencia dual), Supabase MCP, Python+openpyxl (solo migración).

**Spec:** `docs/superpowers/specs/2026-08-07-modulo-deudas-design.md`

## Global Constraints

- ES5 puro: `var`, `function`, callbacks. Nada de `let`/`const`/arrow.
- Toda función invocada desde HTML inline debe ser global de nivel superior.
- Persistencia dual: toda mutación escribe arreglo + `save()` + `sbSaveX()`. Campo nuevo = 4 lugares (objeto, sbSaveX, cargarDesdeSB, columna SB).
- Estilos inline con variables CSS (`var(--green)`, `var(--fram)`, `var(--surface2)`, `var(--radius)`, `var(--mono)`).
- Nunca leer `index.html` entero; ubicar con grep y leer ventanas.
- Local y producción comparten la MISMA base de Supabase. Datos de prueba deben borrarse.
- Commits chicos, uno por cambio lógico. `git push origin main` SOLO al final, con todo verificado (push = producción).
- Antes de modificar cualquier función: `grep "function nombre("` para confirmar que no haya definición duplicada.
- Números de línea citados: válidos al 2026-08-07 (commit cb73e6e); verificar con grep antes de editar.

---

### Task 1: Columnas nuevas en Supabase `contrapartes`

**Files:** ninguno (solo Supabase, vía MCP).

**Interfaces:**
- Produces: columnas `clave text default ''`, `modo text default 'fifo'`, `moneda text default 'MXN'`, `tipo_cambio numeric default 0` en la tabla `contrapartes`.

- [ ] **Step 1: Inspeccionar la tabla actual**

Con MCP `list_tables` (schema public) confirmar columnas actuales de `contrapartes` (se esperan `nombre`, `tipo` y el unique en `(nombre,tipo)`) y el tipo de la PK. Confirmar también los tipos de `deudas.id` y `pagos_deuda.id` (se esperan bigint/numeric — lo usa la Task 8).

- [ ] **Step 2: Aplicar migración**

Con MCP `apply_migration` (nombre `contrapartes_catalogo`):

```sql
alter table contrapartes
  add column if not exists clave text not null default '',
  add column if not exists modo text not null default 'fifo',
  add column if not exists moneda text not null default 'MXN',
  add column if not exists tipo_cambio numeric not null default 0;
```

- [ ] **Step 3: Verificar**

`execute_sql`: `select nombre, tipo, clave, modo, moneda, tipo_cambio from contrapartes limit 5;` — debe regresar filas con defaults `'', 'fifo', 'MXN', 0`.

*(Sin commit: no se tocó el repo.)*

---

### Task 2: Modelo de contrapartes en la app (cargar/guardar/helpers)

**Files:**
- Modify: `index.html:2068` (map de contrapartes en `cargarDesdeSB`)
- Modify: `index.html:7400-7410` (`sbSaveContraparte`, `registrarContraparte`)

**Interfaces:**
- Produces:
  - Objeto contraparte: `{nombre:str, tipo:'cobrar'|'pagar', clave:str, modo:'fifo'|'corriente', moneda:'MXN'|'USD', tipoCambio:number}`
  - `getContraparte(tipo, nombre)` → objeto o `null`
  - `cpModo(tipo, nombre)` → `'fifo'|'corriente'` (default `'fifo'`)
  - `cpMoneda(tipo, nombre)` → `'MXN'|'USD'` (default `'MXN'`)
  - `sbSaveContraparte(c)` — ahora recibe el objeto completo, con fallback si faltan columnas
  - `registrarContraparte(nombre, tipo)` — sin cambio de firma; crea con defaults si no existe

- [ ] **Step 1: Lectura tolerante en `cargarDesdeSB`**

Reemplazar la línea 2068:

```js
    contrapartes = cpData.map(function(c){ return {nombre:c.nombre, tipo:c.tipo}; });
```

por:

```js
    contrapartes = cpData.map(function(c){ return {nombre:c.nombre, tipo:c.tipo,
      clave:c.clave||'', modo:c.modo||'fifo', moneda:c.moneda||'MXN', tipoCambio:parseFloat(c.tipo_cambio||0)}; });
```

- [ ] **Step 2: Guardado con fallback y helpers**

Reemplazar `sbSaveContraparte` y `registrarContraparte` (líneas 7400-7410) por:

```js
async function sbSaveContraparte(c){
  if(!sbOnline||!sb) return;
  var full={nombre:c.nombre, tipo:c.tipo, clave:c.clave||'', modo:c.modo||'fifo',
    moneda:c.moneda||'MXN', tipo_cambio:parseFloat(c.tipoCambio)||0};
  var r=await sb.from('contrapartes').upsert(full, {onConflict:'nombre,tipo'});
  if(r && r.error){ await sb.from('contrapartes').upsert({nombre:c.nombre, tipo:c.tipo}, {onConflict:'nombre,tipo'}); }
}

function getContraparte(tipo, nombre){
  for(var i=0;i<contrapartes.length;i++){
    if(contrapartes[i].tipo===tipo && contrapartes[i].nombre===nombre) return contrapartes[i];
  }
  return null;
}
function cpModo(tipo, nombre){ var c=getContraparte(tipo,nombre); return (c&&c.modo==='corriente')?'corriente':'fifo'; }
function cpMoneda(tipo, nombre){ var c=getContraparte(tipo,nombre); return (c&&c.moneda==='USD')?'USD':'MXN'; }

function registrarContraparte(nombre, tipo){
  if(!nombre) return;
  if(!getContraparte(tipo, nombre)){
    var c={nombre:nombre, tipo:tipo, clave:'', modo:'fifo', moneda:'MXN', tipoCambio:0};
    contrapartes.push(c); saveContrapartes(); sbSaveContraparte(c);
  }
}
```

Nota: los llamadores existentes de `sbSaveContraparte(nombre, tipo)` con dos argumentos deben migrarse. Buscar con `grep "sbSaveContraparte("` — el único fuera de `registrarContraparte` no debe quedar con la firma vieja; si aparece alguno, envolver el nombre en objeto: `sbSaveContraparte({nombre:n, tipo:t})`.

- [ ] **Step 3: Verificar en navegador**

Abrir `index.html` local, consola: `Supabase conectado ✅` sin errores. Ejecutar en consola: `getContraparte('pagar','Nacho')` → objeto con `modo:'fifo'` (default). `cpModo('pagar','Nacho')` → `'fifo'`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Extender catalogo de contrapartes con clave, modo y moneda"
```

---

### Task 3: Alta y edición de contraparte (clave manual, modo, moneda)

**Files:**
- Modify: `index.html:7612-7631` (`abrirModalNuevoDrContraparte`, `confirmarNuevoDrContraparte`)
- Create (funciones nuevas junto a las anteriores): `abrirEditarContraparte`, `guardarEdicionContraparte`, `claveDuplicada`

**Interfaces:**
- Consumes: `getContraparte`, `sbSaveContraparte`, `saveContrapartes` (Task 2); `_dsInput` (línea 7758, mover su declaración ARRIBA de estas funciones si queda después).
- Produces:
  - `abrirModalNuevoDrContraparte(prefill)` — modal con nombre, clave, modo, moneda
  - `confirmarNuevoDrContraparte()` — valida y da de alta
  - `abrirEditarContraparte(tipo, nombre)` — igual pero nombre fijo, prefilled, incluye tipo de cambio si USD
  - `guardarEdicionContraparte(tipo, nombre)`
  - `claveDuplicada(clave, exceptoTipo, exceptoNombre)` → bool

- [ ] **Step 1: Reemplazar el modal de alta**

Sustituir `abrirModalNuevoDrContraparte` y `confirmarNuevoDrContraparte` (7612-7631) por:

```js
function claveDuplicada(clave, exceptoTipo, exceptoNombre){
  if(!clave) return false;
  return contrapartes.some(function(c){
    return c.clave===clave && !(c.tipo===exceptoTipo && c.nombre===exceptoNombre);
  });
}
function abrirModalNuevoDrContraparte(prefill){
  var esCobrar=(((document.getElementById('dr-tipo')||{}).value||'cobrar')==='cobrar');
  var tipo=esCobrar?'cobrar':'pagar';
  document.getElementById('mo-title').innerHTML='👤 Nueva contraparte <span class="chip '+(esCobrar?'jal':'com')+'">'+(esCobrar?'Por cobrar':'Por pagar')+'</span>';
  document.getElementById('mo-body').innerHTML=
    '<div class="field" style="margin-bottom:10px"><label>Nombre</label><input type="text" id="nc-nombre" placeholder="Nombre completo" style="width:100%"></div>'+
    '<div class="field" style="margin-bottom:10px"><label>ID <span style="font-size:10px;color:var(--text3);text-transform:none;letter-spacing:0">(lo asignas tú, ej. CD-01)</span></label><input type="text" id="nc-clave" placeholder="XX-01" style="width:100%;font-family:var(--mono);text-transform:uppercase"></div>'+
    '<div class="field" style="margin-bottom:10px"><label>Modo de cuenta</label><select id="nc-modo" style="'+_dsInput+'">'+
      '<option value="fifo">Facturas con abonos (se paga la más antigua)</option>'+
      '<option value="corriente">Cargos y abonos (saldo corrido)</option></select></div>'+
    '<div class="field" style="margin-bottom:14px"><label>Moneda</label><select id="nc-moneda" style="'+_dsInput+'">'+
      '<option value="MXN">Pesos (MXN)</option><option value="USD">Dólares (USD)</option></select></div>'+
    '<button class="btn-main" onclick="confirmarNuevoDrContraparte(\''+tipo+'\')">Agregar</button>';
  document.getElementById('overlay').classList.add('open');
  setTimeout(function(){ var inp=document.getElementById('nc-nombre'); if(inp){ if(prefill) inp.value=prefill; inp.focus(); } }, 100);
}
function confirmarNuevoDrContraparte(tipo){
  var nom=(document.getElementById('nc-nombre').value||'').trim();
  var clave=(document.getElementById('nc-clave').value||'').trim().toUpperCase();
  var modo=document.getElementById('nc-modo').value;
  var moneda=document.getElementById('nc-moneda').value;
  if(!nom){ showToast('Escribe un nombre'); return; }
  if(!clave){ showToast('Asigna un ID'); return; }
  if(claveDuplicada(clave)){ showToast('El ID '+clave+' ya está usado'); return; }
  if(getContraparte(tipo, nom)){ showToast('Esa contraparte ya existe'); return; }
  var c={nombre:nom, tipo:tipo, clave:clave, modo:modo, moneda:moneda, tipoCambio:0};
  contrapartes.push(c); saveContrapartes(); sbSaveContraparte(c);
  closeModal();
  var inp=document.getElementById('dr-contraparte'); if(inp) inp.value=nom;
  showToast('Contraparte '+clave+' agregada');
}
```

`claveDuplicada` se llama con un solo argumento en el alta: los otros dos quedan `undefined` y el `!(...)` nunca excluye — correcto.

- [ ] **Step 2: Edición (clave, modo, moneda, tipo de cambio)**

Agregar después de las anteriores:

```js
function abrirEditarContraparte(tipo, nombre){
  var c=getContraparte(tipo, nombre);
  if(!c){ showToast('Contraparte no encontrada'); return; }
  document.getElementById('mo-title').innerHTML='⚙️ '+nombre;
  document.getElementById('mo-body').innerHTML=
    '<div class="field" style="margin-bottom:10px"><label>ID</label><input type="text" id="ec-clave" value="'+(c.clave||'')+'" style="width:100%;font-family:var(--mono);text-transform:uppercase"></div>'+
    '<div class="field" style="margin-bottom:10px"><label>Modo de cuenta</label><select id="ec-modo" style="'+_dsInput+'">'+
      '<option value="fifo"'+(c.modo!=='corriente'?' selected':'')+'>Facturas con abonos</option>'+
      '<option value="corriente"'+(c.modo==='corriente'?' selected':'')+'>Cargos y abonos</option></select></div>'+
    '<div class="field" style="margin-bottom:10px"><label>Moneda</label><select id="ec-moneda" style="'+_dsInput+'">'+
      '<option value="MXN"'+(c.moneda!=='USD'?' selected':'')+'>Pesos (MXN)</option>'+
      '<option value="USD"'+(c.moneda==='USD'?' selected':'')+'>Dólares (USD)</option></select></div>'+
    '<div class="field" style="margin-bottom:14px"><label>Tipo de cambio <span style="font-size:10px;color:var(--text3);text-transform:none;letter-spacing:0">(solo cuentas USD, para el equivalente en pesos)</span></label>'+
    '<input type="number" id="ec-tc" value="'+(c.tipoCambio||'')+'" placeholder="17.00" min="0" step="0.01" style="'+_dsInput+'"></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
      '<button onclick="abrirDeudaContraparte(\''+tipo+'\',deudaModalNombre)" style="padding:11px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font)">Cancelar</button>'+
      '<button class="btn-main" style="margin:0" onclick="guardarEdicionContraparte(\''+tipo+'\',deudaModalNombre)">Guardar</button>'+
    '</div>';
}
function guardarEdicionContraparte(tipo, nombre){
  var c=getContraparte(tipo, nombre); if(!c) return;
  var clave=(document.getElementById('ec-clave').value||'').trim().toUpperCase();
  if(!clave){ showToast('Asigna un ID'); return; }
  if(claveDuplicada(clave, tipo, nombre)){ showToast('El ID '+clave+' ya está usado'); return; }
  c.clave=clave;
  c.modo=document.getElementById('ec-modo').value;
  c.moneda=document.getElementById('ec-moneda').value;
  c.tipoCambio=parseFloat(document.getElementById('ec-tc').value)||0;
  saveContrapartes(); sbSaveContraparte(c);
  showToast('Guardado');
  abrirDeudaContraparte(tipo, nombre); renderDeudas();
}
```

Nota: `abrirEditarContraparte` se invoca solo desde el modal de cuenta (Task 5/6), donde `deudaModalNombre` ya está seteado. El nombre va por `deudaModalNombre` y no interpolado, porque los nombres traen espacios/acentos que romperían el atributo onclick.

- [ ] **Step 3: Verificar que `_dsInput` esté declarado antes**

`_dsInput` se declara en línea ~7758 con `var` (se hoistea `undefined`, pero la asignación corre al cargar el script, ANTES de cualquier click — no hay problema real). Confirmar solamente que sigue existiendo: `grep "_dsInput="`.

- [ ] **Step 4: Verificar en navegador**

Recargar. En Deudas → Registrar → escribir un nombre → "+ Agregar nuevo..." → debe salir el modal con los 4 campos. Alta con ID vacío → toast de rechazo. Alta `ZZ-99` de prueba → aparece; repetir mismo ID en otra alta → rechazo. **Borrar la contraparte de prueba desde la consola:**
`contrapartes=contrapartes.filter(function(c){return c.clave!=='ZZ-99';}); saveContrapartes();` y en SB (MCP): `delete from contrapartes where clave='ZZ-99';`

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Alta y edicion de contrapartes con ID manual, modo y moneda"
```

---

### Task 4: Registrar — solo contrapartes del catálogo, cargo/abono, interés

**Files:**
- Modify: `index.html:1847-1873` (markup del formulario `dr-*`)
- Modify: `index.html:7571-7611` (dropdown de contraparte)
- Modify: `index.html:7632-7649` (`registrarDeudaManualForm`)
- Modify: `index.html:7513-7522` (`agregarDeudaManual` — parámetro interés)

**Interfaces:**
- Consumes: `getContraparte`, `cpModo`, `cpMoneda` (Task 2), alta modal (Task 3), `registrarPagoDeuda` (existente, línea 7503).
- Produces:
  - Markup: select `dr-mov` (`cargo`/`abono`), campo `dr-interes` (fila `dr-interes-row`), prefijo de moneda `dr-monto-prefix`.
  - `agregarDeudaManual(tipo, contraparte, monto, fecha, concepto, factura, interes)` — interés como 7º parámetro opcional.
  - `onDrContraparteElegida()` — ajusta visibilidad de interés y prefijo de moneda.

- [ ] **Step 1: Markup**

En línea 1850, después del bloque de Fecha y antes de "Tipo de deuda", insertar:

```html
      <div class="field" style="margin-bottom:12px"><label>Movimiento</label>
        <select id="dr-mov" onchange="onDrMovChange()" style="width:100%;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);font-size:14px;color:var(--text);outline:none">
          <option value="cargo">Cargo (nueva deuda)</option>
          <option value="abono">Abono / pago</option>
        </select></div>
```

En la línea 1861, cambiar el prefijo del monto para poder alternar moneda:

```html
        <div class="monto-wrap"><span class="monto-prefix" id="dr-monto-prefix">$</span><input type="number" id="dr-monto" placeholder="0.00" min="0" step="0.01"></div></div>
```

Después del bloque de Monto (línea 1861) insertar la fila de interés:

```html
      <div class="field" style="margin-bottom:12px;display:none" id="dr-interes-row"><label>Interés <span style="font-size:10px;color:var(--text3);text-transform:none;letter-spacing:0">(opcional, se suma al cargo)</span></label>
        <div class="monto-wrap"><span class="monto-prefix">$</span><input type="number" id="dr-interes" placeholder="0.00" min="0" step="0.01"></div></div>
```

Cambiar el `input` de contraparte (línea 1857): agregar `onchange="onDrContraparteElegida()"` al final de sus atributos, y el botón de submit (línea 1866) a texto neutro: `Registrar movimiento`.

- [ ] **Step 2: Dropdown desde el catálogo**

Reemplazar `drContraparteLista`, `drAgregarContraparteSiNuevo` y `renderDrContraparteDropdown` (7571-7608) por:

```js
function drContraparteLista(){
  var tipo=(((document.getElementById('dr-tipo')||{}).value||'cobrar')==='cobrar')?'cobrar':'pagar';
  return contrapartes.filter(function(c){return c.tipo===tipo;});
}
function renderDrContraparteDropdown(){
  var dd=document.getElementById('dr-contraparte-dropdown'); if(!dd) return;
  var lista=drContraparteLista();
  var q=(document.getElementById('dr-contraparte').value||'').toLowerCase();
  var filtered=lista.filter(function(c){return (c.nombre+' '+c.clave).toLowerCase().indexOf(q)>=0;});
  dd.innerHTML='';
  filtered.forEach(function(c){
    var row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px';
    row.onmouseenter=function(){this.style.background='var(--green-bg)';};
    row.onmouseleave=function(){this.style.background='';};
    var name=document.createElement('span');
    name.textContent=(c.clave?c.clave+' · ':'')+c.nombre; name.style.flex='1';
    name.onmousedown=function(e){e.preventDefault();document.getElementById('dr-contraparte').value=c.nombre;hideDrContraparteDropdown();onDrContraparteElegida();};
    row.appendChild(name); dd.appendChild(row);
  });
  var addRow=document.createElement('div');
  addRow.style.cssText='padding:10px 12px;cursor:pointer;font-size:13px;color:var(--green);font-weight:600';
  addRow.textContent='+ Nueva contraparte...';
  addRow.onmouseenter=function(){this.style.background='var(--green-bg)';};
  addRow.onmouseleave=function(){this.style.background='';};
  addRow.onmousedown=function(e){e.preventDefault();var txt=(document.getElementById('dr-contraparte')||{}).value||'';hideDrContraparteDropdown();abrirModalNuevoDrContraparte(txt.trim());};
  dd.appendChild(addRow);
  dd.style.display='block';
}
```

(El botón × de eliminar desaparece a propósito: las contrapartes con historial no deben poder borrarse desde un dropdown. `drAgregarContraparteSiNuevo` se elimina; grep sus llamadas — línea 7573 y 7642 — y quitarlas.)

- [ ] **Step 3: Visibilidad de interés y prefijo de moneda**

Agregar junto a `onDrTipoChange` (línea 7560):

```js
function onDrMovChange(){ onDrContraparteElegida(); }
function onDrContraparteElegida(){
  var tipo=(((document.getElementById('dr-tipo')||{}).value||'cobrar')==='cobrar')?'cobrar':'pagar';
  var nom=(document.getElementById('dr-contraparte').value||'').trim();
  var esCargo=((document.getElementById('dr-mov')||{}).value||'cargo')==='cargo';
  var row=document.getElementById('dr-interes-row');
  if(row) row.style.display=(esCargo && nom && cpModo(tipo,nom)==='corriente')?'':'none';
  var pref=document.getElementById('dr-monto-prefix');
  if(pref) pref.textContent=(nom && cpMoneda(tipo,nom)==='USD')?'US$':'$';
}
```

Y dentro de `onDrTipoChange` (que limpia la contraparte al cambiar tipo), agregar al final una llamada `onDrContraparteElegida();`.

- [ ] **Step 4: Guardado con validación de catálogo**

Agregar el parámetro `interes` a `agregarDeudaManual` (7513): firma `function agregarDeudaManual(tipo, contraparte, monto, fecha, concepto, factura, interes)` y en el objeto `d` cambiar `interes:0` por `interes:parseFloat(interes)||0`.

Reemplazar `registrarDeudaManualForm` (7632-7649) por:

```js
function registrarDeudaManualForm(){
  var tipo=(document.getElementById('dr-tipo')||{}).value||'cobrar';
  var contraparte=(document.getElementById('dr-contraparte').value||'').trim();
  var mov=(document.getElementById('dr-mov')||{}).value||'cargo';
  var monto=document.getElementById('dr-monto').value;
  var fecha=document.getElementById('dr-fecha').value;
  var concepto=(document.getElementById('dr-concepto').value||'').trim();
  var factura=(document.getElementById('dr-factura').value||'').trim();
  var interes=document.getElementById('dr-interes').value;
  if(!getContraparte(tipo, contraparte)){ showToast('Selecciona una contraparte del catálogo'); return; }
  if(!fecha){ showToast('Selecciona una fecha'); return; }
  var ok;
  if(mov==='abono'){
    ok=registrarPagoDeuda(tipo, contraparte, monto, fecha, concepto);
  } else {
    ok=agregarDeudaManual(tipo, contraparte, monto, fecha, concepto, factura, interes);
  }
  if(!ok) return;
  document.getElementById('dr-contraparte').value='';
  document.getElementById('dr-monto').value='';
  document.getElementById('dr-concepto').value='';
  document.getElementById('dr-factura').value='';
  document.getElementById('dr-interes').value='';
  onDrContraparteElegida();
  showToast(mov==='abono'?'Abono registrado':'Cargo registrado');
  setDeudaTab(tipo);
}
```

También en `abrirAgregarDeuda`/`confirmarDeudaManual` (7781-7797): el modal rápido de "Nueva cuenta" escribe nombres libres — reemplazar el `input` `dd-nom` por la misma validación: en `confirmarDeudaManual`, antes de llamar `agregarDeudaManual`, validar `if(!getContraparte(deudaTabSel, nom)){ showToast('Primero da de alta la contraparte en Registrar'); return; }`.

- [ ] **Step 5: Verificar en navegador**

Recargar. Registrar → intentar guardar con nombre libre no catalogado → toast de rechazo. Elegir contraparte existente modo fifo → fila interés oculta. (La visibilidad con modo corriente se prueba en Task 7, cuando existan cuentas corrientes reales.)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Registrar deudas solo con contrapartes del catalogo, cargo o abono"
```

---

### Task 5: `calcCorriente` y modal de estado de cuenta

**Files:**
- Modify: `index.html` — agregar `calcCorriente` y `calcSaldoCuenta` después de `calcContraparte` (línea ~7494); partir `abrirDeudaContraparte` (7694-7753) en dispatcher + dos renders.

**Interfaces:**
- Consumes: `calcContraparte`, `cpModo`, `cpMoneda`, `getContraparte`, `_ordenar`, `fmt`, `fmtFechaCorta`, `abrirEditarContraparte` (Task 3).
- Produces:
  - `calcCorriente(tipo, nombre)` → `{movs:[{fecha, esCargo, obj, concepto, ref, cargo, interes, nc, abono, saldoDespues}], saldoTotal, nMovs}` — `saldoTotal` con signo: >0 pendiente, <0 a favor de la contraparte.
  - `calcSaldoCuenta(tipo, nombre)` → `{saldo, aFavor, n, moneda, clave}` — despacha por modo. Para fifo: `saldo=r.saldoTotal, aFavor=r.saldoAFavor`. Para corriente: `saldo=max(0,st), aFavor=max(0,-st)`.
  - `fmtUSD(n)` → `"US$1,234.56"`.
  - `abrirDeudaContraparte(tipo, nombre)` — mismo nombre/firma (dispatcher).

- [ ] **Step 1: Cálculos**

Insertar después de `calcContraparte` (tras línea 7494):

```js
function calcCorriente(tipo, nombre){
  var movs=[];
  deudas.forEach(function(d){
    if(d.tipo!==tipo || d.contraparte!==nombre) return;
    var cargo=parseFloat(d.monto)||0, inte=parseFloat(d.interes)||0, nc=parseFloat(d.nc)||0;
    movs.push({fecha:d.fecha||'', esCargo:true, obj:d, concepto:d.desc||((d.items&&d.items[0])?d.items[0].concepto:'Cargo'),
      ref:d.folioExterno||d.factura||'', cargo:cargo, interes:inte, nc:nc, abono:0, saldoDespues:0});
  });
  pagosDeuda.forEach(function(p){
    if(p.tipo!==tipo || p.contraparte!==nombre) return;
    movs.push({fecha:p.fecha||'', esCargo:false, obj:p, concepto:p.desc||'Abono',
      ref:p.folio||'', cargo:0, interes:0, nc:0, abono:parseFloat(p.monto)||0, saldoDespues:0});
  });
  movs.sort(function(a,b){ var fa=a.fecha,fb=b.fecha; return fa<fb?-1:fa>fb?1:((a.obj.id||0)-(b.obj.id||0)); });
  var saldo=0;
  movs.forEach(function(m){ saldo+=(m.cargo+m.interes-m.nc)-m.abono; m.saldoDespues=saldo; });
  return {movs:movs, saldoTotal:saldo, nMovs:movs.length};
}
function calcSaldoCuenta(tipo, nombre){
  var c=getContraparte(tipo, nombre)||{};
  if(cpModo(tipo,nombre)==='corriente'){
    var r=calcCorriente(tipo, nombre);
    return {saldo:Math.max(0,r.saldoTotal), aFavor:Math.max(0,-r.saldoTotal), n:r.nMovs, moneda:c.moneda||'MXN', clave:c.clave||''};
  }
  var f=calcContraparte(tipo, nombre);
  var nP=pagosDeuda.filter(function(p){return p.tipo===tipo && p.contraparte===nombre;}).length;
  return {saldo:f.saldoTotal, aFavor:f.saldoAFavor, n:f.items.length+nP, moneda:c.moneda||'MXN', clave:c.clave||''};
}
function fmtUSD(n){ n=parseFloat(n)||0; return 'US$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtMon(n, moneda){ return moneda==='USD'?fmtUSD(n):fmt(n); }
```

- [ ] **Step 2: Dispatcher del modal**

Renombrar la función actual `abrirDeudaContraparte` (7694) a `renderModalFifo(tipo, nombre)` — quitándole las dos primeras líneas de asignación de `deudaModalTipo/Nombre` — y crear:

```js
function abrirDeudaContraparte(tipo, nombre){
  deudaModalTipo=tipo; deudaModalNombre=nombre;
  if(cpModo(tipo,nombre)==='corriente') renderModalCorriente(tipo,nombre);
  else renderModalFifo(tipo,nombre);
}
```

En `renderModalFifo`, cambiar el título (línea 7750) para incluir clave y botón de edición:

```js
  var cpc=getContraparte(tipo,nombre)||{};
  document.getElementById('mo-title').innerHTML=(cpc.clave?'<span style="font-family:var(--mono);font-size:13px;color:var(--text3)">'+cpc.clave+'</span> ':'')+nombre+
    '&nbsp;<span class="chip '+(tipo==='cobrar'?'jal':'com')+'">'+(tipo==='cobrar'?'Por cobrar':'Por pagar')+'</span>'+
    '&nbsp;<button onclick="abrirEditarContraparte(\''+tipo+'\',deudaModalNombre)" style="background:none;border:none;cursor:pointer;font-size:14px">⚙️</button>';
```

- [ ] **Step 3: Modal corriente (estado de cuenta)**

Agregar:

```js
function renderModalCorriente(tipo, nombre){
  var r=calcCorriente(tipo, nombre);
  var c=getContraparte(tipo,nombre)||{};
  var mon=c.moneda==='USD'?'USD':'MXN';
  var accent=(tipo==='cobrar')?'var(--green)':'var(--fram)';
  var st=r.saldoTotal;
  var lblSaldo=st>=0?((tipo==='cobrar')?'Nos debe':'Le debemos'):'A su favor';
  var html='';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
    '<div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">'+lblSaldo+'</div>'+
    '<div style="font-size:24px;font-weight:700;font-family:var(--mono);color:'+(st>=0?accent:'var(--jal)')+'">'+fmtMon(Math.abs(st),mon)+'</div>'+
    (mon==='USD'&&c.tipoCambio?'<div style="font-size:12px;color:var(--text3)">≈ '+fmt(Math.abs(st)*c.tipoCambio)+' MXN (TC '+c.tipoCambio+')</div>':'')+
    '</div>'+
    '<button class="btn-main" style="width:auto;padding:9px 14px;font-size:13px" onclick="abrirRegistrarPago()">'+((tipo==='cobrar')?'Registrar pago':'Registrar abono')+'</button>'+
    '</div>';
  var tieneInteres=r.movs.some(function(m){return m.interes>0;});
  html+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html+='<tr style="color:var(--text3);text-transform:uppercase;font-size:10px;letter-spacing:.04em"><th style="text-align:left;padding:6px 4px">Fecha</th><th style="text-align:left;padding:6px 4px">Concepto</th><th style="text-align:right;padding:6px 4px">Cargo</th>'+(tieneInteres?'<th style="text-align:right;padding:6px 4px">Interés</th>':'')+'<th style="text-align:right;padding:6px 4px">Abono</th><th style="text-align:right;padding:6px 4px">Saldo</th></tr>';
  r.movs.forEach(function(m){
    var esAuto=m.esCargo && m.obj.origen && m.obj.origen!=='manual';
    html+='<tr style="border-top:0.5px solid var(--border)">'+
      '<td style="padding:6px 4px;white-space:nowrap;color:var(--text3)">'+fmtFechaCorta(m.fecha)+'</td>'+
      '<td style="padding:6px 4px;color:var(--text2)">'+m.concepto+(m.ref?' <span style="color:var(--text3);font-family:var(--mono);font-size:10px">'+m.ref+'</span>':'')+(esAuto?' <span style="font-size:9px;color:var(--text3)">auto · envío</span>':'')+'</td>'+
      '<td style="padding:6px 4px;text-align:right;font-family:var(--mono);color:'+(m.esCargo?'var(--fram)':'var(--text3)')+'">'+(m.esCargo?fmtMon(m.cargo,mon):'')+'</td>'+
      (tieneInteres?'<td style="padding:6px 4px;text-align:right;font-family:var(--mono);color:var(--text3)">'+(m.interes>0?fmtMon(m.interes,mon):'')+'</td>':'')+
      '<td style="padding:6px 4px;text-align:right;font-family:var(--mono);color:'+(!m.esCargo?'var(--green)':'var(--text3)')+'">'+(!m.esCargo?fmtMon(m.abono,mon):'')+'</td>'+
      '<td style="padding:6px 4px;text-align:right;font-family:var(--mono);font-weight:600;color:var(--text)">'+fmtMon(m.saldoDespues,mon)+'</td>'+
      '</tr>';
  });
  html+='</table></div>';
  html+='<div style="font-size:11px;color:var(--text3);margin-top:10px">'+r.nMovs+' movimientos · toca ⚙️ para editar la cuenta</div>';
  var cpc=getContraparte(tipo,nombre)||{};
  document.getElementById('mo-title').innerHTML=(cpc.clave?'<span style="font-family:var(--mono);font-size:13px;color:var(--text3)">'+cpc.clave+'</span> ':'')+nombre+
    '&nbsp;<span class="chip '+(tipo==='cobrar'?'jal':'com')+'">'+(tipo==='cobrar'?'Por cobrar':'Por pagar')+'</span>'+
    '&nbsp;<button onclick="abrirEditarContraparte(\''+tipo+'\',deudaModalNombre)" style="background:none;border:none;cursor:pointer;font-size:14px">⚙️</button>';
  document.getElementById('mo-body').innerHTML=html;
  document.getElementById('overlay').classList.add('open');
}
```

Nota: NC no lleva columna propia (solo La Cañada la usa y es fifo); en corriente el neto ya la descuenta.

- [ ] **Step 4: Verificar en navegador**

Recargar, consola limpia. Abrir una cuenta existente (todas siguen fifo) → modal igual que antes pero con ⚙️. En consola: `calcCorriente('pagar','Nacho')` → objeto con `movs` ordenados y `saldoTotal` numérico.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Estado de cuenta con saldo corrido para cuentas de cargos y abonos"
```

---

### Task 6: Tarjetas — ID, insignia USD y sección Historial

**Files:**
- Modify: `index.html:7650-7692` (`renderDeudas`)

**Interfaces:**
- Consumes: `calcSaldoCuenta` (Task 5), `fmtMon`, `getContraparte`.

- [ ] **Step 1: Reescribir `renderDeudas`**

Reemplazar el cuerpo desde `var lista=...` (línea 7661) hasta el final de la función (línea 7692) por:

```js
  var lista=Object.keys(nombres).map(function(nom){
    var r=calcSaldoCuenta(tipo,nom);
    return {nombre:nom, saldo:r.saldo, aFavor:r.aFavor, n:r.n, moneda:r.moneda, clave:r.clave,
      tc:(getContraparte(tipo,nom)||{}).tipoCambio||0};
  }).sort(function(a,b){ return b.saldo-a.saldo; });
  var totalSaldo=lista.reduce(function(a,x){
    return a+(x.moneda==='USD'?x.saldo*(x.tc||0):x.saldo);
  },0);
  document.getElementById('deuda-total-lbl').textContent=(tipo==='cobrar')?'Total por cobrar':'Total por pagar';
  var tv=document.getElementById('deuda-total-val'); tv.textContent=fmt(totalSaldo); tv.style.color=accent;
  var abiertas=lista.filter(function(x){return x.saldo>0.5 || x.aFavor>0.5;});
  var saldadas=lista.filter(function(x){return x.saldo<=0.5 && x.aFavor<=0.5;});
  document.getElementById('deuda-count-val').textContent=abiertas.length;
  var cont=document.getElementById('deuda-list');
  if(!lista.length){
    cont.innerHTML='<div class="empty" style="padding:44px 20px;text-align:center"><div class="empty-icon" style="font-size:40px">📒</div><div class="empty-text" style="margin-top:10px">Sin cuentas '+(tipo==='cobrar'?'por cobrar':'por pagar')+' aún.</div></div>';
    return;
  }
  cont.innerHTML='';
  function pintaCard(x, esHist){
    var card=document.createElement('div');
    card.className='deuda-card';
    if(esHist) card.style.opacity='0.55';
    card.onclick=function(){ abrirDeudaContraparte(tipo, x.nombre); };
    var sub=x.n+' movimiento'+(x.n!==1?'s':'');
    if(x.aFavor>0.5) sub+=' · a su favor '+fmtMon(x.aFavor,x.moneda);
    var saldoTxt=fmtMon(x.saldo,x.moneda);
    var eqMxn=(x.moneda==='USD'&&x.tc&&x.saldo>0.5)?'<div style="font-size:10px;color:var(--text3);font-family:var(--mono)">≈ '+fmt(x.saldo*x.tc)+'</div>':'';
    card.innerHTML=
      '<div style="flex:1;min-width:0">'+
        '<div class="deuda-nom">'+(x.clave?'<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">'+x.clave+'</span> · ':'')+x.nombre+
          (x.moneda==='USD'?' <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:var(--green-bg);color:var(--green)">USD</span>':'')+'</div>'+
        '<div class="deuda-sub">'+sub+'</div>'+
      '</div>'+
      '<div style="text-align:right">'+
        '<div class="deuda-sub">saldo</div>'+
        '<div class="deuda-saldo" style="color:'+(esHist?'var(--text3)':accent)+'">'+saldoTxt+'</div>'+eqMxn+
      '</div>'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text3)" style="width:18px;height:18px;stroke-width:2;flex-shrink:0"><path d="m9 18 6-6-6-6"/></svg>';
    cont.appendChild(card);
  }
  abiertas.forEach(function(x){ pintaCard(x,false); });
  if(saldadas.length){
    var hdr=document.createElement('div');
    hdr.style.cssText='font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin:18px 0 8px';
    hdr.textContent='Historial (saldadas)';
    cont.appendChild(hdr);
    saldadas.forEach(function(x){ pintaCard(x,true); });
  }
```

- [ ] **Step 2: Verificar en navegador**

Recargar. Por pagar: cuentas con saldo arriba, las de $0 abajo en "Historial (saldadas)" en gris. KPI "Cuentas abiertas" ya no cuenta las saldadas.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Tarjetas de deudas con ID, insignia USD y seccion de saldadas"
```

---

### Task 7: Migración — colisiones, borrado e importación del Excel

**Files:**
- Create: `<scratchpad>/migracion_deudas.py` (fuera del repo)
- Supabase vía MCP. La app NO se toca.

**Interfaces:**
- Consumes: Excel `C:\Users\CN\Downloads\prueba deudas.xlsx`; columnas de Task 1.
- Produces: filas en `contrapartes`, `deudas`, `pagos_deuda`; cuentas viejas fusionadas/limpias.

**Configuración de cuentas** (contrapartes a upsertar; claves las da el usuario en Step 2):

| nombre | tipo | modo | moneda | pestaña(s) Excel |
|---|---|---|---|---|
| Arca | pagar | corriente | MXN | Arca |
| Asciende | pagar | corriente | MXN | Asciende |
| Clemente Duarte | cobrar | corriente | MXN | Clemente |
| Agroproductos los Blancas | pagar | fifo | MXN | Los Blancas |
| Carlos | pagar | corriente | MXN | Carlos |
| Nacho | pagar | corriente | MXN | Nacho |
| Bioterra | pagar | corriente | USD (tc 17.00) | Bioterra |
| La Cañada | pagar | fifo | MXN | La Cañada |

B&M NO se importa (la generan los envíos).

**Reglas de parseo por pestaña** (todas: saltar filas de encabezado/título/`Total`; fechas a ISO `YYYY-MM-DD`):

- *Corrientes (Asciende, Clemente, Carlos, Nacho):* columnas Fecha/Concepto/Cargo/Abono/Saldo. Fila con Cargo>0 → `deudas` `{monto:cargo, interes:0, desc:concepto}`. Fila con Abono>0 → `pagos_deuda` `{monto:abono, desc:concepto}`. En Clemente: los cargos son las ventas de camote, los abonos las transferencias; tipo `cobrar`, contraparte `Clemente Duarte`.
- *Arca:* columnas Fecha/Concepto/Nota/Descripción/Negocio/Cargo/Intereses/Abono/Saldo. Cargo → `deudas` `{monto:cargo, interes:intereses, desc:concepto+' — '+descripcion, factura:nota}`. Abono → `pagos_deuda`.
- *Bioterra:* usar columnas USD. Cargo → `deudas` `{monto:cargo_usd, moneda:'USD', tipo_cambio:17, desc:concepto}`. Abono → `pagos_deuda` `{moneda:'USD', tipo_cambio:17}`.
- *Los Blancas (fifo):* cada fila con Cargo>0 = una factura: `deudas` `{monto:cargo, items:[{concepto:concepto, monto:cargo}], desc:concepto}`. Abonos → `pagos_deuda` (calcContraparte los aplica FIFO al leer).
- *La Cañada (fifo):* columnas Fecha/Nota/Cargo/Intereses/NC/Abono/Total/Saldo/Pagado (ignorar `Pagado`). Fila con Cargo>0 = factura con `monto:cargo+intereses-nc`, `interes:intereses`, `nc:nc`, `factura:nota`, `items:[{concepto:'Compra nota '+nota, monto:cargo},{concepto:'Intereses', monto:intereses}]` más `{concepto:'Nota de crédito', monto:-nc}` si nc>0. Fila con Abono>0 → `pagos_deuda`.
- *IDs:* numéricos únicos `900000000000000 + i` (secuencial global) — fuera del rango de `Date.now()` (~1.78e12) y de ids de envío (`e.id*10+n` ~1.78e13).
- *Campos comunes en `deudas`:* `tipo`, `contraparte`, `fecha`, `ciclo:''`, `origen:'manual'`, `folio_externo:''`, `ref_id:null`, `ref_kind:'importado'`, `descripcion`, `factura`, `negocio:''`. En `pagos_deuda`: `folio:'IMP/'+contraparte+'/'+n` secuencial, `dirigido_a:''`.

- [ ] **Step 1: Detectar colisiones con envíos**

`execute_sql`:

```sql
select contraparte, tipo, count(*) filter (where ref_id is not null) as auto,
       count(*) filter (where ref_id is null) as manuales
from deudas
where contraparte in ('Arca','Asciende','Clemente','Clemente Duarte','Los Blancas',
  'Agroproductos los Blancas','Carlos','Nacho','Bioterra','La Cañada')
group by 1,2 order by 1;
```

Si alguna cuenta tiene filas `auto > 0`: DETENERSE y mostrar al usuario qué envíos las generaron (`select id, contraparte, fecha, monto, ref_id from deudas where ref_id is not null and contraparte in (...)`), y decidir juntos si esas filas se conservan (y las filas equivalentes del Excel se omiten) o se reasignan. No borrar nada hasta resolverlo.

- [ ] **Step 2: Pedir las claves al usuario**

Preguntar (AskUserQuestion o chat) el ID de cada una de las 8 cuentas de la tabla de configuración + B&M (9 claves, estilo iniciales, ej. `CD-01`). Verificar que no se repitan.

- [ ] **Step 3: Parsear el Excel y generar JSON**

Escribir `migracion_deudas.py` en el scratchpad implementando las reglas de arriba con openpyxl (`data_only=True`). El script imprime: número de cargos/abonos por cuenta, saldo calculado por cuenta (corriente: Σ(cargo+interés−nc)−Σabonos; fifo: Σmontos−Σabonos) y el saldo final leído de la columna Saldo del Excel, marcando `OK`/`DIFIERE` por cuenta. Guardar `deudas.json` y `pagos.json` en el scratchpad. **No seguir si alguna cuenta difiere** — investigar la fila culpable primero.

- [ ] **Step 4: Borrar los movimientos manuales viejos en Supabase**

Solo tras Step 1 resuelto y Step 3 cuadrado. `execute_sql` (en transacción):

```sql
begin;
delete from pagos_deuda where contraparte in ('Arca','Asciende','Clemente','Clemente Duarte',
  'Los Blancas','Agroproductos los Blancas','Carlos','Nacho','Bioterra','La Cañada');
delete from deudas where ref_id is null and contraparte in ('Arca','Asciende','Clemente','Clemente Duarte',
  'Los Blancas','Agroproductos los Blancas','Carlos','Nacho','Bioterra','La Cañada');
delete from contrapartes where nombre in ('Clemente','Los Blancas');
commit;
```

(El filtro `ref_id is null` protege lo generado por envíos; si Step 1 encontró filas auto en nombres que desaparecen — p.ej. 'Los Blancas' — su tratamiento ya quedó decidido ahí.)

- [ ] **Step 5: Insertar contrapartes y movimientos**

Upsert de las 8 contrapartes con sus claves, modos y monedas (tabla de configuración; Bioterra con `tipo_cambio:17`). Insertar `deudas.json` y `pagos.json` con `execute_sql` en lotes de ~50 filas (los `items` como jsonb).

- [ ] **Step 6: Verificación de cuadre en Supabase**

`execute_sql` por cuenta:

```sql
select d.contraparte,
  coalesce(sum(d.monto+d.interes-d.nc),0) - coalesce((select sum(p.monto) from pagos_deuda p
    where p.contraparte=d.contraparte and p.tipo=d.tipo),0) as saldo
from deudas d
where d.contraparte in ('Arca','Asciende','Clemente Duarte','Agroproductos los Blancas',
  'Carlos','Nacho','Bioterra','La Cañada')
group by d.contraparte, d.tipo order by 1;
```

Presentar al usuario la tabla: saldo en app vs. saldo final del Excel por cuenta. Todo debe cuadrar al centavo. Saldos esperados (del Excel, verificar contra lo que imprima el Step 3): Arca ≈ −252,078; Asciende −400,000; Nacho ≈ −257,217; Agroproductos los Blancas ≈ −135,038→pendiente confirmar contra pestaña; Carlos 0; Bioterra 0 (USD); La Cañada 0; Clemente Duarte ≈ 0.

*(Sin commit: no se tocó el repo. Conservar `migracion_deudas.py` en el scratchpad hasta terminar.)*

---

### Task 8: Verificación integral en la app y limpieza

**Files:** ninguno (verificación) + posible ajuste fino.

- [ ] **Step 1: Recarga completa**

Abrir `index.html` local con consola abierta. `Supabase conectado ✅`, sin errores. `cargarDesdeSB` reemplaza los arreglos locales con lo importado.

- [ ] **Step 2: Checklist funcional (spec §Pruebas)**

1. Por pagar: Arca, Asciende, Nacho arriba con saldos correctos; Carlos, Bioterra, La Cañada en "Historial (saldadas)".
2. Abrir Arca → estado de cuenta con columna Interés y saldo corrido; último saldo = saldo de la tarjeta.
3. Abrir La Cañada → vista fifo con facturas liquidadas, intereses y NC visibles en los items.
4. Abrir Bioterra → montos en US$, equivalente MXN con TC en la cabecera.
5. Por cobrar: Clemente Duarte con estado de cuenta; si el saldo va a su favor, la etiqueta lo dice.
6. Registrar un cargo de prueba en Nacho (corriente, con interés) → saldo sube cargo+interés; registrar un abono → baja. **Borrar ambos** (× del modal / consola + SB).
7. Registrar un abono de prueba en una cuenta fifo con saldo → se aplica a la factura más antigua. **Borrarlo.**
8. Editar ⚙️ el TC de Bioterra → el equivalente MXN cambia.
9. Crear un envío de camote de prueba NO — en su lugar verificar B&M intacta: abrir B&M en Por cobrar, mismos movimientos que antes de la migración.

- [ ] **Step 3: Actualizar CLAUDE.md**

En el mismo commit final: documentar en CLAUDE.md — columnas nuevas de `contrapartes` (`clave`, `modo`, `moneda`, `tipo_cambio`); el concepto de modos fifo/corriente y que el modo vive en la contraparte; que Registrar exige contraparte del catálogo; los helpers `calcCorriente`/`calcSaldoCuenta`/`getContraparte`; y que los números de línea del módulo de deudas se movieron.

- [ ] **Step 4: Commit final y push**

```bash
git add index.html CLAUDE.md
git commit -m "Documentar catalogo de contrapartes y modos de cuenta"
git push origin main
```

- [ ] **Step 5: Verificar producción**

Abrir https://golden-valley-farms.github.io/Finanzas/ (esperar el deploy de Pages), repetir los puntos 1-5 del checklist visualmente. Confirmar al usuario con la tabla de cuadre final.
