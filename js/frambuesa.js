// ============================================================
// ---- FRAMBUESA MODULE ----
// ============================================================
var framRegistros = [];
try{ var sfr=localStorage.getItem('cc_fram'); if(sfr) framRegistros=JSON.parse(sfr); }catch(e){}
function saveFramRegistros(){ try{localStorage.setItem('cc_fram',JSON.stringify(framRegistros));}catch(e){} }

var PRESENTACIONES_CAJA = ['6 oz','12 oz'];
var framSectorSel = 1; // kept for compatibility
var trabsTemp = []; // [{nombre, cubetas}]
var cajasTemp = []; // [{presentacion, cantidad}]

// ---- Supabase helpers for fram ----
async function sbSaveFramRegistro(r){
  if(!sbOnline||!sb) return;
  await sb.from('fram_registros').upsert({
    id:r.id, fecha:r.fecha, sector:r.sector, ciclo:r.ciclo||'',
    trabajadores:r.trabajadores||[], cajas:r.cajas||[],
    total_cubetas:r.totalCubetas||0, total_cajas:r.totalCajas||0,
    merma:r.merma||0, muestra:r.muestra||0,
    defectos:r.defectos||{}
  });
}
async function sbDeleteFramRegistro(id){
  if(!sbOnline||!sb){ showToast('Sin conexión a Supabase'); return; }
  var res = await sb.from('fram_registros').delete().eq('id', id);
  if(res.error) showToast('Error al borrar en Supabase: '+res.error.message);
}

// ---- Trabajadores list (stored separately) ----
var trabajadores = [];
try{ var swt=localStorage.getItem('cc_trabajadores'); if(swt) trabajadores=JSON.parse(swt); }catch(e){}
function saveTrabajadores(){ try{localStorage.setItem('cc_trabajadores',JSON.stringify(trabajadores));}catch(e){} }
function agregarTrabajadorSiNuevo(nom){
  if(!nom||trabajadores.indexOf(nom)>=0) return;
  trabajadores.push(nom);
  trabajadores.sort(function(a,b){return a.localeCompare(b,'es');});
  saveTrabajadores();
}

// ---- Presentaciones de caja ----
var presentacionesCaja = PRESENTACIONES_CAJA.slice();
// Allow user-added presentaciones
try{ var spc=localStorage.getItem('cc_presentaciones'); if(spc) presentacionesCaja=JSON.parse(spc); }catch(e){}
function savePresentaciones(){ try{localStorage.setItem('cc_presentaciones',JSON.stringify(presentacionesCaja));}catch(e){} }

// ---- Init form ----
var framEditId = null; // id del registro en edición, null si es nuevo

function initFramForm(editReg){
  trabsTemp = [];
  cajasTemp = [];
  framSectorSel = 1;
  framEditId = editReg ? editReg.id : null;

  var iso;
  if(editReg){
    iso = editReg.fecha;
    trabsTemp = (editReg.trabajadores||[]).map(function(t){return {nombre:t.nombre, cubetas:t.cubetas};});
    cajasTemp = (editReg.cajas||[]).map(function(c){return {presentacion:c.presentacion, sector:c.sector, cantidad:c.cantidad};});
  } else {
    var hoy = new Date();
    var tz = hoy.getTimezoneOffset()*60000;
    iso = new Date(hoy-tz).toISOString().slice(0,10);
  }
  document.getElementById('fr-fecha').value = iso;
  // ciclo
  var cicloSel = document.getElementById('fr-ciclo');
  cicloSel.innerHTML = '';
  CICLOS.forEach(function(c){
    var o=document.createElement('option'); o.value=c; o.textContent=c;
    if(editReg ? c===editReg.ciclo : c===cicloFromFecha(iso)) o.selected=true;
    cicloSel.appendChild(o);
  });
  document.getElementById('fr-merma').value = editReg ? (editReg.merma||'') : '';
  document.getElementById('fr-muestra').value = '';
  ['sobremadura','irregular','desgrane','deforme','hongos'].forEach(function(d){
    document.getElementById('fr-d-'+d).value = editReg && editReg.defectos ? (editReg.defectos[d]||'') : '';
    document.getElementById('fr-p-'+d).textContent = '—';
  });
  document.getElementById('fr-defectos-resumen').style.display = 'none';
  document.getElementById('fr-trab-input').value = '';
  var tci=document.getElementById('fr-trab-cubetas-input'); if(tci) tci.value='';
  var ci=document.getElementById('fr-caja-input'); if(ci) ci.value='';
  var cqi=document.getElementById('fr-caja-cantidad-input'); if(cqi) cqi.value='';
  renderTrabajadoresRows();
  renderCajasRows();
  recalcDefectos();
  document.getElementById('btn-fram-guardar').innerHTML = editReg
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;stroke-width:2"><path d="M12 5v14M5 12h14"/></svg> Guardar cambios'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;stroke-width:2"><path d="M12 5v14M5 12h14"/></svg> Guardar registro';
}

