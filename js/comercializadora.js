// ---- VENTAS TAB ----
// venTab fusionada (no duplicar)

// ---- COMERCIALIZADORA JS ----
var comerPartidasTemp=[];
var saveEnviosComer = function(){try{localStorage.setItem('cc_envios',JSON.stringify(envios));}catch(e){}};

function initComerForm(){
  comerPartidasTemp=[];
  var hoyStr=new Date();
  var tz=hoyStr.getTimezoneOffset()*60000;
  var isoStr=new Date(hoyStr-tz).toISOString().slice(0,10);
  var dd=String(new Date().getDate()).padStart(2,'0');
  var mm=String(new Date().getMonth()+1).padStart(2,'0');
  var yyyy=new Date().getFullYear();
  if(document.getElementById('cf-fecha')) document.getElementById('cf-fecha').value=dd+'/'+mm+'/'+yyyy;
  if(document.getElementById('cf-fecha-picker')) document.getElementById('cf-fecha-picker').value=isoStr;
  var anio=yyyy;
  var seq=(envios.filter(function(e){return e.loc==='com'&&(e.num||'').indexOf('/'+anio+'/')>=0;}).length)+1;
  var folioNum=String(seq).padStart(3,'0');
  if(document.getElementById('cf-num')) document.getElementById('cf-num').value='Comer/'+anio+'/'+folioNum;
  if(document.getElementById('cf-proveedor')) document.getElementById('cf-proveedor').value='';
  if(document.getElementById('cf-cliente')) document.getElementById('cf-cliente').value='';
  if(document.getElementById('cf-flete-compra')) document.getElementById('cf-flete-compra').value='';
  if(document.getElementById('cf-flete-venta')) document.getElementById('cf-flete-venta').value='';
  renderComerPartidas();
  updateComerVarSelect();
  recalcComer();
  hideProveedorDropdown();
  hideComerClienteDropdown();
}

function onComerFechaInput(){}
function normalizarComerFecha(){}
function onComerPickerChange(){
  var picker=document.getElementById('cf-fecha-picker');
  if(picker&&picker.value){
    var p=picker.value.split('-');
    document.getElementById('cf-fecha').value=p[2]+'/'+p[1]+'/'+p[0];
  }
}

function updateComerVarSelect(){
  var sel=document.getElementById('cf-var-select'); if(!sel) return;
  var usadas=comerPartidasTemp.map(function(p){return p.variedad;});
  sel.innerHTML='<option value="">— Selecciona variedad —</option>';
  VARIEDADES.forEach(function(v){
    if(usadas.indexOf(v)<0){var o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o);}
  });
  var wrap=document.getElementById('cf-add-var-wrap');
  if(wrap) wrap.style.display=usadas.length>=VARIEDADES.length?'none':'block';
}

function addComerVariedad(){
  var sel=document.getElementById('cf-var-select');
  var v=sel?sel.value:'';
  if(!v){showToast('Selecciona una variedad');return;}
  comerPartidasTemp.push({variedad:v,kgRecibidos:'',descPct:'',kgPagar:0,precioCompra:'',precioVenta:''});
  renderComerPartidas();
}

function removeComerPartida(idx){comerPartidasTemp.splice(idx,1);renderComerPartidas();}

