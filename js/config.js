// ---- Base ----
var hoy = new Date();

// ---- Config ----
var SECTORES = { jal_camote: 2, nay_camote: 10 };
var CATS = {
  camote_general:   ['Compra Insumos','Compra Insumos Agroquímicos','Compra Insumos Riego','Compra Mercancia','Nóminas Operativas'],
  camote_cosecha:   ['Arado','Cosecha','Desvarada','Flete Cosecha','Plantacion'],
  fram:             ['Compra Insumos','Compra Insumos Agroquímicos','Compra Insumos Riego','Compra Mercancia','Inocuidad','Intereses Operativos','Nóminas Operativas','Pago Prestamo'],
  campo_general:    ['Adquisición de Maquinaria','Combustible','Compra Insumos','Fletes','Mantenimiento Equipo','Otros Gastos','Servicios','Viáticos'],
  ofic:             ['Combustible','Contabilidad','Impuestos','IMSS','Intereses Operativos','Manejo de Cuenta','Nóminas Administrativas','Otros Gastos','Seguros','Servicios','Viáticos'],
  com:              ['Compra Mercancia','Fletes']
};
var CULTIVOS_BY_LOC = {
  jal: [{key:'general',lbl:'&#127807; General'},{key:'camote',lbl:'&#127808; Camote'},{key:'fram',lbl:'&#127815; Frambuesa'}],
  nay: [{key:'general',lbl:'&#127807; General'},{key:'camote',lbl:'&#127808; Camote'}],
  ofic: []
};

// ---- Ciclos ----
var CICLOS = ['2025-2026','2026-2027'];
var ciclo = '2025-2026'; // default, overridden by date logic below

function cicloFromFecha(fechaStr){
  if(!fechaStr) return CICLOS[0];
  var d = new Date(fechaStr+'T12:00:00');
  var yr = d.getFullYear();
  var mo = d.getMonth()+1; // 1-12
  // cycle starts July (7), so Jul-Dec = yr/yr+1, Jan-Jun = (yr-1)/yr
  var cycleStart = mo >= 7 ? yr : yr-1;
  var key = cycleStart+'-'+(cycleStart+1);
  if(CICLOS.indexOf(key)<0) key=CICLOS[CICLOS.length-1];
  return key;
}

function buildCicloButtons(){
  var cont=document.getElementById('ciclo-btns'); cont.innerHTML='';
  CICLOS.forEach(function(c){
    var b=document.createElement('button');
    b.className='ciclo-btn'+(c===ciclo?' sel':'');
    b.innerHTML='<div class="ciclo-lbl">'+c+'</div>';
    b.onclick=function(){
      ciclo=c;
      cont.querySelectorAll('.ciclo-btn').forEach(function(x){x.classList.remove('sel');});
      b.classList.add('sel');
    };
    cont.appendChild(b);
  });
}

document.getElementById('hdr-date').textContent=hoy.toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'long',year:'numeric'});


// Datos importados (se sobrescriben al exportar)
var DATOS_IMPORTADOS = [];
