// ---- Reportes ----
function bar(cont,rows,maxV){
  cont.innerHTML='';
  if(!rows.length){cont.innerHTML='<div style="font-size:13px;color:var(--text3);text-align:center;padding:8px 0">Sin datos aun</div>';return;}
  rows.forEach(function(r){
    var pct=maxV>0?Math.round(r[1]/maxV*100):0;
    cont.innerHTML+='<div class="bar-row"><div class="bar-lbl">'+r[0]+'</div><div class="bar-track"><div class="bar-fill '+r[2]+'" style="width:'+pct+'%"></div></div><div class="bar-val">'+fmt(r[1])+'</div></div>';
  });
}

// ============================================================
// ---- DASHBOARD: gráficas de barras y líneas ----
// ============================================================

var dashNegociosActivos = {jal:true, nay:true, ofic:true, com:true};
var DASH_COLORS = {jal:'#5BA3E0', nay:'#B07AE0', ofic:'#3CB87A', com:'#D4894A'};
var DASH_LABELS = {jal:'Jalisco', nay:'Nayarit', ofic:'Oficina', com:'Comercial.'};

function isDark(){ return document.documentElement.getAttribute('data-theme')!=='light'; }

function dashGridColor(){ return isDark() ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; }
function dashTextColor(){ return isDark() ? '#9E9890' : '#8a8378'; }
function dashTextColor2(){ return isDark() ? '#D8D2C8' : '#3a352e'; }

// Devuelve el lunes de la semana de una fecha dada
function fmtCompact(n){
  n = Number(n)||0;
  if(Math.abs(n)>=1000000) return '$'+(n/1000000).toFixed(1)+'M';
  if(Math.abs(n)>=1000) return '$'+(n/1000).toFixed(0)+'k';
  return '$'+n.toFixed(0);
}

function attachDashTooltips(cont, ttId){
  var tt = document.getElementById(ttId);
  if(!tt) return;
  var pts = cont.querySelectorAll('.dash-pt, .dash-bar-rect');
  pts.forEach(function(p){
    p.addEventListener('mouseenter', function(e){
      var val = parseFloat(p.dataset.val)||0;
      var lbl = p.dataset.lbl||'';
      tt.textContent = lbl+': '+fmt(val);
      tt.style.opacity = '1';
    });
    p.addEventListener('mousemove', function(e){
      var rect = cont.getBoundingClientRect();
      tt.style.left = (e.clientX-rect.left+8)+'px';
      tt.style.top = (e.clientY-rect.top-28)+'px';
    });
    p.addEventListener('mouseleave', function(){ tt.style.opacity='0'; });
    p.addEventListener('click', function(e){
      var val = parseFloat(p.dataset.val)||0;
      var lbl = p.dataset.lbl||'';
      showToast(lbl+': '+fmt(val));
    });
  });
}


// ============================================================
// ---- FINANCIERO: Dashboard estilo Power BI ----
// ============================================================

function repTab(t){
  document.getElementById('rt-fin').classList.toggle('active', t==='fin');
  document.getElementById('rt-gen').classList.toggle('active', t==='gen');
  document.getElementById('rep-fin-sec').style.display = t==='fin' ? 'block' : 'none';
  document.getElementById('rep-gen-sec').style.display = t==='gen' ? 'block' : 'none';
  if(t==='fin') renderFinanciero();
  if(t==='gen') renderRep();
}

// ============================================================
// ---- FINANCIERO: dashboard estilo Power BI con negocios y semanas ----
// ============================================================

var finNegSel = 'todos'; // todos | jal | nay | ofic | fram | com
var finSemSel = 'todas'; // 'todas' o número de semana ISO
var finAnioSel = 'todos'; // 'todos' o año específico

var FIN_NEG_MAP = {
  jal:  {locs:['jal'], cultivo:'camote', label:'Camote Jalisco', color:'#5BA3E0'},
  nay:  {locs:['nay'], cultivo:'camote', label:'Camote Nayarit', color:'#D98A4A'},
  ofic: {locs:['ofic'], cultivo:null, label:'Oficina', color:'#9E9E9E'},
  fram: {locs:['jal','nay'], cultivo:'fram', label:'Frambuesa', color:'#D6336C'},
  com:  {locs:['com'], cultivo:null, label:'Comercializadora', color:'#3CB87A'}
};