// ---- Trabajadores ----
function renderTrabajadoresRows(){
  var cont = document.getElementById('fr-trabajadores-list');
  cont.innerHTML = '';
  trabsTemp.forEach(function(t, idx){
    var row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 80px 28px;gap:8px;align-items:center;margin-bottom:6px';
    row.innerHTML =
      '<input type="text" value="'+t.nombre+'" readonly style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);font-size:13px;font-weight:500;color:var(--text);outline:none">'+
      '<input type="number" value="'+(t.cubetas||'')+'" placeholder="0" min="0" step="1"'+
      ' oninput="trabsTemp['+idx+'].cubetas=parseFloat(this.value)||0;actualizarTotalCubetas()"'+
      ' onchange="trabsTemp['+idx+'].cubetas=parseFloat(this.value)||0;actualizarTotalCubetas()"'+
      ' onblur="trabsTemp['+idx+'].cubetas=parseFloat(this.value)||0;actualizarTotalCubetas()"'+
      ' style="width:100%;padding:9px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);font-size:14px;font-weight:600;color:var(--fram);font-family:var(--mono);text-align:center;outline:none">'+
      '<button onclick="removeTrab('+idx+')" title="Eliminar"'+
      ' style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;flex-shrink:0">×</button>';
    cont.appendChild(row);
  });
  actualizarTotalCubetas();
}
function actualizarTotalCubetas(){
  var inputs = document.querySelectorAll('#fr-trabajadores-list input[type="number"]');
  var tot = 0;
  inputs.forEach(function(inp, idx){
    var v = parseFloat(inp.value)||0;
    if(trabsTemp[idx]) trabsTemp[idx].cubetas = v;
    tot += v;
  });
  document.getElementById('fr-total-cubetas').textContent = tot % 1 === 0 ? tot : tot.toFixed(1);
}
function agregarTrabajadorRow(){
  var inp = document.getElementById('fr-trab-input');
  var cubInp = document.getElementById('fr-trab-cubetas-input');
  var nom = inp.value.trim();
  if(!nom){ showToast('Escribe el nombre del trabajador'); return; }
  if(trabsTemp.find(function(t){return t.nombre===nom;})){
    showToast('Ya está en la lista'); inp.value=''; if(cubInp) cubInp.value=''; return;
  }
  var cubetas = cubInp ? (parseFloat(cubInp.value)||0) : 0;
  trabsTemp.push({nombre:nom, cubetas:cubetas});
  agregarTrabajadorSiNuevo(nom);
  inp.value='';
  if(cubInp) cubInp.value='';
  hideTrabajadorDropdown();
  renderTrabajadoresRows();
  // focus back to name input for quick consecutive entry
  setTimeout(function(){ inp.focus(); }, 50);
}
function removeTrab(idx){
  trabsTemp.splice(idx,1);
  renderTrabajadoresRows();
}

// Dropdown trabajadores
var trabDDIndex = -1; // currently highlighted dropdown item
var trabAggregandose = false; // flag to prevent double-add on Tab+blur

