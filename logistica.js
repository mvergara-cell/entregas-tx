/* ================== VISTA LOGÍSTICA / ADMIN ================== */
const TABS = [
  ['guias', 'Asignar guías'],
  ['seguimiento', 'Seguimiento'],
  ['entregas', 'Entregas'],
  ['devoluciones', 'Devoluciones'],
  ['usuarios', 'Choferes y usuarios'],
  ['catalogos', 'Catálogos'],
];

async function cargarUsuarios() {
  const { data } = await sb.from('ent_usuarios').select('*').order('nombre');
  S.usuarios = data || [];
  S.choferes = S.usuarios.filter(u => ['chofer', 'admin'].includes(u.rol) && u.activo);
}
const nombreUsuario = (id) => S.usuarios.find(u => u.id === id)?.nombre || '—';
const colorChofer = (id) => COLORES[Math.max(0, S.choferes.findIndex(c => c.id === id)) % COLORES.length];

async function vistaLogistica(tab) {
  S.vista = 'logistica';
  S.tab = tab || S.tab || 'guias';
  await cargarUsuarios();
  $('#app').innerHTML = `
  <div class="top">
    <div class="brand">Entregas <b>TX</b></div><div class="sp"></div>
    <div class="who"><div>${esc(S.perfil.nombre)}</div><div class="small">${S.perfil.rol === 'admin' ? 'Administrador' : 'Logística'}</div></div>
    ${S.perfil.rol === 'admin' ? '<button id="bComoChofer" title="Probar la app como chofer">Vista chofer</button>' : ''}
    <button id="bSalir">Salir</button>
  </div>
  <div class="tabs">${TABS.map(([k, t]) => `<button data-t="${k}" class="${k === S.tab ? 'on' : ''}">${t}</button>`).join('')}</div>
  <div class="wrap" id="cont"></div>`;
  $('#bSalir').onclick = () => sb.auth.signOut();
  if ($('#bComoChofer')) $('#bComoChofer').onclick = () => vistaChofer();
  $$('.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); abrirTab(); });
  abrirTab();
}
function abrirTab() {
  clearInterval(S.timerSeg);
  const f = { guias: tabGuias, seguimiento: tabSeguimiento, entregas: tabEntregas, devoluciones: tabDevoluciones, usuarios: tabUsuarios, catalogos: tabCatalogos }[S.tab];
  f($('#cont'));
}
const optsChoferes = (sel) => '<option value="">— Sin asignar —</option>' + S.choferes.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nombre)}${c.rol === 'admin' ? ' (admin)' : ''}</option>`).join('');

/* ---------- Asignar guías ---------- */
async function tabGuias(el) {
  S.fGuias = S.fGuias || { fecha: hoy(), chofer: '' };
  el.innerHTML = `
  <div class="card"><div class="row">
    <div><label>Fecha</label><input type="date" id="gF" value="${S.fGuias.fecha}"></div>
    <div class="grow"><label>Chofer</label><select id="gC"><option value="">Todos</option>${S.choferes.map(c => `<option value="${c.id}" ${c.id === S.fGuias.chofer ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
    <div style="align-self:flex-end" class="row">
      <button class="btn" id="gNueva">+ Nueva guía</button>
      <button class="btn sec" id="gPegar">Pegar desde Excel</button>
      <button class="btn sec" id="gGeo" title="Ubicar en el mapa las guías sin coordenadas">Geolocalizar</button>
    </div></div></div>
  <div class="card"><div id="gTabla" class="tbl-wrap"><div class="muted">Cargando…</div></div></div>`;
  $('#gF').onchange = e => { S.fGuias.fecha = e.target.value; cargar(); };
  $('#gC').onchange = e => { S.fGuias.chofer = e.target.value; cargar(); };
  $('#gNueva').onclick = () => editarGuia(null, cargar);
  $('#gPegar').onclick = () => pegarGuias(cargar);
  $('#gGeo').onclick = () => geolocalizarPendientes(S.guiasDia || [], cargar);
  async function cargar() {
    let q = sb.from('ent_guias').select('*').eq('fecha', S.fGuias.fecha).order('chofer_id').order('orden').order('created_at');
    if (S.fGuias.chofer) q = q.eq('chofer_id', S.fGuias.chofer);
    const { data, error } = await q;
    if (!$('#gTabla')) return;
    if (error) return $('#gTabla').innerHTML = `<div class="alerta roja">${esc(errMsg(error))}</div>`;
    S.guiasDia = data;
    if (!data.length) return $('#gTabla').innerHTML = '<div class="muted">No hay guías asignadas para esta fecha.</div>';
    $('#gTabla').innerHTML = `<table><thead><tr><th>#</th><th>Folio</th><th>Chofer</th><th>Cliente / Obra</th><th>Dirección</th><th>Mapa</th><th>Estado</th><th></th></tr></thead><tbody>
      ${data.map(g => `<tr>
        <td>${g.orden || ''}</td><td><b>${esc(g.folio)}</b></td>
        <td>${g.chofer_id ? `<span class="gpsdot" style="background:${colorChofer(g.chofer_id)}"></span>${esc(nombreUsuario(g.chofer_id))}` : '<span style="color:var(--rojo)">Sin asignar</span>'}</td>
        <td>${esc(g.cliente)}<div class="small muted">${esc(g.obra || '')}</div></td>
        <td>${esc(g.direccion)}<div class="small muted">${esc(g.comuna || '')}</div></td>
        <td>${g.dest_lat ? '✔' : '<span class="muted small">—</span>'}</td>
        <td>${badge(g.estado)}</td>
        <td class="right" style="white-space:nowrap">
          ${['asignada', 'anulada'].includes(g.estado) ? `<button class="btn sec sm" data-ed="${g.id}">Editar</button>` : `<button class="btn sec sm" data-ver="${g.id}">Ver</button>`}
        </td></tr>`).join('')}</tbody></table>`;
    $$('[data-ed]', el).forEach(b => b.onclick = () => editarGuia(data.find(g => g.id === b.dataset.ed), cargar));
    $$('[data-ver]', el).forEach(b => b.onclick = () => verEntrega(b.dataset.ver));
  }
  cargar();
}

function editarGuia(g, alGuardar) {
  const n = !g; g = g || { fecha: S.fGuias?.fecha || hoy(), orden: (S.guiasDia?.length || 0) + 1 };
  const box = abrirModal(`<h2>${n ? 'Nueva guía' : 'Editar guía ' + esc(g.folio)}</h2>
  <form id="fg">
    <div class="grid3">
      <div><label>N° guía de despacho *</label><input name="folio" required value="${esc(g.folio || '')}"></div>
      <div><label>Fecha *</label><input name="fecha" type="date" required value="${esc(g.fecha)}"></div>
      <div><label>Orden de visita</label><input name="orden" type="number" min="0" value="${esc(g.orden ?? 0)}"></div>
    </div>
    <label>Chofer / transportista *</label><select name="chofer_id" required>${optsChoferes(g.chofer_id)}</select>
    <div class="grid2">
      <div><label>Cliente *</label><input name="cliente" required value="${esc(g.cliente || '')}"></div>
      <div><label>Obra</label><input name="obra" value="${esc(g.obra || '')}"></div>
    </div>
    <div class="grid2">
      <div><label>Dirección de entrega *</label><input name="direccion" required value="${esc(g.direccion || '')}"></div>
      <div><label>Comuna</label><input name="comuna" value="${esc(g.comuna || '')}"></div>
    </div>
    <div class="row" style="margin:8px 0"><button type="button" class="btn sec sm" id="bBuscar">Buscar dirección en el mapa</button><span class="small muted grow">o haz clic en el mapa para fijar el destino</span></div>
    <div id="mapG" class="map sm"></div>
    <input type="hidden" name="dest_lat" value="${g.dest_lat ?? ''}"><input type="hidden" name="dest_lng" value="${g.dest_lng ?? ''}">
    <div class="grid2">
      <div><label>Contacto en obra</label><input name="contacto" value="${esc(g.contacto || '')}"></div>
      <div><label>Teléfono contacto</label><input name="telefono" value="${esc(g.telefono || '')}"></div>
    </div>
    <label>Detalle de carga</label><textarea name="detalle" placeholder="Ej: 120 sacos Pega Bloque, 40 sacos Estuco">${esc(g.detalle || '')}</textarea>
    <label>Observación para el chofer</label><input name="observacion" value="${esc(g.observacion || '')}">
    <div class="row" style="margin-top:14px">
      <button class="btn">${n ? 'Crear guía' : 'Guardar'}</button>
      ${!n && g.estado === 'asignada' ? '<button type="button" class="btn sec" id="bAnular">Anular</button>' : ''}
      ${!n && g.estado === 'anulada' ? '<button type="button" class="btn sec" id="bReact">Reactivar</button>' : ''}
      ${!n ? '<button type="button" class="btn danger" id="bBorrar">Eliminar</button>' : ''}
    </div>
  </form>`, { ancho: '820px' });
  const f = $('#fg', box);
  const mapa = nuevoMapa($('#mapG', box)); let mk = null;
  const fijar = (lat, lng, centrar) => {
    f.dest_lat.value = lat; f.dest_lng.value = lng;
    if (mk) mk.setLatLng([lat, lng]); else mk = L.marker([lat, lng], { draggable: true }).addTo(mapa).on('dragend', e => { const p = e.target.getLatLng(); f.dest_lat.value = p.lat; f.dest_lng.value = p.lng; });
    if (centrar) mapa.setView([lat, lng], 16);
  };
  if (g.dest_lat) fijar(g.dest_lat, g.dest_lng, true);
  mapa.on('click', e => fijar(e.latlng.lat, e.latlng.lng));
  $('#bBuscar', box).onclick = async () => {
    try { const r = await geocodificar(f.direccion.value, f.comuna.value); if (!r) return toast('No se encontró la dirección; marca el punto en el mapa', 'err'); fijar(r.lat, r.lng, true); }
    catch { toast('Error al buscar dirección', 'err'); }
  };
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    d.orden = +d.orden || 0; d.dest_lat = d.dest_lat ? +d.dest_lat : null; d.dest_lng = d.dest_lng ? +d.dest_lng : null;
    for (const k of ['obra', 'comuna', 'contacto', 'telefono', 'detalle', 'observacion']) d[k] = d[k]?.trim() || null;
    d.folio = d.folio.trim();
    const { error } = n ? await sb.from('ent_guias').insert(d) : await sb.from('ent_guias').update(d).eq('id', g.id);
    if (error) return toast(errMsg(error), 'err');
    toast(n ? 'Guía creada' : 'Guía actualizada', 'ok'); cerrarModal(); alGuardar && alGuardar();
  };
  const cambiarEstado = async (estado) => { const { error } = await sb.from('ent_guias').update({ estado }).eq('id', g.id); if (error) return toast(errMsg(error), 'err'); cerrarModal(); alGuardar && alGuardar(); };
  if ($('#bAnular', box)) $('#bAnular', box).onclick = () => confirm('¿Anular esta guía? El chofer dejará de verla.') && cambiarEstado('anulada');
  if ($('#bReact', box)) $('#bReact', box).onclick = () => cambiarEstado('asignada');
  if ($('#bBorrar', box)) $('#bBorrar', box).onclick = async () => {
    if (!confirm('¿Eliminar definitivamente esta guía?')) return;
    const { error } = await sb.from('ent_guias').delete().eq('id', g.id);
    if (error) return toast(errMsg(error), 'err'); cerrarModal(); alGuardar && alGuardar();
  };
}