function renderComerPartidas(){
  var cont=document.getElementById('cf-partidas-compra'); if(!cont) return;
  cont.innerHTML='';
  comerPartidasTemp.forEach(function(p,idx){
    var kgPagar=p.kgRecibidos&&p.descPct!==''?p.kgRecibidos*(1-parseFloat(p.descPct)/100):parseFloat(p.kgRecibidos||0);
    var costoVar=kgPagar*parseFloat(p.precioCompra||0);
    var ingresoVar=parseFloat(p.kgRecibidos||0)*parseFloat(p.precioVenta||0);
    var d=document.createElement('div');
    d.className='card'; d.style.marginBottom='10px';
    d.innerHTML=
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">'+
        '<span style="font-size:13px;font-weight:600">'+p.variedad+'</span>'+
        '<button onclick="removeComerPartida('+idx+')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:18px;line-height:1;padding:2px 6px">×</button>'+
      '</div>'+
      '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:6px">COMPRA</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">'+
        '<div><label>Kg recibidos</label><input type="number" placeholder="0" min="0" value="'+(p.kgRecibidos||'')+'" oninput="comerPartidasTemp['+idx+'].kgRecibidos=parseFloat(this.value)||0;recalcComer()" onblur="renderComerPartidas()"></div>'+
        '<div><label>% descuento</label><input type="number" placeholder="0" min="0" max="100" step="0.1" value="'+(p.descPct!==''?p.descPct:'')+'" oninput="comerPartidasTemp['+idx+'].descPct=this.value;recalcComer()" onblur="renderComerPartidas()"></div>'+
        '<div><label>Kg a pagar</label><input type="number" id="ckp-'+idx+'" value="'+kgPagar.toFixed(2)+'" readonly style="background:var(--surface2);color:var(--text3)"></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'+
        '<div><label>Precio compra $/kg</label><div class="monto-wrap"><span class="monto-prefix">$</span><input type="number" placeholder="0" min="0" value="'+(p.precioCompra||'')+'" style="padding-left:24px" oninput="comerPartidasTemp['+idx+'].precioCompra=this.value;recalcComer()"></div></div>'+
        '<div><label>Subtotal compra</label><div id="csc-'+idx+'" style="padding:10px 12px;background:var(--fram-bg);border-radius:var(--radius);font-size:13px;font-weight:600;color:var(--fram);font-family:var(--mono)">'+fmt(costoVar)+'</div></div>'+
      '</div>'+
      '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:6px">VENTA</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
        '<div><label>Precio venta $/kg</label><div class="monto-wrap"><span class="monto-prefix">$</span><input type="number" placeholder="0" min="0" value="'+(p.precioVenta||'')+'" style="padding-left:24px" oninput="comerPartidasTemp['+idx+'].precioVenta=this.value;recalcComer()"></div></div>'+
        '<div><label>Subtotal venta</label><div id="csv-'+idx+'" style="padding:10px 12px;background:var(--green-bg);border-radius:var(--radius);font-size:13px;font-weight:600;color:var(--green);font-family:var(--mono)">'+fmt(ingresoVar)+'</div></div>'+
      '</div>';
    cont.appendChild(d);
  });
  updateComerVarSelect();
  recalcComer();
}

function recalcComer(){
  var totalGasto=0;
  comerPartidasTemp.forEach(function(p){
    var kgPagar=p.kgRecibidos&&p.descPct!==''?p.kgRecibidos*(1-parseFloat(p.descPct)/100):parseFloat(p.kgRecibidos||0);
    totalGasto+=kgPagar*parseFloat(p.precioCompra||0);
    var elKg=document.getElementById('ckp-'+comerPartidasTemp.indexOf(p));
    var elSC=document.getElementById('csc-'+comerPartidasTemp.indexOf(p));
    var elSV=document.getElementById('csv-'+comerPartidasTemp.indexOf(p));
    if(elKg) elKg.value=kgPagar.toFixed(2);
    if(elSC) elSC.textContent=fmt(kgPagar*parseFloat(p.precioCompra||0));
    if(elSV) elSV.textContent=fmt(parseFloat(p.kgRecibidos||0)*parseFloat(p.precioVenta||0));
  });
  totalGasto+=parseFloat(document.getElementById('cf-flete-compra')?document.getElementById('cf-flete-compra').value||0:0);
  var totalIngreso=comerPartidasTemp.reduce(function(a,p){return a+parseFloat(p.kgRecibidos||0)*parseFloat(p.precioVenta||0);},0);
  totalIngreso+=parseFloat(document.getElementById('cf-flete-venta')?document.getElementById('cf-flete-venta').value||0:0);
  var util=totalIngreso-totalGasto;
  if(document.getElementById('cf-resumen-gasto')) document.getElementById('cf-resumen-gasto').textContent=fmt(totalGasto);
  if(document.getElementById('cf-resumen-ingreso')) document.getElementById('cf-resumen-ingreso').textContent=fmt(totalIngreso);
  var utilEl=document.getElementById('cf-resumen-util');
  if(utilEl){utilEl.textContent=fmt(util);utilEl.style.color=util>=0?'var(--green)':'var(--fram)';}
  var utilCard=document.getElementById('cf-utilidad-card');
  if(utilCard) utilCard.style.borderColor=util>=0?'var(--green-border)':'var(--fram-border)';
}