function renderTrabajadorDropdown(){
  var dd = document.getElementById('trab-dropdown'); if(!dd) return;
  var q = (document.getElementById('fr-trab-input').value||'').toLowerCase();
  var usados = trabsTemp.map(function(t){return t.nombre;});
  var filtered = trabajadores.filter(function(t){
    return t.toLowerCase().indexOf(q)>=0 && usados.indexOf(t)<0;
  });
  dd.innerHTML='';
  trabDDIndex = -1;
  if(!filtered.length){ dd.style.display='none'; return; }
  filtered.forEach(function(t, i){
    var row = document.createElement('div');
    row.className = 'trab-dd-row';
    row.dataset.idx = i;
    row.dataset.nombre = t;
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px';
    row.onmouseenter=function(){ setTrabDDHighlight(i); };
    var name=document.createElement('span'); name.textContent=t; name.style.flex='1';
    name.onmousedown=function(e){
      e.preventDefault();
      selectTrabFromDD(t);
    };
    var btn=document.createElement('button');
    btn.textContent='×'; btn.title='Eliminar de lista';
    btn.style.cssText='background:none;border:none;color:var(--text3);font-size:17px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0';
    btn.onmousedown=function(e){
      e.preventDefault(); e.stopPropagation();
      trabajadores=trabajadores.filter(function(x){return x!==t;});
      saveTrabajadores();
      renderTrabajadorDropdown();
      showToast('Trabajador eliminado');
    };
    row.appendChild(name); row.appendChild(btn); dd.appendChild(row);
  });
  dd.style.display='block';
}

function setTrabDDHighlight(idx){
  trabDDIndex = idx;
  var rows = document.querySelectorAll('.trab-dd-row');
  rows.forEach(function(r, i){
    r.style.background = i===idx ? 'var(--fram-bg)' : '';
    r.style.color = i===idx ? 'var(--fram)' : '';
  });
  // scroll into view
  if(rows[idx]) rows[idx].scrollIntoView({block:'nearest'});
}

function selectTrabFromDD(nombre){
  document.getElementById('fr-trab-input').value = nombre;
  hideTrabajadorDropdown();
  agregarTrabajadorRow();
  setTimeout(function(){
    var rows = document.querySelectorAll('#fr-trabajadores-list input[type="number"]');
    if(rows.length) { rows[rows.length-1].focus(); rows[rows.length-1].select(); }
  }, 50);
}

function onTrabKeydown(e){
  var dd = document.getElementById('trab-dropdown');
  var ddVisible = dd && dd.style.display !== 'none';
  var rows = ddVisible ? document.querySelectorAll('.trab-dd-row') : [];

  if(e.key === 'ArrowDown'){
    e.preventDefault();
    if(!ddVisible){ showTrabajadorDropdown(); return; }
    var next = Math.min(trabDDIndex+1, rows.length-1);
    setTrabDDHighlight(next);
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    var prev = Math.max(trabDDIndex-1, 0);
    setTrabDDHighlight(prev);
  } else if(e.key === 'Enter'){
    e.preventDefault();
    if(ddVisible && trabDDIndex >= 0 && rows[trabDDIndex]){
      selectTrabFromDD(rows[trabDDIndex].dataset.nombre);
    } else {
      agregarTrabajadorRow();
    }
  } else if(e.key === 'Escape'){
    hideTrabajadorDropdown();
    trabDDIndex = -1;
  } else if(e.key === 'Tab'){
    // Tab selects highlighted item if any, then jumps to cubetas of last row
    if(ddVisible && trabDDIndex >= 0 && rows[trabDDIndex]){
      e.preventDefault();
      selectTrabFromDD(rows[trabDDIndex].dataset.nombre);
    } else {
      var nom = document.getElementById('fr-trab-input').value.trim();
      if(nom){
        e.preventDefault();
        trabAggregandose = true;
        agregarTrabajadorRow();
        setTimeout(function(){
          trabAggregandose = false;
          var cubInputs = document.querySelectorAll('#fr-trabajadores-list input[type="number"]');
          if(cubInputs.length){ cubInputs[cubInputs.length-1].focus(); cubInputs[cubInputs.length-1].select(); }
        }, 50);
      }
    }
  }
}

