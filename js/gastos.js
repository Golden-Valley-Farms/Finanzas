// ---- Registrar ----
function registrar(){
  var monto=parseFloat(document.getElementById('f-monto').value);
  if(!monto||monto<=0){showToast('Ingresa un monto valido');return;}
  var cat=document.getElementById('f-cat').value;
  var fechaVal = document.getElementById('f-fecha').value;
  if(!fechaVal){showToast('Selecciona una fecha');return;}
  var fechaDate = new Date(fechaVal+'T12:00:00');
  var fechaLbl = fechaDate.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
  var semKey = 's'+Math.floor((hoy-fechaDate)/(7*24*60*60*1000));
  if(semKey.indexOf('-')>=0) semKey='s0';

  if(editandoGastoId){
    // update existing
    var idx=gastos.findIndex(function(x){return x.id==editandoGastoId;});
    if(idx>=0){
      var orig=gastos[idx];
      gastos[idx]=Object.assign({},orig,{
        loc:loc, cultivo:(loc==='ofic'||loc==='com')?loc:cultivo,
        ciclo: (function(){ var v=document.getElementById('f-ciclo').value; return v||null; })(),
        tipoCamote:cultivo==='camote'?tipoCamote:null,
        cat:cat,
        sectores:(cultivo==='camote'&&tipoCamote==='cosecha')?sectoresSel.slice():[],
        monto:monto,
        desc:document.getElementById('f-desc').value.trim(),
        banco:document.getElementById('f-banco').value.trim(),
        proveedor:document.getElementById('f-proveedor').value.trim(),
        fechaVal:fechaVal, fecha:fechaLbl, semKey:semKey, semLbl:fechaLbl
      });
    }
    editandoGastoId=null;
    var btn=document.getElementById('btn-reg');
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;stroke-width:2"><path d="M12 5v14M5 12h14"/></svg> Registrar gasto';
    save(); updateHeader();
    showToast('✅ Gasto actualizado');
    document.getElementById('f-monto').value='';
    document.getElementById('f-desc').value='';
    document.getElementById('f-banco').value='';
    document.getElementById('f-proveedor').value='';
    sectoresSel=[];
    goSc('his');
    return;
  }

  var g={
    id:Date.now(), loc:loc, cultivo:(loc==='ofic'||loc==='com')?loc:cultivo,
    ciclo: (function(){ var v=document.getElementById('f-ciclo').value; return v||null; })(),
    tipoCamote: cultivo==='camote' ? tipoCamote : null,
    cat:cat, sectores: (cultivo==='camote' && tipoCamote==='cosecha') ? sectoresSel.slice() : [],
    monto:monto, desc:document.getElementById('f-desc').value.trim(),
    banco:document.getElementById('f-banco').value.trim(),
    proveedor:document.getElementById('f-proveedor').value.trim(),
    fechaVal:fechaVal, fecha:fechaLbl, semKey:semKey, semLbl:fechaLbl
  };
  gastos.unshift(g); save(); updateHeader(); sbSaveGasto(g);
  document.getElementById('f-monto').value='';
  document.getElementById('f-desc').value='';
  document.getElementById('f-banco').value='';
  document.getElementById('f-proveedor').value='';
  sectoresSel=[];
  if(document.getElementById('sector-sec').classList.contains('visible')) buildSectorGrid();
  var locNames={jal:'Jalisco',nay:'Nayarit',ofic:'Oficina'};
  var secTxt=g.sectores.length?' ('+g.sectores.map(function(n){return n+',';}).join(', ')+')':'';
  var tipoTxt=g.tipoCamote?' - '+( g.tipoCamote==='cosecha'?'Cosecha':'General'):'';
  showToast('Guardado: '+fmt(monto)+' - '+locNames[loc]+tipoTxt+secTxt);
  var btn=document.getElementById('btn-reg');
  btn.textContent='Registrado'; btn.classList.add('success');
  setTimeout(function(){
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;stroke-width:2"><path d="M12 5v14M5 12h14"/></svg> Registrar gasto';
    btn.classList.remove('success');
  },1600);
}

// ---- Historial ----
var filtroNeg = 'todas';
var filtroCiclo = 'todos';

var selMode=false, selIds=new Set();

function toggleSelMode(){
  selMode=!selMode;
  selIds.clear();
  var tog=document.getElementById('his-sel-toggle');
  var selAll=document.getElementById('his-sel-all');
  var bar=document.getElementById('bulk-bar');
  if(selMode){
    tog.textContent='✕ Cancelar';
    tog.classList.add('active');
    selAll.classList.add('visible');
    bar.style.display='flex';
  } else {
    tog.textContent='☑ Seleccionar';
    tog.classList.remove('active');
    selAll.classList.remove('visible');
    bar.style.display='none';
  }
  renderHis();
}