function pegarGuias(alGuardar) {
  const box = abrirModal(`<h2>Pegar guías desde Excel</h2>
    <p class="small muted">Copia las filas desde Excel con estas columnas en este orden (la fila de títulos es opcional):<br>
    <b>Folio · Cliente · Obra · Dirección · Comuna · Contacto · Teléfono · Detalle</b></p>
    <div class="grid2">
      <div><label>Fecha</label><input type="date" id="pF" value="${S.fGuias?.fecha || hoy()}"></div>
      <div><label>Asignar al chofer</label><select id="pC">${optsChoferes('')}</select></div>
    </div>
    <label>Filas</label><textarea id="pT" style="min-height:180px;font-family:monospace;font-size:13px" placeholder="123456\tConstructora X\tEdificio Y\tAv. Siempre Viva 123\tMaipú\tJuan\t+569...\t100 sacos"></textarea>
    <div class="row" style="margin-top:8px"><label style="margin:0;display:flex;gap:6px;align-items:center;color:var(--txt)"><input type="checkbox" id="pGeo" style="width:auto" checked> Ubicar direcciones en el mapa automáticamente</label></div>
    <div id="pPrev" class="small muted" style="margin:8px 0"></div>
    <button class="btn" id="pOk">Cargar guías</button>`, { ancho: '820px' });
  const parse = () => $('#pT', box).value.split(/\r?\n/).map(l => l.split('\t').map(s => s.trim())).filter(c => c[0] && !/^folio$/i.test(c[0]));
  $('#pT', box).oninput = () => { const r = parse(); $('#pPrev', box).textContent = r.length ? `${r.length} guía(s) detectadas` : ''; };
  $('#pOk', box).onclick = async () => {
    const filas = parse(); if (!filas.length) return toast('No hay filas', 'err');
    const chofer = $('#pC', box).value || null, fecha = $('#pF', box).value;
    const base = (S.guiasDia || []).filter(g => g.chofer_id === chofer).length;
    const regs = filas.map((c, i) => ({ folio: c[0], cliente: c[1] || '', obra: c[2] || null, direccion: c[3] || '', comuna: c[4] || null, contacto: c[5] || null, telefono: c[6] || null, detalle: c[7] || null, chofer_id: chofer, fecha, orden: base + i + 1 }));
    const btn = $('#pOk', box); btn.disabled = true; btn.textContent = 'Cargando…';
    const { data, error } = await sb.from('ent_guias').insert(regs).select();
    if (error) { btn.disabled = false; btn.textContent = 'Cargar guías'; return toast(errMsg(error), 'err'); }
    toast(`${data.length} guías cargadas`, 'ok');
    if ($('#pGeo', box).checked) { cerrarModal(); await geolocalizarPendientes(data, alGuardar); }
    else { cerrarModal(); alGuardar && alGuardar(); }
  };
}