function showTrabajadorDropdown(){ renderTrabajadorDropdown(); }
function hideTrabajadorDropdown(){ var dd=document.getElementById('trab-dropdown'); if(dd)dd.style.display='none'; trabDDIndex=-1; }
function onTrabajadorInput(){ trabDDIndex=-1; renderTrabajadorDropdown(); }

// ---- Cajas ----
var cajaDDIndex = -1;

function renderCajaDropdown(){
  var dd = document.getElementById('caja-dropdown'); if(!dd) return;
  var q = (document.getElementById('fr-caja-input').value||'').toLowerCase();
  var usadas = cajasTemp.map(function(c){return c.presentacion;});
  var filtered = presentacionesCaja.filter(function(p){
    return p.toLowerCase().indexOf(q)>=0;
  });
  dd.innerHTML='';
  cajaDDIndex = -1;
  if(!filtered.length){ dd.style.display='none'; return; }
  filtered.forEach(function(p, i){
    var row = document.createElement('div');
    row.className = 'caja-dd-row';
    row.dataset.idx = i;
    row.dataset.presentacion = p;
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px';
    row.onmouseenter=function(){ setCajaDDHighlight(i); };
    var name=document.createElement('span'); name.textContent=p; name.style.flex='1';
    name.onmousedown=function(e){
      e.preventDefault();
      selectCajaFromDD(p);
    };
    row.appendChild(name); dd.appendChild(row);
  });
  dd.style.display='block';
}

function setCajaDDHighlight(idx){
  cajaDDIndex = idx;
  var rows = document.querySelectorAll('.caja-dd-row');
  rows.forEach(function(r, i){
    r.style.background = i===idx ? 'var(--green-bg)' : '';
    r.style.color = i===idx ? 'var(--green)' : '';
  });
  if(rows[idx]) rows[idx].scrollIntoView({block:'nearest'});
}

function selectCajaFromDD(presentacion){
  document.getElementById('fr-caja-input').value = presentacion;
  hideCajaDropdown();
  agregarCajaRow(false);
  // focus the cantidad input of the last added row for quick entry
  setTimeout(function(){
    var rows = document.querySelectorAll('#fr-cajas-list input[type="number"]');
    if(rows.length){ rows[rows.length-1].focus(); rows[rows.length-1].select(); }
  }, 50);
}

function onCajaKeydown(e){
  var dd = document.getElementById('caja-dropdown');
  var ddVisible = dd && dd.style.display !== 'none';
  var rows = ddVisible ? document.querySelectorAll('.caja-dd-row') : [];

  if(e.key === 'ArrowDown'){
    e.preventDefault();
    if(!ddVisible){ showCajaDropdown(); return; }
    var next = Math.min(cajaDDIndex+1, rows.length-1);
    setCajaDDHighlight(next);
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    var prev = Math.max(cajaDDIndex-1, 0);
    setCajaDDHighlight(prev);
  } else if(e.key === 'Enter'){
    e.preventDefault();
    if(ddVisible && cajaDDIndex >= 0 && rows[cajaDDIndex]){
      selectCajaFromDD(rows[cajaDDIndex].dataset.presentacion);
    } else {
      agregarCajaRow();
    }
  } else if(e.key === 'Escape'){
    hideCajaDropdown();
    cajaDDIndex = -1;
  } else if(e.key === 'Tab'){
    if(ddVisible && cajaDDIndex >= 0 && rows[cajaDDIndex]){
      e.preventDefault();
      selectCajaFromDD(rows[cajaDDIndex].dataset.presentacion);
    }
  }
}

function showCajaDropdown(){ renderCajaDropdown(); }
function hideCajaDropdown(){ var dd=document.getElementById('caja-dropdown'); if(dd)dd.style.display='none'; cajaDDIndex=-1; }
function onCajaInput(){ cajaDDIndex=-1; renderCajaDropdown(); }