function toggleSelAll(){
  var list=document.getElementById('his-list');
  var items=list.querySelectorAll('[data-gid]');
  var allChecked = items.length>0 && Array.from(items).every(function(el){return selIds.has(el.dataset.gid);});
  items.forEach(function(el){
    if(allChecked){ selIds.delete(el.dataset.gid); }
    else { selIds.add(el.dataset.gid); }
  });
  document.getElementById('his-sel-all').textContent = allChecked ? 'Seleccionar todo' : 'Deseleccionar todo';
  updateBulkBar();
  // re-render just the checkboxes
  items.forEach(function(el){
    var chk=el.querySelector('.gasto-check');
    if(chk){ if(selIds.has(el.dataset.gid)){chk.classList.add('checked');el.classList.add('selected');}else{chk.classList.remove('checked');el.classList.remove('selected');} }
  });
}

function updateBulkBar(){
  var n=selIds.size;
  document.getElementById('bulk-bar-info').textContent = n===1?'1 movimiento seleccionado':n+' movimientos seleccionados';
}

function bulkDelete(){
  var n=selIds.size;
  if(!n){showToast('Nada seleccionado');return;}
  var btn=document.getElementById('bulk-del-btn');
  if(!btn) return;
  if(btn.dataset.confirm==='1'){
    // Confirmed - actually delete
    gastos=gastos.filter(function(g){return !selIds.has(String(g.id));});
    save(); updateHeader();
    var deleted=n;
    selMode=false; selIds.clear();
    btn.dataset.confirm='';
    var tog=document.getElementById('his-sel-toggle');
    tog.textContent='☑ Seleccionar'; tog.classList.remove('active');
    document.getElementById('his-sel-all').classList.remove('visible');
    document.getElementById('bulk-bar').style.display='none';
    renderHis();
    showToast('🗑 '+deleted+' movimiento'+(deleted>1?'s':'')+' eliminado'+(deleted>1?'s':''));
  } else {
    // First tap - ask for confirmation in the button
    btn.dataset.confirm='1';
    btn.textContent='⚠️ Confirmar';
    btn.style.background='#fee2e2';
    btn.style.color='#dc2626';
    setTimeout(function(){
      if(btn && btn.dataset.confirm==='1'){
        btn.dataset.confirm='';
        btn.textContent='🗑 Eliminar';
        btn.style.background='#fff';
        btn.style.color='var(--fram)';
      }
    }, 3000);
  }
}

