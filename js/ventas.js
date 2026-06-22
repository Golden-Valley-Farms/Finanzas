// ---- VENTAS ----
var envios = [];
try{var sve=localStorage.getItem('cc_envios');if(sve)envios=JSON.parse(sve);}catch(e){}
// Cargar envíos embebidos si no hay datos en localStorage
try{if(!envios.length && typeof ENVIOS_IMPORTADOS!=='undefined' && ENVIOS_IMPORTADOS.length){envios=ENVIOS_IMPORTADOS.slice();localStorage.setItem('cc_envios',JSON.stringify(envios));}}catch(e){}
function saveEnvios(){try{localStorage.setItem('cc_envios',JSON.stringify(envios));}catch(e){}}

// VARIEDADES definido en catalogos.js
var venFiltro = 'todas';

function initPartidas(){
  return [];
}
var partidasTemp = initPartidas();

function updateVarSelect(){
  var sel = document.getElementById('vf-var-select');
  if(!sel) return;
  var usadas = partidasTemp.map(function(p){ return p.variedad; });
  sel.innerHTML = '<option value="">— Selecciona variedad —</option>';
  VARIEDADES.forEach(function(v){
    if(usadas.indexOf(v) < 0){
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    }
  });
  // ocultar selector si ya están todas
  var wrap = document.getElementById('vf-add-variedad-wrap');
  if(wrap) wrap.style.display = usadas.length >= VARIEDADES.length ? 'none' : 'block';
}

function addPartidaDesdeSelect(){
  var sel = document.getElementById('vf-var-select');
  var v = sel ? sel.value : '';
  if(!v){ showToast('Selecciona una variedad'); return; }
  partidasTemp.push({variedad:v, sector:'', hectareas:'', pesoNeto:'', toneladas:'', precio:''});
  renderPartidas();
}

function removePartida(idx){
  partidasTemp.splice(idx, 1);
  renderPartidas();
}

// Populate ciclo select in ventas form
(function(){
  var s=document.getElementById('vf-ciclo');
  CICLOS.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s.appendChild(o);});
  // set default based on today
  s.value = cicloFromFecha(document.getElementById('f-fecha').value);
})();

// Set today as default date in ventas form
(function(){
  var fi=document.getElementById('vf-fecha');
  var tz=hoy.getTimezoneOffset()*60000;
  fi.value=new Date(hoy-tz).toISOString().slice(0,10);
})();

var editandoEnvioId = null;
var envioActual = null;

function editarEnvio(e){
  closeModal();
  editandoEnvioId = e.id;
  // poblar encabezado
  document.getElementById('vf-num').value = e.num||'';
  document.getElementById('vf-folio').value = e.folio||'';
  document.getElementById('vf-fecha').value = e.fecha||'';
  document.getElementById('vf-loc').value = e.loc||'jal';
  document.getElementById('vf-tipo-envio').value = e.loc||'jal';
  // Populate date field
  document.getElementById('vf-anio').value = isoToDisplay(e.fecha||'');
  document.getElementById('vf-anio-picker').value = e.fecha||'';
  document.getElementById('vf-cliente').value = e.cliente||'';
  document.getElementById('vf-ciclo').value = e.ciclo||'';
  document.getElementById('vf-flete').value = e.flete||'';
  document.getElementById('vf-factura').value = e.factura||'';
  // poblar partidas: solo las que venían en el envío guardado
  partidasTemp = e.partidas.filter(function(p){ return p.pesoNeto||p.precio||p.hectareas||p.sector; }).map(function(p){
    return {
      variedad:p.variedad, sector:p.sector||'',
      hectareas:p.hectareas||'',
      pesoNeto:p.pesoNeto||'', toneladas:p.toneladas||'',
      precio:p.precio||''
    };
  });
  if(!partidasTemp.length) partidasTemp = [];
  // cambiar label del botón y título
  document.getElementById('btn-ven-guardar').innerHTML=
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;stroke-width:2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg> Guardar cambios';
  document.getElementById('ven-form-sec').querySelector('.step-label').textContent='Editando envio';
  venTab('nuevo');
}