function renderCajasRows(){
  var cont = document.getElementById('fr-cajas-list');
  cont.innerHTML='';
  cajasTemp.forEach(function(c, idx){
    var row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 72px 72px 28px;gap:8px;align-items:center;margin-bottom:6px';
    var secOpts = [1,2,3,4].map(function(n){
      return '<option value="'+n+'"'+(c.sector==n?' selected':'')+'>'+n+'</option>';
    }).join('');
    row.innerHTML =
      '<input type="text" value="'+c.presentacion+'" readonly style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);font-size:13px;font-weight:500;color:var(--text);outline:none">'+
      '<select onchange="cajasTemp['+idx+'].sector=parseInt(this.value)"'+
      ' style="width:100%;padding:9px 4px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);font-size:13px;font-weight:600;color:var(--text);outline:none;-webkit-appearance:none;appearance:none;text-align:center">'+secOpts+'</select>'+
      '<input type="number" value="'+(c.cantidad||'')+'" placeholder="0" min="0" step="1"'+
      ' oninput="cajasTemp['+idx+'].cantidad=parseFloat(this.value)||0;actualizarTotalCajas()"'+
      ' onchange="cajasTemp['+idx+'].cantidad=parseFloat(this.value)||0;actualizarTotalCajas()"'+
      ' onblur="cajasTemp['+idx+'].cantidad=parseFloat(this.value)||0;actualizarTotalCajas()"'+
      ' style="width:100%;padding:9px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);font-size:14px;font-weight:600;color:var(--green);font-family:var(--mono);text-align:center;outline:none">'+
      '<button onclick="removeCaja('+idx+')" title="Eliminar"'+
      ' style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;flex-shrink:0">×</button>';
    cont.appendChild(row);
  });
  actualizarTotalCajas();
}

function actualizarTotalCajas(){
  var inputs = document.querySelectorAll('#fr-cajas-list input[type="number"]');
  var tot = 0;
  inputs.forEach(function(inp, idx){
    var v = parseFloat(inp.value)||0;
    if(cajasTemp[idx]) cajasTemp[idx].cantidad = v;
    tot += v;
  });
  document.getElementById('fr-total-cajas').textContent = tot;
}

function agregarCajaRow(refocusName){
  var inp = document.getElementById('fr-caja-input');
  var secInp = document.getElementById('fr-caja-sector-input');
  var cantInp = document.getElementById('fr-caja-cantidad-input');
  var p = inp.value.trim();
  var sector = secInp ? parseInt(secInp.value)||1 : 1;
  if(!p){ showToast('Escribe o selecciona una presentación'); return; }
  if(cajasTemp.find(function(c){return c.presentacion===p && c.sector===sector;})){
    showToast('Ya existe esa presentación en el sector '+sector); return;
  }
  // save new presentacion if not already in list
  if(presentacionesCaja.indexOf(p)<0){
    presentacionesCaja.push(p);
    presentacionesCaja.sort(function(a,b){return a.localeCompare(b,'es');});
    savePresentaciones();
  }
  var cantidad = cantInp ? (parseFloat(cantInp.value)||0) : 0;
  cajasTemp.push({presentacion:p, sector:sector, cantidad:cantidad});
  inp.value='';
  if(cantInp) cantInp.value='';
  hideCajaDropdown();
  renderCajasRows();
  if(refocusName !== false){
    setTimeout(function(){ inp.focus(); }, 50);
  }
}

function updateCajaSelect(){ /* kept for compatibility */ }
function removeCaja(idx){ cajasTemp.splice(idx,1); renderCajasRows(); }

// ---- Defectos ----
var DEFECTOS = ['sobremadura','irregular','desgrane','deforme','hongos'];
function recalcDefectos(){
  // muestra = sum of all parameters
  var totalDef = 0;
  DEFECTOS.forEach(function(d){
    totalDef += parseFloat(document.getElementById('fr-d-'+d).value)||0;
  });
  // update muestra field (readonly, auto-calculated)
  var muestraEl = document.getElementById('fr-muestra');
  var muestra = totalDef;
  muestraEl.value = muestra > 0 ? muestra.toFixed(2) : '';
  // update % per defecto
  DEFECTOS.forEach(function(d){
    var v = parseFloat(document.getElementById('fr-d-'+d).value)||0;
    var pctEl = document.getElementById('fr-p-'+d);
    pctEl.textContent = muestra>0 ? (v/muestra*100).toFixed(1)+'%' : '—';
  });
  var resumen = document.getElementById('fr-defectos-resumen');
  if(muestra>0){
    resumen.style.display='block';
    document.getElementById('fr-total-defectos').textContent = muestra.toFixed(2)+' kg';
    document.getElementById('fr-pct-defecto').textContent = '100%';
  } else {
    resumen.style.display='none';
  }
}