async function geolocalizarPendientes(guias, alTerminar) {
  const pend = guias.filter(g => !g.dest_lat && g.direccion);
  if (!pend.length) return toast('Todas las guías ya tienen ubicación');
  let ok = 0;
  for (let i = 0; i < pend.length; i++) {
    toast(`Ubicando direcciones ${i + 1}/${pend.length}…`);
    try {
      const r = await geocodificar(pend[i].direccion, pend[i].comuna);
      if (r) { await sb.from('ent_guias').update({ dest_lat: r.lat, dest_lng: r.lng }).eq('id', pend[i].id); ok++; }
    } catch {}
    await new Promise(r => setTimeout(r, 1100)); // límite del servicio de mapas: 1 consulta/seg
  }
  toast(`${ok} de ${pend.length} direcciones ubicadas. Revisa las que faltan con "Editar".`, ok ? 'ok' : 'err');
  alTerminar && alTerminar();
}

/* ---------- Seguimiento (mapa) ---------- */
async function tabSeguimiento(el) {
  S.fSeg = S.fSeg || { fecha: hoy(), chofer: '' };
  el.innerHTML = `
  <div class="card"><div class="row">
    <div><label>Fecha</label><input type="date" id="sF" value="${S.fSeg.fecha}"></div>
    <div class="grow"><label>Chofer</label><select id="sC"><option value="">Todos</option>${S.choferes.map(c => `<option value="${c.id}" ${c.id === S.fSeg.chofer ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
    <div style="align-self:flex-end"><button class="btn sec" id="sR">↻ Actualizar</button></div>
  </div></div>
  <div class="kpis" id="sK"></div>
  <div class="seguim">
    <div class="card" style="margin:0;max-height:calc(100vh - 230px);overflow:auto" id="sL"></div>
    <div><div id="mapS" class="map lg"></div>
      <div class="small muted" style="margin-top:6px">Línea = trayecto registrado por el celular del chofer (y por GPSur cuando esté conectado). ● gris = destino · ● verde = entrega · ● naranjo = con devolución · ● rojo = rechazo o llegada lejos del destino (&gt; ${RADIO_ALERTA_M} m) · 🚚 = última posición.</div></div>
  </div>`;
  const mapa = nuevoMapa($('#mapS'));
  const capa = L.layerGroup().addTo(mapa);
  $('#sF').onchange = e => { S.fSeg.fecha = e.target.value; cargar(true); };
  $('#sC').onchange = e => { S.fSeg.chofer = e.target.value; cargar(true); };
  $('#sR').onclick = () => cargar(false);
  async function cargar(encuadrar) {
    const f = S.fSeg.fecha;
    let qg = sb.from('ent_guias').select('*, ent_entregas(*)').eq('fecha', f).neq('estado', 'anulada');
    if (S.fSeg.chofer) qg = qg.eq('chofer_id', S.fSeg.chofer);
    const desde = new Date(sumarDias(f, -1) + 'T12:00:00Z').toISOString(), hasta = new Date(sumarDias(f, 1) + 'T12:00:00Z').toISOString();
    const qp = () => { let q = sb.from('ent_posiciones').select('chofer_id,patente,ts,lat,lng,velocidad_kmh,fuente').gte('ts', desde).lte('ts', hasta).order('ts'); if (S.fSeg.chofer) q = q.eq('chofer_id', S.fSeg.chofer); return q; };
    let guias, pos;
    try { const [rg, rp] = await Promise.all([qg, traerTodo(qp)]); if (rg.error) throw rg.error; guias = rg.data; pos = rp.filter(p => diaCL(p.ts) === f); }
    catch (e) { return toast(errMsg(e), 'err'); }
    if (!$('#sK')) return;
    capa.clearLayers();
    const bounds = [];
    // trayectos por chofer (o patente si viene de GPSur)
    const porChofer = {};
    pos.forEach(p => { const k = p.chofer_id || 'pat:' + p.patente; (porChofer[k] = porChofer[k] || []).push(p); });
    Object.entries(porChofer).forEach(([k, arr]) => {
      const col = k.startsWith('pat:') ? '#555' : colorChofer(k);
      const lls = arr.map(p => [p.lat, p.lng]); bounds.push(...lls);
      L.polyline(lls, { color: col, weight: 4, opacity: .8 }).addTo(capa);
      const u = arr[arr.length - 1];
      L.marker([u.lat, u.lng], { icon: L.divIcon({ className: '', html: `<div style="font-size:24px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">🚚</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .bindPopup(`<b>${esc(k.startsWith('pat:') ? k.slice(4) : nombreUsuario(k))}</b><br>Patente ${esc(u.patente || '')}<br>Última señal: ${horaCL(u.ts)}${u.velocidad_kmh != null ? '<br>' + u.velocidad_kmh + ' km/h' : ''}`).addTo(capa);
    });
    // destinos y llegadas
    guias.forEach(g => {
      const e = Array.isArray(g.ent_entregas) ? g.ent_entregas[0] : g.ent_entregas;
      if (g.dest_lat) {
        bounds.push([g.dest_lat, g.dest_lng]);
        L.marker([g.dest_lat, g.dest_lng], { icon: pin('#8d99a6', g.orden || '') }).bindPopup(`<b>Destino guía ${esc(g.folio)}</b><br>${esc(g.cliente)}<br>${esc(g.direccion)}<br>${badge(g.estado)}`).addTo(capa);
      }
      if (e && e.llegada_lat) {
        const lejos = e.distancia_destino_m != null && e.distancia_destino_m > RADIO_ALERTA_M;
        const col = g.estado === 'rechazada' || lejos ? '#d64545' : g.estado === 'entregada_con_devolucion' ? '#f28c28' : g.estado === 'entregada' ? '#1f9d55' : '#e0a800';
        bounds.push([e.llegada_lat, e.llegada_lng]);
        L.marker([e.llegada_lat, e.llegada_lng], { icon: pin(col, '✓') }).bindPopup(`<b>Llegada guía ${esc(g.folio)}</b><br>${esc(e.chofer_nombre)} · ${esc(e.patente)}<br>Llegó: ${horaCL(e.llegada_at)}${e.cierre_at ? '<br>Cerró: ' + horaCL(e.cierre_at) : ''}<br>Distancia al destino: ${fmtM(e.distancia_destino_m)}<br><a href="#" data-ver="${g.id}">Ver detalle</a>`).addTo(capa);
        if (g.dest_lat) L.polyline([[g.dest_lat, g.dest_lng], [e.llegada_lat, e.llegada_lng]], { color: col, dashArray: '4 6', weight: 2 }).addTo(capa);
      }
    });
    if (encuadrar && bounds.length) mapa.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    // KPIs
    const tot = guias.length, ent = guias.filter(g => g.estado === 'entregada').length, dev = guias.filter(g => g.estado === 'entregada_con_devolucion').length,
      rec = guias.filter(g => g.estado === 'rechazada').length, des = guias.filter(g => g.estado === 'en_destino').length;
    const lejos = guias.filter(g => { const e = Array.isArray(g.ent_entregas) ? g.ent_entregas[0] : g.ent_entregas; return e?.distancia_destino_m > RADIO_ALERTA_M; }).length;
    $('#sK').innerHTML = [['Guías', tot], ['Entregadas', ent], ['Con devolución', dev], ['Rechazadas', rec], ['En destino ahora', des], ['Pendientes', tot - ent - dev - rec - des], ['Llegada lejos del destino', lejos]]
      .map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    // lista por chofer
    const ids = [...new Set(guias.map(g => g.chofer_id).filter(Boolean).concat(Object.keys(porChofer).filter(k => !k.startsWith('pat:'))))];
    $('#sL').innerHTML = ids.length ? ids.map(id => {
      const gs = guias.filter(g => g.chofer_id === id), hechas = gs.filter(g => !['asignada', 'en_destino'].includes(g.estado)).length;
      const ult = (porChofer[id] || []).slice(-1)[0];
      return `<div class="chofer-item" data-c="${id}"><span class="sw" style="background:${colorChofer(id)}"></span>
        <div class="grow"><b>${esc(nombreUsuario(id))}</b><div class="small muted">${hechas}/${gs.length} guías · ${ult ? 'señal ' + horaCL(ult.ts) + ' · ' + esc(ult.patente || '') : 'sin señal GPS'}</div></div></div>
        ${gs.map(g => `<div class="small" style="padding:2px 0 2px 30px;cursor:pointer" data-ver="${g.id}">${g.orden ? g.orden + '. ' : ''}${esc(g.folio)} · ${esc(g.cliente)} ${badge(g.estado)}</div>`).join('')}`;
    }).join('<hr style="border:0;border-top:1px solid var(--borde)">') : '<div class="muted">Sin actividad para esta fecha.</div>';
    $$('#sL [data-c]').forEach(d => d.onclick = () => { const arr = porChofer[d.dataset.c]; if (arr?.length) mapa.fitBounds(arr.map(p => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 16 }); });
    $$('#sL [data-ver]').forEach(d => d.onclick = () => verEntrega(d.dataset.ver));
  }
  $('#mapS').addEventListener('click', ev => { const a = ev.target.closest('[data-ver]'); if (a) { ev.preventDefault(); verEntrega(a.dataset.ver); } });
  await cargar(true);
  S.timerSeg = setInterval(() => { if (S.tab === 'seguimiento' && document.visibilityState === 'visible') cargar(false); }, 60000);
}