function venTab(t){
  ['lista','nuevo','comer'].forEach(function(tab){
    var btn=document.getElementById('vt-'+tab);
    if(btn) btn.classList.toggle('active',tab===t);
  });
  document.getElementById('ven-lista-sec').style.display = t==='lista'?'block':'none';
  document.getElementById('ven-form-sec').style.display = t==='nuevo'?'block':'none';
  var co=document.getElementById('comer-form-sec');
  if(co) co.style.display = t==='comer'?'block':'none';
  if(t==='lista'){
    editandoEnvioId=null;
    document.getElementById('btn-ven-guardar').innerHTML=
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;stroke-width:2"><path d="M12 5v14M5 12h14"/></svg> Guardar envio';
    document.getElementById('ven-form-sec').querySelector('.step-label').textContent='Encabezado del envio';
    renderEnvios();
  }
  if(t==='nuevo'){ renderPartidas(); updateVarSelect(); if(!editandoEnvioId) initNuevoEnvioForm(); else onTipoEnvioChange(); }
  if(t==='comer') initComerForm();
}

function renderPartidas(){
  var cont = document.getElementById('vf-partidas'); cont.innerHTML='';

  partidasTemp.forEach(function(p,idx){
    var varColor = p.variedad==='Blanco Criollo' ? 'var(--jal)' :
                   p.variedad==='Amarillo Covington' ? 'var(--camote)' :
                   p.variedad==='Morado Criollo' ? 'var(--nay)' : 'var(--fram)';
    var d=document.createElement('div'); d.className='partida-card';

    var secOpts = '<option value="">—</option>';
    for(var s=1; s<=10; s++){
      secOpts += '<option value="'+s+'"'+(p.sector==s?' selected':'')+'>'+s+'</option>';
    }

    d.innerHTML=
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">'+
        '<span style="font-size:13px;font-weight:600;color:'+varColor+'">'+p.variedad+'</span>'+
        '<button onclick="removePartida('+idx+')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:18px;line-height:1;padding:2px 6px;border-radius:6px" title="Quitar variedad">×</button>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">'+
        '<div><label>Sector</label><select onchange="partidasTemp['+idx+'].sector=this.value">'+secOpts+'</select></div>'+
        '<div><label>Hectáreas</label><input type="number" placeholder="0.00" min="0" step="0.01" value="'+p.hectareas+'" onchange="partidasTemp['+idx+'].hectareas=this.value"></div>'+
        '<div><label>Peso Neto (kg)</label><input type="number" id="ppn-'+idx+'" placeholder="0" min="0" value="'+p.pesoNeto+'" onchange="partidasTemp['+idx+'].pesoNeto=this.value;autoCalc('+idx+')"></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'+
        '<div><label>Toneladas</label><input type="number" id="ptn-'+idx+'" placeholder="0.000" min="0" step="0.001" value="'+p.toneladas+'" readonly style="background:var(--surface2);color:var(--text3)"></div>'+
        '<div><label>Precio x kg</label><div class="monto-wrap"><span class="monto-prefix">$</span><input type="number" placeholder="0" min="0" value="'+p.precio+'" style="padding-left:24px" onchange="partidasTemp['+idx+'].precio=this.value;autoCalc('+idx+')"></div></div>'+
        '<div><label>Total</label><div id="ptot-'+idx+'" style="padding:10px 12px;background:var(--green-bg);border-radius:var(--radius);font-size:13px;font-weight:600;color:var(--green);font-family:var(--mono)">'+calcTotal(p)+'</div></div>'+
      '</div>';

    cont.appendChild(d);
  });

  updateVarSelect();
}

