# Cosecha de Maíz — Plan de implementación

> **Para quien ejecute esto:** el spec está en
> `docs/superpowers/specs/2026-08-18-cosecha-maiz-registro-historial-design.md`.
> Los pasos usan casillas (`- [ ]`) para llevar el avance.

**Meta:** Convertir la pantalla vacía de Maíz en un módulo de Cosecha con sub-pestañas
Registro e Historial, que capture ventas de maíz a intermediarios con partidas por variedad.

**Arquitectura:** Todo vive en `index.html`. El markup nuevo reemplaza el cuerpo de
`#sc-maiz` (líneas 1922-1928); toda la lógica va en un bloque nuevo al final del `<script>`,
justo antes de `</script>`. Se editan además dos puntos de `cargarDesdeSB()` y se agrega
una llamada en `goSc()`. Dos tablas nuevas en Supabase.

**Stack:** HTML/CSS/JS ES5 puro en un solo archivo, Supabase JS v2 por CDN. Sin build,
sin npm, sin framework de pruebas.

## Restricciones globales

Copiadas del spec y de `CLAUDE.md`. Aplican a **todas** las tareas:

- **ES5 puro**: `var`, `function`, callbacks. Nada de `let`/`const`/arrow/clases/plantillas.
- **Toda función invocada desde un `onclick` inline debe ser global de nivel superior.**
  Nada de meterlas en un IIFE ni anidarlas.
- **Estilos con variables CSS** (`var(--green)`, `var(--surface2)`, `var(--radius)`,
  `var(--mono)`), nunca hex crudo.
- **Persistencia dual en los cuatro lugares**: objeto al guardar → `sbSaveX()` con mapeo a
  snake_case → `.map()` en `cargarDesdeSB()` de vuelta a camelCase → columna en Supabase.
- **Los `sbSave*`/`sbDelete*` salen temprano** con `if(!sbOnline||!sb) return;`.
- **El ciclo lo elige el usuario**: se guarda tal cual lo que traiga el select.
  `cicloFromFecha()` solo propone el default, nunca sobrescribe.
- **No leer `index.html` completo.** Ubicar con `grep` y leer solo la ventana necesaria.
- **No lanzar subagentes** en este proyecto.
- **Local y producción comparten la misma base de Supabase.** Al verificar en el navegador
  se puede mirar y calcular, pero **no completar guardados de prueba**: nada de llamar a
  `guardarMaiz()` con datos inventados.
- Constantes exactas: `MZ_VARIEDADES = ['Blanco','Antylope','Waxy']` y
  `MZ_PARCELAS = ['Cuata Grande','Cuata Chica','Mesita','Camino']`.
- Claves de localStorage exactas: `cc_maiz`, `cc_intermediarios`.
- Tablas de Supabase exactas: `maiz_registros`, `intermediarios`.

## Sobre las pruebas

Este repo no tiene tests, ni build, ni npm — así que no hay ciclo rojo/verde. El sustituto
es el mismo que usa el resto del proyecto: **levantar el servidor local, abrir la pantalla,
leer la consola y comprobar el render**. Cada tarea termina con una verificación concreta
en el navegador y un commit.

Para levantar el servidor, una sola vez al inicio de la sesión:

```bash
python -m http.server 8777
```

O con la configuración `gvf-local` de `.claude/launch.json` vía `preview_start`. En la
consola debe aparecer `Supabase conectado ✅` antes de dar por buena cualquier verificación.

## Estructura de archivos

| Archivo | Qué cambia |
|---|---|
| `index.html` líneas 1922-1928 | Se reemplaza el cuerpo vacío de `#sc-maiz` por el markup del módulo |
| `index.html` línea ~2077 y ~2211 | Dos bloques nuevos dentro de `cargarDesdeSB()` |
| `index.html` línea ~2913 (dentro de `goSc`) | Una línea que dispara `maizTab()` |
| `index.html` final del `<script>` | Bloque nuevo `// ==== MÓDULO MAÍZ ====` con toda la lógica |
| `CLAUDE.md` | Documentar el módulo, las claves y las tablas nuevas |
| Supabase | Migración con dos tablas nuevas |

Toda la lógica del módulo vive junta al final del script, no repartida por el archivo. Es
la única forma de mantenerlo legible en un archivo de 11 mil líneas, y el hoisting hace que
funcione igual estando al final.

---

### Tarea 1: Tablas en Supabase

**Archivos:** ninguno. Solo la base.

**Produce:** las tablas `maiz_registros` e `intermediarios`, que consumen las tareas 2 en
adelante.

- [ ] **Paso 1: Ubicar el proyecto**

Usar `mcp__99749bfd-fc48-43f3-8ae6-100cbedd8b4d__list_projects` y quedarse con el `id` del
proyecto de Golden Valley Farms. Confirmarlo con `list_tables` — debe traer `gastos`,
`envios`, `fram_registros`, etc.

- [ ] **Paso 2: Aplicar la migración**

Con `apply_migration`, nombre `maiz_registros_e_intermediarios`:

```sql
create table if not exists public.maiz_registros (
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
  ts bigint,
  created_at timestamptz default now()
);

create table if not exists public.intermediarios (
  nombre text primary key
);
```

`created_at` va porque `cargarDesdeSB()` ordena por esa columna en las demás tablas de
registros, y sin ella el `fetchAllRows('maiz_registros','created_at',false)` de la tarea 2
fallaría.

**RLS queda desactivado a propósito**, igual que las otras 12 tablas: con RLS activo y sin
políticas la app no podría leer ni escribir. No agregar `enable row level security`.

- [ ] **Paso 3: Verificar**

`list_tables` debe mostrar las dos tablas nuevas con sus columnas. Después, un
`execute_sql` con `select count(*) from public.maiz_registros;` debe devolver `0` sin error
de permisos — si diera error de RLS, la tabla se creó mal.

- [ ] **Paso 4: Sin commit**

No hay cambios en archivos. Se sigue a la tarea 2.

---

### Tarea 2: Estado y persistencia

**Archivos:**
- Modificar: `index.html` — bloque nuevo al final del `<script>`
- Modificar: `index.html` `cargarDesdeSB()` (~línea 2077 y ~línea 2211)

