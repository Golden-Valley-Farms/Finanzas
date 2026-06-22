// ---- SUPABASE ----
var SUPABASE_URL = 'https://jlfendrdwptwmttrahre.supabase.co';
var SUPABASE_KEY = 'sb_publishable_RNnR7jV42dGEGLFWdRVfvQ_cP1xSwuO';
var sb = null;
var sbOnline = false;

function initSupabase(){
  try {
    var client = window.supabase;
    if(!client){ console.warn('Supabase CDN no cargó'); return; }
    sb = client.createClient(SUPABASE_URL, SUPABASE_KEY);
    (async function(){
      try {
        var res = await sb.from('gastos').select('id').limit(1);
        sbOnline = !res.error;
        if(sbOnline){ console.log('Supabase conectado ✅'); cargarDesdeSB(); }
        else console.error('Supabase error:', res.error.message);
      } catch(e){ console.error('Supabase excepcion:', e.message); }
    })();
  } catch(e){ console.error('initSupabase error:', e.message); }
}

async function fetchAllRows(table, orderCol, asc){
  var all = [];
  var pageSize = 1000;
  var from = 0;
  while(true){
    var q = sb.from(table).select('*');
    if(orderCol) q = q.order(orderCol, {ascending: !!asc});
    q = q.range(from, from+pageSize-1);
    var res = await q;
    if(res.error || !res.data || !res.data.length) break;
    all = all.concat(res.data);
    if(res.data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function cargarDesdeSB(){
  if(!sbOnline) return;
  showToast('Sincronizando...');
  var gData = await fetchAllRows('gastos', 'created_at', false);
  var eData = await fetchAllRows('envios', 'created_at', false);
  var rC = await sb.from('clientes').select('nombre').order('nombre');
  var rP = await sb.from('proveedores').select('nombre').order('nombre');
  var rB = await sb.from('bancos').select('nombre').order('nombre');

  if(gData && gData.length){
    gastos = gData.map(function(g){
      return {id:g.id, fechaVal:g.fecha_val, fechaLbl:g.fecha_lbl,
        loc:g.loc, cultivo:g.cultivo, cat:g.cat, desc:g.descripcion,
        monto:parseFloat(g.monto||0), ciclo:g.ciclo, sector:g.sector,
        banco:g.banco, proveedor:g.proveedor||'', autoGen:g.auto_gen};
    });
    localStorage.setItem('cc_gastos3', JSON.stringify(gastos));
  }
  if(eData && eData.length){
    envios = eData.map(function(e){
      return {id:e.id, num:e.num, folio:e.folio, fecha:e.fecha,
        fechaLbl:e.fecha_lbl, loc:e.loc, ciclo:e.ciclo,
        cliente:e.cliente, proveedor:e.proveedor,
        flete:parseFloat(e.flete||0), fleteCompra:parseFloat(e.flete_compra||0),
        factura:e.factura, esComer:e.es_comer,
        total:parseFloat(e.total||0), partidas:e.partidas||[]};
    });
    localStorage.setItem('cc_envios', JSON.stringify(envios));
  }
  if(rC.data) clientes = rC.data.map(function(c){return c.nombre;});
  if(rP.data) proveedores = rP.data.map(function(p){return p.nombre;});
  if(rB.data) bancos = rB.data.map(function(b){return b.nombre;});

  showToast('✅ Datos sincronizados');
  renderEnvios();
}

async function sbSaveGasto(g){
  if(!sbOnline||!sb) return;
  await sb.from('gastos').upsert({
    id:g.id, fecha_val:g.fechaVal||'', fecha_lbl:g.fechaLbl||'',
    loc:g.loc||'', cultivo:g.cultivo||'', cat:g.cat||'',
    descripcion:g.desc||'', monto:g.monto||0, ciclo:g.ciclo||'',
    sector:g.sector||'', banco:g.banco||'', proveedor:g.proveedor||'', auto_gen:g.autoGen||false
  });
}

async function sbDeleteGasto(id){
  if(!sbOnline||!sb) return;
  await sb.from('gastos').delete().eq('id', id);
}

async function sbSaveEnvio(e){
  if(!sbOnline||!sb) return;
  await sb.from('envios').upsert({
    id:e.id, num:e.num||'', folio:e.folio||'', fecha:e.fecha||'',
    fecha_lbl:e.fechaLbl||'', loc:e.loc||'', ciclo:e.ciclo||'',
    cliente:e.cliente||'', proveedor:e.proveedor||'',
    flete:e.flete||0, flete_compra:e.fleteCompra||0,
    factura:e.factura||'', es_comer:e.esComer||false,
    total:e.total||0, partidas:e.partidas||[]
  });
}

async function sbDeleteEnvio(id){
  if(!sbOnline||!sb) return;
  await sb.from('envios').delete().eq('id', id);
}

async function sbSaveCliente(nombre){
  if(!sbOnline||!sb) return;
  await sb.from('clientes').upsert({nombre:nombre},{onConflict:'nombre'});
}

async function sbDeleteCliente(nombre){
  if(!sbOnline||!sb) return;
  await sb.from('clientes').delete().eq('nombre', nombre);
}

async function sbSaveProveedor(nombre){
  if(!sbOnline||!sb) return;
  await sb.from('proveedores').upsert({nombre:nombre},{onConflict:'nombre'});
}

async function sbDeleteProveedor(nombre){
  if(!sbOnline||!sb) return;
  await sb.from('proveedores').delete().eq('nombre', nombre);
}

async function sbSaveBanco(nombre){
  if(!sbOnline||!sb) return;
  await sb.from('bancos').upsert({nombre:nombre},{onConflict:'nombre'});
}

async function sbDeleteBanco(nombre){
  if(!sbOnline||!sb) return;
  await sb.from('bancos').delete().eq('nombre', nombre);
}

