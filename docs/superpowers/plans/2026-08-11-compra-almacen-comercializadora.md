# Compra a almacén y venta posterior en Comercializadora — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **No subagentes** (regla de CLAUDE.md: releer el archivo en frío desperdicia cuota).

**Goal:** El lote de almacén de Comercializadora captura la compra (proveedor, precio compra, flete) y genera solo sus gastos y la cuenta por pagar; el despacho genera la cuenta por cobrar para los tres negocios.

**Architecture:** Todo en `index.html` (ES5, sin framework). Se agregan 4 campos al lote con persistencia dual (localStorage + Supabase), una función `sincronizarCompraLote()` espejo de `sincronizarDeudasEnvio()`, y dos líneas al despacho (`esComer` + llamada a `sincronizarDeudasEnvio`). Spec: `docs/superpowers/specs/2026-08-11-compra-almacen-comercializadora-design.md`.

**Tech Stack:** ES5 puro, Supabase JS v2, sin build ni tests automatizados — la verificación es en navegador (`javascript_tool`) con persistencia bloqueada.

## Global Constraints

- ES5: `var`, `function`, concatenación de strings. Nada de `let`/`const`/arrow.
- Toda función invocada desde HTML inline debe ser global de nivel superior.
- Persistencia dual: cada campo nuevo toca 4 lugares (objeto al guardar, `sbSaveAlmLote`, `.map()` en `cargarDesdeSB`, columna en Supabase).
- Local y producción comparten la base de Supabase: **toda prueba de guardado se hace con los `sbSaveX`/`sbDeleteX` stubbeados** y restaurando los arreglos en memoria al final.
- Commits chicos por tarea; **un solo push al final** (main es producción en vivo — no publicar la feature a medias).
- Antes de modificar una función, `grep "function nombre("` para confirmar que no haya definición duplicada.

---

### Task 1: Migración Supabase — 4 columnas en `alm_lotes`

**Files:** ninguno (solo Supabase, vía MCP).

**Interfaces:**
- Produces: columnas `proveedor text`, `precio_compra numeric`, `flete_compra numeric`, `gasto_ids jsonb` en la tabla `alm_lotes`, todas nullables.

- [ ] **Step 1:** Obtener el project id con `mcp__...__list_projects` (hay un solo proyecto GVF).
- [ ] **Step 2:** Aplicar la migración con `apply_migration`, nombre `alm_lotes_compra_comercializadora`:

```sql
alter table alm_lotes
  add column if not exists proveedor text,
  add column if not exists precio_compra numeric,
  add column if not exists flete_compra numeric,
  add column if not exists gasto_ids jsonb;
```

- [ ] **Step 3:** Verificar con `execute_sql`: `select proveedor, precio_compra, flete_compra, gasto_ids from alm_lotes limit 1;` — debe responder sin error (filas viejas con null).

---

### Task 2: Campos de compra en el formulario de lote + persistencia dual

**Files:**
- Modify: `index.html` — markup del form de lote (bloque `alm-form-sec`, buscar `id="af-loc"`), `initAlmForm()`, `editarLote()`, `guardarLote()`, `sbSaveAlmLote()`, `.map()` de `alm_lotes` en `cargarDesdeSB()` (buscar `aData.map` o `precioEst:parseFloat(l.precio_est`).

**Interfaces:**
- Consumes: columnas de Task 1; catálogo `proveedoresComer` + `agregarProveedorComerSiNuevo(nombre)` (existen).
- Produces: campos `lote.proveedor` (string), `lote.precioCompra` (number), `lote.fleteCompra` (number), `lote.gastoIds` (array) persistidos ida y vuelta; función global `onAlmLocChange()`.

- [ ] **Step 1: Markup.** Dentro del card del formulario de lote, inmediatamente después del `field-row` que contiene `af-loc` y `af-fecha`, insertar:

```html
          <div id="af-com-fields" style="display:none">
            <div class="field">
              <label>Proveedor</label>
              <input type="text" id="af-proveedor" list="af-proveedor-dl" placeholder="Nombre del proveedor" autocomplete="off">
              <datalist id="af-proveedor-dl"></datalist>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Precio compra $/kg</label>
                <div class="monto-wrap"><span class="monto-prefix">$</span>
                  <input type="number" id="af-precio-compra" placeholder="0" min="0" step="0.01">
                </div>
              </div>
              <div class="field">
                <label>Flete de compra $</label>
                <div class="monto-wrap"><span class="monto-prefix">$</span>
                  <input type="number" id="af-flete-compra" placeholder="0" min="0" step="0.01">
                </div>
              </div>
            </div>
          </div>
```