// ---- PROVEEDOR DROPDOWN ----
function renderProveedorDropdown(){
  var dd=document.getElementById('proveedor-dropdown'); if(!dd) return;
  var q=(document.getElementById('cf-proveedor').value||'').toLowerCase();
  var filtered=proveedores.filter(function(p){return p.toLowerCase().indexOf(q)>=0;});
  dd.innerHTML='';
  if(!filtered.length){dd.style.display='none';return;}
  filtered.forEach(function(p){
    var row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px';
    row.onmouseenter=function(){this.style.background='var(--green-bg)';};
    row.onmouseleave=function(){this.style.background='';};
    var name=document.createElement('span'); name.textContent=p; name.style.flex='1';
    name.onmousedown=function(e){e.preventDefault();document.getElementById('cf-proveedor').value=p;hideProveedorDropdown();};
    var btn=document.createElement('button');
    btn.textContent='×'; btn.title='Eliminar';
    btn.style.cssText='background:none;border:none;color:var(--text3);font-size:17px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0';
    btn.onmousedown=function(e){e.preventDefault();e.stopPropagation();
      proveedores=proveedores.filter(function(x){return x!==p;});saveProveedores();sbDeleteProveedor(p);
      renderProveedorDropdown();
      if(document.getElementById('cf-proveedor').value===p) document.getElementById('cf-proveedor').value='';
      showToast('Proveedor eliminado');};
    row.appendChild(name); row.appendChild(btn); dd.appendChild(row);
  });
  dd.style.display='block';
}
function showProveedorDropdown(){renderProveedorDropdown();}
function hideProveedorDropdown(){var dd=document.getElementById('proveedor-dropdown');if(dd)dd.style.display='none';}
function onProveedorInput(){renderProveedorDropdown();var dd=document.getElementById('proveedor-dropdown');if(dd&&dd.children.length)dd.style.display='block';}

// ---- COMER CLIENTE DROPDOWN ----
function renderComerClienteDropdown(){
  var dd=document.getElementById('comer-cliente-dropdown'); if(!dd) return;
  var q=(document.getElementById('cf-cliente').value||'').toLowerCase();
  var filtered=clientes.filter(function(c){return c.toLowerCase().indexOf(q)>=0;});
  dd.innerHTML='';
  if(!filtered.length){dd.style.display='none';return;}
  filtered.forEach(function(c){
    var row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px';
    row.onmouseenter=function(){this.style.background='var(--green-bg)';};
    row.onmouseleave=function(){this.style.background='';};
    var name=document.createElement('span'); name.textContent=c; name.style.flex='1';
    name.onmousedown=function(e){e.preventDefault();document.getElementById('cf-cliente').value=c;hideComerClienteDropdown();};
    row.appendChild(name); dd.appendChild(row);
  });
  dd.style.display='block';
}
function showComerClienteDropdown(){renderComerClienteDropdown();}
function hideComerClienteDropdown(){var dd=document.getElementById('comer-cliente-dropdown');if(dd)dd.style.display='none';}
function onComerClienteInput(){renderComerClienteDropdown();var dd=document.getElementById('comer-cliente-dropdown');if(dd&&dd.children.length)dd.style.display='block';}