// ---- Guardar registro ----
function guardarRegistroFram(){
  var fecha = document.getElementById('fr-fecha').value;
  if(!fecha){ showToast('Selecciona una fecha'); return; }
  if(!trabsTemp.length){ showToast('Agrega al menos un trabajador'); return; }
  var totalCubetas = trabsTemp.reduce(function(a,t){return a+(parseFloat(t.cubetas)||0);},0);
  var totalCajas = cajasTemp.reduce(function(a,c){return a+(parseFloat(c.cantidad)||0);},0);
  var merma = parseFloat(document.getElementById('fr-merma').value)||0;
  var muestra = parseFloat(document.getElementById('fr-muestra').value)||0; // auto-computed from params
  var defectos = {};
  DEFECTOS.forEach(function(d){
    defectos[d] = parseFloat(document.getElementById('fr-d-'+d).value)||0;
  });
  var ciclo = document.getElementById('fr-ciclo').value;

  var fechaDate = new Date(fecha+'T12:00:00');
  var fechaLbl = fechaDate.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});

  // sector(es) representados en este registro (derivados de los sectores de trabajadores y cajas si aplica)
  var sectoresEnReg = cajasTemp.map(function(c){return c.sector;});
  var sectorPrincipal = sectoresEnReg.length ? sectoresEnReg[0] : framSectorSel;

  var reg = {
    id: framEditId || Date.now(),
    fecha: fecha, fechaLbl: fechaLbl,
    sector: sectorPrincipal,
    ciclo: ciclo,
    trabajadores: trabsTemp.map(function(t){return {nombre:t.nombre, cubetas:t.cubetas};}),
    cajas: cajasTemp.map(function(c){return {presentacion:c.presentacion, sector:c.sector, cantidad:c.cantidad};}),
    totalCubetas: totalCubetas,
    totalCajas: totalCajas,
    merma: merma,
    muestra: muestra,
    defectos: defectos
  };

  if(framEditId){
    var idx = framRegistros.findIndex(function(r){return r.id===framEditId;});
    if(idx>=0) framRegistros[idx] = reg;
    else framRegistros.unshift(reg);
  } else {
    framRegistros.unshift(reg);
  }
  saveFramRegistros();
  sbSaveFramRegistro(reg);

  var wasEdit = !!framEditId;
  framEditId = null;

  showToast(wasEdit ? '✅ Registro actualizado' : '✅ Registro guardado — '+totalCubetas+' cubetas');
  var btn = document.getElementById('btn-fram-guardar');
  btn.textContent='Guardado ✓'; btn.style.background='var(--green)';
  setTimeout(function(){
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;stroke-width:2"><path d="M12 5v14M5 12h14"/></svg> Guardar registro';
    btn.style.background='var(--fram)';
    framTab('hist');
  }, 1200);
}

function framTab(t, forceNew){
  document.getElementById('ft-nuevo').classList.toggle('active', t==='nuevo');
  document.getElementById('ft-hist').classList.toggle('active', t==='hist');
  document.getElementById('fram-form-sec').style.display = t==='nuevo'?'block':'none';
  document.getElementById('fram-hist-sec').style.display = t==='hist'?'block':'none';
  if(t==='nuevo' && (!framEditId || forceNew)){ framEditId=null; initFramForm(); }
  if(t==='hist') renderFramHist();
}

function editarFramRegistro(id){
  var reg = framRegistros.find(function(r){return r.id===id;});
  if(!reg) return;
  document.getElementById('ft-nuevo').classList.add('active');
  document.getElementById('ft-hist').classList.remove('active');
  document.getElementById('fram-form-sec').style.display = 'block';
  document.getElementById('fram-hist-sec').style.display = 'none';
  initFramForm(reg);
  window.scrollTo(0,0);
}