- [ ] **Step 2: Toggle.** Cambiar el `onchange` de `af-loc` de `buildAlmSectorSelect()` a `onAlmLocChange()`, y agregar junto a `buildAlmSectorSelect()`:

```js
// Muestra los campos de compra (proveedor/precio/flete) solo para lotes de
// Comercializadora: en jal/nay la compra no existe (el lote es cosecha propia).
function onAlmLocChange(){
  buildAlmSectorSelect();
  var box=document.getElementById('af-com-fields');
  if(box) box.style.display = document.getElementById('af-loc').value==='com' ? 'block' : 'none';
}
```

- [ ] **Step 3: `initAlmForm()`.** Donde limpia campos (`af-kg`, `af-precio`…) agregar limpieza de los tres nuevos y poblar el datalist; al final, la línea `buildAlmSectorSelect();` cambia a `onAlmLocChange();`:

```js
  document.getElementById('af-proveedor').value='';
  document.getElementById('af-precio-compra').value='';
  document.getElementById('af-flete-compra').value='';
  var dl=document.getElementById('af-proveedor-dl');
  if(dl) dl.innerHTML=proveedoresComer.map(function(p){return '<option value="'+p.replace(/"/g,'&quot;')+'">';}).join('');
```

- [ ] **Step 4: `editarLote()`.** Tras `document.getElementById('af-notas').value=lote.notas||'';` agregar relleno de los nuevos, y cambiar su `buildAlmSectorSelect();` por `onAlmLocChange();`:

```js
  document.getElementById('af-proveedor').value=lote.proveedor||'';
  document.getElementById('af-precio-compra').value=lote.precioCompra||'';
  document.getElementById('af-flete-compra').value=lote.fleteCompra||'';
```

- [ ] **Step 5: `guardarLote()`.** Tras leer `notas`, leer los nuevos (ignorando valores si no es com):

```js
  var esCom = loc==='com';
  var proveedor = esCom ? document.getElementById('af-proveedor').value.trim() : '';
  var precioCompra = esCom ? (parseFloat(document.getElementById('af-precio-compra').value)||0) : 0;
  var fleteCompra = esCom ? (parseFloat(document.getElementById('af-flete-compra').value)||0) : 0;
```

En la rama de **edición**, junto a las demás asignaciones: `almLotes[idx].proveedor=proveedor; almLotes[idx].precioCompra=precioCompra; almLotes[idx].fleteCompra=fleteCompra;` (NO tocar `gastoIds` aquí — lo administra la sincronización). En la rama **nueva**, el objeto lote suma `proveedor:proveedor, precioCompra:precioCompra, fleteCompra:fleteCompra, gastoIds:[]`.

- [ ] **Step 6: `sbSaveAlmLote()`.** Agregar al upsert: `proveedor:l.proveedor||'', precio_compra:l.precioCompra||0, flete_compra:l.fleteCompra||0, gasto_ids:l.gastoIds||[]`.

- [ ] **Step 7: `cargarDesdeSB()`.** En el `.map()` de `alm_lotes` agregar: `proveedor:l.proveedor||'', precioCompra:parseFloat(l.precio_compra||0), fleteCompra:parseFloat(l.flete_compra||0), gastoIds:l.gasto_ids||[]`.

- [ ] **Step 8: Verificar en navegador.** Cargar `index.html`, consola sin errores y `Supabase conectado ✅`. Con `javascript_tool`: `goSc('fram')`… no — ir a almacén (`goSc('ven'); venTab('alm');` o el router que abra `alm-form-sec`; confirmar visualmente con `almTab('nuevo')`). Comprobar: (a) con `af-loc='jal'` el bloque `af-com-fields` está oculto; (b) al cambiar a `com` aparece; (c) datalist poblado; (d) stub de `sbSaveAlmLote` + guardar lote com de prueba en memoria → el objeto en `almLotes[0]` trae los 4 campos; (e) restaurar `almLotes` y limpiar.

- [ ] **Step 9: Commit.** `git add index.html` + mensaje: `Campos de compra (proveedor, precio, flete) en el lote de almacen`.

---

### Task 3: `sincronizarCompraLote()` — gastos + cuenta por pagar del lote

**Files:**
- Modify: `index.html` — nueva función junto a `sbSaveAlmLote`/`saveAlmLotes`; `guardarLote()` (dos ramas); `confirmDelLote()`.