**Interfaces:**
- Consume: `sbOnline`, `sb`, `fetchAllRows(tabla, col, asc)` (línea ~2055), `showToast()`.
- Produce: los globales `maizRegistros`, `intermediarios`; y las funciones
  `saveMaiz()`, `saveIntermediarios()`, `agregarIntermediarioSiNuevo(nombre)`,
  `sbSaveMaizReg(reg)`, `sbDeleteMaizReg(id)`, `sbSaveIntermediario(nombre)`,
  `sbDeleteIntermediario(nombre)`. Las tareas 4, 6 y 7 dependen de estos nombres exactos.

- [ ] **Paso 1: Crear el bloque del módulo al final del script**

Localizar el final del archivo con `grep -n "</script>"`. Justo **antes** de esa etiqueta,
insertar:

```js
// ============================================================
// ==== MÓDULO MAÍZ ====
// Cosecha de maíz: registro de ventas a intermediarios e historial.
// Spec: docs/superpowers/specs/2026-08-18-cosecha-maiz-registro-historial-design.md
// ============================================================

var MZ_VARIEDADES = ['Blanco','Antylope','Waxy'];
var MZ_PARCELAS   = ['Cuata Grande','Cuata Chica','Mesita','Camino'];

var maizRegistros = [];
try{ var smz=localStorage.getItem('cc_maiz'); if(smz) maizRegistros=JSON.parse(smz); }catch(e){}
function saveMaiz(){ try{localStorage.setItem('cc_maiz',JSON.stringify(maizRegistros));}catch(e){} }

var intermediarios = [];
try{ var smi=localStorage.getItem('cc_intermediarios'); if(smi) intermediarios=JSON.parse(smi); }catch(e){}
function saveIntermediarios(){ try{localStorage.setItem('cc_intermediarios',JSON.stringify(intermediarios));}catch(e){} }

function agregarIntermediarioSiNuevo(nombre){
  if(!nombre) return;
  var nom=nombre.trim(); if(!nom) return;
  if(intermediarios.indexOf(nom)<0){
    intermediarios.push(nom);
    intermediarios.sort(function(a,b){return a.localeCompare(b,'es');});
    saveIntermediarios();
    sbSaveIntermediario(nom);
  }
}

async function sbSaveMaizReg(r){
  if(!sbOnline||!sb) return;
  await sb.from('maiz_registros').upsert({
    id:r.id, fecha:r.fechaVal||null, ciclo:r.ciclo||'',
    intermediario:r.intermediario||'', boleta:r.boleta||'',
    receptor_factura:r.receptorFactura||'', chofer:r.chofer||'',
    placa:r.placa||'', factura:r.factura||'',
    partidas:r.partidas||[],
    total_kg:r.totalKg||0, total_ton:r.totalTon||0, total:r.total||0,
    ts:r.ts||0
  });
}
async function sbDeleteMaizReg(id){
  if(!sbOnline||!sb){ showToast('Sin conexión a Supabase'); return; }
  var res = await sb.from('maiz_registros').delete().eq('id', id);
  if(res.error) showToast('Error al borrar en Supabase: '+res.error.message);
}
async function sbSaveIntermediario(nombre){
  if(!sbOnline||!sb) return;
  await sb.from('intermediarios').upsert({nombre:nombre},{onConflict:'nombre'});
}
async function sbDeleteIntermediario(nombre){
  if(!sbOnline||!sb) return;
  await sb.from('intermediarios').delete().eq('nombre', nombre);
}
```

- [ ] **Paso 2: Leer las dos tablas en `cargarDesdeSB()`**

En la lista de lecturas (línea ~2084, después de `var cpData = await fetchAllRows('contrapartes', ...)`)
agregar:

```js
  var mzData = await fetchAllRows('maiz_registros', 'created_at', false);
```

Y junto a los catálogos de una columna (línea ~2092, después de la línea de `trabajadores`):

```js
  var rInt = await sb.from('intermediarios').select('nombre').order('nombre');
```

- [ ] **Paso 3: Mapear de vuelta a camelCase**

Después del bloque `if(dData && dData.length){...}` (termina en la línea ~2194), agregar:

```js
  if(mzData && mzData.length){
    maizRegistros = mzData.map(function(m){
      return {id:m.id, fechaVal:m.fecha||'', ciclo:m.ciclo||'',
        intermediario:m.intermediario||'', boleta:m.boleta||'',
        receptorFactura:m.receptor_factura||'', chofer:m.chofer||'',
        placa:m.placa||'', factura:m.factura||'',
        partidas:m.partidas||[],
        totalKg:parseFloat(m.total_kg||0), totalTon:parseFloat(m.total_ton||0),
        total:parseFloat(m.total||0), ts:m.ts||0};
    });
    saveMaiz();
    if(typeof renderMaizHist==='function') renderMaizHist();
  }
```

Y junto a los demás catálogos (línea ~2216, después de la línea de `trabajadores`):

```js
  if(rInt && rInt.data){ intermediarios = rInt.data.map(function(i){return i.nombre;}); saveIntermediarios(); }
```

- [ ] **Paso 4: Verificar en el navegador**

Recargar la app local. En la consola:

1. Debe seguir apareciendo `Supabase conectado ✅` y **ningún** error nuevo.
2. Escribir `maizRegistros` → debe dar `[]`.
3. Escribir `intermediarios` → debe dar `[]`.
4. Escribir `typeof sbSaveMaizReg` → debe dar `"function"`.
5. Escribir `MZ_PARCELAS` → debe dar los cuatro nombres.

Si alguno da `undefined`, el bloque quedó dentro de otra función o después de `</script>`.

- [ ] **Paso 5: Commit**

```bash
git add index.html && git commit -m "Agregar estado y persistencia del modulo de maiz"
```

---

### Tarea 3: Pantalla y navegación

**Archivos:**
- Modificar: `index.html` líneas 1922-1928 (cuerpo de `#sc-maiz`)
- Modificar: `index.html` `goSc()` (~línea 2913)
- Modificar: `index.html` bloque del módulo maíz (final del script)