function autoCalc(idx){
  var p=partidasTemp[idx];
  var pb=parseFloat(p.pesoNeto)||0;
  // toneladas = peso neto / 1000
  p.toneladas=pb>0?(pb/1000).toFixed(3):'';
  var pt=document.getElementById('ptn-'+idx); if(pt) pt.value=p.toneladas;
  // total = kg * precio x kg
  var el=document.getElementById('ptot-'+idx);
  if(el) el.textContent=calcTotal(p);
}

function calcTotal(p){
  var kg=parseFloat(p.pesoNeto)||0;
  var precio=parseFloat(p.precio)||0;
  if(!kg||!precio) return '$0';
  return fmt(kg*precio);
}

function guardarEnvio(){
  // Sync loc and fecha from new fields
  var tipoSel = document.getElementById('vf-tipo-envio').value;
  document.getElementById('vf-loc').value = tipoSel;
  var fechaDisplay = document.getElementById('vf-anio').value;
  var fechaISO = fechaEnvioToISO(fechaDisplay);
  if(fechaISO) document.getElementById('vf-fecha').value = fechaISO;
  var num=document.getElementById('vf-num').value.trim();
  var folio=document.getElementById('vf-folio').value.trim();
  var fecha=fechaISO || document.getElementById('vf-fecha').value;
  var cliente=document.getElementById('vf-cliente').value.trim();
  var loc=tipoSel;
  var cicloV=document.getElementById('vf-ciclo').value;
  var flete=parseFloat(document.getElementById('vf-flete').value)||0;
  var fleteCompraEnvio=parseFloat(document.getElementById('vf-flete-compra')?document.getElementById('vf-flete-compra').value||0:0)||0;
  var factura=document.getElementById('vf-factura').value.trim();

  if(!fecha){showToast('Selecciona una fecha');return;}
  if(!cliente){showToast('Ingresa el cliente');return;}
  agregarClienteSiNuevo(cliente);
  if(!partidasTemp.length){showToast('Agrega al menos una variedad');return;}

  var partidas=partidasTemp.map(function(p){
    return {
      variedad:p.variedad,
      sector: p.sector || '',
      hectareas:parseFloat(p.hectareas)||0,
      pesoNeto:parseFloat(p.pesoNeto)||0,
      toneladas:parseFloat(p.toneladas)||0,
      precio:parseFloat(p.precio)||0,
      total:(parseFloat(p.pesoNeto)||0)*(parseFloat(p.precio)||0)
    };
  });

  var totalVenta=partidas.reduce(function(a,p){return a+p.total;},0);
  var totalConFlete=totalVenta+(flete||0);
  var fechaLbl=new Date(fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});

  var envioObj={
    num:num, folio:folio, fecha:fecha, fechaLbl:fechaLbl,
    cliente:cliente, loc:loc, ciclo:cicloV,
    flete:flete, fleteCompra:fleteCompraEnvio, factura:factura, partidas:partidas, totalVenta:totalVenta, total:totalConFlete
  };

  if(editandoEnvioId){
    envioObj.id=editandoEnvioId;
    var idx=envios.findIndex(function(e){return e.id===editandoEnvioId;});
    if(idx>=0) envios[idx]=envioObj; else envios.unshift(envioObj);
    showToast('Envio actualizado');
  } else {
    envioObj.id=Date.now();
    envios.unshift(envioObj);
    showToast('Envio guardado: '+fmt(totalVenta));
  }
  saveEnvios();
  sbSaveEnvio(envioObj);
  if(fleteCompraEnvio>0){
    var gFC={id:Date.now()+10,fechaVal:fecha,fechaLbl:fechaLbl||fecha,
      loc:loc,cultivo:'general',cat:'Fletes',desc:'Flete compra envio '+num,
      monto:fleteCompraEnvio,ciclo:cicloV||'',sector:'',autoGen:true};
    gastos.unshift(gFC); save(); sbSaveGasto(gFC);
  }

  // reset form
  editandoEnvioId = null;
  document.getElementById('vf-folio').value='';
  document.getElementById('vf-cliente').value='';
  document.getElementById('vf-flete').value='';
  if(document.getElementById('vf-flete-compra')) document.getElementById('vf-flete-compra').value='';
  document.getElementById('vf-factura').value='';
  partidasTemp=initPartidas();
  renderPartidas();
  showToast('Envio guardado: '+fmt(totalVenta));
  venTab('lista');
}