// ---- GUARDAR OPERACION COMER ----
function guardarOperacionComer(){
  var num=document.getElementById('cf-num').value.trim();
  var fechaDisplay=document.getElementById('cf-fecha').value;
  var parts=fechaDisplay.split('/');
  var fecha=parts.length===3?parts[2]+'-'+parts[1].padStart(2,'0')+'-'+parts[0].padStart(2,'0'):'';
  var proveedor=document.getElementById('cf-proveedor').value.trim();
  var cliente=document.getElementById('cf-cliente').value.trim();
  var fleteCompra=parseFloat(document.getElementById('cf-flete-compra').value||0);
  var fleteVenta=parseFloat(document.getElementById('cf-flete-venta').value||0);
  if(!fecha){showToast('Selecciona una fecha');return;}
  if(!proveedor){showToast('Ingresa el proveedor');return;}
  if(!cliente){showToast('Ingresa el cliente');return;}
  if(!comerPartidasTemp.length){showToast('Agrega al menos una variedad');return;}
  var totalCompra=0;
  comerPartidasTemp.forEach(function(p){
    var kgPagar=p.kgRecibidos&&p.descPct!==''?p.kgRecibidos*(1-parseFloat(p.descPct)/100):parseFloat(p.kgRecibidos||0);
    totalCompra+=kgPagar*parseFloat(p.precioCompra||0);
  });
  var totalVenta=comerPartidasTemp.reduce(function(a,p){return a+parseFloat(p.kgRecibidos||0)*parseFloat(p.precioVenta||0);},0)+fleteVenta;
  var cicloV=fecha<(new Date().getFullYear()-1)+'-07-01'?'2024-2025':'2025-2026';
  var envioObj={
    id:Date.now(), num:num, folio:'', fecha:fecha, fechaLbl:fechaDisplay,
    loc:'com', ciclo:cicloV, cliente:cliente, proveedor:proveedor,
    flete:fleteVenta, fleteCompra:fleteCompra, esComer:true, total:totalVenta,
    partidas:comerPartidasTemp.map(function(p){
      var kgPagar=p.kgRecibidos&&p.descPct!==''?p.kgRecibidos*(1-parseFloat(p.descPct)/100):parseFloat(p.kgRecibidos||0);
      return {variedad:p.variedad,kgRecibidos:p.kgRecibidos,descPct:p.descPct,kgPagar:kgPagar,
        precioCompra:p.precioCompra,precioVenta:p.precioVenta,pesoNeto:p.kgRecibidos,precio:p.precioVenta,sector:''};
    })
  };
  envios.unshift(envioObj);
  try{localStorage.setItem('cc_envios',JSON.stringify(envios));}catch(e){}
  sbSaveEnvio(envioObj);
  // Gasto compra mercancia
  var gastoCompra={id:Date.now()+1,fechaVal:fecha,fechaLbl:fechaDisplay,
    loc:'com',cultivo:'com',cat:'Compra Mercancia',
    desc:'Compra mercancia op. '+num,monto:totalCompra,ciclo:cicloV,sector:'',autoGen:true};
  gastos.unshift(gastoCompra);
  sbSaveGasto(gastoCompra);
  if(fleteCompra>0){
    var gastoFlete={id:Date.now()+2,fechaVal:fecha,fechaLbl:fechaDisplay,
      loc:'com',cultivo:'com',cat:'Fletes',desc:'Flete compra op. '+num,
      monto:fleteCompra,ciclo:cicloV,sector:'',autoGen:true};
    gastos.unshift(gastoFlete);
    sbSaveGasto(gastoFlete);
  }
  save();
  agregarProveedorSiNuevo(proveedor);
  if(typeof agregarClienteSiNuevo==='function') agregarClienteSiNuevo(cliente);
  showToast('Operación guardada: '+fmt(totalVenta));
  venTab('lista');
}