/* ---------- Detalle de una entrega ---------- */
async function verEntrega(guiaId) {
  const box = abrirModal('<div class="muted">Cargando…</div>', { ancho: '860px' });
  const { data: g, error } = await sb.from('ent_guias').select('*, ent_entregas(*), ent_devoluciones(*)').eq('id', guiaId).single();
  if (error) return box.innerHTML += `<div class="alerta roja">${esc(errMsg(error))}</div>`;
  const e = Array.isArray(g.ent_entregas) ? g.ent_entregas[0] : g.ent_entregas;
  const fotos = e ? await Promise.all((e.fotos || []).map(urlFirmada)) : [];
  const firma = e?.firma_path ? await urlFirmada(e.firma_path) : '';
  const lejos = e?.distancia_destino_m > RADIO_ALERTA_M;
  box.innerHTML = `<button class="x" aria-label="Cerrar">×</button>
    <h2>Guía ${esc(g.folio)} ${badge(g.estado)}</h2>
    <div class="det-grid">
      <div>Fecha</div><div>${fechaCL(g.fecha)}</div>
      <div>Cliente</div><div>${esc(g.cliente)}${g.obra ? ' · ' + esc(g.obra) : ''}</div>
      <div>Dirección</div><div>${esc(g.direccion)}${g.comuna ? ', ' + esc(g.comuna) : ''}</div>
      <div>Chofer asignado</div><div>${esc(nombreUsuario(g.chofer_id))}</div>
      ${g.detalle ? `<div>Detalle carga</div><div style="white-space:pre-wrap">${esc(g.detalle)}</div>` : ''}
    </div>
    ${e ? `
    <h3 style="margin:16px 0 6px">Llegada</h3>
    <div class="det-grid">
      <div>Chofer / patente</div><div>${esc(e.chofer_nombre)} · <b>${esc(e.patente)}</b></div>
      <div>Aviso de llegada</div><div>${fechaHoraCL(e.llegada_at)}</div>
      <div>Ubicación del aviso</div><div>${e.llegada_lat ? `${e.llegada_lat.toFixed(5)}, ${e.llegada_lng.toFixed(5)} (±${Math.round(e.llegada_precision_m || 0)} m)` : '—'}</div>
      <div>Distancia al destino</div><div>${lejos ? `<span style="color:var(--rojo);font-weight:600">${fmtM(e.distancia_destino_m)} ⚠</span>` : fmtM(e.distancia_destino_m)}</div>
      ${e.cierre_at ? `<div>Entrega cerrada</div><div>${fechaHoraCL(e.cierre_at)} (${Math.round((new Date(e.cierre_at) - new Date(e.llegada_at)) / 60000)} min en obra)</div>` : ''}
    </div>
    ${e.llegada_lat ? '<div id="mapD" class="map sm" style="margin-top:8px"></div>' : ''}
    ${e.cierre_at ? `
    <h3 style="margin:16px 0 6px">Recepción</h3>
    <div class="det-grid">
      <div>Recibe</div><div><b>${esc(e.receptor_nombre)}</b>${e.receptor_rut ? ' · ' + esc(e.receptor_rut) : ''}${e.receptor_cargo ? ' · ' + esc(e.receptor_cargo) : ''}</div>
      ${e.receptor_telefono ? `<div>Teléfono</div><div>${esc(e.receptor_telefono)}</div>` : ''}
      ${e.observacion ? `<div>Observación</div><div>${esc(e.observacion)}</div>` : ''}
    </div>
    <h3 style="margin:16px 0 6px">Fotos</h3>
    <div class="imgs">${fotos.map(u => `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="foto"></a>`).join('') || '<span class="muted">—</span>'}</div>
    <h3 style="margin:16px 0 6px">Firma</h3>
    ${firma ? `<img class="firma-img" src="${firma}" alt="firma">` : '—'}
    ${g.ent_devoluciones?.length ? `<h3 style="margin:16px 0 6px">Devoluciones</h3>
      <div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Motivo</th><th>Comentario</th></tr></thead><tbody>
      ${g.ent_devoluciones.map(d => `<tr><td>${esc(d.producto_codigo)}</td><td>${esc(d.producto_descripcion)}</td><td>${d.cantidad} ${esc(d.unidad || '')}</td><td>${esc(d.motivo)}</td><td>${esc(d.comentario || '')}</td></tr>`).join('')}
      </tbody></table></div>` : ''}` : '<div class="alerta" style="margin-top:10px">El chofer marcó llegada pero aún no cierra la entrega.</div>'}
    ` : '<div class="alerta" style="margin-top:12px">Aún sin aviso de llegada.</div>'}
    <div class="row" style="margin-top:16px"><button class="btn sec" id="bImp">Imprimir comprobante</button></div>`;
  $('.x', box).onclick = cerrarModal;
  $('#bImp', box).onclick = () => imprimirComprobante(box);
  if (e?.llegada_lat) {
    const m = nuevoMapa($('#mapD', box)); const pts = [[e.llegada_lat, e.llegada_lng]];
    L.marker([e.llegada_lat, e.llegada_lng], { icon: pin(lejos ? '#d64545' : '#1f9d55', '✓') }).bindPopup('Aviso de llegada').addTo(m);
    if (e.llegada_precision_m) L.circle([e.llegada_lat, e.llegada_lng], { radius: e.llegada_precision_m, weight: 1 }).addTo(m);
    if (g.dest_lat) { pts.push([g.dest_lat, g.dest_lng]); L.marker([g.dest_lat, g.dest_lng], { icon: pin('#8d99a6') }).bindPopup('Destino informado').addTo(m); }
    m.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
  }
}
function imprimirComprobante(box) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permite ventanas emergentes para imprimir', 'err');
  const html = box.cloneNode(true); $$('.x,#bImp,.map', html).forEach(n => n.remove());
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Comprobante de entrega</title><link rel="stylesheet" href="${new URL('styles.css', location.href)}"><style>body{background:#fff;padding:20px}</style></head><body><h1 style="color:#12355b;margin:0 0 10px">Grupo TX · Comprobante de entrega</h1>${html.innerHTML}<script>setTimeout(()=>print(),800)<\/script></body></html>`);
  w.document.close();
}