// ---- Historial ----
function renderFramHist(){
  var filSec = document.getElementById('fr-fil-sector').value;
  var filCic = document.getElementById('fr-fil-ciclo').value;

  // rebuild ciclo filter options
  var ciclosEnFram = [];
  framRegistros.forEach(function(r){ if(r.ciclo && ciclosEnFram.indexOf(r.ciclo)<0) ciclosEnFram.push(r.ciclo); });
  ciclosEnFram.sort();
  var filCicloSel = document.getElementById('fr-fil-ciclo');
  filCicloSel.innerHTML='<option value="todos">Todos los ciclos</option>';
  ciclosEnFram.forEach(function(c){
    var o=document.createElement('option'); o.value=c; o.textContent=c;
    if(c===filCic) o.selected=true;
    filCicloSel.appendChild(o);
  });

  var data = framRegistros.filter(function(r){
    var regSectores = (r.cajas||[]).map(function(c){return String(c.sector);});
    var secOk = filSec==='todos' || regSectores.indexOf(filSec)>=0 || (regSectores.length===0 && String(r.sector)===filSec);
    var cicOk = filCic==='todos' || r.ciclo===filCic;
    return secOk && cicOk;
  });

  var list = document.getElementById('fram-hist-list');
  if(!data.length){
    list.innerHTML='<div class="empty"><div class="empty-icon">🍇</div><div class="empty-text">Sin registros para este filtro.</div></div>';
    return;
  }
  list.innerHTML='';
  data.forEach(function(r){
    var item = document.createElement('div');
    item.className='fram-hist-item';
    item.innerHTML=
      '<div class="fram-hist-header">'+
        '<div>'+
          '<div class="fram-hist-fecha">'+r.fechaLbl+'</div>'+
          '<div style="font-size:12px;color:var(--text3);margin-top:2px">'+(r.ciclo||'')+'</div>'+
        '</div>'+
        '<div class="fram-hist-cubetas">'+r.totalCajas+' cajas</div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">'+
        '<span class="tag fram">🍇 '+r.totalCubetas+' cubetas</span>'+
        (r.totalCajas?'<span class="tag general">📦 '+r.totalCajas+' cajas</span>':'')+
        (r.merma?'<span class="tag camote">Merma '+r.merma+' kg</span>':'')+
      '</div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">'+
        '<button onclick="editarFramRegistro('+r.id+')" style="padding:6px 12px;border-radius:var(--radius);border:1px solid var(--border);background:transparent;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font)">Editar</button>'+
        '<button id="delbtn-'+r.id+'" onclick="confirmDelFram('+r.id+')" style="padding:6px 12px;border-radius:var(--radius);border:1px solid var(--fram-border);background:transparent;color:var(--fram);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font)">Eliminar</button>'+
      '</div>';
    item.addEventListener('click', function(e){
      if(e.target.tagName==='BUTTON') return;
      verFramRegistro(r);
    });
    list.appendChild(item);
  });
}

function confirmDelFram(id){
  var btn = document.getElementById('delbtn-'+id);
  if(!btn) return;
  if(btn.dataset.confirm==='1'){
    framRegistros = framRegistros.filter(function(r){return r.id!==id;});
    saveFramRegistros();
    sbDeleteFramRegistro(id);
    renderFramHist();
    showToast('Registro eliminado');
  } else {
    btn.dataset.confirm='1'; btn.textContent='⚠️ Confirmar';
    setTimeout(function(){
      if(btn){ btn.dataset.confirm=''; btn.textContent='Eliminar'; }
    }, 2500);
  }
}