function renderEnvios(){
  var wfCiclo=document.getElementById('ven-wf-ciclo'); wfCiclo.innerHTML='';
  var wfNeg=document.getElementById('ven-wf-neg'); wfNeg.innerHTML='';

  function mkBtn(cont,v,l,a){
    var b=document.createElement('button'); b.className='wf-btn'+(a?' active':''); b.textContent=l;
    b.onclick=function(){venFiltro=v;renderEnvios();}; cont.appendChild(b);
  }

  // Fila 1: ciclos
  CICLOS.forEach(function(c){
    if(envios.some(function(e){return e.ciclo===c;})) mkBtn(wfCiclo,'ciclo:'+c,c,venFiltro==='ciclo:'+c);
  });

  // Fila 2: negocio/ubicacion
  mkBtn(wfNeg,'todas','Todos',venFiltro==='todas');
  mkBtn(wfNeg,'jal','Jalisco',venFiltro==='jal');
  mkBtn(wfNeg,'nay','Nayarit',venFiltro==='nay');
  mkBtn(wfNeg,'com','Comercial.',venFiltro==='com');

  var list=document.getElementById('ven-lista');
  var data=venFiltro==='todas'?envios:
    venFiltro.indexOf('ciclo:')===0?envios.filter(function(e){return e.ciclo===venFiltro.replace('ciclo:','');}):
    envios.filter(function(e){return e.loc===venFiltro;});

  if(!data.length){
    list.innerHTML='<div class="empty"><div class="empty-icon">&#127808;</div><div class="empty-text">Sin envios registrados aun.</div></div>'; return;
  }
  list.innerHTML='';
  var locNames={jal:'Jalisco',nay:'Nayarit',com:'Comercial.'};
  data.forEach(function(e){
    var item=document.createElement('div'); item.className='envio-item';
    var miniRows = e.partidas.map(function(p){
      if(!p.pesoNeto && !p.hectareas && !p.precio) return '';
      return '<tr>'+
        '<td>'+p.variedad+'</td>'+
        '<td style="text-align:right">'+(p.sector||'-')+'</td>'+
        '<td style="text-align:right">'+(p.hectareas||'-')+'</td>'+
        '<td style="text-align:right">'+(p.pesoNeto?p.pesoNeto.toLocaleString('es-MX'):'-')+'</td>'+
        '<td style="text-align:right">'+(p.precio?'$'+p.precio:'-')+'</td>'+
        '<td style="text-align:right;color:var(--green);font-weight:600">'+fmt(p.total)+'</td>'+
      '</tr>';
    }).join('');

    var fleteRow = e.flete ?
      '<tr>'+
        '<td colspan="5" style="color:var(--text3);padding-top:8px;border-top:1px solid var(--border)">Flete</td>'+
        '<td style="text-align:right;color:var(--camote);font-weight:600;padding-top:8px;border-top:1px solid var(--border)">'+fmt(e.flete)+'</td>'+
      '</tr>' : '';

    item.innerHTML=
      '<div class="envio-header">'+
        '<div>'+
          '<div class="envio-num">'+(e.num||'Sin folio')+'</div>'+
          '<div class="envio-meta">'+e.fechaLbl+' · '+e.cliente+'</div>'+
        '</div>'+
        '<div class="envio-total">'+fmt(e.total)+'</div>'+
      '</div>'+
      '<div class="envio-tags" style="margin-bottom:8px">'+
        '<span class="tag '+(e.loc||'jal')+'">'+(locNames[e.loc]||e.loc)+'</span>'+
        '<span class="tag general">'+e.ciclo+'</span>'+
      '</div>'+
      (miniRows?
        '<table class="ven-modal-table" style="margin-top:0">'+
          '<thead><tr>'+
            '<th>Variedad</th>'+
            '<th style="text-align:right">Sec.</th>'+
            '<th style="text-align:right">Ha</th>'+
            '<th style="text-align:right">P.Neto</th>'+
            '<th style="text-align:right">$/kg</th>'+
            '<th style="text-align:right">Total</th>'+
          '</tr></thead>'+
          '<tbody>'+miniRows+fleteRow+'</tbody>'+
        '</table>':''
      );
    item.addEventListener('click',function(){verEnvio(e);});
    list.appendChild(item);
  });
}