**Interfaces:**
- Consumes: `lote.proveedor/precioCompra/fleteCompra/gastoIds` (Task 2); `sbDeleteGasto`, `sbSaveGasto`, `sbSaveDeuda`, `sbDeleteDeuda`, `registrarContraparte(nombre,tipo)`, `agregarProveedorComerSiNuevo(nombre)`, `save()`, `saveDeudas()` (existen).
- Produces: `sincronizarCompraLote(lote, soloLimpiar)` global. Deuda con `refKind:'alm_compra_pagar'`, `refId: lote.id`, `id: lote.id*10+1`.

- [ ] **Step 1: La función.**

```js
// Gastos autoGen y cuenta por pagar que nacen de la COMPRA de un lote de
// comercializadora. Espejo de sincronizarDeudasEnvio: limpia lo previo y recrea.
// Se llama al guardar el lote (alta y edicion) y con soloLimpiar=true al borrarlo.
// La cuenta por pagar lleva SOLO la mercancia: el flete de compra se paga aparte
// (regla del negocio, igual que en sincronizarDeudasEnvio).
function sincronizarCompraLote(lote, soloLimpiar){
  if(!lote) return;
  var ids=lote.gastoIds||[];
  if(ids.length){
    gastos=gastos.filter(function(g){
      if(ids.indexOf(g.id)>=0){ sbDeleteGasto(g.id); return false; }
      return true;
    });
  }
  lote.gastoIds=[];
  deudas=deudas.filter(function(d){
    if(d.refId===lote.id && d.refKind==='alm_compra_pagar'){ sbDeleteDeuda(d.id); return false; }
    return true;
  });
  if(!soloLimpiar && lote.loc==='com' && lote.proveedor && (parseFloat(lote.precioCompra)||0)>0){
    var montoCompra=Math.round(lote.kgTotal*lote.precioCompra*100)/100;
    var gastoCompra={id:Date.now()+1,fechaVal:lote.fecha,fechaLbl:lote.fechaLbl,
      loc:'com',cultivo:'com',cat:'Compra Mercancia',
      desc:'Compra mercancia lote '+lote.variedad+' '+lote.fechaLbl,
      monto:montoCompra,ciclo:lote.ciclo||'',sector:'',autoGen:true};
    gastos.unshift(gastoCompra); sbSaveGasto(gastoCompra); lote.gastoIds.push(gastoCompra.id);
    if((parseFloat(lote.fleteCompra)||0)>0){
      var gastoFlete={id:Date.now()+2,fechaVal:lote.fecha,fechaLbl:lote.fechaLbl,
        loc:'com',cultivo:'com',cat:'Fletes',
        desc:'Flete compra lote '+lote.variedad+' '+lote.fechaLbl,
        monto:lote.fleteCompra,ciclo:lote.ciclo||'',sector:'',autoGen:true};
      gastos.unshift(gastoFlete); sbSaveGasto(gastoFlete); lote.gastoIds.push(gastoFlete.id);
    }
    var deudaP={id:lote.id*10+1, tipo:'pagar', contraparte:lote.proveedor, fecha:lote.fecha,
      ciclo:lote.ciclo||'', origen:'comercializadora', folioExterno:'', refId:lote.id,
      refKind:'alm_compra_pagar', items:[{concepto:'Compra '+(lote.variedad||''), monto:montoCompra}],
      monto:montoCompra, desc:''};
    deudas.push(deudaP); sbSaveDeuda(deudaP); registrarContraparte(deudaP.contraparte,'pagar');
    agregarProveedorComerSiNuevo(lote.proveedor);
  }
  save(); saveDeudas();
}
```

- [ ] **Step 2: `guardarLote()`.** Rama edición: después de asignar los campos y ANTES de `sbSaveAlmLote(almLotes[idx])`, insertar `sincronizarCompraLote(almLotes[idx]);` (la sincronización muta `gastoIds` y debe persistirse). Rama nueva: después de `almLotes.unshift(lote);` y antes de `sbSaveAlmLote(lote);`, insertar `sincronizarCompraLote(lote);`.

- [ ] **Step 3: `confirmDelLote()`.** En la rama confirmada, antes de `almLotes=almLotes.filter(...)`:

```js
    var loteDel=almLotes.find(function(l){return l.id===loteId;});
    if(loteDel) sincronizarCompraLote(loteDel, true);
```

