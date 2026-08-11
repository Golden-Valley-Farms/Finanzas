# Envíos cancelados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. **No subagentes** (regla de CLAUDE.md).

**Goal:** Un envío se puede marcar como cancelado: conserva sus folios y los reserva, sale de todos los ingresos, se le borran las deudas, y se elige gasto por gasto cuáles borrar y cuáles conservar.

**Architecture:** Todo en `index.html` (ES5). 3 campos nuevos en el envío con persistencia dual, un localizador de gastos autogenerados robusto (no depende de `gastoCosechaIds`, que no se persiste), un modal de cancelación, y `envioTotal()` devolviendo 0 para cancelados — el único punto que suman los 8 sitios de ingresos. Spec: `docs/superpowers/specs/2026-08-11-envios-cancelados-design.md`.

**Tech Stack:** ES5 puro, Supabase JS v2. Sin tests automatizados: verificación en navegador con `javascript_tool` y persistencia bloqueada.

## Global Constraints

- ES5: `var`, `function`, concatenación de strings. Nada de `let`/`const`/arrow.
- Funciones llamadas desde `onclick` inline deben ser globales de nivel superior.
- Persistencia dual: cada campo nuevo toca 4 lugares.
- Local y producción comparten base: **toda prueba con `sbSaveX`/`sbDeleteX` stubbeados** y restaurando arreglos al final.
- Commits chicos por tarea; **un solo push al final**.
- Antes de modificar una función, `grep "function nombre("` (hay definiciones duplicadas en el archivo).

---

### Task 1: Migración Supabase — 3 columnas en `envios`

**Files:** ninguno (solo Supabase, vía MCP; project_id `jlfendrdwptwmttrahre`).

**Interfaces:**
- Produces: `cancelado boolean default false`, `motivo_cancelacion text`, `fecha_cancelacion text` en `envios`.

- [ ] **Step 1:** `apply_migration`, nombre `envios_cancelado`:

```sql
alter table envios
  add column if not exists cancelado boolean default false,
  add column if not exists motivo_cancelacion text,
  add column if not exists fecha_cancelacion text;
```

- [ ] **Step 2:** Verificar con `execute_sql`: `select id, cancelado, motivo_cancelacion, fecha_cancelacion from envios limit 1;` — sin error.

---

### Task 2: Persistencia de las marcas + `envioTotal()` en 0

**Files:**
- Modify: `index.html` — `sbSaveEnvio()` (~2232), `.map()` de `envios` en `cargarDesdeSB()` (~2075), `envioTotal()` (~9019).

**Interfaces:**
- Produces: `e.cancelado` (bool), `e.motivoCancelacion` (string), `e.fechaCancelacion` (string ISO) sobreviven al round-trip; `envioTotal(e)` devuelve `0` si `e.cancelado`.

- [ ] **Step 1: `sbSaveEnvio()`.** Agregar al upsert, tras `total:e.total||0,`:

```js
    cancelado:e.cancelado||false, motivo_cancelacion:e.motivoCancelacion||'',
    fecha_cancelacion:e.fechaCancelacion||'',
```

- [ ] **Step 2: `cargarDesdeSB()`.** En el `.map()` de envíos, tras `total:parseFloat(e.total||0),` agregar:

```js
        cancelado:e.cancelado||false, motivoCancelacion:e.motivo_cancelacion||'',
        fechaCancelacion:e.fecha_cancelacion||'',
```

- [ ] **Step 3: `envioTotal()`.** Primera línea del cuerpo:

```js
  // Un envio cancelado no es ingreso. Aqui se corta una sola vez: esta funcion
  // la suman los 8 puntos donde aparecen ventas (reportes, EDR, resumen por
  // negocio, ingresos por mes/ciclo), asi que no hay que filtrar en cada uno.
  if(e && e.cancelado) return 0;
```

- [ ] **Step 4: Verificar** en navegador: `envioTotal({cancelado:true, partidas:[{pesoNeto:100,precio:10}], flete:500})` → `0`; el mismo sin `cancelado` → `1500`.

- [ ] **Step 5: Commit.** `Persistir la marca de cancelado y sacar el envio de los ingresos`.

---

### Task 3: `gastosAutoGenDeEnvio(e)` — localizar los gastos del envío

**Files:**
- Modify: `index.html` — nueva función justo antes de `delEnvio()` (~7743).

**Interfaces:**
- Produces: `gastosAutoGenDeEnvio(e)` → array de objetos gasto (referencias vivas de `gastos`), deduplicado por id.

- [ ] **Step 1: La función.**

