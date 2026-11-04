/* ================== Entregas TX · Portal de clientes ================== */
async function iniciarCliente() {
  VIEWS = [
    { id: 'seguimiento', label: 'En camino', icon: I.map, title: 'Mis despachos en camino', bottom: true, render: vistaSeguimientoCliente },
    { id: 'recibidos', label: 'Recibidos', icon: I.check, title: 'Despachos recibidos', bottom: true, render: vistaRecibidosCliente },
  ];
  montarShell('cliente');
}

async function datosCliente(dias = 7) {
  const { data, error } = await sb.rpc('ent_seguimiento_cliente', { p_dias: dias });
  if (error) throw error;
  return data || [];
}

const ESTADO_CLIENTE = (g) => g.estado === 'en_destino' ? 'El camión llegó a tu obra'
  : g.estado !== 'asignada' ? ESTADOS[g.estado]
  : g.ruta_estado === 'en_ruta' ? (g.paradas_previas > 0 ? `En camino · ${g.paradas_previas} entrega(s) antes que la tuya` : 'En camino a tu obra')
  : g.ruta_estado === 'aceptada' ? 'Cargando en planta' : 'Programado';

async function vistaSeguimientoCliente(el) {
  $('#top-actions').innerHTML = `<button class="btn" id="cR">${I.refresh}<span>Actualizar</span></button>`;
  el.innerHTML = `<div class="seg-wrap"><div id="cL" style="display:grid;gap:12px;align-content:start"><div class="card empty"><b>Cargando…</b></div></div><div><div id="cMap" class="map full"></div><div class="sub" style="margin-top:6px">🚚 posición del camión (GPS) · ● tu obra. Se actualiza cada minuto.</div></div></div>`;
  const mapa = nuevoMapa($('#cMap')); S.mapa = mapa; const capa = mapa ? L.layerGroup().addTo(mapa) : null;
  let primera = true;
  const cargar = async () => {
    let G;
    try { G = await datosCliente(2); } catch (e) { $('#cL').innerHTML = `<div class="ctx err">${esc(errMsg(e))}</div>`; return; }
    if (!$('#cL')) return;
    const activos = G.filter(g => ['asignada', 'en_destino'].includes(g.estado));
    if (!S.perfil.cliente_rut && S.perfil.rol === 'cliente') { $('#cL').innerHTML = '<div class="card empty"><b>Cuenta sin RUT asociado</b>Pide a Grupo TX que asocie el RUT de tu empresa a tu usuario.</div>'; return; }
    $('#cL').innerHTML = activos.length ? activos.map(g => `<div class="card gcard ${g.estado}" data-g="${g.id}" style="cursor:pointer">
        <div class="top"><div><span class="eyebrow">${fechaCL(g.fecha)} · Pedido</span><div class="folio">${esc(g.folio)}</div></div>${badge(g.estado)}</div>
        <div class="cli">${esc(g.obra || g.cliente)}</div>
        <div class="dir">${I.pin}<span>${esc(g.direccion)}${g.comuna ? ', ' + esc(g.comuna) : ''}</span></div>
        <div class="ctx" style="padding:8px 10px"><b>${esc(ESTADO_CLIENTE(g))}</b>${g.patente ? `<span class="chip dark plain mono">${esc(g.patente)}</span>` : ''}${g.chofer ? `<span class="sub">Chofer ${esc(g.chofer)}</span>` : ''}</div>
        ${g.pos ? `<div class="sub">Última posición ${horaCL(g.pos.ts)}${g.dest_lat ? ` · a ~${fmtM(distM(g.pos.lat, g.pos.lng, g.dest_lat, g.dest_lng) * 1.3)} de tu obra` : ''}</div>` : g.ruta_estado === 'en_ruta' ? '<div class="sub">Esperando señal GPS del camión…</div>' : ''}
        ${g.detalle ? `<div class="det">${esc(g.detalle)}</div>` : ''}
      </div>`).join('')
      : '<div class="card empty"><b>No tienes despachos en camino</b>Cuando Grupo TX programe una entrega para tu obra, la verás aquí con la ubicación del camión.</div>';
    if (!capa) return;
    capa.clearLayers(); const b = [];
    activos.forEach(g => {
      if (g.dest_lat) { b.push([g.dest_lat, g.dest_lng]); L.marker([g.dest_lat, g.dest_lng], { icon: pin('#e4032e', '●') }).bindPopup(`<b>${esc(g.obra || g.cliente)}</b><br>${esc(g.direccion)}<br>Pedido ${esc(g.folio)}`).addTo(capa); }
      if (g.trazo && g.trazo.length > 1) L.polyline(g.trazo, { color: '#111214', weight: 3, opacity: .55, dashArray: '6 6' }).addTo(capa);
      if (g.pos) { b.push([g.pos.lat, g.pos.lng]); L.marker([g.pos.lat, g.pos.lng], { icon: pinCamion() }).bindPopup(`<b>Camión ${esc(g.patente || '')}</b><br>${esc(ESTADO_CLIENTE(g))}<br>Señal ${horaCL(g.pos.ts)}${g.pos.vel != null ? ' · ' + g.pos.vel + ' km/h' : ''}`).addTo(capa); }
    });
    if (primera && b.length) { mapa.fitBounds(b, { padding: [40, 40], maxZoom: 15 }); primera = false; }
    $$('[data-g]').forEach(c => c.onclick = () => { const g = activos.find(x => x.id === c.dataset.g); const p = g.pos || (g.dest_lat ? { lat: g.dest_lat, lng: g.dest_lng } : null); if (p) mapa.setView([p.lat, p.lng], 14); });
  };
  $('#cR').onclick = cargar;
  await cargar();
  S.timer = setInterval(() => { if (S.view === 'seguimiento' && document.visibilityState === 'visible') cargar(); }, 60000);
}

async function vistaRecibidosCliente(el) {
  let G;
  try { G = await datosCliente(60); } catch (e) { el.innerHTML = `<div class="ctx err">${esc(errMsg(e))}</div>`; return; }
  const hechos = G.filter(g => !['asignada', 'en_destino'].includes(g.estado));
  el.innerHTML = `<div class="sec-h"><div><h2>Últimos 60 días</h2><p>${hechos.length} despachos entregados a tus obras.</p></div></div>
    <div class="card tbl-wrap">${hechos.length ? `<table><thead><tr><th>Fecha</th><th>Pedido</th><th>Obra</th><th>Llegada</th><th>Recibió</th><th>Estado</th></tr></thead><tbody>
    ${hechos.map(g => `<tr><td class="num">${fechaCL(g.fecha)}</td><td class="num"><b>${esc(g.folio)}</b></td><td>${esc(g.obra || g.direccion)}</td><td class="num">${horaCL(g.llegada_at)}</td><td>${esc(g.receptor || '')}</td><td>${badge(g.estado)}</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty"><b>Sin despachos recibidos</b></div>'}</div>`;
}