- [ ] **Step 4: Verificar en navegador** (stubs en `sbSaveAlmLote`, `sbSaveGasto`, `sbDeleteGasto`, `sbSaveDeuda`, `sbDeleteDeuda`, `sbSaveProveedorComer`, snapshot de `gastos`/`deudas`/`almLotes`/`contrapartes`/`proveedoresComer`):
  - Alta lote com (100 kg × $10, flete $500, proveedor "PruebaProv") → 2 gastos (1000 y 500), 1 deuda pagar de 1000 con `refKind:'alm_compra_pagar'`, `lote.gastoIds.length===2`, contraparte creada.
  - Editar el mismo lote (precio $12) → siguen siendo 2 gastos (1200 y 500) y 1 deuda (1200): sin duplicados.
  - Editar cambiándolo a `jal` → 0 gastos, 0 deudas, `gastoIds` vacío.
  - Volverlo com y borrar el lote → todo limpio.
  - Alta lote jal → no genera nada.
  - Restaurar snapshots.

- [ ] **Step 5: Commit.** Mensaje: `El lote de comercializadora genera sus gastos y la cuenta por pagar`.

---

### Task 4: Despacho — `esComer` y cuenta por cobrar

**Files:**
- Modify: `index.html` — `confirmarDespachoGeneral()` (buscar `esDespachoAlm:true`).

**Interfaces:**
- Consumes: `sincronizarDeudasEnvio(e)` (existe; com→cobrar sin flete, jal/nay→cobrar con flete).
- Produces: envíos de despacho con `esComer:true` cuando `loc==='com'` y deuda cobrar `id: envio.id*10+2` (la pone `sincronizarDeudasEnvio`).

- [ ] **Step 1:** En el `envioObj` de `confirmarDespachoGeneral()`, junto a `esDespachoAlm:true`, agregar `esComer: loc==='com',`.
- [ ] **Step 2:** Después de `sbSaveEnvio(envioObj);` insertar `sincronizarDeudasEnvio(envioObj);`.
- [ ] **Step 3: Verificar en navegador** (stubs también de `sbSaveEnvio` y `sbSaveDeuda`; snapshots de `envios`/`deudas`/`almLotes`/`clientes`):
  - Despacho de lote com (50 kg × $20, flete venta $300) → envío `esComer:true`, num `Comer/...`; deuda cobrar de **1000** (sin flete), `refKind:'com_cobrar'`.
  - Despacho de lote jal (50 kg × $20, flete $300) → deuda cobrar de **1300** (con flete), `refKind:'camote_cobrar'`.
  - `delEnvio` del envío com de prueba → la cobrar desaparece (ya lo hace `borrarDeudasDeEnvio`).
  - Restaurar snapshots.

- [ ] **Step 4: Commit.** Mensaje: `El despacho de almacen genera la cuenta por cobrar y marca esComer`.

---

### Task 5: Documentación, verificación final y publicación

**Files:**
- Modify: `CLAUDE.md` — sección "Acoplamientos entre módulos" (bloque Almacén → envíos) y "Claves de localStorage"/tablas si aplica (no aplica: sin tablas ni claves nuevas).

**Interfaces:** n/a.

- [ ] **Step 1: `CLAUDE.md`.** Al bloque **Almacén → envíos** agregar: los campos de compra del lote com (4 lugares ya cableados), `sincronizarCompraLote()` (espejo de `sincronizarDeudasEnvio`, refKind `alm_compra_pagar`, flete nunca a la cuenta del proveedor), y que TODO despacho ahora llama `sincronizarDeudasEnvio` (cobrar en los tres negocios; envíos com de despacho llevan `esComer:true` sin proveedor).
- [ ] **Step 2: Verificación final.** Recargar `index.html` limpio: consola sin errores, `Supabase conectado ✅`. Revisar que la operación de paso directo (`venTab('comer')`) abre y guarda igual (sin tocar datos: solo abrir el form).
- [ ] **Step 3: Commit + push.** `git add index.html CLAUDE.md` + mensaje `Compra a almacen de comercializadora: docs` (o incluir doc en el último commit de código) y **`git push origin main`** — único push de la feature.

---

## Self-review del plan

- **Cobertura del spec:** §1→Task 2 (campos/toggle/datalist), §2→Tasks 1-2 (4 lugares), §3→Task 3, §4→Task 4, §5→sin tareas (no se toca nada de eso), Verificación→pasos de cada task. Sin huecos.
- **Placeholders:** ninguno — todo el código está escrito.
- **Consistencia de nombres:** `onAlmLocChange`, `sincronizarCompraLote(lote, soloLimpiar)`, `af-proveedor`/`af-precio-compra`/`af-flete-compra`/`af-com-fields`, `refKind:'alm_compra_pagar'` usados igual en todas las tareas.