// ---- EXPORTAR CSV ----
function csvEscape(v){
  if(v===null||v===undefined) return '';
  var s=String(v);
  if(s.indexOf(',')>=0||s.indexOf('"')>=0||s.indexOf('\n')>=0) return '"'+s.replace(/"/g,'""')+'"';
  return s;
}
function csvRow(arr){return arr.map(csvEscape).join(',');}

function exportarExcel(){
  var fecha=new Date().toISOString().slice(0,10);
  var locLbl={jal:'Jalisco',nay:'Nayarit',ofic:'Oficina',com:'Comercializadora'};
  var rows=[];
  rows.push(['GASTOS','','','','','','','']);
  rows.push(['Fecha','Negocio','Actividad','Categoria','Sector','Descripcion','Monto','Ciclo']);
  gastos.forEach(function(g){
    rows.push([g.fechaVal||'',locLbl[g.loc]||g.loc||'',g.cultivo||'',g.cat||'',g.sector||'',g.desc||'',g.monto||0,g.ciclo||'']);
  });
  rows.push(['','','','','','','','']);
  rows.push(['ENVIOS','','','','','','','','','','','','','','']);
  rows.push(['N Envio','Folio','Fecha','Negocio','Cliente','Ciclo','Variedad','Sector','Hectareas','Peso Neto kg','Toneladas','Precio x kg','Total Variedad','Flete','Total Envio']);
  envios.forEach(function(e){
    var totalEnvio=envioTotal(e);
    if(!e.partidas||!e.partidas.length){
      rows.push([e.num||'',e.folio||'',e.fecha||'',locLbl[e.loc]||'',e.cliente||'',e.ciclo||'','','','','','','','',e.flete||0,totalEnvio]);
    } else {
      e.partidas.forEach(function(p,pi){
        var kg=e.esComer?parseFloat(p.kgRecibidos||0):parseFloat(p.pesoNeto||0);
        var pv=e.esComer?parseFloat(p.precioVenta||0):parseFloat(p.precio||0);
        rows.push([pi===0?e.num||'':'',pi===0?e.folio||'':'',pi===0?e.fecha||'':'',
          pi===0?locLbl[e.loc]||'':'',pi===0?e.cliente||'':'',pi===0?e.ciclo||'':'',
          p.variedad||'',p.sector||'',p.hectareas||'',kg,p.toneladas||'',pv,kg*pv,
          pi===0?e.flete||0:'',pi===0?totalEnvio:'']);
      });
    }
  });
  var csv=rows.map(csvRow).join('\r\n');
  var enc=encodeURIComponent(csv);
  document.getElementById('mo-title').textContent='Descargar CSV';
  document.getElementById('mo-body').innerHTML=
    '<p style="font-size:13px;color:var(--text2);margin-bottom:16px">Haz clic para descargar el archivo CSV.</p>'+
    '<a href="data:text/csv;charset=utf-8,'+enc+'" download="cosecha-y-cuentas-'+fecha+'.csv" '+
    'style="display:block;text-align:center;padding:14px;background:var(--green);color:#fff;border-radius:var(--radius);font-weight:600;font-size:14px;text-decoration:none">'+
    '⬇️ Descargar cosecha-y-cuentas-'+fecha+'.csv</a>';
  document.getElementById('overlay').classList.add('open');
}

// ---- REPORTES INGRESOS ----
function renderIngresosRep(){
  if(!document.getElementById('r-ing-tot')) return;
  var ingTot=envios.reduce(function(a,e){return a+envioTotal(e);},0);
  var ingJal=envios.filter(function(e){return e.loc==='jal';}).reduce(function(a,e){return a+envioTotal(e);},0);
  var ingNay=envios.filter(function(e){return e.loc==='nay';}).reduce(function(a,e){return a+envioTotal(e);},0);
  var ingCom=envios.filter(function(e){return e.loc==='com';}).reduce(function(a,e){return a+envioTotal(e);},0);
  var hoyD=new Date(); var oneWeekAgo=new Date(); oneWeekAgo.setDate(hoyD.getDate()-7);
  var ingSw=envios.filter(function(e){
    if(!e.fecha) return false;
    var fd=new Date(e.fecha+'T12:00:00'); return fd>=oneWeekAgo&&fd<=hoyD;
  }).reduce(function(a,e){return a+envioTotal(e);},0);
  var totGastos=gastos.reduce(function(a,g){return a+g.monto;},0);
  document.getElementById('r-ing-tot').textContent=fmt(ingTot);
  document.getElementById('r-ing-jal').textContent=fmt(ingJal);
  document.getElementById('r-ing-nay').textContent=fmt(ingNay);
  document.getElementById('r-ing-com').textContent=fmt(ingCom);
  document.getElementById('r-ing-cnt').textContent=envios.length;
  document.getElementById('r-ing-sw').textContent=fmt(ingSw);
  document.getElementById('r-gas-tot').textContent=fmt(totGastos);
  var util=ingTot-totGastos;
  var utilEl=document.getElementById('r-util');
  if(utilEl){utilEl.textContent=fmt(util);utilEl.style.color=util>=0?'var(--green)':'var(--fram)';}
  var utilCard=document.getElementById('r-util-card');
  if(utilCard) utilCard.style.borderColor=util>=0?'var(--green-border)':'var(--fram-border)';
  // Ingresos por mes
  var byMonth={},order=[];
  envios.forEach(function(e){
    var mk=e.fecha?e.fecha.substring(0,7):'sin-fecha';
    if(!byMonth[mk]){byMonth[mk]=0;order.push(mk);}
    byMonth[mk]+=envioTotal(e);
  });
  order=order.filter(function(v,i){return order.indexOf(v)===i;});
  var ingMesRows=order.map(function(mk){
    var lbl=mk==='sin-fecha'?'Sin fecha':(function(){var p=mk.split('-');var d=new Date(parseInt(p[0]),parseInt(p[1])-1,1);return d.toLocaleDateString('es-MX',{month:'short',year:'numeric'});})();
    return [lbl,byMonth[mk],'c5'];
  });
  var maxIng=ingMesRows.length?Math.max.apply(null,ingMesRows.map(function(r){return r[1];})):1;
  if(typeof bar==='function') bar(document.getElementById('rb-ing-mes'),ingMesRows,maxIng);
  // Costo por sector
  var CONFIG={jal:{sectores:2,actividades:2},nay:{sectores:10,actividades:1}};
  var CATS_COSECHA=['Arado','Cosecha','Desvarada','Flete Cosecha','Plantacion','Plantación'];
  ['jal','nay'].forEach(function(loc){
    var cfg=CONFIG[loc];
    var camGen=gastos.filter(function(g){return g.loc===loc&&g.cultivo==='camote'&&CATS_COSECHA.indexOf(g.cat)<0;}).reduce(function(a,g){return a+g.monto;},0);
    var bProrr=camGen/cfg.sectores;
    var genGasto=gastos.filter(function(g){return g.loc===loc&&g.cultivo==='general';}).reduce(function(a,g){return a+g.monto;},0);
    var cProrr=genGasto/cfg.actividades/cfg.sectores;
    var secRows=[];
    for(var s=1;s<=cfg.sectores;s++){
      var aCosecha=gastos.filter(function(g){return g.loc===loc&&g.cultivo==='camote'&&CATS_COSECHA.indexOf(g.cat)>=0&&String(g.sector)===String(s);}).reduce(function(a,g){return a+g.monto;},0);
      var total=aCosecha+bProrr+cProrr;
      if(total>0) secRows.push(['Sector '+s,total,loc==='jal'?'jal':'nay']);
    }
    var cont=document.getElementById('rb-sec-'+loc);
    if(!cont) return;
    if(secRows.length){
      var maxSec=Math.max.apply(null,secRows.map(function(r){return r[1];}));
      if(typeof bar==='function') bar(cont,secRows,maxSec);
      var note=document.createElement('div');
      note.style.cssText='font-size:11px;color:var(--text3);margin-top:6px;padding:8px 4px;border-top:1px solid var(--border)';
      note.innerHTML='Cosecha General/sector: <b>'+fmt(bProrr)+'</b> · Gastos Generales/sector: <b>'+fmt(cProrr)+'</b>';
      cont.appendChild(note);
    } else {
      cont.innerHTML='<div style="font-size:13px;color:var(--text3);text-align:center;padding:8px 0">Sin gastos de camote registrados</div>';
    }
  });
}


function fallbackDescarga(h, nombre){
  try {
    var blob = new Blob([h], {type:'text/html;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1000);
    showToast('✅ Archivo guardado con todos los datos');
  } catch(e){
    showToast('❌ Error al guardar: ' + e.message);
  }
}