function verEnvio(e){
  envioActual=e;
  var locNames={jal:'Jalisco',nay:'Nayarit',com:'Comercial.'};
  var rows=e.partidas.map(function(p){
    var tha=p.hectareas>0?(p.toneladas/p.hectareas).toFixed(2):'-';
    var secTxt = p.sector || '-';
    return '<tr>'+
      '<td>'+p.variedad+'</td>'+
      '<td style="text-align:right">'+secTxt+'</td>'+
      '<td style="text-align:right">'+p.hectareas+'</td>'+

      '<td style="text-align:right">'+(p.pesoNeto?p.pesoNeto.toLocaleString('es-MX'):'-')+'</td>'+
      '<td style="text-align:right">'+p.toneladas+'</td>'+
      '<td style="text-align:right">'+tha+'</td>'+
      '<td style="text-align:right">'+fmt(p.precio)+'</td>'+
      '<td style="text-align:right;font-weight:600;color:var(--green)">'+fmt(p.total)+'</td>'+
    '</tr>';
  }).join('');

  document.getElementById('mo-title').innerHTML='&#127808; '+(e.num||'Envio')+
    '&nbsp;<span class="chip '+(e.loc||'jal')+'">'+(locNames[e.loc]||e.loc)+'</span>';
  document.getElementById('mo-body').innerHTML=
    '<div class="modal-row"><span class="modal-key">Folio</span><span class="modal-val">'+(e.folio||'-')+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Fecha</span><span class="modal-val">'+e.fechaLbl+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Cliente</span><span class="modal-val">'+e.cliente+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Ciclo</span><span class="modal-val">'+e.ciclo+'</span></div>'+
    (e.factura?'<div class="modal-row"><span class="modal-key">Factura</span><span class="modal-val">'+e.factura+'</span></div>':'')+
    (e.flete?'<div class="modal-row"><span class="modal-key">Flete</span><span class="modal-val" style="color:var(--camote);font-family:var(--mono)">'+fmt(e.flete)+'</span></div>':'')+
    '<div class="modal-row"><span class="modal-key">Total venta</span><span class="modal-val" style="font-family:var(--mono)">'+fmt(e.totalVenta||e.total)+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Total con flete</span><span class="modal-val" style="font-size:16px;color:var(--green);font-family:var(--mono)">'+fmt(e.total)+'</span></div>'+
    '<div style="overflow-x:auto;margin-top:10px">'+
    '<table class="ven-modal-table">'+
      '<thead><tr>'+
        '<th>Variedad</th><th style="text-align:right">Sec.</th><th style="text-align:right">Ha</th>'+
        '<th style="text-align:right">P.Neto</th><th style="text-align:right">Ton</th>'+
        '<th style="text-align:right">Ton/Ha</th><th style="text-align:right">Precio</th><th style="text-align:right">Total</th>'+
      '</tr></thead>'+
      '<tbody>'+rows+'</tbody>'+
    '</table></div>'+
    '<div style="display:flex;gap:8px;margin-top:14px">'+
    '<button class="ven-del-btn" style="flex:1;margin-top:0;border-color:var(--green-border);color:var(--green)" onmouseover="this.style.background=\'var(--green-bg)\'" onmouseout="this.style.background=\'none\'" onclick="editarEnvio(envioActual)">✏️ Editar</button>'+
    '<button id="del-btn-'+e.id+'" class="ven-del-btn" style="flex:1;margin-top:0" onclick="confirmDelEnvio('+e.id+')">Eliminar</button>'+
    '</div>';
  document.getElementById('overlay').classList.add('open');
}