function renderHis(){
  // poblar ciclos disponibles dinámicamente
  var selCiclo = document.getElementById('his-fil-ciclo');
  var ciclosEnGastos = [];
  gastos.forEach(function(g){ if(g.ciclo && ciclosEnGastos.indexOf(g.ciclo)<0) ciclosEnGastos.push(g.ciclo); });
  ciclosEnGastos.sort();
  // reconstruir opciones
  selCiclo.innerHTML = '<option value="todos">Ciclo: Todos</option>';
  ciclosEnGastos.forEach(function(c){
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    if(c === filtroCiclo) o.selected = true;
    selCiclo.appendChild(o);
  });
  // sync neg select
  document.getElementById('his-fil-neg').value = filtroNeg;

  var list=document.getElementById('his-list');
  var data = gastos.filter(function(g){
    var negOk = filtroNeg==='todas' || g.loc===filtroNeg;
    var cicloOk = filtroCiclo==='todos' || g.ciclo===filtroCiclo;
    return negOk && cicloOk;
  });

  if(!data.length){
    list.innerHTML='<div class="empty"><div class="empty-icon">&#127807;</div><div class="empty-text">Sin gastos registrados aun.</div></div>'; return;
  }

  // Group by day
  var byDay={};
  var dayOrder=[];
  data.forEach(function(g){
    var dk = g.fechaVal || 'sin-fecha';
    if(!byDay[dk]){byDay[dk]=[];dayOrder.push(dk);}
    byDay[dk].push(g);
  });
  dayOrder=dayOrder.filter(function(v,i){return dayOrder.indexOf(v)===i;});
  dayOrder.sort(function(a,b){ return a<b?1:a>b?-1:0; });

  list.innerHTML='';
  var locNames={jal:'Jalisco',nay:'Nayarit',ofic:'Oficina',com:'Comercial.'};
  var cultNames={camote:'Camote',fram:'Frambuesa',general:'General',ofic:'Oficina',com:'Comercial.'};

  dayOrder.forEach(function(dk){
    var gs=byDay[dk];
    var dayLbl = dk==='sin-fecha'?'Sin fecha':(function(){
      var d=new Date(dk+'T12:00:00');
      return d.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    })();
    var tot=gs.reduce(function(a,g){return a+g.monto;},0);
    var wb=document.createElement('div'); wb.className='week-block';
    wb.innerHTML='<div class="week-header"><span class="week-title" style="text-transform:capitalize">'+dayLbl+'</span><span class="week-total">'+fmt(tot)+'</span></div>';
    gs.forEach(function(g){
      var it=document.createElement('div');
      it.className='gasto-item'+(selMode?' sel-mode':'')+(selIds.has(String(g.id))?' selected':'');
      it.dataset.gid=String(g.id);
      var locTag='<span class="tag '+g.loc+'">'+locNames[g.loc]+'</span>';
      var cicloTag=g.ciclo?'<span class="tag general">'+g.ciclo+'</span>':'';
      var cultTag=g.loc!=='ofic'?'<span class="tag '+g.cultivo+'">'+cultNames[g.cultivo]+'</span>':'';
      var tipoTag=g.tipoCamote?'<span class="tag '+(g.tipoCamote==='cosecha'?'camote':'general')+'">'+(g.tipoCamote==='cosecha'?'Cosecha':'General')+'</span>':'';
      var secTag=g.sectores&&g.sectores.length?'<span class="tag sector">'+g.sectores.map(function(n){return n;}).join(', ')+'</span>':'';
      var checkHtml=selMode?'<div class="gasto-check'+(selIds.has(String(g.id))?' checked':'')+'"></div>':'';
      var delHtml=selMode?'':'<button class="del-btn" title="Eliminar">&#215;</button>';
      it.innerHTML=checkHtml+
        '<div class="gasto-dot '+g.loc+'"></div>'+
        '<div class="gasto-body">'+
          '<div class="gasto-cat">'+g.cat+'</div>'+
          '<div class="gasto-tags">'+locTag+cicloTag+cultTag+tipoTag+secTag+'</div>'+
          (g.desc?'<div class="gasto-desc">'+g.desc+'</div>':'')+
        '</div>'+
        '<div class="gasto-right"><span class="gasto-monto">'+fmt(g.monto)+'</span>'+delHtml+'</div>';
      if(selMode){
        it.addEventListener('click',function(){
          var gid=it.dataset.gid;
          var chk=it.querySelector('.gasto-check');
          if(selIds.has(gid)){ selIds.delete(gid); chk.classList.remove('checked'); it.classList.remove('selected'); }
          else { selIds.add(gid); chk.classList.add('checked'); it.classList.add('selected'); }
          updateBulkBar();
          var allItems=list.querySelectorAll('[data-gid]');
          var allChecked=allItems.length>0&&Array.from(allItems).every(function(el){return selIds.has(el.dataset.gid);});
          document.getElementById('his-sel-all').textContent=allChecked?'Deseleccionar todo':'Seleccionar todo';
        });
      } else {
        it.querySelector('.del-btn').onclick=function(e){e.stopPropagation();delGasto(g.id);};
        it.addEventListener('click',function(){verDet(g);});
      }
      wb.appendChild(it);
    });
    list.appendChild(wb);
  });
}

function delGasto(id){
  gastos=gastos.filter(function(g){return g.id!==id;}); save(); updateHeader(); renderHis();
  sbDeleteGasto(id);
  showToast('Gasto eliminado');
}

var editandoGastoId = null;