**Interfaces:**
- Consume: las clases `fram-subnav-wrap`, `fram-subnav`, `fram-subnav-sub`, `fram-tab`,
  `step-label`, `card`, `field-row`, `field`, `btn-main`, `empty` — todas ya existen en el
  CSS; no se agrega CSS nuevo.
- Produce: `maizTabSel`, `maizMainTab(main)`, `maizTab(t, forceNew)`, y los contenedores
  `#maiz-form-sec` y `#maiz-hist-sec` que llenan las tareas 4-7.

- [ ] **Paso 1: Reemplazar el cuerpo de `#sc-maiz`**

Sustituir las líneas 1922-1928 completas (el `.empty` de "módulo en blanco") por:

```html
  <div id="sc-maiz" class="screen">
    <div class="fram-subnav-wrap">
      <div class="fram-subnav" id="maiz-maintabs">
        <button class="fram-tab active" id="mzt-cosecha" onclick="maizMainTab('cosecha')">Cosecha</button>
      </div>
    </div>
    <div class="fram-subnav-wrap">
      <div class="fram-subnav fram-subnav-sub" id="maiz-subtabs-cosecha">
        <button class="fram-tab active" id="mst-cosecha-reg" onclick="maizTab('nuevo', true)">Registro</button>
        <button class="fram-tab" id="mst-cosecha-hist" onclick="maizTab('hist')">Historial</button>
      </div>
    </div>

    <!-- FORMULARIO DE REGISTRO -->
    <div id="maiz-form-sec"></div>

    <!-- HISTORIAL -->
    <div id="maiz-hist-sec" style="display:none">
      <div id="maiz-hist-list"><div class="empty"><div class="empty-icon">🌽</div><div class="empty-text">Sin registros de maíz aún.</div></div></div>
    </div>
  </div>
```

`#maiz-form-sec` queda vacío en esta tarea; lo llena la tarea 4.

- [ ] **Paso 2: Agregar el router al bloque del módulo**

Al final del bloque `// ==== MÓDULO MAÍZ ====`, agregar:

```js
// ---- Navegación ----
var maizTabSel = 'nuevo';

function maizMainTab(main){
  document.getElementById('mzt-cosecha').classList.toggle('active', main==='cosecha');
  document.getElementById('maiz-subtabs-cosecha').style.display = main==='cosecha'?'flex':'none';
  if(main==='cosecha') maizTab('nuevo', true);
}

function maizTab(t, forceNew){
  maizTabSel = t;
  document.getElementById('mst-cosecha-reg').classList.toggle('active', t==='nuevo');
  document.getElementById('mst-cosecha-hist').classList.toggle('active', t==='hist');
  document.getElementById('maiz-form-sec').style.display = t==='nuevo'?'block':'none';
  document.getElementById('maiz-hist-sec').style.display = t==='hist'?'block':'none';
  if(t==='nuevo' && (!mzEditId || forceNew)){ mzEditId=null; initMaizForm(); }
  if(t==='hist') renderMaizHist();
}
```

`mzEditId`, `initMaizForm()` y `renderMaizHist()` los definen las tareas 6 y 7. Por
hoisting de `var`/`function` esto no truena mientras no se llame antes de tiempo — pero
para que la verificación de esta tarea pase, agregar **ya** los tres stubs mínimos al final
del bloque, que las tareas siguientes reemplazan:

```js
var mzEditId = null;
function initMaizForm(reg){}
function renderMaizHist(){}
```

- [ ] **Paso 3: Enganchar en `goSc()`**

En `goSc()` (línea ~2888), junto a las líneas que despachan el render de cada pantalla
(`if(s==='his') renderHis();` etc., línea ~2912), agregar:

```js
  if(s==='maiz') maizTab(maizTabSel);
```

No tocar nada más de `goSc`: `sc-maiz` ya está en el arreglo de pantallas de la línea 2889
y ya cuenta como pantalla de cosechas en `esCosecha`.

- [ ] **Paso 4: Verificar en el navegador**

Recargar y navegar a Cosechas → 🌽 Maíz:

1. Se ve la pestaña **Cosecha** arriba y **Registro / Historial** debajo, con el mismo
   aspecto que las de Frambuesa.
2. Al hacer clic en **Historial** se ve el `.empty` con el 🌽 y el botón queda marcado.
3. Al volver a **Registro** el área queda en blanco (correcto en esta tarea) y el botón
   se marca.
4. Cambiar a otra pantalla y regresar a Maíz: debe volver a la sub-pestaña donde estaba.
5. La consola no reporta errores.

- [ ] **Paso 5: Commit**

```bash
git add index.html && git commit -m "Agregar pantalla de maiz con pestanas Registro e Historial"
```

---

### Tarea 4: Formulario — encabezado y dropdown de intermediarios

**Archivos:**
- Modificar: `index.html` `#maiz-form-sec` (markup)
- Modificar: `index.html` bloque del módulo maíz

**Interfaces:**
- Consume: `intermediarios`, `saveIntermediarios()`, `agregarIntermediarioSiNuevo()`,
  `sbDeleteIntermediario()` (tarea 2); `CICLOS`, `cicloFromFecha()`, `showToast()`,
  `closeModal()`, `#overlay`, `#mo-title`, `#mo-body`.
- Produce: los campos `#mz-fecha`, `#mz-ciclo`, `#mz-intermediario`, `#mz-boleta`,
  `#mz-receptor`, `#mz-chofer`, `#mz-placa`, `#mz-factura`, que lee `guardarMaiz()` en la
  tarea 6; y `renderMzIntermediarioDropdown()`.

- [ ] **Paso 1: Markup del encabezado**

Reemplazar `<div id="maiz-form-sec"></div>` por:

```html
    <div id="maiz-form-sec">
      <div class="step-label">1. Datos del envío</div>
      <div class="card" style="margin-bottom:12px">
        <div class="field-row">
          <div class="field">
            <label>Fecha</label>
            <input type="date" id="mz-fecha" style="width:100%">
          </div>
          <div class="field">
            <label>Ciclo</label>
            <select id="mz-ciclo" style="width:100%"></select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Intermediario</label>
            <div style="position:relative">
              <input type="text" id="mz-intermediario" placeholder="Nombre del intermediario" autocomplete="off" style="width:100%" oninput="onMzIntermediarioInput()" onclick="showMzIntermediarioDropdown()" onblur="setTimeout(hideMzIntermediarioDropdown,150)">
              <div id="mz-intermediario-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);z-index:100;max-height:200px;overflow-y:auto;margin-top:2px;box-shadow:0 4px 12px rgba(0,0,0,0.3)"></div>
            </div>
          </div>
          <div class="field">
            <label>N° de Boleta</label>
            <input type="text" id="mz-boleta" placeholder="0000">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Receptor Factura</label>
            <input type="text" id="mz-receptor" placeholder="Razón social">
          </div>
          <div class="field">
            <label>Chofer</label>
            <input type="text" id="mz-chofer" placeholder="Nombre">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>N° de Placa</label>
            <input type="text" id="mz-placa" placeholder="ABC-123">
          </div>
          <div class="field">
            <label>Factura</label>
            <input type="text" id="mz-factura" placeholder="F-000">
          </div>
        </div>
      </div>
    </div>
```

- [ ] **Paso 2: Poblar el select de ciclo**

En el bloque del módulo, agregar:

```js
// ---- Formulario: encabezado ----
function initMzCicloSelect(){
  var s=document.getElementById('mz-ciclo'); if(!s || s.options.length) return;
  CICLOS.forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; s.appendChild(o); });
}
```

Se llama desde `initMaizForm()` en la tarea 6. El `if(s.options.length) return;` evita
duplicar las opciones cada vez que se reabre el formulario.

- [ ] **Paso 3: Dropdown de intermediarios**

Clon del de proveedores comer (`renderProveedorDropdown`, línea ~9459), con su catálogo:

```js
// ---- Dropdown de intermediarios ----
function renderMzIntermediarioDropdown(){
  var dd=document.getElementById('mz-intermediario-dropdown'); if(!dd) return;
  var inp=document.getElementById('mz-intermediario');
  var q=(inp.value||'').toLowerCase();
  var filtered=intermediarios.filter(function(n){return n.toLowerCase().indexOf(q)>=0;});
  dd.innerHTML='';
  filtered.forEach(function(n){
    var row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px';
    row.onmouseenter=function(){this.style.background='var(--green-bg)';};
    row.onmouseleave=function(){this.style.background='';};
    var name=document.createElement('span'); name.textContent=n; name.style.flex='1';
    name.onmousedown=function(e){e.preventDefault();inp.value=n;hideMzIntermediarioDropdown();};
    var btn=document.createElement('button');
    btn.textContent='×'; btn.title='Eliminar';
    btn.style.cssText='background:none;border:none;color:var(--text3);font-size:17px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0';
    btn.onmousedown=function(e){e.preventDefault();e.stopPropagation();
      intermediarios=intermediarios.filter(function(x){return x!==n;});
      saveIntermediarios(); sbDeleteIntermediario(n);
      renderMzIntermediarioDropdown();
      if(inp.value===n) inp.value='';
      showToast('Intermediario eliminado');};
    row.appendChild(name); row.appendChild(btn); dd.appendChild(row);
  });
  var addRow=document.createElement('div');
  addRow.style.cssText='padding:10px 12px;cursor:pointer;font-size:13px;color:var(--green);font-weight:600';
  addRow.textContent='+ Agregar nuevo...';
  addRow.onmouseenter=function(){this.style.background='var(--green-bg)';};
  addRow.onmouseleave=function(){this.style.background='';};
  addRow.onmousedown=function(e){e.preventDefault();hideMzIntermediarioDropdown();abrirModalNuevoIntermediario();};
  dd.appendChild(addRow);
  dd.style.display='block';
}
function showMzIntermediarioDropdown(){renderMzIntermediarioDropdown();}
function hideMzIntermediarioDropdown(){var dd=document.getElementById('mz-intermediario-dropdown');if(dd)dd.style.display='none';}
function onMzIntermediarioInput(){renderMzIntermediarioDropdown();}

function abrirModalNuevoIntermediario(){
  document.getElementById('mo-title').innerHTML = '🚚 Nuevo intermediario';
  document.getElementById('mo-body').innerHTML =
    '<div class="field" style="margin-bottom:14px"><label>Nombre del intermediario</label>'+
    '<input type="text" id="nuevo-intermediario-input" placeholder="Nombre" style="width:100%" onkeydown="if(event.key===\'Enter\'){event.preventDefault();confirmarNuevoIntermediario();}"></div>'+
    '<button class="btn-main" onclick="confirmarNuevoIntermediario()">Agregar intermediario</button>';
  document.getElementById('overlay').classList.add('open');
  setTimeout(function(){ var i=document.getElementById('nuevo-intermediario-input'); if(i) i.focus(); }, 100);
}
function confirmarNuevoIntermediario(){
  var inp = document.getElementById('nuevo-intermediario-input');
  var nom = inp.value.trim();
  if(!nom){ showToast('Escribe un nombre'); return; }
  agregarIntermediarioSiNuevo(nom);
  closeModal();
  var target=document.getElementById('mz-intermediario');
  if(target) target.value = nom;
  showToast('Intermediario agregado');
}
```

Nota: los handlers usan `onmousedown` con `preventDefault()` a propósito. Con `onclick`, el
`onblur` del input cierra el dropdown antes de que el clic llegue a la fila.

- [ ] **Paso 4: Verificar en el navegador**

En Maíz → Registro:

1. Se ven los ocho campos en cuatro filas de dos.
2. El select de Ciclo trae las opciones de `CICLOS` — para probarlo sin abrir aún
   `initMaizForm()`, llamar `initMzCicloSelect()` desde la consola.
3. Al hacer clic en Intermediario abre el dropdown con solo la fila **"+ Agregar nuevo..."**
   (el catálogo está vacío).
4. Agregar uno de prueba desde el modal. **Esto sí escribe en la base real**: agregar uno
   con nombre reconocible, verificar que aparece en la lista con su **×**, que al elegirlo
   se pone en el input, y **borrarlo con la ×** antes de terminar. La base debe quedar como
   estaba.
5. Confirmar en Supabase con `execute_sql`: `select * from public.intermediarios;` debe
   devolver 0 filas al final.