function delEnvio(id){
  envios=envios.filter(function(e){return e.id!==id;});
  saveEnvios(); closeModal(); renderEnvios();
  sbDeleteEnvio(id);
  showToast('Envio eliminado');
}

function confirmDelEnvio(id){
  var btn=document.getElementById('del-btn-'+id);
  if(!btn) return;
  btn.textContent='¿Confirmar eliminación?';
  btn.style.background='var(--camote)';
  btn.onclick=function(){delEnvio(id);};
}


// ---- Importacion Excel ----
var ENVIOS_IMPORTADOS = [];
var CLIENTES_IMPORTADOS = ["B&M","Sabritas"];
// DATOS_IMPORTADOS definido en config.js

function importarGastos(){
  var existentes = gastos.map(function(g){return g.id;});
  var nuevos = DATOS_IMPORTADOS.filter(function(g){return existentes.indexOf(g.id)<0;});
  if(!nuevos.length){showToast('Ya estaban importados');return;}
  gastos = gastos.concat(nuevos);
  gastos.sort(function(a,b){return b.fechaVal>a.fechaVal?1:b.fechaVal<a.fechaVal?-1:0;});
  save(); updateHeader();
  document.getElementById('import-banner').style.display='none';
  showToast('✅ '+nuevos.length+' gastos importados');
  renderHis();
}


// ---- FOLIO AUTO ----
var PREFIJOS = { jal: 'ProdJal', nay: 'ProdNay', com: 'Comer' };

function parseFechaEnvio(str){
  if(!str) return null;
  str = str.trim();
  // YYYY-MM-DD (ISO interno)
  if(/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str+'T12:00:00');
  // D/M/AAAA, DD/M/AAAA, D/MM/AAAA, DD/MM/AAAA
  if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)){
    var p=str.split('/');
    return new Date(p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0')+'T12:00:00');
  }
  // D/M/AA, DD/MM/AA (año corto: 25→2025, 26→2026)
  if(/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(str)){
    var p=str.split('/');
    var yy=parseInt(p[2],10);
    var yyyy= yy<=50 ? 2000+yy : 1900+yy;
    return new Date(yyyy+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0')+'T12:00:00');
  }
  return null;
}

function fechaEnvioToISO(str){
  if(!str) return '';
  str = str.trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  var d = parseFechaEnvio(str);
  if(!d || isNaN(d)) return '';
  var mm = String(d.getMonth()+1).padStart(2,'0');
  var dd = String(d.getDate()).padStart(2,'0');
  return d.getFullYear()+'-'+mm+'-'+dd;
}

function isoToDisplay(isoStr){
  // Convert YYYY-MM-DD to DD/MM/AAAA for display
  if(!isoStr) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(isoStr)){
    var p = isoStr.split('-');
    return p[2]+'/'+p[1]+'/'+p[0];
  }
  return isoStr;
}

function getAnioFromFecha(str){
  var d = parseFechaEnvio(str);
  return d ? d.getFullYear() : new Date().getFullYear();
}

function normalizarFechaEnvio(){
  var field = document.getElementById('vf-anio');
  var d = parseFechaEnvio(field.value);
  if(d && !isNaN(d)){
    var dd = String(d.getDate()).padStart(2,'0');
    var mm = String(d.getMonth()+1).padStart(2,'0');
    field.value = dd+'/'+mm+'/'+d.getFullYear();
    onTipoEnvioChange();
  }
}

function onPickerChange(){
  var picker = document.getElementById('vf-anio-picker');
  if(picker && picker.value){
    document.getElementById('vf-anio').value = isoToDisplay(picker.value);
    onTipoEnvioChange();
  }
}

function onFechaEnvioInput(){
  // Allow digits and slashes freely; trigger recalc when valid
  var val = document.getElementById('vf-anio').value;
  val = val.replace(/[^0-9\/]/g,'');
  document.getElementById('vf-anio').value = val;
  // Only recalc when we have a recognizable date
  if(parseFechaEnvio(val)) onTipoEnvioChange();
}