/* ---------- Historial de entregas ---------- */
async function tabEntregas(el) {
  S.fEnt = S.fEnt || { desde: sumarDias(hoy(), -7), hasta: hoy(), chofer: '', estado: '', texto: '' };
  const F = S.fEnt;
  el.innerHTML = `<div class="card"><div class="row">
    <div><label>Desde</label><input type="date" id="eD" value="${F.desde}"></div>
    <div><label>Hasta</label><input type="date" id="eH" value="${F.hasta}"></div>
    <div><label>Chofer</label><select id="eC"><option value="">Todos</option>${S.choferes.map(c => `<option value="${c.id}" ${c.id === F.chofer ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
    <div><label>Estado</label><select id="eE"><option value="">Todos</option>${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${k === F.estado ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="grow"><label>Buscar folio / cliente</label><input id="eT" value="${esc(F.texto)}"></div>
    <div style="align-self:flex-end"><button class="btn sec" id="eX">Exportar CSV</button></div>
  </div></div><div class="card"><div id="eTabla" class="tbl-wrap">Cargando…</div></div>`;
  const leer = () => { F.desde = $('#eD').value; F.hasta = $('#eH').value; F.chofer = $('#eC').value; F.estado = $('#eE').value; F.texto = $('#eT').value.trim(); };
  ['#eD', '#eH', '#eC', '#eE'].forEach(s => $(s).onchange = () => { leer(); cargar(); });
  let tt; $('#eT').oninput = () => { clearTimeout(tt); tt = setTimeout(() => { leer(); cargar(); }, 400); };
  let filas = [];
  async function cargar() {
    const fab = () => {
      let q = sb.from('ent_guias').select('*, ent_entregas(*), ent_devoluciones(id)').gte('fecha', F.desde).lte('fecha', F.hasta).order('fecha', { ascending: false }).order('orden');
      if (F.chofer) q = q.eq('chofer_id', F.chofer);
      if (F.estado) q = q.eq('estado', F.estado);
      if (F.texto) q = q.or(`folio.ilike.%${F.texto.replace(/[,()]/g, '')}%,cliente.ilike.%${F.texto.replace(/[,()]/g, '')}%`);
      return q;
    };
    try { filas = await traerTodo(fab); } catch (e) { return $('#eTabla') && ($('#eTabla').innerHTML = `<div class="alerta roja">${esc(errMsg(e))}</div>`); }
    if (!$('#eTabla')) return;
    if (!filas.length) return $('#eTabla').innerHTML = '<div class="muted">Sin resultados.</div>';
    $('#eTabla').innerHTML = `<div class="small muted" style="margin-bottom:6px">${filas.length} guías</div><table><thead><tr><th>Fecha</th><th>Folio</th><th>Cliente</th><th>Chofer</th><th>Patente</th><th>Llegada</th><th>Cierre</th><th>Dist. destino</th><th>Recibió</th><th>Estado</th></tr></thead><tbody>
      ${filas.map(g => { const e = Array.isArray(g.ent_entregas) ? g.ent_entregas[0] : g.ent_entregas; return `<tr class="click" data-id="${g.id}">
        <td>${fechaCL(g.fecha)}</td><td><b>${esc(g.folio)}</b></td><td>${esc(g.cliente)}</td><td>${esc(nombreUsuario(g.chofer_id))}</td>
        <td>${esc(e?.patente || '')}</td><td>${horaCL(e?.llegada_at)}</td><td>${horaCL(e?.cierre_at)}</td>
        <td>${e ? (e.distancia_destino_m > RADIO_ALERTA_M ? `<span style="color:var(--rojo)">${fmtM(e.distancia_destino_m)} ⚠</span>` : fmtM(e.distancia_destino_m)) : ''}</td>
        <td>${esc(e?.receptor_nombre || '')}</td><td>${badge(g.estado)}</td></tr>`; }).join('')}</tbody></table>`;
    $$('#eTabla tr.click').forEach(tr => tr.onclick = () => verEntrega(tr.dataset.id));
  }
  $('#eX').onclick = () => descargarCSV(`entregas_${F.desde}_${F.hasta}.csv`, filas.map(g => {
    const e = (Array.isArray(g.ent_entregas) ? g.ent_entregas[0] : g.ent_entregas) || {};
    return { fecha: g.fecha, folio: g.folio, cliente: g.cliente, obra: g.obra, direccion: g.direccion, comuna: g.comuna, chofer: nombreUsuario(g.chofer_id), patente: e.patente,
      estado: ESTADOS[g.estado], llegada: fechaHoraCL(e.llegada_at), llegada_lat: e.llegada_lat, llegada_lng: e.llegada_lng, distancia_destino_m: e.distancia_destino_m != null ? Math.round(e.distancia_destino_m) : '',
      cierre: fechaHoraCL(e.cierre_at), minutos_en_obra: e.cierre_at ? Math.round((new Date(e.cierre_at) - new Date(e.llegada_at)) / 60000) : '',
      receptor: e.receptor_nombre, receptor_rut: e.receptor_rut, receptor_cargo: e.receptor_cargo, n_devoluciones: g.ent_devoluciones?.length || 0, observacion: e.observacion };
  }));
  cargar();
}

/* ---------- Devoluciones ---------- */
async function tabDevoluciones(el) {
  S.fDev = S.fDev || { desde: sumarDias(hoy(), -30), hasta: hoy() };
  const F = S.fDev;
  el.innerHTML = `<div class="card"><div class="row">
    <div><label>Desde</label><input type="date" id="dD" value="${F.desde}"></div>
    <div><label>Hasta</label><input type="date" id="dH" value="${F.hasta}"></div>
    <div class="grow"></div><div style="align-self:flex-end"><button class="btn sec" id="dX">Exportar CSV</button></div>
  </div></div>
  <div class="grid2" style="gap:12px"><div class="card"><h3>Por motivo</h3><div id="dM"></div></div><div class="card"><h3>Por producto</h3><div id="dP"></div></div></div>
  <div class="card"><h3>Detalle</h3><div id="dT" class="tbl-wrap">Cargando…</div></div>`;
  let filas = [];
  const cargar = async () => {
    F.desde = $('#dD').value; F.hasta = $('#dH').value;
    try { filas = await traerTodo(() => sb.from('ent_devoluciones').select('*, ent_guias!inner(folio,fecha,cliente,obra,chofer_id), ent_entregas(patente,chofer_nombre)').gte('ent_guias.fecha', F.desde).lte('ent_guias.fecha', F.hasta).order('created_at', { ascending: false })); }
    catch (e) { return $('#dT') && ($('#dT').innerHTML = `<div class="alerta roja">${esc(errMsg(e))}</div>`); }
    if (!$('#dT')) return;
    const agrupar = (k) => { const m = {}; filas.forEach(d => { const key = k(d); m[key] = m[key] || { n: 0, c: 0, u: d.unidad }; m[key].n++; m[key].c += +d.cantidad; }); return Object.entries(m).sort((a, b) => b[1].n - a[1].n); };
    const tablaRes = (arr) => arr.length ? `<table><thead><tr><th></th><th class="right">Casos</th><th class="right">Cantidad</th></tr></thead><tbody>${arr.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="right">${v.n}</td><td class="right">${v.c.toLocaleString('es-CL')}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">—</div>';
    $('#dM').innerHTML = tablaRes(agrupar(d => d.motivo));
    $('#dP').innerHTML = tablaRes(agrupar(d => `${d.producto_codigo} ${d.producto_descripcion || ''}`));
    $('#dT').innerHTML = filas.length ? `<table><thead><tr><th>Fecha</th><th>Guía</th><th>Cliente</th><th>Chofer</th><th>Código</th><th>Producto</th><th>Cant.</th><th>Motivo</th><th>Comentario</th></tr></thead><tbody>
      ${filas.map(d => `<tr class="click" data-id="${d.guia_id}"><td>${fechaCL(d.ent_guias.fecha)}</td><td>${esc(d.ent_guias.folio)}</td><td>${esc(d.ent_guias.cliente)}</td><td>${esc(d.ent_entregas?.chofer_nombre || '')}</td>
        <td>${esc(d.producto_codigo)}</td><td>${esc(d.producto_descripcion)}</td><td>${d.cantidad} ${esc(d.unidad || '')}</td><td>${esc(d.motivo)}</td><td>${esc(d.comentario || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Sin devoluciones en el período.</div>';
    $$('#dT tr.click').forEach(tr => tr.onclick = () => verEntrega(tr.dataset.id));
  };
  $('#dD').onchange = $('#dH').onchange = cargar;
  $('#dX').onclick = () => descargarCSV(`devoluciones_${F.desde}_${F.hasta}.csv`, filas.map(d => ({ fecha: d.ent_guias.fecha, guia: d.ent_guias.folio, cliente: d.ent_guias.cliente, obra: d.ent_guias.obra, chofer: d.ent_entregas?.chofer_nombre, patente: d.ent_entregas?.patente, codigo: d.producto_codigo, producto: d.producto_descripcion, cantidad: d.cantidad, unidad: d.unidad, motivo: d.motivo, comentario: d.comentario })));
  cargar();
}

/* ---------- Usuarios ---------- */
async function tabUsuarios(el) {
  await cargarUsuarios();
  const esAdmin = S.perfil.rol === 'admin';
  const ROLES = { pendiente: 'Pendiente', chofer: 'Chofer', logistica: 'Logística', admin: 'Admin' };
  el.innerHTML = `<div class="card"><div class="row"><h3 class="grow" style="margin:0">Choferes y usuarios</h3><button class="btn" id="uNuevo">+ Crear chofer</button></div>
    <p class="small muted">Los choferes ingresan con su <b>RUT y clave</b>. El personal de Logística/Admin crea su cuenta con correo y ${esAdmin ? 'tú le asignas el rol aquí' : 'un administrador le asigna el rol'}.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Nombre</th><th>RUT</th><th>Teléfono</th><th>Acceso</th><th>Rol</th><th>Activo</th><th></th></tr></thead><tbody>
    ${S.usuarios.map(u => `<tr data-id="${u.id}">
      <td><b>${esc(u.nombre)}</b></td><td>${esc(u.rut || '')}</td><td>${esc(u.telefono || '')}</td>
      <td class="small">${u.email?.endsWith('@' + DOMINIO_CHOFER) ? 'RUT + clave' : esc(u.email || '')}</td>
      <td>${esAdmin && u.id !== S.perfil.id ? `<select data-rol>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === u.rol ? 'selected' : ''}>${v}</option>`).join('')}</select>` : ROLES[u.rol]}</td>
      <td>${esAdmin && u.id !== S.perfil.id ? `<input type="checkbox" data-act ${u.activo ? 'checked' : ''} style="width:auto">` : (u.activo ? 'Sí' : 'No')}</td>
      <td class="right" style="white-space:nowrap">${u.rol === 'chofer' || (esAdmin && u.email?.endsWith('@' + DOMINIO_CHOFER)) ? '<button class="btn sec sm" data-clave>Cambiar clave</button> ' : ''}${esAdmin && u.id !== S.perfil.id ? '<button class="btn sec sm" data-borrar title="Eliminar">🗑</button>' : ''}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  $$('[data-rol]', el).forEach(s => s.onchange = async () => { const { error } = await sb.from('ent_usuarios').update({ rol: s.value }).eq('id', s.closest('tr').dataset.id); toast(error ? errMsg(error) : 'Rol actualizado', error ? 'err' : 'ok'); });
  $$('[data-act]', el).forEach(c => c.onchange = async () => { const { error } = await sb.from('ent_usuarios').update({ activo: c.checked }).eq('id', c.closest('tr').dataset.id); toast(error ? errMsg(error) : 'Actualizado', error ? 'err' : 'ok'); });
  $$('[data-clave]', el).forEach(b => b.onclick = async () => {
    const p = prompt('Nueva clave para el chofer (mínimo 6 caracteres):'); if (!p) return;
    const r = await llamarFuncion({ accion: 'clave', id: b.closest('tr').dataset.id, password: p });
    toast(r.error || 'Clave actualizada', r.error ? 'err' : 'ok');
  });
  $$('[data-borrar]', el).forEach(b => b.onclick = async () => {
    const u = S.usuarios.find(x => x.id === b.closest('tr').dataset.id);
    if (!confirm(`¿Eliminar a ${u.nombre}? Solo es posible si no tiene entregas registradas (si tiene, desactívalo).`)) return;
    const esChofer = u.email?.endsWith('@' + DOMINIO_CHOFER);
    const borrarLogin = !esChofer && confirm('¿Eliminar también su cuenta de acceso? (Afecta otras apps TX que usen este mismo correo, como Control de Silos). Aceptar = sí, Cancelar = solo quitarlo de Entregas.');
    const r = await llamarFuncion({ accion: 'eliminar', id: u.id, borrar_login: borrarLogin });
    toast(r.error || 'Usuario eliminado', r.error ? 'err' : 'ok');
    if (!r.error) tabUsuarios(el);
  });
  $('#uNuevo').onclick = () => {
    const box = abrirModal(`<h2>Crear chofer</h2><form id="fc">
      <label>Nombre completo *</label><input name="nombre" required>
      <div class="grid2"><div><label>RUT *</label><input name="rut" required placeholder="12.345.678-9"></div><div><label>Teléfono</label><input name="telefono"></div></div>
      <label>Clave inicial * (mín. 6)</label><input name="password" required minlength="6" value="${Math.random().toString().slice(2, 8)}">
      <div style="height:12px"></div><button class="btn block">Crear chofer</button></form>
      <p class="small muted">Entrégale al chofer su RUT y esta clave. Ingresa en la pestaña “Soy chofer”.</p>`, { ancho: '460px' });
    $('#fc', box).onsubmit = async (ev) => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target));
      const r = await llamarFuncion({ accion: 'crear', ...d });
      if (r.error) return toast(r.error, 'err');
      alert(`Chofer creado.\n\nRUT: ${d.rut}\nClave: ${d.password}\n\nLink de la app: ${location.href.split('#')[0]}`);
      cerrarModal(); tabUsuarios(el);
    };
  };
}
async function llamarFuncion(body) {
  try {
    const { data, error } = await sb.functions.invoke('ent-choferes', { body });
    if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} return { error: m }; }
    return data;
  } catch (e) { return { error: errMsg(e) }; }
}

/* ---------- Catálogos ---------- */
async function tabCatalogos(el) {
  await cargarCatalogos();
  el.innerHTML = `
  <div class="card"><div class="row"><h3 class="grow" style="margin:0">Productos (para devoluciones)</h3><button class="btn sm" id="cP">+ Producto</button><button class="btn sec sm" id="cPP">Pegar desde Excel</button></div>
    <p class="small muted">Lista de ejemplo: reemplázala por los códigos reales (Código · Descripción · Unidad).</p>
    <div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Descripción</th><th>Unidad</th><th>Activo</th></tr></thead><tbody>
    ${S.productos.map(p => `<tr class="click" data-p="${esc(p.codigo)}"><td>${esc(p.codigo)}</td><td>${esc(p.descripcion)}</td><td>${esc(p.unidad)}</td><td>${p.activo ? 'Sí' : 'No'}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="grid2" style="gap:12px">
    <div class="card"><div class="row"><h3 class="grow" style="margin:0">Motivos de devolución</h3><button class="btn sm" id="cM">+ Motivo</button></div>
      <table><tbody>${S.motivos.map(m => `<tr class="click" data-m="${m.id}"><td>${esc(m.motivo)}</td><td class="right">${m.activo ? '' : '<span class="muted">inactivo</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="card"><div class="row"><h3 class="grow" style="margin:0">Vehículos</h3><button class="btn sm" id="cV">+ Vehículo</button></div>
      <p class="small muted">Opcional: sugiere patentes al chofer. El ID GPSur servirá para unir el trayecto del GPS del camión.</p>
      <table><thead><tr><th>Patente</th><th>Descripción</th><th>ID GPSur</th></tr></thead><tbody>${S.vehiculos.map(v => `<tr class="click" data-v="${esc(v.patente)}"><td><b>${esc(v.patente)}</b></td><td>${esc(v.descripcion || '')}</td><td>${esc(v.gpsur_id || '')}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
  const recargar = () => tabCatalogos(el);
  const formProd = (p) => {
    const n = !p; p = p || { activo: true, unidad: 'SACO' };
    const box = abrirModal(`<h2>${n ? 'Nuevo producto' : 'Editar producto'}</h2><form id="fp">
      <label>Código *</label><input name="codigo" required value="${esc(p.codigo || '')}" ${n ? '' : 'readonly'}>
      <label>Descripción *</label><input name="descripcion" required value="${esc(p.descripcion || '')}">
      <label>Unidad</label><input name="unidad" value="${esc(p.unidad)}">
      <label style="display:flex;gap:6px;align-items:center;color:var(--txt)"><input type="checkbox" name="activo" style="width:auto" ${p.activo ? 'checked' : ''}> Activo</label>
      <div style="height:10px"></div><button class="btn">Guardar</button></form>`, { ancho: '460px' });
    $('#fp', box).onsubmit = async (ev) => { ev.preventDefault(); const f = ev.target;
      const d = { codigo: f.codigo.value.trim(), descripcion: f.descripcion.value.trim(), unidad: f.unidad.value.trim() || 'UN', activo: f.activo.checked };
      const { error } = n ? await sb.from('ent_productos').insert(d) : await sb.from('ent_productos').update(d).eq('codigo', p.codigo);
      if (error) return toast(errMsg(error), 'err'); cerrarModal(); recargar(); };
  };
  $('#cP').onclick = () => formProd(null);
  $$('[data-p]', el).forEach(tr => tr.onclick = () => formProd(S.productos.find(p => p.codigo === tr.dataset.p)));
  $('#cPP').onclick = () => {
    const box = abrirModal(`<h2>Pegar productos</h2><p class="small muted">Columnas: Código · Descripción · Unidad. Si el código existe, se actualiza.</p>
      <textarea id="tp" style="min-height:200px;font-family:monospace;font-size:13px"></textarea><div style="height:10px"></div><button class="btn" id="bp">Cargar</button>`);
    $('#bp', box).onclick = async () => {
      const regs = $('#tp', box).value.split(/\r?\n/).map(l => l.split('\t').map(s => s.trim())).filter(c => c[0] && c[1] && !/^c[oó]digo$/i.test(c[0]))
        .map(c => ({ codigo: c[0], descripcion: c[1], unidad: c[2] || 'UN', activo: true }));
      if (!regs.length) return toast('Sin filas válidas', 'err');
      const { error } = await sb.from('ent_productos').upsert(regs, { onConflict: 'codigo' });
      if (error) return toast(errMsg(error), 'err'); toast(`${regs.length} productos cargados`, 'ok'); cerrarModal(); recargar();
    };
  };
  const formMot = (m) => {
    const n = !m; m = m || { activo: true };
    const box = abrirModal(`<h2>${n ? 'Nuevo motivo' : 'Editar motivo'}</h2><form id="fm"><label>Motivo *</label><input name="motivo" required value="${esc(m.motivo || '')}">
      <label style="display:flex;gap:6px;align-items:center;color:var(--txt)"><input type="checkbox" name="activo" style="width:auto" ${m.activo ? 'checked' : ''}> Activo</label>
      <div style="height:10px"></div><button class="btn">Guardar</button></form>`, { ancho: '420px' });
    $('#fm', box).onsubmit = async (ev) => { ev.preventDefault(); const d = { motivo: ev.target.motivo.value.trim(), activo: ev.target.activo.checked };
      const { error } = n ? await sb.from('ent_motivos').insert(d) : await sb.from('ent_motivos').update(d).eq('id', m.id);
      if (error) return toast(errMsg(error), 'err'); cerrarModal(); recargar(); };
  };
  $('#cM').onclick = () => formMot(null);
  $$('[data-m]', el).forEach(tr => tr.onclick = () => formMot(S.motivos.find(m => m.id === +tr.dataset.m)));
  const formVeh = (v) => {
    const n = !v; v = v || { activo: true };
    const box = abrirModal(`<h2>${n ? 'Nuevo vehículo' : 'Editar vehículo'}</h2><form id="fv">
      <label>Patente *</label><input name="patente" required value="${esc(v.patente || '')}" ${n ? '' : 'readonly'} style="text-transform:uppercase">
      <label>Descripción</label><input name="descripcion" value="${esc(v.descripcion || '')}" placeholder="Camión rampla, 3/4…">
      <label>ID en GPSur</label><input name="gpsur_id" value="${esc(v.gpsur_id || '')}">
      <label style="display:flex;gap:6px;align-items:center;color:var(--txt)"><input type="checkbox" name="activo" style="width:auto" ${v.activo ? 'checked' : ''}> Activo</label>
      <div style="height:10px"></div><button class="btn">Guardar</button></form>`, { ancho: '420px' });
    $('#fv', box).onsubmit = async (ev) => { ev.preventDefault(); const f = ev.target;
      const d = { patente: f.patente.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), descripcion: f.descripcion.value.trim() || null, gpsur_id: f.gpsur_id.value.trim() || null, activo: f.activo.checked };
      const { error } = n ? await sb.from('ent_vehiculos').insert(d) : await sb.from('ent_vehiculos').update(d).eq('patente', v.patente);
      if (error) return toast(errMsg(error), 'err'); cerrarModal(); recargar(); };
  };
  $('#cV').onclick = () => formVeh(null);
  $$('[data-v]', el).forEach(tr => tr.onclick = () => formVeh(S.vehiculos.find(v => v.patente === tr.dataset.v)));
}

/* ---------- arranque ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
iniciar();