- [ ] **Paso 5: Commit**

```bash
git add index.html && git commit -m "Agregar encabezado y catalogo de intermediarios en maiz"
```

---

### Tarea 5: Partidas por variedad y resumen

**Archivos:**
- Modificar: `index.html` `#maiz-form-sec` (markup, después de la tarjeta del encabezado)
- Modificar: `index.html` bloque del módulo maíz

**Interfaces:**
- Consume: `MZ_VARIEDADES`, `MZ_PARCELAS` (tarea 2); `fmt()`, `showToast()`; las clases
  `partida-card`, `monto-wrap`, `monto-prefix`.
- Produce: `mzPartidasTemp`, `renderMzPartidas()`, `addMzPartidaDesdeSelect()`,
  `removeMzPartida(idx)`, `mzAutoCalc(idx)`, `recalcMzResumen()`, `mzCalcTotalPartida(p)`.
  La tarea 6 lee `mzPartidasTemp` para guardar.

- [ ] **Paso 1: Markup de partidas y resumen**

Dentro de `#maiz-form-sec`, **después** del `</div>` que cierra la `.card` del encabezado y
antes del `</div>` que cierra `#maiz-form-sec`:

```html
      <div class="step-label">2. Partidas por variedad</div>
      <div id="mz-partidas"></div>
      <div class="card" style="margin-bottom:12px" id="mz-add-variedad-wrap">
        <div style="display:flex;gap:8px;align-items:flex-end">
          <div class="field" style="flex:1;margin:0">
            <label>Variedad</label>
            <select id="mz-var-select" style="width:100%"></select>
          </div>
          <button class="btn-main" style="width:auto;padding:10px 16px;margin:0;flex-shrink:0" onclick="addMzPartidaDesdeSelect()">+ Agregar</button>
        </div>
      </div>

      <div class="step-label">3. Resumen</div>
      <div class="card" style="margin-bottom:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Total kg</div>
            <div id="mz-resumen-kg" style="font-size:15px;font-weight:600;font-family:var(--mono);color:var(--text)">0</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Total toneladas</div>
            <div id="mz-resumen-ton" style="font-size:15px;font-weight:600;font-family:var(--mono);color:var(--text)">0.000</div>
          </div>
        </div>
        <div style="padding:12px;background:var(--green-bg);border-radius:var(--radius);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;font-weight:600;color:var(--green);text-transform:uppercase;letter-spacing:.04em">Total</span>
          <span id="mz-resumen-total" style="font-size:17px;font-weight:700;font-family:var(--mono);color:var(--green)">$0</span>
        </div>
      </div>

      <button class="btn-main" id="mz-guardar-btn" onclick="guardarMaiz()">Guardar registro</button>
```

- [ ] **Paso 2: Estado y render de partidas**

En el bloque del módulo:

```js
// ---- Partidas por variedad ----
var mzPartidasTemp = [];

function updateMzVarSelect(){
  var sel=document.getElementById('mz-var-select'); if(!sel) return;
  sel.innerHTML='<option value="">— Selecciona variedad —</option>';
  MZ_VARIEDADES.forEach(function(v){
    var o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o);
  });
}

function addMzPartidaDesdeSelect(){
  var sel=document.getElementById('mz-var-select');
  var v=sel?sel.value:'';
  if(!v){ showToast('Selecciona una variedad'); return; }
  mzPartidasTemp.push({variedad:v, parcela:'', hectareas:'', pesoNeto:'', toneladas:'', precio:''});
  if(sel) sel.value='';
  renderMzPartidas();
}

function removeMzPartida(idx){
  mzPartidasTemp.splice(idx,1);
  renderMzPartidas();
}

function renderMzPartidas(){
  var cont=document.getElementById('mz-partidas'); if(!cont) return;
  cont.innerHTML='';
  mzPartidasTemp.forEach(function(p,idx){
    var d=document.createElement('div'); d.className='partida-card';
    var parcOpts='<option value="">—</option>';
    MZ_PARCELAS.forEach(function(pc){
      parcOpts+='<option value="'+pc+'"'+(p.parcela===pc?' selected':'')+'>'+pc+'</option>';
    });
    d.innerHTML=
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">'+
        '<span style="font-size:13px;font-weight:600;color:var(--green)">'+p.variedad+'</span>'+
        '<button onclick="removeMzPartida('+idx+')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:18px;line-height:1;padding:2px 6px;border-radius:6px" title="Quitar variedad">×</button>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">'+
        '<div><label>Parcela</label><select onchange="mzPartidasTemp['+idx+'].parcela=this.value">'+parcOpts+'</select></div>'+
        '<div><label>Hectáreas</label><input type="number" placeholder="0.00" min="0" step="0.01" value="'+p.hectareas+'" onchange="mzPartidasTemp['+idx+'].hectareas=this.value"></div>'+
        '<div><label>Peso Neto (kg)</label><input type="number" placeholder="0" min="0" value="'+p.pesoNeto+'" onchange="mzPartidasTemp['+idx+'].pesoNeto=this.value;mzAutoCalc('+idx+')"></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'+
        '<div><label>Toneladas</label><input type="number" id="mztn-'+idx+'" placeholder="0.000" min="0" step="0.001" value="'+p.toneladas+'" readonly style="background:var(--surface2);color:var(--text3)"></div>'+
        '<div><label>Precio x kg</label><div class="monto-wrap"><span class="monto-prefix">$</span><input type="number" placeholder="0" min="0" step="0.01" value="'+p.precio+'" style="padding-left:24px" onchange="mzPartidasTemp['+idx+'].precio=this.value;mzAutoCalc('+idx+')"></div></div>'+
        '<div><label>Total</label><div id="mztot-'+idx+'" style="padding:10px 12px;background:var(--green-bg);border-radius:var(--radius);font-size:13px;font-weight:600;color:var(--green);font-family:var(--mono)">'+mzCalcTotalPartida(p)+'</div></div>'+
      '</div>';
    cont.appendChild(d);
  });
  updateMzVarSelect();
  recalcMzResumen();
}

function mzCalcTotalPartida(p){
  var kg=parseFloat(p.pesoNeto)||0;
  var precio=parseFloat(p.precio)||0;
  if(!kg||!precio) return '$0';
  return fmt(kg*precio);
}

function mzAutoCalc(idx){
  var p=mzPartidasTemp[idx]; if(!p) return;
  var kg=parseFloat(p.pesoNeto)||0;
  p.toneladas = kg>0 ? (kg/1000).toFixed(3) : '';
  var t=document.getElementById('mztn-'+idx); if(t) t.value=p.toneladas;
  var el=document.getElementById('mztot-'+idx); if(el) el.textContent=mzCalcTotalPartida(p);
  recalcMzResumen();
}

function recalcMzResumen(){
  var kg=0, total=0;
  mzPartidasTemp.forEach(function(p){
    var k=parseFloat(p.pesoNeto)||0;
    kg+=k;
    total+=k*(parseFloat(p.precio)||0);
  });
  var eK=document.getElementById('mz-resumen-kg');
  var eT=document.getElementById('mz-resumen-ton');
  var eTot=document.getElementById('mz-resumen-total');
  if(eK) eK.textContent = kg.toLocaleString('es-MX');
  if(eT) eT.textContent = (kg/1000).toFixed(3);
  if(eTot) eTot.textContent = fmt(total);
}
```