function getNextNumEnvio(tipo, anio, excluirId){
  // Match ProdJal/CUALQUIER_AÑO/ — el año ya está en el folio, solo evitamos duplicados globales por tipo
  var prefixTipo = PREFIJOS[tipo] + '/' + anio + '/';
  var lista = envios;
  try{ var sv=localStorage.getItem('cc_envios'); if(sv) lista=JSON.parse(sv); }catch(e){}
  var usados = [];
  lista.forEach(function(e){
    if(excluirId && String(e.id)===String(excluirId)) return;
    if(!e.num) return;
    // Match same tipo AND same año
    if(e.num.indexOf(prefixTipo) === 0){
      var resto = e.num.slice(prefixTipo.length);
      var n = parseInt(resto, 10);
      if(!isNaN(n)) usados.push(n);
    }
  });
  var siguiente = 1;
  usados.sort(function(a,b){return a-b;});
  usados.forEach(function(n){ if(n === siguiente) siguiente++; });
  return siguiente;
}

function buildNumEnvio(tipo, anio, seq){
  var pad = seq < 10 ? '00' + seq : seq < 100 ? '0' + seq : '' + seq;
  return PREFIJOS[tipo] + '/' + anio + '/' + pad;
}

function onTipoEnvioChange(){
  var tipo = document.getElementById('vf-tipo-envio').value;
  var fechaVal = document.getElementById('vf-anio').value;
  var anio = getAnioFromFecha(fechaVal);
  // Sync hidden fields
  document.getElementById('vf-loc').value = tipo;
  var isoFecha = fechaEnvioToISO(fechaVal);
  if(isoFecha) document.getElementById('vf-fecha').value = isoFecha;
  // Only auto-generate num if not editing
  if(!editandoEnvioId){
    var seq = getNextNumEnvio(tipo, anio, null);
    document.getElementById('vf-num').value = buildNumEnvio(tipo, anio, seq);
  }
}

function initNuevoEnvioForm(){
  var hoy = new Date();
  var tz = hoy.getTimezoneOffset() * 60000;
  var isoStr = new Date(hoy - tz).toISOString().slice(0, 10);
  var displayStr = isoToDisplay(isoStr);
  document.getElementById('vf-anio').value = displayStr;
  document.getElementById('vf-anio-picker').value = isoStr;
  document.getElementById('vf-fecha').value = isoStr;
  var tipo = document.getElementById('vf-tipo-envio').value;
  document.getElementById('vf-loc').value = tipo;
  var anio = getAnioFromFecha(displayStr);
  var seq = getNextNumEnvio(tipo, anio, null);
  document.getElementById('vf-num').value = buildNumEnvio(tipo, anio, seq);
}

// ---- CLIENTES ----
var clientes = [];
try{var svc=localStorage.getItem('cc_clientes');if(svc)clientes=JSON.parse(svc);}catch(e){}
// Cargar clientes embebidos si localStorage vacío
try{if(!clientes.length && typeof CLIENTES_IMPORTADOS!=='undefined' && CLIENTES_IMPORTADOS.length){clientes=CLIENTES_IMPORTADOS.slice();localStorage.setItem('cc_clientes',JSON.stringify(clientes));}}catch(e){}

function saveClientes(){try{localStorage.setItem('cc_clientes',JSON.stringify(clientes));}catch(e){}}

function updateClientesDatalist(){
  var dl = document.getElementById('clientes-list');
  if(!dl) return;
  dl.innerHTML = '';
  clientes.forEach(function(c){
    var o = document.createElement('option');
    o.value = c;
    dl.appendChild(o);
  });
}

function onClienteInput(){
  // noop - datalist handles suggestions natively
}