// Semana ISO del año calendario real (1-53)
function semanaISO(fechaStr){
  var d = new Date(fechaStr+'T12:00:00');
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date-yearStart)/86400000)+1)/7);
}

function anioDeFecha(fechaStr){
  var d = new Date(fechaStr+'T12:00:00');
  return d.getFullYear();
}

// Filtra gastos según negocio seleccionado (sin restricción de ciclo; el año se filtra aparte)
function finGastosFiltrados(negKey, soloEsteNeg){
  return gastos.filter(function(g){
    if(!soloEsteNeg || negKey==='todos') return true;
    var def = FIN_NEG_MAP[negKey];
    if(!def) return true;
    if(def.locs.indexOf(g.loc)<0) return false;
    if(def.cultivo===null){
      // ofic/com: cultivo debe ser igual al loc (ofic) o com
      return true;
    }
    return g.cultivo===def.cultivo;
  });
}

function finNegTab(neg){
  finNegSel = neg;
  document.querySelectorAll('#fin-neg-subnav .rep-tab').forEach(function(btn){
    btn.classList.toggle('active', btn.dataset.neg===neg);
  });
  document.getElementById('fin-card-negocio').style.display = neg==='todos' ? 'block' : 'none';
  document.getElementById('fin-cat-title').textContent = neg==='todos' ? 'Gastos x Sub-Concepto' : 'Gastos x Sub-Concepto — '+FIN_NEG_MAP[neg].label;
  populateFinAnioSelect(true);
  populateFinSemanaSelect(true);
  renderFinanciero();
}

function onFinAnioChange(){
  finAnioSel = document.getElementById('fin-anio-select').value;
  if(finAnioSel==='todos'){
    finSemSel = 'todas';
    populateFinSemanaSelect();
  } else {
    populateFinSemanaSelect(true);
  }
  renderFinanciero();
}

function onFinSemanaChange(){
  finSemSel = document.getElementById('fin-sem-select').value;
  renderFinanciero();
}

// Valores de periodo (ciclos o años, según el negocio activo) presentes en los datos, más reciente primero
function finValoresPeriodo(){
  var usaCiclo = finUsaCiclo(finNegSel);
  var data = finGastosFiltrados(finNegSel, finNegSel!=='todos');
  var set = {};
  data.forEach(function(g){
    if(usaCiclo){
      var c = g.ciclo || cicloFromFecha(g.fechaVal);
      if(c) set[c] = true;
    } else {
      if(g.fechaVal) set[String(anioDeFecha(g.fechaVal))] = true;
    }
  });
  var arr = Object.keys(set);
  arr.sort();
  arr.reverse();
  return arr;
}