Los `onchange` mutan `mzPartidasTemp` y solo actualizan los tres nodos calculados — **no**
llaman a `renderMzPartidas()`. Repintar la lista en cada cambio le quitaría el foco al
input, la misma trampa documentada en `dgSetKg()` y `recalcFramFin()`.

- [ ] **Paso 3: Verificar en el navegador**

Recargar y en Maíz → Registro, con la consola abierta ejecutar `updateMzVarSelect()` y
`renderMzPartidas()` una vez (todavía no hay `initMaizForm()` real):

1. El select trae **Blanco, Antylope y Waxy**.
2. Agregar una variedad: aparece la tarjeta con Parcela (los cuatro nombres), Hectáreas,
   Peso Neto, Toneladas (gris, solo lectura), Precio x kg con `$` y Total.
3. Escribir `24000` en Peso Neto y salir del campo → Toneladas muestra `24.000`.
4. Escribir `6.5` en Precio → Total muestra `$156,000` y el resumen muestra
   `24,000` kg / `24.000` t / `$156,000`.
5. Agregar una segunda variedad y comprobar que el resumen suma las dos.
6. Escribir dentro de un input sin que pierda el foco entre teclas.
7. La **×** de la tarjeta la quita y el resumen se recalcula.
8. La consola no reporta errores.

Nada de esto llama a `guardarMaiz()`, así que no escribe en la base.

- [ ] **Paso 4: Commit**

```bash
git add index.html && git commit -m "Agregar partidas por variedad y resumen en maiz"
```

---

### Tarea 6: Guardar, inicializar y limpiar

**Archivos:**
- Modificar: `index.html` bloque del módulo maíz (sustituye los stubs de la tarea 3)

**Interfaces:**
- Consume: los ocho campos de la tarea 4, `mzPartidasTemp` y `renderMzPartidas()` (tarea 5),
  `maizRegistros`, `saveMaiz()`, `sbSaveMaizReg()`, `agregarIntermediarioSiNuevo()`
  (tarea 2), `cicloFromFecha()`, `showToast()`.
- Produce: `mzEditId`, `initMaizForm(reg)`, `resetMaizForm()`, `guardarMaiz()`,
  `mzTotalesDesdeTemp()`. La tarea 7 llama a `initMaizForm(reg)` para editar.

- [ ] **Paso 1: Borrar los stubs**

Quitar del bloque las dos líneas stub de la tarea 3:

```js
function initMaizForm(reg){}
```

`var mzEditId = null;` se **conserva** y `function renderMaizHist(){}` se conserva hasta la
tarea 7.

- [ ] **Paso 2: Init, reset y totales**

```js
// ---- Guardar / inicializar ----
function mzTotalesDesdeTemp(){
  var kg=0, total=0;
  mzPartidasTemp.forEach(function(p){
    var k=parseFloat(p.pesoNeto)||0;
    kg+=k;
    total+=k*(parseFloat(p.precio)||0);
  });
  return {kg:kg, ton:kg/1000, total:total};
}

function initMaizForm(reg){
  initMzCicloSelect();
  var hoy=new Date().toISOString().slice(0,10);
  var f=document.getElementById('mz-fecha');
  var c=document.getElementById('mz-ciclo');
  var btn=document.getElementById('mz-guardar-btn');
  if(reg){
    mzEditId = reg.id;
    f.value = reg.fechaVal||hoy;
    c.value = reg.ciclo||cicloFromFecha(f.value);
    document.getElementById('mz-intermediario').value = reg.intermediario||'';
    document.getElementById('mz-boleta').value = reg.boleta||'';
    document.getElementById('mz-receptor').value = reg.receptorFactura||'';
    document.getElementById('mz-chofer').value = reg.chofer||'';
    document.getElementById('mz-placa').value = reg.placa||'';
    document.getElementById('mz-factura').value = reg.factura||'';
    mzPartidasTemp = (reg.partidas||[]).map(function(p){
      return {variedad:p.variedad||'', parcela:p.parcela||'',
        hectareas:p.hectareas!=null?String(p.hectareas):'',
        pesoNeto:p.pesoNeto!=null?String(p.pesoNeto):'',
        toneladas:p.toneladas!=null?String(p.toneladas):'',
        precio:p.precio!=null?String(p.precio):''};
    });
    if(btn) btn.textContent='Actualizar registro';
  } else {
    mzEditId = null;
    f.value = hoy;
    c.value = cicloFromFecha(hoy);
    ['mz-intermediario','mz-boleta','mz-receptor','mz-chofer','mz-placa','mz-factura'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.value='';
    });
    mzPartidasTemp = [];
    if(btn) btn.textContent='Guardar registro';
  }
  renderMzPartidas();
}

function resetMaizForm(){ initMaizForm(null); }
```

`initMaizForm()` propone el ciclo con `cicloFromFecha()` solo como default; al editar
respeta el ciclo guardado. No hay ningún punto donde se recalcule el ciclo a partir de la
fecha.

