// ---- State ----
var gastos=[], loc='jal', cultivo='camote', tipoCamote='general', sectoresSel=[], filtro='todas';
try{var sv=localStorage.getItem('cc_gastos3');if(sv)gastos=JSON.parse(sv);}catch(e){}
// FORZAR reemplazo completo con datos del Excel
try{
  gastos = DATOS_IMPORTADOS.slice();
  gastos.sort(function(a,b){return b.fechaVal>a.fechaVal?1:b.fechaVal<a.fechaVal?-1:0;});
  localStorage.setItem('cc_gastos3', JSON.stringify(gastos));
}catch(e){}

// Parche masivo: camote Jalisco/Nayarit sin tipoCamote → asignar 'general'
(function(){
  var changed=false;
  gastos.forEach(function(g){
    if(g.cultivo==='camote' && (g.loc==='jal'||g.loc==='nay') && !g.tipoCamote){
      g.tipoCamote='general'; changed=true;
    }
  });
  if(changed) try{localStorage.setItem('cc_gastos3',JSON.stringify(gastos));}catch(e){}
})();

function fmt(n){return '$'+Number(n).toLocaleString('es-MX',{minimumFractionDigits:0,maximumFractionDigits:0});}
function save(){try{localStorage.setItem('cc_gastos3',JSON.stringify(gastos));}catch(e){}}
function saveGastos(){save();}

// ---- Cat select ----
function updateCatSelect(){
  var sel=document.getElementById('f-cat'); sel.innerHTML='';
  var list=[];
  if(loc==='ofic') list=CATS.ofic;
  else if(loc==='com') list=CATS.com;
  else if(cultivo==='camote' && tipoCamote==='cosecha') list=CATS.camote_cosecha;
  else if(cultivo==='camote') list=CATS.camote_general;
  else if(cultivo==='fram') list=CATS.fram;
  else list=CATS.campo_general;
  for(var i=0;i<list.length;i++){
    var op=document.createElement('option'); op.value=list[i]; op.textContent=list[i]; sel.appendChild(op);
  }
}

function selTipo(t){
  tipoCamote=t;
  document.getElementById('tb-cosecha').classList.toggle('sel', t==='cosecha');
  document.getElementById('tb-general').classList.toggle('sel', t==='general');
  sectoresSel=[];
  var secSec=document.getElementById('sector-sec');
  if(t==='cosecha'){
    secSec.classList.add('visible');
    buildSectorGrid();
  } else {
    secSec.classList.remove('visible');
  }
  updateCatSelect();
  updateStepNumbers();
}

function onCatChange(){}  // kept for compatibility

function updateStepNumbers(){
  var esCampo = loc!=='ofic' && loc!=='com';
  var esCamote = esCampo && cultivo==='camote';
  var step=1;
  document.getElementById('step-loc-lbl').textContent=step+'. Negocio'; step++;
  if(esCampo){ document.getElementById('step-cultivo-lbl').textContent=step+'. Actividad'; step++; }
  if(esCamote){ document.getElementById('step-tipo-lbl').textContent=step+'. Tipo de gasto'; step++; }
  if(esCamote && tipoCamote==='cosecha'){ document.getElementById('step-sector-lbl').innerHTML=step+'. Sector <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text3)">(opcional)</span>'; step++; }
  document.getElementById('step-detalle-lbl').textContent=step+'. Detalle';
}

function buildSectorGrid(){
  var key = loc+'_'+cultivo;
  var n = SECTORES[key] || 0;
  var sel=document.getElementById('sector-select'); sel.innerHTML='';
  var def=document.createElement('option'); def.value=''; def.textContent='— Sin sector —'; sel.appendChild(def);
  for(var i=1;i<=n;i++){
    var op=document.createElement('option');
    op.value=i; op.textContent='Sector '+i;
    sel.appendChild(op);
  }
  sel.value = sectoresSel.length ? sectoresSel[0] : '';
}

function onSectorChange(){
  var v=document.getElementById('sector-select').value;
  sectoresSel = v ? [parseInt(v)] : [];
}

function updateSectorHint(){}

// ---- Cultivo ----
function updateCultivoButtons(l){
  var sec=document.getElementById('cultivo-sec');
  var tipoSec=document.getElementById('tipo-sec');
  var opts=CULTIVOS_BY_LOC[l];
  if(!opts||!opts.length){
    sec.classList.remove('visible');
    tipoSec.classList.remove('visible');
    document.getElementById('sector-sec').classList.remove('visible');
    cultivo= (l==='com') ? 'com' : 'ofic'; updateCatSelect(); updateStepNumbers(); return;
  }
  sec.classList.add('visible');
  cultivo=opts[0].key;
  var cont=document.getElementById('cultivo-btns'); cont.innerHTML='';
  for(var i=0;i<opts.length;i++){
    (function(opt,idx){
      var b=document.createElement('button');
      var extraCls=(l==='nay'&&opt.key==='general')?' nay':'';
      b.className='cultivo-btn '+opt.key+extraCls+(idx===0?' sel':'');
      b.innerHTML=opt.lbl;
      b.onclick=function(){
        cultivo=opt.key; sectoresSel=[];
        var all=cont.querySelectorAll('.cultivo-btn');
        for(var j=0;j<all.length;j++) all[j].classList.remove('sel');
        b.classList.add('sel');
        // show tipo only for camote
        var ts=document.getElementById('tipo-sec');
        var ss=document.getElementById('sector-sec');
        if(opt.key==='camote'){
          ts.classList.add('visible');
          tipoCamote='cosecha';
          document.getElementById('tb-cosecha').classList.add('sel');
          document.getElementById('tb-general').classList.remove('sel');
          ss.classList.add('visible');
          buildSectorGrid();
        } else {
          ts.classList.remove('visible');
          ss.classList.remove('visible');
        }
        updateCatSelect(); updateStepNumbers();
      };
      cont.appendChild(b);
    })(opts[i],i);
  }
  // init tipo for default cultivo (camote) - default general
  if(cultivo==='camote'){
    tipoSec.classList.add('visible');
    tipoCamote='general';
    document.getElementById('tb-general').classList.add('sel');
    document.getElementById('tb-cosecha').classList.remove('sel');
    document.getElementById('sector-sec').classList.remove('visible');
  } else {
    tipoSec.classList.remove('visible');
    document.getElementById('sector-sec').classList.remove('visible');
  }
  updateCatSelect(); updateStepNumbers();
}

// ---- Loc ----
function selLoc(l){
  loc=l;
  ['jal','nay','ofic','com'].forEach(function(x){
    document.getElementById('lb-'+x).classList.toggle('sel',x===l);
  });
  sectoresSel=[]; tipoCamote='general';
  document.getElementById('sector-sec').classList.remove('visible');
  document.getElementById('tipo-sec').classList.remove('visible');
  updateCultivoButtons(l);
  updateStepNumbers();
}

// ---- Nav ----
function goSc(s){
  ['reg','his','rep','ven','fram'].forEach(function(x){
    document.getElementById('sc-'+x).classList.toggle('active',x===s);
    document.getElementById('nav-'+x).classList.toggle('active',x===s);
  });
  if(s==='his') renderHis();
  if(s==='rep') renderFinanciero();
  if(s==='ven'){ venTab('lista'); }
  if(s==='fram'){ framTab('nuevo'); }
  window.scrollTo(0,0);
}

function showToast(msg){
  var t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(function(){t.classList.remove('show');},2300);
}

function updateHeader(){
  // totals removed from UI - kept for compatibility
}