```js
// Gastos autoGen que creó un envío. NO se puede confiar solo en e.gastoCosechaIds:
// sbSaveEnvio no lo persiste y cargarDesdeSB sobreescribe cc_envios, asi que esa
// lista desaparece en cada recarga desde Supabase. Se usa como fuente adicional
// y se complementa con los criterios de cada tipo de envio.
function gastosAutoGenDeEnvio(e){
  if(!e) return [];
  var num=e.num||'';
  var vistos={}, out=[];
  function push(g){ if(g && !vistos[g.id]){ vistos[g.id]=1; out.push(g); } }
  (e.gastoCosechaIds ? objValues(e.gastoCosechaIds) : []).forEach(function(id){
    push(gastos.find(function(g){return g.id===id;}));
  });
  var descsCom=['Compra mercancia op. '+num, 'Flete compra op. '+num];
  gastos.forEach(function(g){
    if(!g.autoGen) return;
    if(e.esComer===true && g.loc==='com' && descsCom.indexOf(g.desc)>=0){ push(g); return; }
    if(g.desc==='Flete compra envio '+num){ push(g); return; }
    if((e.loc==='jal'||e.loc==='nay') && g.loc===e.loc && g.cultivo==='camote' &&
       g.tipoCamote==='cosecha' && g.fechaVal===e.fecha && g.proveedor===e.cliente &&
       ['Flete Cosecha','Cosecha','Arado','Desvarada'].indexOf(g.cat)>=0){ push(g); return; }
  });
  return out;
}
// gastoCosechaIds es un objeto {sector_key: id}, no un arreglo.
function objValues(o){
  var r=[]; for(var k in o){ if(Object.prototype.hasOwnProperty.call(o,k)) r.push(o[k]); }
  return r;
}
```

- [ ] **Step 2: Verificar** en navegador con datos reales (solo lectura, sin stubs): tomar un envío jal existente con gastos de cosecha y confirmar que `gastosAutoGenDeEnvio(env)` devuelve sus 1-4 gastos y que ninguno pertenece a otro envío (comparar `fechaVal` y `proveedor` de cada resultado contra `env.fecha`/`env.cliente`). Repetir con un envío com si existe.

- [ ] **Step 3: Commit.** `Localizar los gastos autogenerados de un envio sin depender de gastoCosechaIds`.

---

### Task 4: Modal de cancelación + reactivar

**Files:**
- Modify: `index.html` — funciones nuevas tras `gastosAutoGenDeEnvio`; `verEnvio()` (~7697) para los botones.

**Interfaces:**
- Consumes: `gastosAutoGenDeEnvio(e)`, `borrarDeudasDeEnvio(id)`, `sincronizarDeudasEnvio(e)`, `sbDeleteGasto`, `sbSaveGasto`, `sbSaveEnvio`, `save()`, `saveEnvios()`, `fmt()`.
- Produces: globales `abrirCancelarEnvio(id)`, `confirmarCancelarEnvio(id)`, `reactivarEnvio(id)`.

- [ ] **Step 1: Las tres funciones.**