- [ ] **Paso 3: Guardar**

```js
function guardarMaiz(){
  var fechaVal = document.getElementById('mz-fecha').value;
  var intermediario = document.getElementById('mz-intermediario').value.trim();
  if(!fechaVal){ showToast('Falta la fecha'); return; }
  if(!intermediario){ showToast('Falta el intermediario'); return; }
  var validas = mzPartidasTemp.filter(function(p){
    return (parseFloat(p.pesoNeto)||0)>0 && (parseFloat(p.precio)||0)>0;
  });
  if(!validas.length){ showToast('Agrega al menos una variedad con peso y precio'); return; }

  agregarIntermediarioSiNuevo(intermediario);

  var partidas = validas.map(function(p){
    var kg=parseFloat(p.pesoNeto)||0;
    return {variedad:p.variedad, parcela:p.parcela||'',
      hectareas:parseFloat(p.hectareas)||0,
      pesoNeto:kg, toneladas:kg/1000,
      precio:parseFloat(p.precio)||0};
  });
  var tot = mzTotalesDesdeTemp();

  var reg = {
    id: mzEditId || Date.now(),
    fechaVal: fechaVal,
    ciclo: document.getElementById('mz-ciclo').value,
    intermediario: intermediario,
    boleta: document.getElementById('mz-boleta').value.trim(),
    receptorFactura: document.getElementById('mz-receptor').value.trim(),
    chofer: document.getElementById('mz-chofer').value.trim(),
    placa: document.getElementById('mz-placa').value.trim(),
    factura: document.getElementById('mz-factura').value.trim(),
    partidas: partidas,
    totalKg: tot.kg, totalTon: tot.ton, total: tot.total,
    ts: Date.now()
  };

  if(mzEditId){
    var i = maizRegistros.findIndex(function(r){return r.id===mzEditId;});
    if(i>=0) maizRegistros[i]=reg; else maizRegistros.unshift(reg);
  } else {
    maizRegistros.unshift(reg);
  }
  saveMaiz();
  sbSaveMaizReg(reg);
  var eraEdicion = !!mzEditId;
  resetMaizForm();
  showToast(eraEdicion ? 'Registro actualizado' : 'Registro guardado');
}
```

Ojo: `mzTotalesDesdeTemp()` suma sobre `mzPartidasTemp` completo, incluyendo partidas sin
peso o sin precio — pero esas aportan cero al total, así que el resultado coincide con la
suma de `validas`. Las partidas incompletas simplemente no se guardan.

- [ ] **Paso 4: Verificar en el navegador**

Recargar y en Maíz → Registro:

1. El formulario abre solo, con la fecha de hoy y el ciclo propuesto. Ya no hace falta
   llamar nada desde la consola.
2. Cambiar de sub-pestaña a Historial y volver a Registro: el formulario se reinicia.
3. Probar las validaciones **sin llenar nada**: el botón Guardar debe mostrar el toast
   "Falta la fecha" / "Falta el intermediario" / "Agrega al menos una variedad…" según
   corresponda. Estas rutas no escriben nada.
4. **No completar un guardado de prueba.** Para revisar el objeto que se armaría, llenar
   el formulario y ejecutar en consola el cuerpo de `guardarMaiz()` hasta el `reg`, o más
   simple: llenar el formulario y verificar `mzPartidasTemp` en consola.

- [ ] **Paso 5: Commit**

```bash
git add index.html && git commit -m "Agregar guardado y edicion del registro de maiz"
```

---

### Tarea 7: Historial

**Archivos:**
- Modificar: `index.html` bloque del módulo maíz (sustituye el stub de `renderMaizHist`)

**Interfaces:**
- Consume: `maizRegistros`, `saveMaiz()`, `sbDeleteMaizReg()` (tarea 2),
  `initMaizForm(reg)` (tarea 6), `maizTab()` (tarea 3), `fmt()`, `showToast()`.
- Produce: `renderMaizHist()`, `editarMaizReg(id)`, `confirmDelMaiz(id)`.

- [ ] **Paso 1: Borrar el stub**

Quitar `function renderMaizHist(){}` del bloque.

- [ ] **Paso 2: Render del historial**

```js
// ---- Historial ----
function mzFechaLbl(fv){
  if(!fv) return '';
  return new Date(fv+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
}

function renderMaizHist(){
  var cont=document.getElementById('maiz-hist-list'); if(!cont) return;
  var lista = maizRegistros.slice().sort(function(a,b){
    return (b.fechaVal||'').localeCompare(a.fechaVal||'');
  });
  if(!lista.length){
    cont.innerHTML='<div class="empty"><div class="empty-icon">🌽</div><div class="empty-text">Sin registros de maíz aún.</div></div>';
    return;
  }
  var h='';
  lista.forEach(function(r){
    var parts='';
    (r.partidas||[]).forEach(function(p){
      parts+='<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--text2);padding:3px 0">'+
        '<span>'+p.variedad+(p.parcela?' · '+p.parcela:'')+'</span>'+
        '<span style="font-family:var(--mono)">'+(p.pesoNeto||0).toLocaleString('es-MX')+' kg · '+fmt(p.precio||0)+'/kg</span>'+
      '</div>';
    });
    h+='<div class="card" style="margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">'+
        '<div>'+
          '<div style="font-size:14px;font-weight:600;color:var(--text)">'+(r.intermediario||'—')+'</div>'+
          '<div style="font-size:12px;color:var(--text3)">'+mzFechaLbl(r.fechaVal)+' · '+(r.ciclo||'')+(r.boleta?' · Boleta '+r.boleta:'')+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:4px;flex-shrink:0">'+
          '<button onclick="editarMaizReg('+r.id+')" style="background:none;border:none;cursor:pointer;font-size:15px;padding:2px 6px" title="Editar">✏️</button>'+
          '<button onclick="confirmDelMaiz('+r.id+')" style="background:none;border:none;cursor:pointer;font-size:15px;padding:2px 6px" title="Eliminar">🗑</button>'+
        '</div>'+
      '</div>'+
      '<div style="border-top:1px solid var(--border);padding-top:6px;margin-bottom:8px">'+parts+'</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--green-bg);border-radius:var(--radius)">'+
        '<span style="font-size:11px;font-weight:600;color:var(--green);text-transform:uppercase;letter-spacing:.04em">'+(r.totalKg||0).toLocaleString('es-MX')+' kg · '+(r.totalTon||0).toFixed(3)+' t</span>'+
        '<span style="font-size:15px;font-weight:700;font-family:var(--mono);color:var(--green)">'+fmt(r.total||0)+'</span>'+
      '</div>'+
    '</div>';
  });
  cont.innerHTML=h;
}
```