function verFramRegistro(r){
  var DEFECTOS_LBL = {sobremadura:'Sobremadura',irregular:'Irregular',desgrane:'Desgrane',deforme:'Deforme',hongos:'Hongos'};
  var trabRows = (r.trabajadores||[]).map(function(t){
    return '<div class="modal-row"><span class="modal-key">'+t.nombre+'</span><span class="modal-val">'+t.cubetas+' cubetas</span></div>';
  }).join('');
  var cajaRows = (r.cajas||[]).map(function(c){
    return '<div class="modal-row"><span class="modal-key">'+c.presentacion+(c.sector?' (Sector '+c.sector+')':'')+'</span><span class="modal-val">'+c.cantidad+' cajas</span></div>';
  }).join('');
  var defRows = '';
  if(r.defectos){
    var muestra = r.muestra||0;
    Object.keys(DEFECTOS_LBL).forEach(function(k){
      var v=r.defectos[k]||0;
      var pct=muestra>0?(v/muestra*100).toFixed(1)+'%':'—';
      defRows+='<div class="modal-row"><span class="modal-key">'+DEFECTOS_LBL[k]+'</span><span class="modal-val" style="font-family:var(--mono)">'+v+' kg <span style="color:var(--text3)">'+pct+'</span></span></div>';
    });
  }
  document.getElementById('mo-title').innerHTML='🍇 '+r.fechaLbl+' &nbsp;<span class="chip fram">Frambuesa</span>';
  document.getElementById('mo-body').innerHTML=
    '<div class="modal-row"><span class="modal-key">Fecha</span><span class="modal-val">'+r.fechaLbl+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Ciclo</span><span class="modal-val">'+(r.ciclo||'—')+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Total cubetas</span><span class="modal-val" style="font-family:var(--mono);color:var(--fram);font-size:16px">'+r.totalCubetas+'</span></div>'+
    '<div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin:10px 0 4px">Recolección</div>'+
    trabRows+
    (cajaRows?'<div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin:10px 0 4px">Clasificación</div>'+cajaRows:'')+
    '<div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin:10px 0 4px">Merma</div>'+
    '<div class="modal-row"><span class="modal-key">Merma total</span><span class="modal-val" style="font-family:var(--mono)">'+(r.merma||0)+' kg</span></div>'+
    (r.muestra?'<div class="modal-row"><span class="modal-key">Muestra analizada</span><span class="modal-val" style="font-family:var(--mono)">'+r.muestra+' kg</span></div>':'')+ 
    (defRows?'<div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin:10px 0 4px">Defectos en muestra</div>'+defRows:'')+
    '<div style="margin-top:14px"><button onclick="eliminarFramDesdeModal('+r.id+')" style="width:100%;padding:10px;border-radius:var(--radius);border:1px solid var(--fram-border);background:transparent;color:var(--fram);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font)">🗑 Eliminar registro</button></div>';
  document.getElementById('overlay').classList.add('open');
}

function eliminarFramDesdeModal(id){
  var btn = event.target;
  if(btn.dataset.confirm==='1'){
    framRegistros = framRegistros.filter(function(r){return r.id!==id;});
    saveFramRegistros();
    sbDeleteFramRegistro(id);
    document.getElementById('overlay').classList.remove('open');
    renderFramHist();
    showToast('Registro eliminado');
  } else {
    btn.dataset.confirm='1'; btn.textContent='⚠️ Confirmar eliminación';
    setTimeout(function(){if(btn){btn.dataset.confirm='';btn.textContent='🗑 Eliminar registro';}},2500);
  }
}

// ---- Init frambuesa on load ----
(function(){
  // Recalcular total de cajas al hacer click en cualquier parte de la pantalla
  document.addEventListener('click', function(e){
    var sec = document.getElementById('sc-fram');
    if(sec && sec.classList.contains('active')){
      actualizarTotalCajas();
      actualizarTotalCubetas();
    }
  });
  // También recalcular en cualquier evento de input/cambio dentro de frambuesa
  document.addEventListener('input', function(e){
    var sec = document.getElementById('sc-fram');
    if(sec && sec.classList.contains('active') && e.target && e.target.type==='number'){
      if(sec.contains(e.target)){
        actualizarTotalCajas();
        actualizarTotalCubetas();
      }
    }
  });
  // Ensure base presentaciones always exist
  PRESENTACIONES_CAJA.forEach(function(p){
    if(presentacionesCaja.indexOf(p)<0){ presentacionesCaja.push(p); }
  });
  savePresentaciones();
})();
// ============================================================

</script>