function verDet(g){
  var locNames={jal:'Jalisco',nay:'Nayarit',ofic:'Oficina',com:'Comercializadora'};
  var cultNames={camote:'Camote',fram:'Frambuesa',general:'General Terreno',ofic:'Oficina',com:'Comercializadora'};
  document.getElementById('mo-title').innerHTML=g.cat+'&nbsp;<span class="chip '+g.loc+'">'+locNames[g.loc]+'</span>';
  var tipoRow='';
  if(g.tipoCamote) tipoRow='<div class="modal-row"><span class="modal-key">Tipo</span><span class="modal-val">'+(g.tipoCamote==='cosecha'?'Cosecha':'General')+'</span></div>';
  var secRow=g.sectores&&g.sectores.length?'<div class="modal-row"><span class="modal-key">Sectores</span><span class="modal-val">'+g.sectores.map(function(n){return n;}).join(', ')+'</span></div>':'';
  document.getElementById('mo-body').innerHTML=
    '<div class="modal-row"><span class="modal-key">Monto</span><span class="modal-val" style="font-family:var(--mono);font-size:18px">'+fmt(g.monto)+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Ubicacion</span><span class="modal-val">'+locNames[g.loc]+'</span></div>'+
    (g.ciclo?'<div class="modal-row"><span class="modal-key">Ciclo</span><span class="modal-val">'+g.ciclo+'</span></div>':'')+
    (g.loc!=='ofic'?'<div class="modal-row"><span class="modal-key">Cultivo</span><span class="modal-val">'+cultNames[g.cultivo]+'</span></div>':'')+
    tipoRow+secRow+
    '<div class="modal-row"><span class="modal-key">Semana</span><span class="modal-val">'+g.semLbl+'</span></div>'+
    '<div class="modal-row"><span class="modal-key">Fecha</span><span class="modal-val">'+g.fecha+'</span></div>'+
    (g.desc?'<div style="margin-top:10px"><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">Descripción</div><div class="modal-note">'+g.desc+'</div></div>':'')+
    (g.banco?'<div class="modal-row" style="margin-top:8px"><span class="modal-key">Banco</span><span class="modal-val">'+g.banco+'</span></div>':'')+
    (g.proveedor?'<div class="modal-row"><span class="modal-key">Cliente / Proveedor</span><span class="modal-val">'+g.proveedor+'</span></div>':'')+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">'+
      '<button onclick="editarGasto(\''+g.id+'\')" style="padding:10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font)">✏️ Editar</button>'+
      '<button id="del-modal-btn" onclick="delGastoModal(\''+g.id+'\')" style="padding:10px;border-radius:var(--radius);border:1px solid #f87171;background:transparent;color:#f87171;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font)">🗑 Eliminar</button>'+
    '</div>';
  document.getElementById('overlay').classList.add('open');
}

function delGastoModal(id){
  var btn=document.getElementById('del-modal-btn');
  if(!btn) return;
  if(btn.dataset.confirm==='1'){
    gastos=gastos.filter(function(g){return g.id!=id;}); save(); updateHeader();
    document.getElementById('overlay').classList.remove('open');
    renderHis(); showToast('Gasto eliminado');
  } else {
    btn.dataset.confirm='1'; btn.textContent='⚠️ Confirmar';
    setTimeout(function(){if(btn){btn.dataset.confirm='';btn.textContent='🗑 Eliminar';}},2500);
  }
}

function editarGasto(id){
  var g=gastos.find(function(x){return x.id==id;});
  if(!g) return;
  editandoGastoId = g.id;
  document.getElementById('overlay').classList.remove('open');
  goSc('reg');
  // Set loc
  selLoc(g.loc);
  // Set cultivo
  var cultReal = (g.loc==='ofic'||g.loc==='com') ? null : g.cultivo;
  if(cultReal){
    var btns=document.querySelectorAll('.cultivo-btn');
    btns.forEach(function(b){
      b.classList.remove('sel');
      if(b.textContent.trim().toLowerCase().indexOf(cultReal)>=0 || b.className.indexOf(cultReal)>=0) b.classList.add('sel');
    });
    cultivo=cultReal;
    // tipo camote
    if(cultReal==='camote'){
      var tipo=g.tipoCamote||'general';
      selTipo(tipo);
    }
  }
  // Set ciclo dropdown if visible
  var cicloSel=document.getElementById('f-ciclo');
  if(cicloSel) cicloSel.value=g.ciclo||'';
  // Set form fields
  document.getElementById('f-fecha').value = g.fechaVal||'';
  updateCatSelect();
  setTimeout(function(){
    document.getElementById('f-cat').value = g.cat;
    document.getElementById('f-monto').value = g.monto;
    document.getElementById('f-desc').value = g.desc||'';
    document.getElementById('f-banco').value = g.banco||'';
    document.getElementById('f-proveedor').value = g.proveedor||'';
  },50);
  // Change button label
  var btn=document.getElementById('btn-reg');
  btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;stroke-width:2"><path d="M5 12l5 5L19 7"/></svg> Guardar cambios';
  window.scrollTo(0,0);
  showToast('Editando gasto — haz tus cambios y guarda');
}

function closeModal(e){if(!e||e.target===document.getElementById('overlay'))document.getElementById('overlay').classList.remove('open');}