- [ ] **Paso 3: Editar y borrar**

```js
function editarMaizReg(id){
  var reg = maizRegistros.find(function(r){return r.id===id;});
  if(!reg) return;
  maizTab('nuevo');
  initMaizForm(reg);
  window.scrollTo(0,0);
}

function confirmDelMaiz(id){
  var btn=event.target;
  if(btn.dataset.confirm==='1'){
    maizRegistros = maizRegistros.filter(function(r){return r.id!==id;});
    saveMaiz();
    sbDeleteMaizReg(id);
    renderMaizHist();
    showToast('Registro eliminado');
  } else {
    btn.dataset.confirm='1'; btn.textContent='⚠️';
    setTimeout(function(){if(btn){btn.dataset.confirm='';btn.textContent='🗑';}},2500);
  }
}
```

`maizTab('nuevo')` sin `forceNew` es deliberado: con `forceNew` el propio `maizTab`
llamaría `initMaizForm()` en blanco y borraría lo que acaba de cargar `editarMaizReg`. Como
`mzEditId` todavía es `null` en ese momento, la condición `(!mzEditId || forceNew)` sí se
cumple y `maizTab` reinicia el formulario — por eso `initMaizForm(reg)` va **después**, y
es quien deja el estado bueno.

- [ ] **Paso 4: Verificar en el navegador**

Con la base todavía vacía de registros, verificar contra datos **en memoria**, sin guardar:

1. En consola, sembrar un registro falso solo en memoria:

```js
maizRegistros.push({id:1,fechaVal:'2026-08-18',ciclo:'2026-2027',intermediario:'Prueba',boleta:'123',receptorFactura:'',chofer:'',placa:'',factura:'',partidas:[{variedad:'Blanco',parcela:'Mesita',hectareas:10,pesoNeto:24000,toneladas:24,precio:6.5}],totalKg:24000,totalTon:24,total:156000,ts:1}); renderMaizHist();
```

**Importante: no llamar `saveMaiz()` ni `sbSaveMaizReg()` aquí.** El registro vive solo en
memoria y desaparece al recargar.

2. La tarjeta muestra intermediario, fecha, ciclo, boleta, la línea de la partida y el
   total `24,000 kg · 24.000 t` / `$156,000`.
3. El ✏️ lleva a Registro con todo cargado y el botón dice **"Actualizar registro"**.
4. El 🗑 pide confirmación en dos toques y a los ~2.5 s vuelve a 🗑.
5. Al confirmar el borrado, la tarjeta desaparece y queda el `.empty`. `sbDeleteMaizReg(1)`
   se ejecuta contra un id que no existe en la base — es un `delete` sin filas afectadas,
   inofensivo.
6. Recargar la página: el historial vuelve a estar vacío (el registro falso nunca se
   persistió).

- [ ] **Paso 5: Commit**

```bash
git add index.html && git commit -m "Agregar historial de maiz con editar y borrar"
```

---

### Tarea 8: Repaso del viaje redondo, documentación y publicación

**Archivos:**
- Modificar: `CLAUDE.md`

- [ ] **Paso 1: Revisar el mapeo campo por campo**

Con los tres puntos abiertos a la vez —`sbSaveMaizReg()`, el `.map()` de `mzData` en
`cargarDesdeSB()`, y las columnas de la migración— confirmar que los **catorce** campos
aparecen en los tres lados:

`id, fechaVal↔fecha, ciclo, intermediario, boleta, receptorFactura↔receptor_factura,
chofer, placa, factura, partidas, totalKg↔total_kg, totalTon↔total_ton, total, ts`

Cualquiera que falte en uno de los tres se borra solo en la siguiente recarga.

- [ ] **Paso 2: Repaso final en el navegador**

Recargar con la consola abierta:

1. `Supabase conectado ✅` y ninguna línea roja.
2. Navegar a Maíz y recorrer las dos sub-pestañas.
3. Navegar a Ventas, Frambuesa y Deudas y volver — nada se rompió; en particular el
   dropdown de proveedores de Comercializadora sigue funcionando (comparte el patrón, no el
   catálogo).

- [ ] **Paso 3: Actualizar `CLAUDE.md`**

Cuatro ediciones:

1. En la descripción del proyecto y en el modelo de negocios, quitar cualquier mención a
   que la pantalla de maíz está en blanco.
2. En **Claves de localStorage**, agregar `cc_maiz` y `cc_intermediarios` a la lista.
3. En **Supabase → Tablas**, agregar `maiz_registros` e `intermediarios`.
4. Sección nueva **"Módulo de maíz"** con: la estructura de pestañas (`maizMainTab`/
   `maizTab`/`maizTabSel`), las constantes `MZ_VARIEDADES` y `MZ_PARCELAS` como listas
   fijas, el catálogo de intermediarios como cuarto catálogo por nombre, y —explícito— que
   el módulo **no genera deudas, gastos ni entra en reportes**, con el enlace al spec.

- [ ] **Paso 4: Commit y push**

```bash
git add index.html CLAUDE.md && git commit -m "Documentar el modulo de cosecha de maiz en CLAUDE.md"
```

```bash
git push origin main
```

El push despliega en vivo a GitHub Pages. Confirmar que el workflow de Pages terminó bien
antes de dar la tarea por cerrada.

- [ ] **Paso 5: Avisar al usuario qué falta probar con datos reales**

El viaje redondo completo (guardar → recargar desde Supabase → el campo sigue ahí) solo se
puede cerrar con un registro real, porque local y producción comparten la base. Decirle al
usuario que capture su primer registro de maíz y recargue; si algún campo se pierde, es que
falta una columna o un mapeo.