function populateFinAnioSelect(forceReciente){
  var sel = document.getElementById('fin-anio-select');
  var lblEl = document.getElementById('fin-periodo-lbl');
  var usaCiclo = finUsaCiclo(finNegSel);
  if(lblEl) lblEl.textContent = usaCiclo ? 'Ciclo' : 'Año';

  var valores = finValoresPeriodo();
  var prevVal = finAnioSel;
  sel.innerHTML = '<option value="todos">'+(usaCiclo ? 'Todos los ciclos' : 'Todos los años')+'</option>';
  valores.forEach(function(v){
    var o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
  if(!forceReciente && (valores.indexOf(String(prevVal))>=0 || prevVal==='todos')){
    sel.value = prevVal;
    finAnioSel = prevVal;
  } else if(valores.length){
    sel.value = valores[0];
    finAnioSel = valores[0];
  } else {
    sel.value = 'todos';
    finAnioSel = 'todos';
  }
}

function populateFinSemanaSelect(forceReciente){
  var sel = document.getElementById('fin-sem-select');
  var usaCiclo = finUsaCiclo(finNegSel);
  var data = finGastosFiltrados(finNegSel, finNegSel!=='todos');
  if(finAnioSel!=='todos'){
    data = data.filter(function(g){
      if(usaCiclo) return (g.ciclo||cicloFromFecha(g.fechaVal))===finAnioSel;
      return g.fechaVal && String(anioDeFecha(g.fechaVal))===String(finAnioSel);
    });
  }
  var semSet = {};
  var fechaMax = null, semMax = null;
  data.forEach(function(g){
    if(!g.fechaVal) return;
    var s = semanaISO(g.fechaVal);
    semSet[s] = true;
    if(fechaMax===null || g.fechaVal>fechaMax){ fechaMax = g.fechaVal; semMax = s; }
  });
  var semanas = Object.keys(semSet).map(Number).sort(function(a,b){return a-b;});
  var prevVal = finSemSel;
  sel.innerHTML = '<option value="todas">Todas las semanas</option>';
  semanas.forEach(function(s){
    var o = document.createElement('option');
    o.value = s; o.textContent = 'Semana '+(s<10?'0'+s:s);
    sel.appendChild(o);
  });
  if(!forceReciente && (semanas.indexOf(Number(prevVal))>=0 || prevVal==='todas')){
    sel.value = prevVal;
    finSemSel = prevVal;
  } else if(semMax!==null){
    sel.value = semMax;
    finSemSel = semMax;
  } else {
    sel.value = 'todas';
    finSemSel = 'todas';
  }
}

function finDataConSemana(){
  var data = finGastosFiltrados(finNegSel, finNegSel!=='todos');
  data = data.map(function(g){
    return Object.assign({}, g, {
      _periodo: finUsaCiclo(finNegSel) ? (g.ciclo || cicloFromFecha(g.fechaVal)) : (g.fechaVal ? String(anioDeFecha(g.fechaVal)) : null),
      _semana: g.fechaVal ? semanaISO(g.fechaVal) : null
    });
  });
  if(finAnioSel!=='todos'){
    data = data.filter(function(g){return g._periodo===String(finAnioSel);});
  }
  if(finSemSel!=='todas'){
    data = data.filter(function(g){return g._semana===Number(finSemSel);});
  }
  return data;
}

function renderFinKPIs(){
  var data = finDataConSemana();
  var suma = data.reduce(function(a,g){return a+(parseFloat(g.monto)||0);},0);
  var prom = data.length ? suma/data.length : 0;
  document.getElementById('fin-kpi1').textContent = fmt(suma);
  document.getElementById('fin-kpi2').textContent = fmt(prom);

  // ---- Gasto del Mes (mes calendario actual, independiente del filtro de ciclo/año/semana) ----
  var mesActual = finMesKey(0), mesAnterior = finMesKey(-1);
  var gastoMesActual = finGastoDelMes(mesActual);
  var gastoMesAnterior = finGastoDelMes(mesAnterior);
  var mesEl = document.getElementById('fin-kpi-mes'), mesSubEl = document.getElementById('fin-kpi-mes-sub'), mesTrendEl = document.getElementById('fin-kpi-mes-trend');
  if(mesEl) mesEl.textContent = fmt(gastoMesActual);
  if(mesSubEl) mesSubEl.textContent = finMesLabel(mesActual);
  if(mesTrendEl) mesTrendEl.innerHTML = trendBadge(gastoMesActual, gastoMesAnterior, true);
}

// ---- Barras horizontales: Gastos x Sub-Concepto (categoría) ----
function renderFinBarrasCategoria(){
  var cont = document.getElementById('fin-barras-categoria');
  if(!cont) return;
  var data = finDataConSemana();
  var porCat = {};
  data.forEach(function(g){
    var c = g.cat || 'Sin categoría';
    porCat[c] = (porCat[c]||0) + (parseFloat(g.monto)||0);
  });
  var rows = Object.keys(porCat).map(function(c){return [c, porCat[c]];});
  rows.sort(function(a,b){return b[1]-a[1];});
  rows = rows.slice(0,10);

  if(!rows.length){
    cont.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px 0">Sin datos para este filtro</div>';
    return;
  }

  var maxV = Math.max.apply(null, rows.map(function(r){return r[1];}));
  var W = 320, barH = 22, gap = 8, padL = 4, padR = 56, padT=4;
  var H = rows.length*(barH+gap)-gap + padT*2;
  var plotW = W-padL-padR;

  var bars = '';
  rows.forEach(function(r, i){
    var y = padT + i*(barH+gap);
    var w = maxV>0 ? (r[1]/maxV*plotW) : 0;
    var labelTxt = r[0].length>18 ? r[0].slice(0,17)+'…' : r[0];
    bars += '<text x="'+padL+'" y="'+(y+barH/2-5)+'" font-size="9" fill="'+dashTextColor2()+'" font-weight="600">'+labelTxt+'</text>';
    bars += '<rect class="dash-bar-rect" x="'+padL+'" y="'+(y+barH/2-1)+'" width="'+Math.max(w,2).toFixed(1)+'" height="9" rx="3" fill="var(--green)" data-val="'+r[1]+'" data-lbl="'+r[0]+'"/>';
    bars += '<text x="'+(padL+w+6)+'" y="'+(y+barH/2+6)+'" font-size="9" fill="'+dashTextColor()+'" font-family="var(--mono)">'+fmtCompact(r[1])+'</text>';
  });

  var svg = '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+bars+'</svg>';
  cont.innerHTML = svg + '<div class="dash-tooltip" id="dash-tt-fincat"></div>';
  attachDashTooltips(cont, 'dash-tt-fincat');
}

// ---- Barras verticales: Gastos x Negocio (solo vista "todos") ----
function renderFinBarrasTodosNegocios(){
  var cont = document.getElementById('fin-barras-todos-negocios');
  if(!cont || finNegSel!=='todos') return;
  var keys = Object.keys(FIN_NEG_MAP);
  var rows = keys.map(function(k){
    var def = FIN_NEG_MAP[k];
    var total = gastos.filter(function(g){
      if(finAnioSel!=='todos' && (!g.fechaVal || anioDeFecha(g.fechaVal)!==Number(finAnioSel))) return false;
      if(finSemSel!=='todas' && (!g.fechaVal || semanaISO(g.fechaVal)!==Number(finSemSel))) return false;
      if(def.locs.indexOf(g.loc)<0) return false;
      if(def.cultivo===null) return true;
      return g.cultivo===def.cultivo;
    }).reduce(function(a,g){return a+(parseFloat(g.monto)||0);},0);
    return {key:k, label:def.label, total:total, color:def.color};
  });
  rows.sort(function(a,b){return b.total-a.total;});

  var maxV = Math.max.apply(null, rows.map(function(r){return r.total;}).concat([1]));
  var W = 320, H = 170, padL = 38, padR = 10, padT = 16, padB = 38;
  var plotW = W-padL-padR, plotH = H-padT-padB;
  var n = rows.length;
  var slot = plotW/n;
  var barW = Math.min(46, slot*0.6);

  var gridLines = '';
  var nGrid = 4;
  for(var g=0; g<=nGrid; g++){
    var gy = padT + plotH - (g/nGrid*plotH);
    var gv = Math.round(maxV*g/nGrid);
    gridLines += '<line x1="'+padL+'" y1="'+gy+'" x2="'+(padL+plotW)+'" y2="'+gy+'" stroke="'+dashGridColor()+'" stroke-width="1"/>';
    gridLines += '<text x="'+(padL-6)+'" y="'+(gy+3)+'" font-size="8" fill="'+dashTextColor()+'" text-anchor="end" font-family="var(--mono)">'+fmtCompact(gv)+'</text>';
  }

  var bars = '', labels = '';
  rows.forEach(function(r,i){
    var cx = padL + slot*i + slot/2;
    var bx = cx-barW/2;
    var bh = maxV>0 ? (r.total/maxV*plotH) : 0;
    var by = padT+plotH-bh;
    bars += '<rect class="dash-bar-rect" x="'+bx.toFixed(1)+'" y="'+by.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(bh,0.5).toFixed(1)+'" fill="'+r.color+'" rx="2" data-val="'+r.total+'" data-lbl="'+r.label+'"/>';
    bars += '<text x="'+cx.toFixed(1)+'" y="'+(by-5).toFixed(1)+'" font-size="8" fill="'+dashTextColor2()+'" text-anchor="middle" font-family="var(--mono)">'+fmtCompact(r.total)+'</text>';
    var lbl = r.label.length>12 ? r.label.slice(0,11)+'…' : r.label;
    labels += '<text x="'+cx.toFixed(1)+'" y="'+(H-22)+'" font-size="7.5" fill="'+dashTextColor()+'" text-anchor="middle">'+lbl+'</text>';
  });

  var svg = '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+gridLines+bars+labels+'</svg>';
  cont.innerHTML = svg + '<div class="dash-tooltip" id="dash-tt-finneg"></div>';
  attachDashTooltips(cont, 'dash-tt-finneg');
}

// Construye serie de puntos por semana, respetando si hay un año filtrado o todos
function finSerieSemanal(data){
  var bySemKey = {};
  data.forEach(function(g){
    if(!g.fechaVal) return;
    var anio = anioDeFecha(g.fechaVal);
    var sem = semanaISO(g.fechaVal);
    var key = anio+'-'+(sem<10?'0'+sem:sem);
    if(!bySemKey[key]) bySemKey[key] = {anio:anio, sem:sem, total:0};
    bySemKey[key].total += (parseFloat(g.monto)||0);
  });
  var keys = Object.keys(bySemKey).sort();
  return keys.map(function(k){
    var v = bySemKey[k];
    var lbl = finAnioSel==='todos' ? v.anio+' S'+(v.sem<10?'0'+v.sem:v.sem) : 'S'+(v.sem<10?'0'+v.sem:v.sem);
    return {label:lbl, total:v.total};
  });
}

// ---- Periodo: ciclo agrícola para jal/nay/fram, año calendario para ofic/com/todos ----
function finUsaCiclo(neg){
  return neg==='jal' || neg==='nay' || neg==='fram';
}

// Periodo anterior (ciclo previo o año previo) a partir de un valor de periodo dado
function finPeriodoPrevio(periodoVal, usaCiclo){
  if(usaCiclo){
    var idx = CICLOS.indexOf(periodoVal);
    if(idx>0) return CICLOS[idx-1];
    var parts = String(periodoVal).split('-');
    if(parts.length===2){
      var startY = parseInt(parts[0],10)-1;
      return startY+'-'+(startY+1);
    }
    return null;
  }
  return String(Number(periodoVal)-1);
}

// Etiqueta de tendencia (▲/▼/▬) comparando un valor actual contra uno previo.
// invertido=true para métricas de costo, donde subir es una alerta (rojo) y bajar es positivo (verde).
function trendBadge(curr, prev, invertido){
  if(prev===null || prev===undefined || prev===0 || curr===null || curr===undefined) return '';
  var pct = ((curr-prev)/Math.abs(prev))*100;
  var subiendo = pct>0.5, bajando = pct<-0.5;
  var cls = subiendo ? (invertido?'down':'up') : (bajando ? (invertido?'up':'down') : 'flat');
  var arrow = subiendo ? '▲' : (bajando ? '▼' : '▬');
  return '<span class="kpi-trend '+cls+'">'+arrow+' '+Math.abs(pct).toFixed(0)+'%</span>';
}

// ---- Mes calendario (independiente del filtro de ciclo/año/semana): para el pulso de gasto mensual ----
function finMesKey(offsetMeses){
  var hoy = new Date();
  var d = new Date(hoy.getFullYear(), hoy.getMonth()+offsetMeses, 1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}

function finMesLabel(mesKey){
  var p = mesKey.split('-');
  var d = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, 1);
  var lbl = d.toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  return lbl.charAt(0).toUpperCase()+lbl.slice(1);
}

function finGastoDelMes(mesKey){
  return finGastosFiltrados(finNegSel, finNegSel!=='todos').filter(function(g){
    return g.fechaVal && g.fechaVal.substring(0,7)===mesKey;
  }).reduce(function(a,g){return a+(parseFloat(g.monto)||0);},0);
}

function finPorCategoriaMes(mesKey){
  var base = finGastosFiltrados(finNegSel, finNegSel!=='todos');
  var porCat = {};
  base.forEach(function(g){
    if(!g.fechaVal || g.fechaVal.substring(0,7)!==mesKey) return;
    var c = g.cat || 'Sin categoría';
    porCat[c] = (porCat[c]||0)+(parseFloat(g.monto)||0);
  });
  return porCat;
}

// ---- Comparativo por rubro: mes actual vs mes anterior (para detectar categorías que están subiendo) ----
// ---- Puntos clave: lecturas automáticas para apoyar decisiones ----
function renderFinInsights(){
  var cont = document.getElementById('fin-insights');
  if(!cont) return;

  var data = finDataConSemana();
  var insights = [];

  // 1) Categoría con mayor concentración de gasto en el filtro activo
  var porCat = {};
  data.forEach(function(g){
    var c = g.cat || 'Sin categoría';
    porCat[c] = (porCat[c]||0) + (parseFloat(g.monto)||0);
  });
  var catRows = Object.keys(porCat).map(function(c){return [c, porCat[c]];}).sort(function(a,b){return b[1]-a[1];});
  var totalGasto = catRows.reduce(function(a,r){return a+r[1];},0);
  if(catRows.length && totalGasto>0){
    var top = catRows[0];
    var pctTop = top[1]/totalGasto*100;
    insights.push({icon:'📌', text:'<b>'+top[0]+'</b> concentra el '+pctTop.toFixed(0)+'% del gasto en este filtro ('+fmt(top[1])+').'});
  }

  // 2) Rubro con mayor incremento mes actual vs mes anterior
  var mesActualIns = finMesKey(0), mesAnteriorIns = finMesKey(-1);
  var porCatActualIns = finPorCategoriaMes(mesActualIns);
  var porCatAnteriorIns = finPorCategoriaMes(mesAnteriorIns);
  var subidas = Object.keys(porCatActualIns).map(function(c){
    var actual = porCatActualIns[c], anterior = porCatAnteriorIns[c]||0;
    return {cat:c, actual:actual, anterior:anterior, delta:actual-anterior};
  }).filter(function(r){return r.anterior>0 && r.delta>0;});
  subidas.sort(function(a,b){return (b.delta/b.anterior)-(a.delta/a.anterior);});
  if(subidas.length){
    var s = subidas[0];
    var pctSube = (s.delta/s.anterior*100);
    insights.push({icon:'⚠️', text:'<b>'+s.cat+'</b> subió '+pctSube.toFixed(0)+'% vs el mes anterior ('+fmt(s.anterior)+' → '+fmt(s.actual)+').'});
  }

  // 3) Comparativo vs el mismo periodo anterior (ciclo previo o año previo, según el negocio)
  if(finAnioSel!=='todos'){
    var usaCicloIns = finUsaCiclo(finNegSel);
    var periodoPrevIns = finPeriodoPrevio(finAnioSel, usaCicloIns);
    var gastoPrev = finGastosFiltrados(finNegSel, finNegSel!=='todos').filter(function(g){
      var per = usaCicloIns ? (g.ciclo||cicloFromFecha(g.fechaVal)) : (g.fechaVal?String(anioDeFecha(g.fechaVal)):null);
      if(per!==periodoPrevIns) return false;
      if(finSemSel!=='todas' && semanaISO(g.fechaVal)!==Number(finSemSel)) return false;
      return true;
    }).reduce(function(a,g){return a+(parseFloat(g.monto)||0);},0);
    if(gastoPrev>0){
      var gastoActual = data.reduce(function(a,g){return a+(parseFloat(g.monto)||0);},0);
      var delta = (gastoActual-gastoPrev)/gastoPrev*100;
      var etiquetaPrev = usaCicloIns ? 'el ciclo '+periodoPrevIns : 'el mismo periodo de '+periodoPrevIns;
      insights.push({icon: delta>0?'🔺':'🔻', text:'El gasto '+(delta>0?'subió':'bajó')+' '+Math.abs(delta).toFixed(0)+'% vs '+etiquetaPrev+'.'});
    }
  }

  if(!insights.length){
    cont.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:10px 0">Aún no hay suficientes datos para generar puntos clave con este filtro.</div>';
    return;
  }

  cont.innerHTML = insights.map(function(it){
    return '<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--border)">'+
      '<span style="font-size:14px;flex-shrink:0">'+it.icon+'</span>'+
      '<span style="font-size:12.5px;color:var(--text2);line-height:1.4">'+it.text+'</span>'+
      '</div>';
  }).join('');
}

// ---- Línea: Gastos x Semana (del negocio/filtro activo) ----
function renderFinLineaSemana(){
  var cont = document.getElementById('fin-linea-semana');
  if(!cont) return;
  var data = finGastosFiltrados(finNegSel, finNegSel!=='todos');
  if(finAnioSel!=='todos'){
    data = data.filter(function(g){return g.fechaVal && anioDeFecha(g.fechaVal)===Number(finAnioSel);});
  }
  var puntos = finSerieSemanal(data);

  if(!puntos.length){
    cont.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px 0">Sin datos aún</div>';
    return;
  }

  var maxV = Math.max.apply(null, puntos.map(function(p){return p.total;}).concat([1]));
  var W = 680, H = 190, padL = 50, padR = 14, padT = 16, padB = 30;
  var plotW = W-padL-padR, plotH = H-padT-padB;
  var n = puntos.length;
  var stepX = n>1 ? plotW/(n-1) : 0;

  function xAt(i){ return padL + i*stepX; }
  function yAt(v){ return padT + plotH - (maxV>0 ? (v/maxV*plotH) : 0); }

  var gridLines = '';
  var nGrid = 4;
  for(var g=0; g<=nGrid; g++){
    var gy = padT + plotH - (g/nGrid*plotH);
    var gv = Math.round(maxV*g/nGrid);
    gridLines += '<line x1="'+padL+'" y1="'+gy+'" x2="'+(padL+plotW)+'" y2="'+gy+'" stroke="'+dashGridColor()+'" stroke-width="1"/>';
    gridLines += '<text x="'+(padL-6)+'" y="'+(gy+3)+'" font-size="8" fill="'+dashTextColor()+'" text-anchor="end" font-family="var(--mono)">'+fmtCompact(gv)+'</text>';
  }

  var pathD = '', points = '', labels = '';
  puntos.forEach(function(p,i){
    var x = xAt(i), y = yAt(p.total);
    pathD += (i===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1)+' ';
    points += '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="2.8" fill="var(--fram)" stroke="var(--surface)" stroke-width="1.3" class="dash-pt" data-val="'+p.total+'" data-lbl="'+p.label+'"/>';
    if(i%2===0 || n<=10) labels += '<text x="'+x.toFixed(1)+'" y="'+(H-10)+'" font-size="7.5" fill="'+dashTextColor()+'" text-anchor="middle">'+p.label+'</text>';
  });

  var svg = '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+
    gridLines+
    '<path d="'+pathD+'" fill="none" stroke="var(--fram)" stroke-width="2"/>'+
    points+labels+
    '</svg>';

  cont.innerHTML = svg + '<div class="dash-tooltip" id="dash-tt-finsem"></div>';
  attachDashTooltips(cont, 'dash-tt-finsem');
}

function renderFinanciero(){
  if(document.getElementById('fin-anio-select').options.length<=1){
    populateFinAnioSelect(true);
    populateFinSemanaSelect(true);
  }
  renderFinKPIs();
  renderFinBarrasCategoria();
  renderFinBarrasTodosNegocios();
  renderFinLineaSemana();
  renderFinInsights();
}

function renderRep(){
  var tot=gastos.reduce(function(a,g){return a+g.monto;},0);
  var tjal=gastos.filter(function(g){return g.loc==='jal';}).reduce(function(a,g){return a+g.monto;},0);
  var tnay=gastos.filter(function(g){return g.loc==='nay';}).reduce(function(a,g){return a+g.monto;},0);
  var tofi=gastos.filter(function(g){return g.loc==='ofic';}).reduce(function(a,g){return a+g.monto;},0);
  var tcom=gastos.filter(function(g){return g.loc==='com';}).reduce(function(a,g){return a+g.monto;},0);
  var tcam=gastos.filter(function(g){return g.cultivo==='camote';}).reduce(function(a,g){return a+g.monto;},0);
  var oneWeekAgo = new Date(hoy); oneWeekAgo.setDate(hoy.getDate()-7);
  var sw=gastos.filter(function(g){
    if(!g.fechaVal) return false;
    var fd=new Date(g.fechaVal+'T12:00:00'); return fd>=oneWeekAgo && fd<=hoy;
  }).reduce(function(a,g){return a+g.monto;},0);
  document.getElementById('r-tot').textContent=fmt(tot);
  document.getElementById('r-jal').textContent=fmt(tjal);
  document.getElementById('r-nay').textContent=fmt(tnay);
  document.getElementById('r-ofi').textContent=fmt(tofi);
  document.getElementById('r-com').textContent=fmt(tcom);
  document.getElementById('r-cam').textContent=fmt(tcam);
  document.getElementById('r-sw').textContent=fmt(sw);
  document.getElementById('r-cnt').textContent=gastos.length;

  // Por ciclo
  var cicloRows=[];
  CICLOS.forEach(function(c,ci){
    var v=gastos.filter(function(g){return g.ciclo===c;}).reduce(function(a,g){return a+g.monto;},0);
    if(v>0) cicloRows.push([c, v, ci===0?'c2':'c3']);
  });
  var maxCiclo=cicloRows.length?Math.max.apply(null,cicloRows.map(function(r){return r[1];})):1;
  bar(document.getElementById('rb-ciclo'),cicloRows,maxCiclo);

  // Por ubicacion/cultivo
  var locRows=[];
  var subG=[
    ['Jal. Camote','jal','camote','camote'],['Jal. Frambuesa','jal','fram','fram'],
    ['Jal. General','jal','general','jal'],
    ['Nay. Camote','nay','camote','camote'],['Nay. General','nay','general','nay'],
    ['Oficina','ofic','ofic','ofic'],
    ['Comercial.','com','com','com']
  ];
  subG.forEach(function(sg){
    var v=gastos.filter(function(g){return g.loc===sg[1]&&g.cultivo===sg[2];}).reduce(function(a,g){return a+g.monto;},0);
    if(v>0) locRows.push([sg[0],v,sg[3]]);
  });
  bar(document.getElementById('rb-loc'),locRows,tot);

  // Por tipo especial camote
  var tipoRows=[];
  CATS.camote_cosecha.forEach(function(c,ci){
    var v=gastos.filter(function(g){return g.cat===c;}).reduce(function(a,g){return a+g.monto;},0);
    var cls=['c1','c2','c3','c4'][ci];
    if(v>0) tipoRows.push([c,v,cls]);
  });
  var maxTipo=tipoRows.length?Math.max.apply(null,tipoRows.map(function(r){return r[1];})):1;
  bar(document.getElementById('rb-tipo'),tipoRows,maxTipo);

  // Por categoria general
  var allCats=CATS.camote_cosecha.concat(CATS.camote_general).concat(CATS.fram).concat(CATS.campo_general).concat(CATS.ofic).concat(CATS.com);
  var seen={};
  var catRows=[];
  var cls_list=['c1','c2','c3','c4','c5','c6','c7','c1','c2','c3','c4','c5','c6','c7','c1','c2','c3','c4'];
  allCats.forEach(function(c,ci){
    if(seen[c]) return; seen[c]=1;
    var v=gastos.filter(function(g){return g.cat===c;}).reduce(function(a,g){return a+g.monto;},0);
    if(v>0) catRows.push([c.split('/')[0].trim(),v,cls_list[ci]||'c1']);
  });
  var maxCat=catRows.length?Math.max.apply(null,catRows.map(function(r){return r[1];})):1;
  bar(document.getElementById('rb-cat'),catRows,maxCat);

  // Por mes
  var byMonthRep={};var monthRepOrder=[];
  gastos.forEach(function(g){
    var mk=g.fechaVal?g.fechaVal.substring(0,7):'sin-fecha';
    if(!byMonthRep[mk]){byMonthRep[mk]=0;monthRepOrder.push(mk);}
    byMonthRep[mk]+=g.monto;
  });
  monthRepOrder=monthRepOrder.filter(function(v,i){return monthRepOrder.indexOf(v)===i;});
  var semRows=monthRepOrder.map(function(mk){
    var lbl=mk==='sin-fecha'?'Sin fecha':(function(){
      var p=mk.split('-');var d=new Date(parseInt(p[0]),parseInt(p[1])-1,1);
      return d.toLocaleDateString('es-MX',{month:'short',year:'numeric'});
    })();
    return [lbl, byMonthRep[mk], 'c6'];
  });
  var maxSem=semRows.length?Math.max.apply(null,semRows.map(function(r){return r[1];})):1;
  bar(document.getElementById('rb-sem'),semRows,maxSem);
  renderIngresosRep();
}

// ---- Init ----
updateHeader();
window.addEventListener('load', function(){ setTimeout(initSupabase, 300); });
updateCultivoButtons('jal');
updateStepNumbers();
// set today as default date and auto-select ciclo
(function(){
  var fi=document.getElementById('f-fecha');
  var tz=hoy.getTimezoneOffset()*60000;
  var todayStr=new Date(hoy-tz).toISOString().slice(0,10);
  fi.value=todayStr;
  // Populate ciclo select in detalle form
  (function(){
    var s=document.getElementById('f-ciclo');
    CICLOS.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s.appendChild(o);});
    // default: auto from today
    var suggested=cicloFromFecha(todayStr);
    s.value=suggested;
  })();
})();