function agregarClienteSiNuevo(nombre){
  if(!nombre) return;
  var nom = nombre.trim();
  if(!nom) return;
  if(clientes.indexOf(nom) < 0){
    clientes.push(nom);
    clientes.sort(function(a,b){return a.localeCompare(b,'es');});
    saveClientes();
    sbSaveCliente(nom);
    updateClientesDatalist();
  }
}

function mostrarBorrarCliente(){
  var body = '<div style="margin-bottom:12px;font-size:13px;color:var(--text2)">Selecciona un cliente para eliminarlo de la lista:</div>';
  if(!clientes.length){
    body += '<div style="color:var(--text3);font-size:13px;text-align:center;padding:16px 0">No hay clientes guardados a&uacute;n</div>';
  } else {
    body += '<div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto">';
    clientes.forEach(function(c){
      var safe = c.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      body += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border)">'
        + '<span style="font-size:13px">' + safe + '</span>'
        + '<button onclick="confirmarBorrarCliente(this.dataset.nom)" data-nom="' + safe + '" style="background:var(--fram-bg);border:1px solid var(--fram-border);color:var(--fram);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:var(--font)">Eliminar</button>'
        + '</div>';
    });
    body += '</div>';
  }
  document.getElementById('mo-title').textContent = 'Administrar clientes';
  document.getElementById('mo-body').innerHTML = body;
  document.getElementById('overlay').classList.add('open');
}
function confirmarBorrarCliente(nombre){
  clientes = clientes.filter(function(c){return c !== nombre;});
  saveClientes();
  sbDeleteCliente(nombre);
  updateClientesDatalist();
  // If current field had this client, clear it
  var field = document.getElementById('vf-cliente');
  if(field && field.value.trim() === nombre) field.value = '';
  showToast('Cliente eliminado');
  mostrarBorrarCliente(); // refresh modal
}

// Init datalist on load
(function(){ updateClientesDatalist(); })();

function guardarHTML(){
  var currentGastos = gastos;
  try { var sv=localStorage.getItem('cc_gastos3'); if(sv) currentGastos=JSON.parse(sv); } catch(e){}
  var currentEnvios = envios;
  try { var sve=localStorage.getItem('cc_envios'); if(sve) currentEnvios=JSON.parse(sve); } catch(e){}
  var h = document.documentElement.outerHTML;
  var newData = 'var DATOS_IMPORTADOS = ' + JSON.stringify(currentGastos) + ';';
  h = h.replace(/var DATOS_IMPORTADOS\s*=\s*\[[\s\S]*?\];/, newData);
  var newEnvios = 'var ENVIOS_IMPORTADOS = ' + JSON.stringify(currentEnvios) + ';';
  h = h.replace(/var ENVIOS_IMPORTADOS\s*=\s*\[[\s\S]*?\];/, newEnvios);
  var currentClientes = clientes;
  try { var svc2=localStorage.getItem('cc_clientes'); if(svc2) currentClientes=JSON.parse(svc2); } catch(e){}
  var newClientes = 'var CLIENTES_IMPORTADOS = ' + JSON.stringify(currentClientes) + ';';
  h = h.replace(/var CLIENTES_IMPORTADOS\s*=\s*\[[\s\S]*?\];/, newClientes);
  var fecha = new Date().toISOString().slice(0,10);
  var nombre = 'cosecha-y-cuentas-' + fecha + '.html';
  try {
    // Método moderno: File System Access API (sin pantalla en blanco)
    if(window.showSaveFilePicker){
      window.showSaveFilePicker({
        suggestedName: nombre,
        types:[{description:'HTML',accept:{'text/html':['.html']}}]
      }).then(function(fileHandle){
        return fileHandle.createWritable();
      }).then(function(writable){
        writable.write(h);
        return writable.close();
      }).then(function(){
        showToast('✅ Archivo guardado con todos los datos');
      }).catch(function(err){
        if(err.name !== 'AbortError') fallbackDescarga(h, nombre);
      });
    } else {
      fallbackDescarga(h, nombre);
    }
  } catch(e){
    fallbackDescarga(h, nombre);
  }
}