```js
function abrirCancelarEnvio(id){
  var e=envios.find(function(x){return x.id===id;}); if(!e) return;
  var gs=gastosAutoGenDeEnvio(e);
  var filas = gs.length ? gs.map(function(g,i){
    return '<label style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border);cursor:pointer">'+
      '<input type="checkbox" id="ce-g-'+i+'" data-gid="'+g.id+'" checked style="width:16px;height:16px;flex-shrink:0">'+
      '<span style="flex:1;font-size:12px;color:var(--text2)">'+(g.cat||'')+(g.desc?' <span style="color:var(--text3)">· '+g.desc+'</span>':'')+'</span>'+
      '<span style="font-family:var(--mono);font-weight:600;color:var(--camote)">'+fmt(g.monto)+'</span>'+
    '</label>';
  }).join('') : '<div style="font-size:12px;color:var(--text3);padding:8px 0">Este envío no generó gastos automáticos.</div>';
  document.getElementById('mo-title').innerHTML='🚫 Cancelar envío';
  document.getElementById('mo-body').innerHTML=
    '<div class="modal-row"><span class="modal-key">Folio Negocio</span><span class="modal-val">'+(e.num||'-')+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Folio Cliente</span><span class="modal-val">'+(e.folio||'-')+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Cliente</span><span class="modal-val">'+(e.cliente||'-')+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Total</span><span class="modal-val" style="font-family:var(--mono)">'+fmt(e.total)+'</span></div>'+
    '<div style="margin-top:14px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Gastos automáticos</div>'+
    '<div style="font-size:11px;color:var(--text3);margin:4px 0 6px">Marcado = se borra. Desmarcado = se conserva (por ejemplo un flete que sí se pagó).</div>'+
    filas+
    '<div class="field" style="margin-top:14px"><label>Motivo (opcional)</label>'+
      '<input type="text" id="ce-motivo" placeholder="Por qué se canceló" style="width:100%"></div>'+
    '<div style="font-size:11px;color:var(--text3);margin:10px 0">Se borrarán sus cuentas por cobrar y por pagar. El folio queda reservado y el almacén no se modifica.</div>'+
    '<button class="btn-main" style="background:var(--camote);border-color:var(--camote)" onclick="confirmarCancelarEnvio('+id+')">🚫 Confirmar cancelación</button>';
  document.getElementById('overlay').classList.add('open');
}

function confirmarCancelarEnvio(id){
  var e=envios.find(function(x){return x.id===id;}); if(!e) return;
  var motEl=document.getElementById('ce-motivo');
  var hoy=new Date(); var tz=hoy.getTimezoneOffset()*60000;
  e.cancelado=true;
  e.motivoCancelacion=motEl?motEl.value.trim():'';
  e.fechaCancelacion=new Date(hoy-tz).toISOString().slice(0,10);
  borrarDeudasDeEnvio(e.id); // siempre: nadie cobra ni paga un envio cancelado
  var chks=document.querySelectorAll('#mo-body input[type="checkbox"][data-gid]');
  var borrar={}, conservar=[];
  Array.prototype.slice.call(chks).forEach(function(c){
    var gid=parseFloat(c.dataset.gid);
    if(c.checked) borrar[gid]=1; else conservar.push(gid);
  });
  gastos=gastos.filter(function(g){
    if(borrar[g.id]){ sbDeleteGasto(g.id); return false; }
    return true;
  });
  // Los conservados dejan de ser autoGen para que una reedicion del envio no los pise.
  conservar.forEach(function(gid){
    var g=gastos.find(function(x){return x.id===gid;});
    if(g){ g.autoGen=false; sbSaveGasto(g); }
  });
  if(e.gastoCosechaIds){
    var limpio={};
    for(var k in e.gastoCosechaIds){
      if(Object.prototype.hasOwnProperty.call(e.gastoCosechaIds,k) && !borrar[e.gastoCosechaIds[k]] && conservar.indexOf(e.gastoCosechaIds[k])<0) limpio[k]=e.gastoCosechaIds[k];
    }
    e.gastoCosechaIds=limpio;
  }
  save(); saveEnvios(); sbSaveEnvio(e);
  closeModal(); renderEnvios();
  showToast('Envío cancelado · folio '+(e.num||'')+' reservado');
}

function reactivarEnvio(id){
  var e=envios.find(function(x){return x.id===id;}); if(!e) return;
  e.cancelado=false; e.motivoCancelacion=''; e.fechaCancelacion='';
  saveEnvios(); sbSaveEnvio(e);
  sincronizarDeudasEnvio(e); // recrea cobrar/pagar; los gastos borrados no se recuperan
  closeModal(); renderEnvios();
  showToast('Envío reactivado · los gastos borrados no se recuperan');
}
```

- [ ] **Step 2: Botones en `verEnvio()`.** Sustituir el bloque de dos botones (Editar + Eliminar) por:

```js
    '<div style="display:flex;gap:8px;margin-top:14px">'+
    '<button class="ven-del-btn" style="flex:1;margin-top:0;border-color:var(--green-border);color:var(--green)" onmouseover="this.style.background=\'var(--green-bg)\'" onmouseout="this.style.background=\'none\'" onclick="editarEnvio(envioActual)">✏️ Editar</button>'+
    (e.cancelado?
      '<button class="ven-del-btn" style="flex:1;margin-top:0;border-color:var(--green-border);color:var(--green)" onclick="reactivarEnvio('+e.id+')">↩️ Reactivar</button>':
      '<button class="ven-del-btn" style="flex:1;margin-top:0;border-color:var(--camote);color:var(--camote)" onclick="abrirCancelarEnvio('+e.id+')">🚫 Cancelar</button>')+
    '<button id="del-btn-'+e.id+'" class="ven-del-btn" style="flex:1;margin-top:0" onclick="confirmDelEnvio('+e.id+')">Eliminar</button>'+
    '</div>';
```

- [ ] **Step 3: Fila de motivo en `verEnvio()`.** Tras la fila de Folio, agregar:

```js
    (e.cancelado?'<div class="modal-row"><span class="modal-key">Estado</span><span class="modal-val" style="color:var(--camote);font-weight:700">🚫 CANCELADO'+(e.fechaCancelacion?' · '+e.fechaCancelacion:'')+(e.motivoCancelacion?' · '+e.motivoCancelacion:'')+'</span></div>':'')+
```

- [ ] **Step 4: Verificar** con stubs (`sbSaveEnvio`,`sbDeleteEnvio`,`sbSaveGasto`,`sbDeleteGasto`,`sbSaveDeuda`,`sbDeleteDeuda`) y snapshots de `envios`/`gastos`/`deudas`:
  - Crear en memoria un envío jal con 2 gastos autoGen simulados (uno "Flete Cosecha" $500, otro "Cosecha" $800) que cumplan el criterio de match, y una deuda cobrar suya.
  - `abrirCancelarEnvio(id)` → el modal lista exactamente esos 2 gastos.
  - Desmarcar el del flete; `confirmarCancelarEnvio(id)` → queda 1 gasto (el flete, con `autoGen===false`), el otro borrado, 0 deudas del envío, `e.cancelado===true`.
  - `envioTotal(e)===0`.
  - `reactivarEnvio(id)` → `cancelado===false` y vuelve la deuda cobrar.
  - Restaurar snapshots.

- [ ] **Step 5: Commit.** `Cancelar y reactivar envios, eligiendo que gastos conservar`.

---

### Task 5: Insignia en la lista + folio reservado

**Files:**
- Modify: `index.html` — `renderEnvios()` (~7647-7691).

**Interfaces:** n/a (solo presentación).

- [ ] **Step 1: Insignia y total tachado.** En el `forEach` de `renderEnvios`, tras `var item=document.createElement('div'); item.className='envio-item';` agregar `if(e.cancelado) item.style.opacity='.6';`. En el header, sustituir la línea del total por:

```js
        '<div class="envio-total"'+(e.cancelado?' style="text-decoration:line-through;color:var(--text3)"':'')+'>'+fmt(e.total)+'</div>'+
```

y en el bloque de tags, tras el tag del ciclo, agregar:

```js
        (e.cancelado?'<span class="tag" style="background:var(--camote-bg);color:var(--camote)">🚫 Cancelado</span>':'')+
```

- [ ] **Step 2: Verificar** que el folio queda reservado: con un envío cancelado de prueba en memoria cuyo `num` sea el último de su serie, `getNextNumEnvio(loc, anio, null)` debe devolver el **siguiente** número, no el del cancelado. Restaurar.
- [ ] **Step 3: Verificar** visualmente la lista (`goSc('ven'); venTab('lista')`): el cancelado se ve atenuado, con la insignia y el total tachado.
- [ ] **Step 4: Commit.** `Marcar los envios cancelados en la lista`.

---

### Task 6: CLAUDE.md, verificación final y push

**Files:**
- Modify: `CLAUDE.md` — sección de acoplamientos (envío → gastos / envío → deudas).

- [ ] **Step 1: `CLAUDE.md`.** Documentar: los 3 campos nuevos y su persistencia; que `envioTotal()` devuelve 0 para cancelados y por eso es el único punto de corte de ingresos; que el folio queda reservado porque el envío sobrevive; `gastosAutoGenDeEnvio()` y **por qué no se usa `gastoCosechaIds`** (no se persiste en Supabase y `cargarDesdeSB` sobrescribe localStorage); que los gastos conservados pierden `autoGen`; y que cancelar **no toca el almacén** (la mercancía ya salió).
- [ ] **Step 2:** Recarga limpia: consola sin errores, `Supabase conectado ✅`, sin datos de prueba (`envios.some(e=>e.cancelado)` debe ser false si no se canceló nada real).
- [ ] **Step 3: Commit + `git push origin main`** — único push de la feature.

---

## Self-review del plan

- **Cobertura del spec:** campos+persistencia→Task 2; `envioTotal` 0→Task 2; localizador→Task 3; modal/confirmar/reactivar→Task 4; presentación+folio reservado→Task 5; almacén intacto→no se toca en ninguna tarea (verificado por omisión y documentado en Task 6); migración→Task 1.
- **Placeholders:** ninguno; todo el código está escrito.
- **Consistencia:** `gastosAutoGenDeEnvio`, `abrirCancelarEnvio`, `confirmarCancelarEnvio`, `reactivarEnvio`, `cancelado`/`motivoCancelacion`/`fechaCancelacion` usados igual en todas las tareas. `objValues` definida en Task 3 y usada solo ahí.
