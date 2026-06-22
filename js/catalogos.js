// ---- VARIEDADES ----
var VARIEDADES = ['Blanco Criollo','Amarillo Covington','Morado Criollo','Amarillo Nylon'];

// ---- PROVEEDORES ----
var proveedores = [];
try{var svp=localStorage.getItem('cc_proveedores');if(svp)proveedores=JSON.parse(svp);}catch(e){}
function saveProveedores(){try{localStorage.setItem('cc_proveedores',JSON.stringify(proveedores));}catch(e){}}
function agregarProveedorSiNuevo(nombre){
  if(!nombre) return;
  var nom=nombre.trim(); if(!nom) return;
  if(proveedores.indexOf(nom)<0){proveedores.push(nom);proveedores.sort(function(a,b){return a.localeCompare(b,'es');});saveProveedores();sbSaveProveedor(nom);}
}

// ---- BANCOS ----
var bancos = [];
try{
  var svb=localStorage.getItem('cc_bancos');
  if(svb) bancos=JSON.parse(svb);
  else {
    var seen={};
    gastos.forEach(function(g){if(g.banco&&g.banco.trim())seen[g.banco.trim()]=1;});
    bancos=Object.keys(seen).sort(function(a,b){return a.localeCompare(b,'es');});
  }
}catch(e){}
function saveBancos(){try{localStorage.setItem('cc_bancos',JSON.stringify(bancos));}catch(e){}}
function agregarBancoSiNuevo(nombre){
  if(!nombre) return;
  var nom=nombre.trim(); if(!nom) return;
  if(bancos.indexOf(nom)<0){bancos.push(nom);bancos.sort(function(a,b){return a.localeCompare(b,'es');});saveBancos();sbSaveBanco(nom);}
}

// ---- CLIENTE DROPDOWN ----
function updateClientesDatalist(){}
function renderClienteDropdown(){
  var dd=document.getElementById('cliente-dropdown'); if(!dd) return;
  var q=(document.getElementById('vf-cliente').value||'').toLowerCase();
  var filtered=clientes.filter(function(c){return c.toLowerCase().indexOf(q)>=0;});
  dd.innerHTML='';
  if(!filtered.length){dd.style.display='none';return;}
  filtered.forEach(function(c){
    var row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px';
    row.onmouseenter=function(){this.style.background='var(--green-bg)';};
    row.onmouseleave=function(){this.style.background='';};
    var name=document.createElement('span'); name.textContent=c; name.style.flex='1';
    name.onmousedown=function(e){e.preventDefault();document.getElementById('vf-cliente').value=c;hideClienteDropdown();};
    var btn=document.createElement('button');
    btn.textContent='×'; btn.title='Eliminar';
    btn.style.cssText='background:none;border:none;color:var(--text3);font-size:17px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0';
    btn.onmousedown=function(e){e.preventDefault();e.stopPropagation();
      clientes=clientes.filter(function(x){return x!==c;});
      if(typeof saveClientes==='function') saveClientes();
      sbDeleteCliente(c);
      renderClienteDropdown();
      if(document.getElementById('vf-cliente').value===c) document.getElementById('vf-cliente').value='';
      showToast('Cliente eliminado');};
    row.appendChild(name); row.appendChild(btn); dd.appendChild(row);
  });
  dd.style.display='block';
}
function showClienteDropdown(){renderClienteDropdown();}
function hideClienteDropdown(){var dd=document.getElementById('cliente-dropdown');if(dd)dd.style.display='none';}
function onClienteInput(){renderClienteDropdown();var dd=document.getElementById('cliente-dropdown');if(dd&&dd.children.length)dd.style.display='block';}

// ---- BANCO DROPDOWN ----
function renderBancoDropdown(){
  var dd=document.getElementById('banco-dropdown'); if(!dd) return;
  var q=(document.getElementById('f-banco').value||'').toLowerCase();
  var filtered=bancos.filter(function(b){return b.toLowerCase().indexOf(q)>=0;});
  dd.innerHTML='';
  if(!filtered.length){dd.style.display='none';return;}
  filtered.forEach(function(b){
    var row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px';
    row.onmouseenter=function(){this.style.background='var(--green-bg)';};
    row.onmouseleave=function(){this.style.background='';};
    var name=document.createElement('span'); name.textContent=b; name.style.flex='1';
    name.onmousedown=function(e){e.preventDefault();document.getElementById('f-banco').value=b;hideBancoDropdown();};
    var btn=document.createElement('button');
    btn.textContent='×'; btn.title='Eliminar';
    btn.style.cssText='background:none;border:none;color:var(--text3);font-size:17px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0';
    btn.onmousedown=function(e){e.preventDefault();e.stopPropagation();
      bancos=bancos.filter(function(x){return x!==b;});saveBancos();sbDeleteBanco(b);
      renderBancoDropdown();
      if(document.getElementById('f-banco').value===b) document.getElementById('f-banco').value='';
      showToast('Banco eliminado');};
    row.appendChild(name); row.appendChild(btn); dd.appendChild(row);
  });
  dd.style.display='block';
}
function showBancoDropdown(){renderBancoDropdown();}
function hideBancoDropdown(){var dd=document.getElementById('banco-dropdown');if(dd)dd.style.display='none';}
function onBancoInput(){renderBancoDropdown();var dd=document.getElementById('banco-dropdown');if(dd&&dd.children.length)dd.style.display='block';}

// ---- envioTotal ----
function envioTotal(e){
  return (e.partidas||[]).reduce(function(a,p){
    if(e.esComer||p.kgRecibidos!==undefined){
      return a+(parseFloat(p.kgRecibidos||0)*parseFloat(p.precioVenta||0));
    }
    return a+(parseFloat(p.pesoNeto||0)*parseFloat(p.precio||0));
  },0)+parseFloat(e.flete||0);
}

// fmt() definido en app.js

