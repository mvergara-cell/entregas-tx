/* ================== Entregas TX · Logística / Admin ================== */
async function cargarUsuarios() {
  const { data } = await sb.from('ent_usuarios').select('*').order('nombre');
  S.usuarios = data || [];
  S.choferes = S.usuarios.filter(u => ['chofer', 'admin'].includes(u.rol) && u.activo);
}
const nombreUsuario = (id) => S.usuarios.find(u => u.id === id)?.nombre || '—';
const colorChofer = (id) => COLORES[Math.max(0, S.choferes.findIndex(c => c.id === id)) % COLORES.length];
const optsChoferes = (sel, vacio = '— Sin asignar —') => `<option value="">${vacio}</option>` + S.choferes.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nombre)}${c.rol === 'admin' ? ' (admin)' : ''}</option>`).join('');

async function iniciarStaff() {
  await cargarUsuarios();
  VIEWS = [
    { id: 'inicio', label: 'Inicio', icon: I.home, title: 'Resumen del día', bottom: true, bo: 1, render: vistaInicio },
    { id: 'mapa', label: 'Mapa', icon: I.map, title: 'Seguimiento de camiones', bottom: true, bo: 2, render: vistaMapa },
    { id: 'guias', label: 'Guías', icon: I.doc, title: 'Asignación de guías', bottom: true, bo: 4, render: vistaGuias },
    { id: 'entregas', label: 'Entregas', icon: I.box, title: 'Registro de entregas', bottom: true, bo: 5, render: vistaEntregas },
    { id: 'devoluciones', label: 'Devoluc.', icon: I.ret, title: 'Devoluciones', render: vistaDevoluciones },
    { id: 'usuarios', label: 'Usuarios', icon: I.users, title: 'Choferes y usuarios', render: vistaUsuarios },
    { id: 'catalogos', label: 'Catálogos', icon: I.tag, title: 'Catálogos', render: vistaCatalogos },
    { id: '_nueva', act: 'nueva-guia', label: 'Nueva guía', icon: I.plus, bottom: true, bo: 3 },
  ];
  montarShell('staff');
}

/* ---------- Inicio ---------- */
async function vistaInicio(el) {
  $('#top-actions').innerHTML = `<button class="btn primary" data-act="nueva-guia">${I.plus}<span>Nueva guía</span></button>`;
  const f = hoy();
  const [rg, rd] = await Promise.all([
    sb.from('ent_guias').select('*, ent_entregas(*)').eq('fecha', f).neq('estado', 'anulada').order('orden'),
    sb.from('ent_devoluciones').select('*, ent_guias!inner(folio,fecha,cliente)').eq('ent_guias.fecha', f),
  ]);
  if (rg.error) { el.innerHTML = `<div class="ctx err">${esc(errMsg(rg.error))}</div>`; return; }
  const G = rg.data, D = rd.data || [];
  const n = (e) => G.filter(g => g.estado === e).length;
  const tot = G.length || 1;
  const cerradas = G.filter(g => ['entregada', 'entregada_con_devolucion', 'rechazada'].includes(g.estado));
  const lejos = G.filter(g => (entregaDe(g)?.distancia_destino_m ?? 0) > RADIO_ALERTA_M);
  const tiempos = cerradas.map(g => minutos(entregaDe(g)?.llegada_at, entregaDe(g)?.cierre_at)).filter(x => x != null);
  const promObra = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null;
  const esperando = G.filter(g => g.estado === 'en_destino' && minutos(entregaDe(g)?.llegada_at, new Date().toISOString()) > 45);
  const sinChofer = G.filter(g => !g.chofer_id);
  const choferIds = [...new Set(G.map(g => g.chofer_id).filter(Boolean))];

  if (!G.length) {
    el.innerHTML = `<div class="hero"><div><span class="eyebrow" style="color:var(--brand)">${fechaLarga(f)}</span><h2 style="margin:6px 0 8px;font-size:28px;font-weight:800;letter-spacing:-.02em">Aún no hay guías asignadas hoy</h2>
      <p style="opacity:.8;max-width:52ch;margin:0">Asigna las guías de despacho a cada chofer con su dirección de entrega. Ellos marcan la llegada, sacan fotos, registran quién recibe, la firma y las devoluciones.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><button class="btn primary" data-act="nueva-guia">${I.plus}Nueva guía</button><button class="btn" data-act="go" data-to="guias" style="background:transparent;color:inherit;border-color:color-mix(in srgb,var(--bg) 30%,transparent)">Pegar guías desde Excel</button></div></div>
      <div class="fleet" style="align-items:center;justify-content:center;flex-direction:row;gap:18px;color:var(--bg)">${[60, 84, 60].map(w => `<span style="width:${w}px;opacity:.85">${I.truck}</span>`).join('')}</div></div>
      <div class="card"><div class="empty"><b>Así funciona</b>1. Crea los choferes en <b>Usuarios</b> (ingresan con RUT y clave). 2. Asigna guías en <b>Guías</b>. 3. Sigue los camiones en <b>Mapa</b>. 4. Revisa fotos, firmas y devoluciones en <b>Entregas</b>.</div></div>`;
    return;
  }

  const alertas = [
    ...lejos.map(g => ({ c: 'bad', i: I.pin, t: `Guía ${g.folio}: aviso de llegada a ${fmtM(entregaDe(g).distancia_destino_m)} del destino`, s: `${esc(g.cliente)} · ${esc(entregaDe(g).chofer_nombre || '')}`, id: g.id })),
    ...G.filter(g => g.estado === 'rechazada').map(g => ({ c: 'bad', i: I.ban, t: `Guía ${g.folio} rechazada`, s: `${esc(g.cliente)} · ${esc(nombreUsuario(g.chofer_id))}`, id: g.id })),
    ...G.filter(g => g.estado === 'entregada_con_devolucion').map(g => ({ c: 'info', i: I.ret, t: `Guía ${g.folio} con devolución`, s: D.filter(d => d.guia_id === g.id).map(d => `${d.cantidad} ${d.unidad || ''} ${d.producto_codigo} (${d.motivo})`).join(' · ') || esc(g.cliente), id: g.id })),
    ...esperando.map(g => ({ c: 'warn', i: I.clock, t: `Guía ${g.folio}: ${minutos(entregaDe(g).llegada_at, new Date().toISOString())} min en obra sin cerrar`, s: `${esc(g.cliente)} · ${esc(nombreUsuario(g.chofer_id))}`, id: g.id })),
    ...sinChofer.map(g => ({ c: 'warn', i: I.users, t: `Guía ${g.folio} sin chofer asignado`, s: esc(g.cliente), id: g.id, editar: true })),
  ];

  el.innerHTML = `
  <div class="hero">
    <div>
      <span class="eyebrow" style="color:color-mix(in srgb,var(--bg) 70%,transparent)">Despachos · ${fechaLarga(f)}</span>
      <div class="big" style="margin-top:12px">
        <div class="red"><b>${n('asignada') + n('en_destino')}</b><span>Por entregar</span></div>
        <div><b>${cerradas.length}</b><span>Cerradas</span></div>
        <div style="opacity:.75"><b>${G.length}</b><span>Guías hoy</span></div>
      </div>
      <div class="ratio">${['entregada', 'entregada_con_devolucion', 'rechazada', 'en_destino'].map(e => `<i style="width:${n(e) / tot * 100}%;background:${EST_COLOR[e]}"></i>`).join('')}</div>
      <div class="legend"><span style="--c:var(--ok)">Entregadas ${n('entregada')}</span><span style="--c:var(--info)">Con devolución ${n('entregada_con_devolucion')}</span><span style="--c:var(--bad)">Rechazadas ${n('rechazada')}</span><span style="--c:var(--warn)">En destino ${n('en_destino')}</span><span style="--c:color-mix(in srgb,var(--bg) 25%,transparent)">Pendientes ${n('asignada')}</span></div>
    </div>
    <div class="fleet">
      <div class="fleet-row"><span class="lbl">Avance por chofer</span></div>
      ${choferIds.map(id => { const gs = G.filter(g => g.chofer_id === id), h = gs.filter(g => !['asignada', 'en_destino'].includes(g.estado)).length; const pat = gs.map(entregaDe).find(e => e?.patente)?.patente;
        return `<button class="fs" data-act="go" data-to="mapa" style="flex-direction:row;justify-content:space-between;width:100%;gap:10px;padding:6px 8px;align-items:center"><span style="font:600 13px var(--f-ui);opacity:1;text-align:left">${esc(nombreUsuario(id))}${pat ? ` <span class="mono" style="opacity:.6">${esc(pat)}</span>` : ''}</span><span style="flex:1;max-width:160px;height:6px;border-radius:99px;background:color-mix(in srgb,var(--bg) 18%,transparent);overflow:hidden"><i style="display:block;height:100%;width:${h / gs.length * 100}%;background:var(--brand)"></i></span><span class="mono" style="font-size:12px;opacity:.85">${h}/${gs.length}</span></button>`; }).join('')}
    </div>
  </div>
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Guías hoy</span><b>${G.length}</b><small>${choferIds.length} choferes</small></div>
    <div class="kpi"><span class="eyebrow">Entregadas</span><b>${n('entregada')}</b><small>conformes</small></div>
    <div class="kpi"><span class="eyebrow">Con devolución</span><b>${n('entregada_con_devolucion')}</b><small>${D.length} productos</small></div>
    <div class="kpi ${n('rechazada') ? 'alert' : ''}"><span class="eyebrow">Rechazadas</span><b>${n('rechazada')}</b><small>rechazo total</small></div>
    <div class="kpi ${lejos.length ? 'alert' : ''}"><span class="eyebrow">Lejos del destino</span><b>${lejos.length}</b><small>&gt; ${RADIO_ALERTA_M} m</small></div>
    <div class="kpi"><span class="eyebrow">Tiempo en obra</span><b>${promObra != null ? promObra + ' min' : '—'}</b><small>promedio</small></div>
  </div>
  <div class="grid g2">
    <div><div class="sec-h"><div><h2>Requiere atención</h2><p>Alertas del día</p></div></div>
      <div class="card">${alertas.length ? `<ul class="alerts">${alertas.map(a => `<li data-gid="${a.id}" ${a.editar ? 'data-edit="1"' : ''}><span class="ic" style="background:var(--${a.c}-soft);color:var(--${a.c})">${a.i}</span><span class="tx"><b>${esc(a.t)}</b><span class="sub">${a.s}</span></span></li>`).join('')}</ul>` : '<div class="empty"><b>Todo en orden</b>No hay alertas por ahora.</div>'}</div></div>
    <div><div class="sec-h"><div><h2>Últimas entregas</h2><p>Cierres registrados hoy</p></div><button class="btn sm" data-act="go" data-to="entregas">Ver todas</button></div>
      <div class="card">${cerradas.length ? `<ul class="list">${cerradas.sort((a, b) => (entregaDe(b).cierre_at || '').localeCompare(entregaDe(a).cierre_at || '')).slice(0, 8).map(g => { const e = entregaDe(g); return `<li class="click" data-gid="${g.id}"><span class="sw" style="background:${colorChofer(g.chofer_id)}"></span><span class="tx"><b><span class="mono">${esc(g.folio)}</span> · ${esc(g.cliente)}</b><span class="sub">${horaCL(e.cierre_at)} · ${esc(e.chofer_nombre || '')} · recibió ${esc(e.receptor_nombre || '')}</span></span>${badge(g.estado)}</li>`; }).join('')}</ul>` : '<div class="empty"><b>Sin cierres aún</b>Las entregas aparecerán aquí cuando los choferes las registren.</div>'}</div></div>
  </div>`;
  $$('[data-gid]', el).forEach(li => li.onclick = () => li.dataset.edit ? editarGuia(G.find(g => g.id === li.dataset.gid), () => go('inicio')) : verEntrega(li.dataset.gid));
  S.timer = setInterval(() => { if (S.view === 'inicio' && document.visibilityState === 'visible' && $('#sheet-bg').hidden) go('inicio'); }, 120000);
}

/* ---------- Asignar guías ---------- */
async function vistaGuias(el) {
  S.fGuias = S.fGuias || { fecha: hoy(), chofer: '' };
  $('#top-actions').innerHTML = `<button class="btn" id="gPegar">${I.doc}<span>Pegar desde Excel</span></button><button class="btn primary" data-act="nueva-guia">${I.plus}<span>Nueva guía</span></button>`;
  el.innerHTML = `
  <div class="filters">
    ${fld('Fecha', `<input type="date" id="gF" value="${S.fGuias.fecha}">`)}
    <div class="grow">${fld('Chofer', `<select id="gC">${optsChoferes(S.fGuias.chofer, 'Todos los choferes')}</select>`)}</div>
    <button class="btn" id="gGeo" title="Ubicar en el mapa las guías sin coordenadas">${I.pin}<span>Geolocalizar</span></button>
  </div>
  <div class="card tbl-wrap" id="gTabla"><div class="empty"><b>Cargando…</b></div></div>`;
  const recargar = () => go('guias');
  $('#gF').onchange = e => { S.fGuias.fecha = e.target.value; cargar(); };
  $('#gC').onchange = e => { S.fGuias.chofer = e.target.value; cargar(); };
  $('#gPegar').onclick = () => pegarGuias(recargar);
  $('#gGeo').onclick = () => geolocalizarPendientes(S.guiasDia || [], cargar);
  async function cargar() {
    let q = sb.from('ent_guias').select('*').eq('fecha', S.fGuias.fecha).order('chofer_id').order('orden').order('created_at');
    if (S.fGuias.chofer) q = q.eq('chofer_id', S.fGuias.chofer);
    const { data, error } = await q;
    const t = $('#gTabla'); if (!t) return;
    if (error) return t.innerHTML = `<div class="ctx err">${esc(errMsg(error))}</div>`;
    S.guiasDia = data;
    if (!data.length) return t.innerHTML = `<div class="empty"><b>Sin guías para el ${fechaCL(S.fGuias.fecha)}</b>Crea una guía o pégalas desde Excel.<br><button class="btn primary" data-act="nueva-guia">${I.plus}Nueva guía</button></div>`;
    t.innerHTML = `<table><thead><tr><th>#</th><th>Folio</th><th>Chofer</th><th>Cliente / obra</th><th>Dirección</th><th>Mapa</th><th>Estado</th></tr></thead><tbody>
      ${data.map(g => `<tr class="click" data-id="${g.id}">
        <td class="num">${g.orden || ''}</td><td class="num"><b>${esc(g.folio)}</b></td>
        <td>${g.chofer_id ? `<span class="swatch" style="--c:${colorChofer(g.chofer_id)};color:var(--ink)">${esc(nombreUsuario(g.chofer_id))}</span>` : '<span class="chip warn">Sin asignar</span>'}</td>
        <td>${esc(g.cliente)}<div class="sub">${esc(g.obra || '')}</div></td>
        <td>${esc(g.direccion)}<div class="sub">${esc(g.comuna || '')}</div></td>
        <td>${g.dest_lat ? `<span class="chip ok plain">${I.check.replace('<svg', '<svg style="width:12px;height:12px"')}</span>` : '<span class="sub">—</span>'}</td>
        <td>${badge(g.estado)}</td></tr>`).join('')}</tbody></table>`;
    $$('tr.click', t).forEach(tr => tr.onclick = () => { const g = data.find(x => x.id === tr.dataset.id); ['asignada', 'anulada'].includes(g.estado) ? editarGuia(g, cargar) : verEntrega(g.id); });
  }
  cargar();
}

function editarGuia(g, alGuardar) {
  const n = !g; g = g || { fecha: S.fGuias?.fecha || hoy(), orden: (S.guiasDia?.length || 0) + 1 };
  const sh = openSheet(n ? 'Nueva guía' : `Guía ${esc(g.folio)}`, `
  <form id="fg" class="form">
    <fieldset><legend>Guía de despacho</legend>
      <div class="fg3">${fld('N° de guía', `<input name="folio" required value="${esc(g.folio || '')}" inputmode="numeric">`, 1)}${fld('Fecha', `<input name="fecha" type="date" required value="${esc(g.fecha)}">`, 1)}${fld('Orden de visita', `<input name="orden" type="number" min="0" value="${esc(g.orden ?? 0)}">`)}</div>
      ${fld('Chofer / transportista', `<select name="chofer_id" required>${optsChoferes(g.chofer_id)}</select>`, 1)}
      ${fld('Detalle de carga', `<textarea name="detalle" placeholder="Ej: 120 sacos Pega Bloque, 40 sacos Estuco">${esc(g.detalle || '')}</textarea>`)}
    </fieldset>
    <fieldset><legend>Cliente y destino</legend>
      <div class="fg">${fld('Cliente', `<input name="cliente" required value="${esc(g.cliente || '')}">`, 1)}${fld('Obra', `<input name="obra" value="${esc(g.obra || '')}">`)}</div>
      <div class="fg">${fld('Dirección de entrega', `<input name="direccion" required value="${esc(g.direccion || '')}">`, 1)}${fld('Comuna', `<input name="comuna" value="${esc(g.comuna || '')}">`)}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn sm" id="bBuscar">${I.pin}Buscar dirección en el mapa</button><span class="sub">o toca el mapa para fijar el punto exacto</span></div>
      <div class="picker" id="mapG"></div>
      <input type="hidden" name="dest_lat" value="${g.dest_lat ?? ''}"><input type="hidden" name="dest_lng" value="${g.dest_lng ?? ''}">
      <div class="fg">${fld('Contacto en obra', `<input name="contacto" value="${esc(g.contacto || '')}">`)}${fld('Teléfono contacto', `<input name="telefono" type="tel" value="${esc(g.telefono || '')}">`)}</div>
      ${fld('Observación para el chofer', `<input name="observacion" value="${esc(g.observacion || '')}">`)}
    </fieldset>
    <div class="actions">
      ${!n ? '<button type="button" class="btn danger" id="bBorrar">Eliminar</button>' : ''}
      ${!n && g.estado === 'asignada' ? '<button type="button" class="btn" id="bAnular">Anular</button>' : ''}
      ${!n && g.estado === 'anulada' ? '<button type="button" class="btn" id="bReact">Reactivar</button>' : ''}
      <button class="btn primary">${n ? 'Crear guía' : 'Guardar cambios'}</button>
    </div>
  </form>`, { eyebrow: n ? 'Asignar' : 'Editar' });
  const f = $('#fg', sh);
  const mapa = nuevoMapa($('#mapG', sh), { mini: false }); let mk = null;
  S.sheetCleanup = () => { try { mapa?.remove(); } catch {} };
  const fijar = (lat, lng, centrar) => {
    f.dest_lat.value = lat; f.dest_lng.value = lng;
    if (mk) mk.setLatLng([lat, lng]); else mk = L.marker([lat, lng], { draggable: true, icon: pin('var(--brand)') }).addTo(mapa).on('dragend', e => { const p = e.target.getLatLng(); f.dest_lat.value = p.lat; f.dest_lng.value = p.lng; });
    if (centrar) mapa.setView([lat, lng], 16);
  };
  if (mapa) { if (g.dest_lat) fijar(g.dest_lat, g.dest_lng, true); mapa.on('click', e => fijar(e.latlng.lat, e.latlng.lng)); }
  $('#bBuscar', sh).onclick = async () => {
    try { const r = await geocodificar(f.direccion.value, f.comuna.value); if (!r) return toast('No se encontró la dirección; marca el punto en el mapa'); fijar(r.lat, r.lng, true); }
    catch { toast('Error al buscar la dirección'); }
  };
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    d.orden = +d.orden || 0; d.dest_lat = d.dest_lat ? +d.dest_lat : null; d.dest_lng = d.dest_lng ? +d.dest_lng : null;
    for (const k of ['obra', 'comuna', 'contacto', 'telefono', 'detalle', 'observacion']) d[k] = d[k]?.trim() || null;
    d.folio = d.folio.trim(); d.chofer_id = d.chofer_id || null;
    const { error } = n ? await sb.from('ent_guias').insert(d) : await sb.from('ent_guias').update(d).eq('id', g.id);
    if (error) return toast(errMsg(error));
    toast(n ? 'Guía creada' : 'Guía actualizada'); closeSheet(); alGuardar && alGuardar();
  };
  const cambiarEstado = async (estado) => { const { error } = await sb.from('ent_guias').update({ estado }).eq('id', g.id); if (error) return toast(errMsg(error)); closeSheet(); alGuardar && alGuardar(); };
  if ($('#bAnular', sh)) $('#bAnular', sh).onclick = () => confirm('¿Anular esta guía? El chofer dejará de verla.') && cambiarEstado('anulada');
  if ($('#bReact', sh)) $('#bReact', sh).onclick = () => cambiarEstado('asignada');
  if ($('#bBorrar', sh)) $('#bBorrar', sh).onclick = async () => {
    if (!confirm('¿Eliminar definitivamente esta guía?')) return;
    const { error } = await sb.from('ent_guias').delete().eq('id', g.id);
    if (error) return toast(errMsg(error)); closeSheet(); alGuardar && alGuardar();
  };
}

function pegarGuias(alGuardar) {
  const sh = openSheet('Pegar guías desde Excel', `
    <div class="form">
      <div class="ctx">Copia las filas desde Excel con estas columnas, en este orden (la fila de títulos es opcional): <b>Folio · Cliente · Obra · Dirección · Comuna · Contacto · Teléfono · Detalle</b></div>
      <fieldset><legend>Asignación</legend>
        <div class="fg">${fld('Fecha', `<input type="date" id="pF" value="${S.fGuias?.fecha || hoy()}">`, 1)}${fld('Chofer', `<select id="pC">${optsChoferes('')}</select>`)}</div>
        ${fld('Filas', '<textarea id="pT" style="min-height:200px;font-family:var(--f-mono);font-size:12.5px" placeholder="123456&#9;Constructora X&#9;Edificio Y&#9;Av. Siempre Viva 123&#9;Maipú"></textarea>', 1)}
        <label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="pGeo" style="width:auto" checked> Ubicar las direcciones en el mapa automáticamente</label>
        <div class="sub" id="pPrev"></div>
      </fieldset>
      <div class="actions"><button class="btn primary" id="pOk">Cargar guías</button></div>
    </div>`, { eyebrow: 'Carga masiva' });
  const parse = () => $('#pT', sh).value.split(/\r?\n/).map(l => l.split('\t').map(s => s.trim())).filter(c => c[0] && !/^folio$/i.test(c[0]));
  $('#pT', sh).oninput = () => { const r = parse(); $('#pPrev', sh).textContent = r.length ? `${r.length} guía(s) detectadas` : ''; };
  $('#pOk', sh).onclick = async () => {
    const filas = parse(); if (!filas.length) return toast('No hay filas para cargar');
    const chofer = $('#pC', sh).value || null, fecha = $('#pF', sh).value;
    const base = (S.guiasDia || []).filter(g => g.chofer_id === chofer).length;
    const regs = filas.map((c, i) => ({ folio: c[0], cliente: c[1] || '', obra: c[2] || null, direccion: c[3] || '', comuna: c[4] || null, contacto: c[5] || null, telefono: c[6] || null, detalle: c[7] || null, chofer_id: chofer, fecha, orden: base + i + 1 }));
    const btn = $('#pOk', sh); btn.disabled = true; btn.textContent = 'Cargando…';
    const { data, error } = await sb.from('ent_guias').insert(regs).select();
    if (error) { btn.disabled = false; btn.textContent = 'Cargar guías'; return toast(errMsg(error)); }
    toast(`${data.length} guías cargadas`);
    const geo = $('#pGeo', sh).checked; closeSheet();
    if (geo) await geolocalizarPendientes(data, alGuardar); else alGuardar && alGuardar();
  };
}

async function geolocalizarPendientes(guias, alTerminar) {
  const pend = guias.filter(g => !g.dest_lat && g.direccion);
  if (!pend.length) return toast('Todas las guías ya tienen ubicación');
  let ok = 0;
  for (let i = 0; i < pend.length; i++) {
    banner(`Ubicando direcciones en el mapa ${i + 1}/${pend.length}…`);
    try { const r = await geocodificar(pend[i].direccion, pend[i].comuna); if (r) { await sb.from('ent_guias').update({ dest_lat: r.lat, dest_lng: r.lng }).eq('id', pend[i].id); ok++; } } catch {}
    await new Promise(r => setTimeout(r, 1100)); // el servicio de mapas permite 1 consulta por segundo
  }
  banner('');
  toast(`${ok} de ${pend.length} direcciones ubicadas. Revisa las que falten desde la guía.`);
  alTerminar && alTerminar();
}

/* ---------- Seguimiento (mapa) ---------- */
async function vistaMapa(el) {
  S.fSeg = S.fSeg || { fecha: hoy(), chofer: '' };
  $('#top-actions').innerHTML = `<button class="btn" id="sR">${I.refresh}<span>Actualizar</span></button>`;
  el.innerHTML = `
  <div class="mapbar">
    <input type="date" id="sF" value="${S.fSeg.fecha}" style="width:auto">
    <select id="sC" style="width:auto;min-width:200px">${optsChoferes(S.fSeg.chofer, 'Todos los choferes')}</select>
    <span class="swatch" style="--c:var(--muted)">Destino</span><span class="swatch" style="--c:var(--ok)">Entregada</span><span class="swatch" style="--c:var(--info)">Con devolución</span><span class="swatch" style="--c:var(--bad)">Rechazo / lejos del destino</span><span class="swatch" style="--c:var(--warn)">En destino</span>
  </div>
  <div class="kpis k4" id="sK"></div>
  <div class="seg-wrap">
    <div class="card" style="max-height:calc(100vh - 300px);min-height:300px;overflow:auto" id="sL"></div>
    <div><div id="mapS" class="map full"></div>
      <div class="sub" style="margin-top:6px">La línea es el trayecto del celular del chofer (y de GPSur cuando esté conectado). 🚚 = última posición registrada.</div></div>
  </div>`;
  const mapa = nuevoMapa($('#mapS')); S.mapa = mapa;
  const capa = mapa ? L.layerGroup().addTo(mapa) : null;
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
    catch (e) { return toast(errMsg(e)); }
    if (!$('#sK') || !capa) return;
    capa.clearLayers();
    const bounds = [], porChofer = {};
    pos.forEach(p => { const k = p.chofer_id || 'pat:' + p.patente; (porChofer[k] = porChofer[k] || []).push(p); });
    Object.entries(porChofer).forEach(([k, arr]) => {
      const col = k.startsWith('pat:') ? '#5e6066' : colorChofer(k);
      const lls = arr.map(p => [p.lat, p.lng]); bounds.push(...lls);
      L.polyline(lls, { color: col, weight: 4, opacity: .85 }).addTo(capa);
      const u = arr[arr.length - 1];
      L.marker([u.lat, u.lng], { icon: pinCamion() }).bindPopup(`<b>${esc(k.startsWith('pat:') ? k.slice(4) : nombreUsuario(k))}</b><br>Patente <span class="mono">${esc(u.patente || '')}</span><br>Última señal ${horaCL(u.ts)}${u.velocidad_kmh != null ? ' · ' + u.velocidad_kmh + ' km/h' : ''}`).addTo(capa);
    });
    guias.forEach(g => {
      const e = entregaDe(g);
      if (g.dest_lat) { bounds.push([g.dest_lat, g.dest_lng]); L.marker([g.dest_lat, g.dest_lng], { icon: pin('#8d939a', g.orden || '') }).bindPopup(`<b>Destino guía ${esc(g.folio)}</b><br>${esc(g.cliente)}<br>${esc(g.direccion)}<br>${badge(g.estado)}`).addTo(capa); }
      if (e && e.llegada_lat) {
        const lejos = e.distancia_destino_m != null && e.distancia_destino_m > RADIO_ALERTA_M;
        const col = g.estado === 'rechazada' || lejos ? '#c4121f' : g.estado === 'entregada_con_devolucion' ? '#2459a8' : g.estado === 'entregada' ? '#18864a' : '#b86e00';
        bounds.push([e.llegada_lat, e.llegada_lng]);
        L.marker([e.llegada_lat, e.llegada_lng], { icon: pin(col, '✓') }).bindPopup(`<b>Llegada guía ${esc(g.folio)}</b><br>${esc(e.chofer_nombre)} · <span class="mono">${esc(e.patente)}</span><br>Llegó ${horaCL(e.llegada_at)}${e.cierre_at ? ' · cerró ' + horaCL(e.cierre_at) : ''}<br>A ${fmtM(e.distancia_destino_m)} del destino<br><a href="#" data-ver="${g.id}">Ver detalle</a>`).addTo(capa);
        if (g.dest_lat) L.polyline([[g.dest_lat, g.dest_lng], [e.llegada_lat, e.llegada_lng]], { color: col, dashArray: '4 6', weight: 2 }).addTo(capa);
      }
    });
    if (encuadrar && bounds.length) mapa.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    const cnt = (e) => guias.filter(g => g.estado === e).length;
    const lejos = guias.filter(g => entregaDe(g)?.distancia_destino_m > RADIO_ALERTA_M).length;
    $('#sK').innerHTML = [['Guías', guias.length, ''], ['Cerradas', cnt('entregada') + cnt('entregada_con_devolucion') + cnt('rechazada'), ''], ['En destino ahora', cnt('en_destino'), ''], ['Lejos del destino', lejos, lejos ? 'alert' : '']]
      .map(([l, v, c]) => `<div class="kpi ${c}"><span class="eyebrow">${l}</span><b>${v}</b></div>`).join('');
    const ids = [...new Set(guias.map(g => g.chofer_id).filter(Boolean).concat(Object.keys(porChofer).filter(k => !k.startsWith('pat:'))))];
    $('#sL').innerHTML = ids.length ? `<ul class="list">${ids.map(id => {
      const gs = guias.filter(g => g.chofer_id === id), h = gs.filter(g => !['asignada', 'en_destino'].includes(g.estado)).length, ult = (porChofer[id] || []).slice(-1)[0];
      return `<li class="click" data-c="${id}"><span class="sw" style="background:${colorChofer(id)}"></span><span class="tx"><b>${esc(nombreUsuario(id))}</b><span class="sub">${h}/${gs.length} guías · ${ult ? 'señal ' + horaCL(ult.ts) + ' · <span class="mono">' + esc(ult.patente || '') + '</span>' : 'sin señal GPS'}</span></span></li>
        ${gs.map(g => `<li class="click" data-ver="${g.id}" style="padding-left:38px"><span class="tx"><span class="sub"><span class="mono">${g.orden ? g.orden + '. ' : ''}${esc(g.folio)}</span> · ${esc(g.cliente)}</span></span>${badge(g.estado)}</li>`).join('')}`; }).join('')}</ul>`
      : '<div class="empty"><b>Sin actividad</b>No hay guías ni posiciones para esta fecha.</div>';
    $$('#sL [data-c]').forEach(d => d.onclick = () => { const arr = porChofer[d.dataset.c]; if (arr?.length) mapa.fitBounds(arr.map(p => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 16 }); });
    $$('#sL [data-ver]').forEach(d => d.onclick = () => verEntrega(d.dataset.ver));
  }
  $('#mapS').addEventListener('click', ev => { const a = ev.target.closest('[data-ver]'); if (a) { ev.preventDefault(); verEntrega(a.dataset.ver); } });
  await cargar(true);
  S.timer = setInterval(() => { if (S.view === 'mapa' && document.visibilityState === 'visible') cargar(false); }, 60000);
}

/* ---------- Detalle de una entrega ---------- */
async function verEntrega(guiaId) {
  const sh = openSheet('Cargando…', '<div class="card empty"><b>Cargando…</b></div>', { eyebrow: 'Entrega' });
  const { data: g, error } = await sb.from('ent_guias').select('*, ent_entregas(*), ent_devoluciones(*)').eq('id', guiaId).single();
  if (error) { sh.innerHTML += `<div class="ctx err">${esc(errMsg(error))}</div>`; return; }
  const e = entregaDe(g);
  const fotos = e ? await Promise.all((e.fotos || []).map(urlFirmada)) : [];
  const firma = e?.firma_path ? await urlFirmada(e.firma_path) : '';
  const lejos = e?.distancia_destino_m > RADIO_ALERTA_M;
  const enObra = minutos(e?.llegada_at, e?.cierre_at);
  const sh2 = openSheet(`Guía ${esc(g.folio)}`, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${badge(g.estado)}<span class="chip plain">${fechaCL(g.fecha)}</span>${e?.patente ? `<span class="chip dark plain mono">${esc(e.patente)}</span>` : ''}</div>
    <div class="facts">
      <div><small>Llegada</small><b>${e ? horaCL(e.llegada_at) : '—'}</b></div>
      <div><small>Cierre</small><b>${e?.cierre_at ? horaCL(e.cierre_at) : '—'}</b></div>
      <div><small>Al destino</small><b style="${lejos ? 'color:var(--bad)' : ''}">${e ? fmtM(e.distancia_destino_m) : '—'}</b></div>
      <div><small>En obra</small><b>${enObra != null ? enObra + ' min' : '—'}</b></div>
      <div><small>Fotos</small><b>${fotos.length}</b></div>
      <div><small>Devoluciones</small><b>${g.ent_devoluciones?.length || 0}</b></div>
    </div>
    <div class="block"><h3>Guía</h3><div class="card" style="padding:14px;display:grid;gap:4px">
      <b>${esc(g.cliente)}${g.obra ? ' · ' + esc(g.obra) : ''}</b>
      <span class="sub">${esc(g.direccion)}${g.comuna ? ', ' + esc(g.comuna) : ''}</span>
      <span class="sub">Chofer asignado: <b style="color:var(--ink)">${esc(nombreUsuario(g.chofer_id))}</b></span>
      ${g.detalle ? `<div class="sub" style="white-space:pre-wrap;margin-top:4px">${esc(g.detalle)}</div>` : ''}
    </div></div>
    ${e ? `
    <div class="block"><h3>Aviso de llegada</h3>
      ${lejos ? `<div class="ctx err" style="margin-bottom:10px">${I.alert}<span>El chofer marcó la llegada a ${fmtM(e.distancia_destino_m)} del destino informado.</span></div>` : ''}
      <div class="card" style="padding:14px;display:grid;gap:4px"><span>${esc(e.chofer_nombre)} · ${fechaHoraCL(e.llegada_at)}</span><span class="sub mono">${e.llegada_lat ? `${e.llegada_lat.toFixed(5)}, ${e.llegada_lng.toFixed(5)} (±${Math.round(e.llegada_precision_m || 0)} m)` : 'sin coordenadas'}</span></div>
      ${e.llegada_lat ? '<div id="mapD" class="map" style="height:260px;margin-top:10px"></div>' : ''}
    </div>
    ${e.cierre_at ? `
    <div class="block"><h3>Recepción</h3><div class="card" style="padding:14px;display:grid;gap:4px">
      <b>${esc(e.receptor_nombre)}</b><span class="sub">${[e.receptor_rut, e.receptor_cargo, e.receptor_telefono].filter(Boolean).map(esc).join(' · ')}</span>
      ${e.observacion ? `<span>${esc(e.observacion)}</span>` : ''}</div></div>
    <div class="block"><h3>Fotos de la mercadería</h3><div class="photos">${fotos.map(u => `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="foto"></a>`).join('') || '<span class="sub">—</span>'}</div></div>
    <div class="block"><h3>Firma</h3>${firma ? `<img class="firma-img" src="${firma}" alt="firma de ${esc(e.receptor_nombre)}">` : '—'}</div>
    ${g.ent_devoluciones?.length ? `<div class="block"><h3>Devoluciones</h3><div class="card tbl-wrap"><table><thead><tr><th>Código</th><th>Producto</th><th class="r">Cantidad</th><th>Motivo</th></tr></thead><tbody>
      ${g.ent_devoluciones.map(d => `<tr><td class="num">${esc(d.producto_codigo)}</td><td>${esc(d.producto_descripcion)}${d.comentario ? `<div class="sub">${esc(d.comentario)}</div>` : ''}</td><td class="r num">${d.cantidad} ${esc(d.unidad || '')}</td><td>${esc(d.motivo)}</td></tr>`).join('')}
      </tbody></table></div></div>` : ''}` : '<div class="banner">El chofer marcó la llegada pero aún no cierra la entrega.</div>'}
    ` : '<div class="banner">Aún sin aviso de llegada.</div>'}
    <div class="actions block">${['asignada', 'anulada'].includes(g.estado) ? '<button class="btn" id="bEdit">Editar guía</button>' : ''}<button class="btn" id="bImp">${I.doc}Imprimir comprobante</button></div>`, { eyebrow: 'Entrega' });
  if ($('#bEdit', sh2)) $('#bEdit', sh2).onclick = () => editarGuia(g, () => go(S.view));
  $('#bImp', sh2).onclick = () => imprimirComprobante(sh2, g);
  if (e?.llegada_lat) {
    const m = nuevoMapa($('#mapD', sh2), { mini: true }); if (!m) return;
    S.sheetCleanup = () => { try { m.remove(); } catch {} };
    const pts = [[e.llegada_lat, e.llegada_lng]];
    L.marker([e.llegada_lat, e.llegada_lng], { icon: pin(lejos ? '#c4121f' : '#18864a', '✓') }).bindTooltip('Aviso de llegada').addTo(m);
    if (e.llegada_precision_m) L.circle([e.llegada_lat, e.llegada_lng], { radius: e.llegada_precision_m, weight: 1 }).addTo(m);
    if (g.dest_lat) { pts.push([g.dest_lat, g.dest_lng]); L.marker([g.dest_lat, g.dest_lng], { icon: pin('#8d939a') }).bindTooltip('Destino informado').addTo(m); }
    m.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
  }
}
function imprimirComprobante(sh, g) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permite ventanas emergentes para imprimir');
  const c = sh.cloneNode(true); $$('.xbtn,.actions,.map', c).forEach(n => n.remove());
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Comprobante guía ${esc(g.folio)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;800&family=JetBrains+Mono:wght@500;700&display=swap"><link rel="stylesheet" href="${new URL('styles.css', location.href)}"><style>:root{color-scheme:light}body{background:#fff;padding:24px;max-width:760px;margin:0 auto}.sheet-h{position:static}</style></head><body data-theme="light"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="width:120px;color:#111">${$('#logo-tpl').innerHTML}</span><span class="eyebrow">Comprobante de entrega</span></div>${c.innerHTML}<script>setTimeout(()=>print(),900)<\/script></body></html>`);
  w.document.close();
}

/* ---------- Historial de entregas ---------- */
async function vistaEntregas(el) {
  S.fEnt = S.fEnt || { desde: sumarDias(hoy(), -7), hasta: hoy(), chofer: '', estado: '', texto: '' };
  const F = S.fEnt;
  $('#top-actions').innerHTML = `<button class="btn" id="eX">${I.download}<span>Exportar CSV</span></button>`;
  el.innerHTML = `<div class="filters">
    ${fld('Desde', `<input type="date" id="eD" value="${F.desde}">`)}${fld('Hasta', `<input type="date" id="eH" value="${F.hasta}">`)}
    ${fld('Chofer', `<select id="eC">${optsChoferes(F.chofer, 'Todos')}</select>`)}
    ${fld('Estado', `<select id="eE"><option value="">Todos</option>${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${k === F.estado ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
    <div class="grow">${fld('Buscar', `<input id="eT" value="${esc(F.texto)}" placeholder="Folio o cliente">`)}</div>
  </div><div class="card tbl-wrap" id="eTabla"><div class="empty"><b>Cargando…</b></div></div>`;
  const leer = () => { F.desde = $('#eD').value; F.hasta = $('#eH').value; F.chofer = $('#eC').value; F.estado = $('#eE').value; F.texto = $('#eT').value.trim(); };
  ['#eD', '#eH', '#eC', '#eE'].forEach(s => $(s).onchange = () => { leer(); cargar(); });
  let tt2; $('#eT').oninput = () => { clearTimeout(tt2); tt2 = setTimeout(() => { leer(); cargar(); }, 400); };
  let filas = [];
  async function cargar() {
    const fab = () => {
      let q = sb.from('ent_guias').select('*, ent_entregas(*), ent_devoluciones(id)').gte('fecha', F.desde).lte('fecha', F.hasta).order('fecha', { ascending: false }).order('orden');
      if (F.chofer) q = q.eq('chofer_id', F.chofer);
      if (F.estado) q = q.eq('estado', F.estado);
      if (F.texto) { const t = F.texto.replace(/[,()]/g, ''); q = q.or(`folio.ilike.%${t}%,cliente.ilike.%${t}%`); }
      return q;
    };
    const t = () => $('#eTabla');
    try { filas = await traerTodo(fab); } catch (e) { return t() && (t().innerHTML = `<div class="ctx err">${esc(errMsg(e))}</div>`); }
    if (!t()) return;
    if (!filas.length) return t().innerHTML = '<div class="empty"><b>Sin resultados</b>Ninguna guía coincide con el filtro.</div>';
    t().innerHTML = `<table><thead><tr><th>Fecha</th><th>Guía</th><th>Cliente</th><th>Chofer</th><th>Patente</th><th>Llegada</th><th>Cierre</th><th class="r">Al destino</th><th>Recibió</th><th>Estado</th></tr></thead><tbody>
      ${filas.map(g => { const e = entregaDe(g); return `<tr class="click" data-id="${g.id}">
        <td class="num">${fechaCL(g.fecha)}</td><td class="num"><b>${esc(g.folio)}</b></td><td>${esc(g.cliente)}</td><td>${esc(nombreUsuario(g.chofer_id))}</td>
        <td class="num">${esc(e?.patente || '')}</td><td class="num">${horaCL(e?.llegada_at)}</td><td class="num">${horaCL(e?.cierre_at)}</td>
        <td class="r num" style="${e?.distancia_destino_m > RADIO_ALERTA_M ? 'color:var(--bad);font-weight:700' : ''}">${e ? fmtM(e.distancia_destino_m) : ''}</td>
        <td>${esc(e?.receptor_nombre || '')}</td><td>${badge(g.estado)}</td></tr>`; }).join('')}</tbody></table>`;
    $$('tr.click', t()).forEach(tr => tr.onclick = () => verEntrega(tr.dataset.id));
  }
  $('#eX').onclick = () => descargarCSV(`entregas_${F.desde}_${F.hasta}.csv`, filas.map(g => {
    const e = entregaDe(g) || {};
    return { fecha: g.fecha, folio: g.folio, cliente: g.cliente, obra: g.obra, direccion: g.direccion, comuna: g.comuna, chofer: nombreUsuario(g.chofer_id), patente: e.patente,
      estado: ESTADOS[g.estado], llegada: fechaHoraCL(e.llegada_at), llegada_lat: e.llegada_lat, llegada_lng: e.llegada_lng, distancia_destino_m: e.distancia_destino_m != null ? Math.round(e.distancia_destino_m) : '',
      cierre: fechaHoraCL(e.cierre_at), minutos_en_obra: minutos(e.llegada_at, e.cierre_at) ?? '', receptor: e.receptor_nombre, receptor_rut: e.receptor_rut, receptor_cargo: e.receptor_cargo,
      n_devoluciones: g.ent_devoluciones?.length || 0, observacion: e.observacion };
  }));
  cargar();
}

/* ---------- Devoluciones ---------- */
async function vistaDevoluciones(el) {
  S.fDev = S.fDev || { desde: sumarDias(hoy(), -30), hasta: hoy() };
  const F = S.fDev;
  $('#top-actions').innerHTML = `<button class="btn" id="dX">${I.download}<span>Exportar CSV</span></button>`;
  el.innerHTML = `<div class="filters">${fld('Desde', `<input type="date" id="dD" value="${F.desde}">`)}${fld('Hasta', `<input type="date" id="dH" value="${F.hasta}">`)}</div>
  <div class="kpis k4" id="dK"></div>
  <div class="grid g2"><div class="card" style="padding:16px"><div class="sec-h"><div><h2>Por motivo</h2><p>Casos registrados</p></div></div><div id="dM"></div></div>
    <div class="card" style="padding:16px"><div class="sec-h"><div><h2>Por producto</h2><p>Casos registrados</p></div></div><div id="dP"></div></div></div>
  <div class="sec-h block"><div><h2>Detalle</h2></div></div><div class="card tbl-wrap" id="dT"><div class="empty"><b>Cargando…</b></div></div>`;
  let filas = [];
  const cargar = async () => {
    F.desde = $('#dD').value; F.hasta = $('#dH').value;
    try { filas = await traerTodo(() => sb.from('ent_devoluciones').select('*, ent_guias!inner(folio,fecha,cliente,obra,chofer_id,estado), ent_entregas(patente,chofer_nombre)').gte('ent_guias.fecha', F.desde).lte('ent_guias.fecha', F.hasta).order('created_at', { ascending: false })); }
    catch (e) { return $('#dT') && ($('#dT').innerHTML = `<div class="ctx err">${esc(errMsg(e))}</div>`); }
    if (!$('#dT')) return;
    const agrupar = (k) => { const m = {}; filas.forEach(d => { const key = k(d); m[key] = m[key] || { n: 0, c: 0 }; m[key].n++; m[key].c += +d.cantidad; }); return Object.entries(m).sort((a, b) => b[1].n - a[1].n); };
    const barras = (arr, dark) => { if (!arr.length) return '<div class="empty"><b>Sin datos</b></div>'; const mx = arr[0][1].n; return arr.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><span class="b"><i class="${dark ? 'k' : ''}" style="width:${v.n / mx * 100}%"></i></span><span class="mono">${v.n}</span></div>`).join(''); };
    const guias = new Set(filas.map(d => d.guia_id)).size;
    const rech = new Set(filas.filter(d => d.ent_guias.estado === 'rechazada').map(d => d.guia_id)).size;
    $('#dK').innerHTML = `<div class="kpi"><span class="eyebrow">Líneas devueltas</span><b>${filas.length}</b></div><div class="kpi"><span class="eyebrow">Guías afectadas</span><b>${guias}</b></div><div class="kpi ${rech ? 'alert' : ''}"><span class="eyebrow">Rechazos totales</span><b>${rech}</b></div><div class="kpi"><span class="eyebrow">Motivo principal</span><b style="font-size:15px;font-family:var(--f-ui)">${esc(agrupar(d => d.motivo)[0]?.[0] || '—')}</b></div>`;
    $('#dM').innerHTML = barras(agrupar(d => d.motivo));
    $('#dP').innerHTML = barras(agrupar(d => `${d.producto_codigo} · ${d.producto_descripcion || ''}`), true);
    $('#dT').innerHTML = filas.length ? `<table><thead><tr><th>Fecha</th><th>Guía</th><th>Cliente</th><th>Chofer</th><th>Código</th><th>Producto</th><th class="r">Cant.</th><th>Motivo</th></tr></thead><tbody>
      ${filas.map(d => `<tr class="click" data-id="${d.guia_id}"><td class="num">${fechaCL(d.ent_guias.fecha)}</td><td class="num">${esc(d.ent_guias.folio)}</td><td>${esc(d.ent_guias.cliente)}</td><td>${esc(d.ent_entregas?.chofer_nombre || '')}</td>
        <td class="num">${esc(d.producto_codigo)}</td><td>${esc(d.producto_descripcion)}${d.comentario ? `<div class="sub">${esc(d.comentario)}</div>` : ''}</td><td class="r num">${d.cantidad} ${esc(d.unidad || '')}</td><td>${esc(d.motivo)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty"><b>Sin devoluciones</b>No hay devoluciones en el período.</div>';
    $$('#dT tr.click').forEach(tr => tr.onclick = () => verEntrega(tr.dataset.id));
  };
  $('#dD').onchange = $('#dH').onchange = cargar;
  $('#dX').onclick = () => descargarCSV(`devoluciones_${F.desde}_${F.hasta}.csv`, filas.map(d => ({ fecha: d.ent_guias.fecha, guia: d.ent_guias.folio, cliente: d.ent_guias.cliente, obra: d.ent_guias.obra, chofer: d.ent_entregas?.chofer_nombre, patente: d.ent_entregas?.patente, codigo: d.producto_codigo, producto: d.producto_descripcion, cantidad: d.cantidad, unidad: d.unidad, motivo: d.motivo, comentario: d.comentario })));
  cargar();
}

/* ---------- Usuarios ---------- */
async function vistaUsuarios(el) {
  await cargarUsuarios();
  const esAdmin = S.perfil.rol === 'admin';
  $('#top-actions').innerHTML = `<button class="btn primary" id="uNuevo">${I.plus}<span>Crear chofer</span></button>`;
  el.innerHTML = `<div class="sec-h"><div><h2>Usuarios de Entregas TX</h2><p>Los choferes ingresan con su <b>RUT y clave</b>. El personal de Logística crea su cuenta con su correo y ${esAdmin ? 'tú le asignas' : 'un administrador le asigna'} el perfil.</p></div></div>
    <div class="card tbl-wrap"><table><thead><tr><th>Nombre</th><th>RUT</th><th>Teléfono</th><th>Acceso</th><th>Perfil</th><th>Activo</th><th></th></tr></thead><tbody>
    ${S.usuarios.map(u => `<tr data-id="${u.id}">
      <td><b>${esc(u.nombre)}</b></td><td class="num">${esc(u.rut || '')}</td><td class="num">${esc(u.telefono || '')}</td>
      <td class="sub">${u.email?.endsWith('@' + DOMINIO_CHOFER) ? 'RUT + clave' : esc(u.email || '')}</td>
      <td>${esAdmin && u.id !== S.perfil.id ? `<select data-rol style="width:auto">${Object.entries(ROL_CORTO).map(([k, v]) => `<option value="${k}" ${k === u.rol ? 'selected' : ''}>${v}</option>`).join('')}</select>` : `<span class="chip ${u.rol === 'pendiente' ? 'warn' : u.rol === 'admin' ? 'brand' : ''}">${ROL_CORTO[u.rol]}</span>`}</td>
      <td>${esAdmin && u.id !== S.perfil.id ? `<input type="checkbox" data-act2 ${u.activo ? 'checked' : ''} style="width:auto">` : (u.activo ? 'Sí' : 'No')}</td>
      <td class="r" style="white-space:nowrap">${u.rol === 'chofer' || (esAdmin && u.email?.endsWith('@' + DOMINIO_CHOFER)) ? '<button class="btn sm" data-clave>Cambiar clave</button> ' : ''}${esAdmin && u.id !== S.perfil.id ? '<button class="btn sm danger" data-borrar>Eliminar</button>' : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="grid g3 block">${[['Chofer', 'Ve solo sus guías. Marca llegada, fotos, receptor, firma y devoluciones.'], ['Logística', 'Asigna guías, sigue los camiones, revisa entregas y crea choferes.'], ['Admin', 'Todo lo anterior, más asignar perfiles y eliminar usuarios.']].map(([t, d]) => `<div class="card" style="padding:14px"><b>${t}</b><div class="sub">${d}</div></div>`).join('')}</div>`;
  $$('[data-rol]', el).forEach(s => s.onchange = async () => { const { error } = await sb.from('ent_usuarios').update({ rol: s.value }).eq('id', s.closest('tr').dataset.id); toast(error ? errMsg(error) : 'Perfil actualizado'); });
  $$('[data-act2]', el).forEach(c => c.onchange = async () => { const { error } = await sb.from('ent_usuarios').update({ activo: c.checked }).eq('id', c.closest('tr').dataset.id); toast(error ? errMsg(error) : 'Actualizado'); });
  $$('[data-clave]', el).forEach(b => b.onclick = async () => {
    const p = prompt('Nueva clave para el chofer (mínimo 6 caracteres):'); if (!p) return;
    const r = await llamarFuncion({ accion: 'clave', id: b.closest('tr').dataset.id, password: p });
    toast(r.error || 'Clave actualizada');
  });
  $$('[data-borrar]', el).forEach(b => b.onclick = async () => {
    const u = S.usuarios.find(x => x.id === b.closest('tr').dataset.id);
    if (!confirm(`¿Eliminar a ${u.nombre}? Solo es posible si no tiene entregas registradas (si tiene, desactívalo).`)) return;
    const esChofer = u.email?.endsWith('@' + DOMINIO_CHOFER);
    const borrarLogin = !esChofer && confirm('¿Eliminar también su cuenta de acceso? Afecta otras apps TX que usen el mismo correo, como Control de Silos. Aceptar = sí, Cancelar = solo quitarlo de Entregas.');
    const r = await llamarFuncion({ accion: 'eliminar', id: u.id, borrar_login: borrarLogin });
    toast(r.error || 'Usuario eliminado'); if (!r.error) go('usuarios');
  });
  $('#uNuevo').onclick = () => {
    const sh = openSheet('Crear chofer', `<form id="fc" class="form"><fieldset><legend>Datos del chofer</legend>
      ${fld('Nombre completo', '<input name="nombre" required>', 1)}
      <div class="fg">${fld('RUT', '<input name="rut" required placeholder="12.345.678-9">', 1)}${fld('Teléfono', '<input name="telefono" type="tel">')}</div>
      ${fld('Clave inicial (mín. 6)', `<input name="password" required minlength="6" value="${Math.random().toString().slice(2, 8)}" class="mono">`, 1)}
      <div class="ctx">Entrégale al chofer el link de la app, su RUT y esta clave. Ingresa en la pestaña “Soy chofer”.</div></fieldset>
      <div class="actions"><button class="btn primary">Crear chofer</button></div></form>`, { eyebrow: 'Usuarios' });
    $('#fc', sh).onsubmit = async (ev) => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target));
      const r = await llamarFuncion({ accion: 'crear', ...d });
      if (r.error) return toast(r.error);
      alert(`Chofer creado.\n\nRUT: ${d.rut}\nClave: ${d.password}\n\nLink de la app: ${location.href.split('#')[0]}`);
      closeSheet(); go('usuarios');
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
async function vistaCatalogos(el) {
  await cargarCatalogos();
  el.innerHTML = `
  <div class="sec-h"><div><h2>Productos para devoluciones</h2><p>Lista de ejemplo: reemplázala por los códigos reales (Código · Descripción · Unidad).</p></div><div style="display:flex;gap:8px"><button class="btn" id="cPP">${I.doc}Pegar desde Excel</button><button class="btn primary" id="cP">${I.plus}Producto</button></div></div>
  <div class="card tbl-wrap"><table><thead><tr><th>Código</th><th>Descripción</th><th>Unidad</th><th>Estado</th></tr></thead><tbody>
    ${S.productos.map(p => `<tr class="click" data-p="${esc(p.codigo)}"><td class="num"><b>${esc(p.codigo)}</b></td><td>${esc(p.descripcion)}</td><td>${esc(p.unidad)}</td><td>${p.activo ? '<span class="chip ok">Activo</span>' : '<span class="chip">Inactivo</span>'}</td></tr>`).join('')}</tbody></table></div>
  <div class="grid g2 block">
    <div><div class="sec-h"><div><h2>Motivos de devolución</h2></div><button class="btn sm" id="cM">${I.plus}Motivo</button></div>
      <div class="card"><ul class="list">${S.motivos.map(m => `<li class="click" data-m="${m.id}"><span class="tx"><b>${esc(m.motivo)}</b></span>${m.activo ? '' : '<span class="chip">Inactivo</span>'}</li>`).join('')}</ul></div></div>
    <div><div class="sec-h"><div><h2>Vehículos</h2><p>Opcional: sugiere patentes al chofer y une el GPS de GPSur.</p></div><button class="btn sm" id="cV">${I.plus}Vehículo</button></div>
      <div class="card tbl-wrap">${S.vehiculos.length ? `<table><thead><tr><th>Patente</th><th>Descripción</th><th>ID GPSur</th></tr></thead><tbody>${S.vehiculos.map(v => `<tr class="click" data-v="${esc(v.patente)}"><td class="num"><b>${esc(v.patente)}</b></td><td>${esc(v.descripcion || '')}</td><td class="num">${esc(v.gpsur_id || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><b>Sin vehículos</b>Agrega los camiones para que el chofer elija la patente.</div>'}</div></div>
  </div>`;
  const recargar = () => go('catalogos');
  const chk = (name, v) => `<label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" name="${name}" style="width:auto" ${v ? 'checked' : ''}> Activo</label>`;
  const formProd = (p) => {
    const n = !p; p = p || { activo: true, unidad: 'SACO' };
    const sh = openSheet(n ? 'Nuevo producto' : 'Editar producto', `<form id="fp" class="form"><fieldset><legend>Producto</legend>
      ${fld('Código', `<input name="codigo" required value="${esc(p.codigo || '')}" ${n ? '' : 'readonly'} class="mono">`, 1)}
      ${fld('Descripción', `<input name="descripcion" required value="${esc(p.descripcion || '')}">`, 1)}
      ${fld('Unidad', `<input name="unidad" value="${esc(p.unidad)}">`)}${chk('activo', p.activo)}</fieldset>
      <div class="actions"><button class="btn primary">Guardar</button></div></form>`, { eyebrow: 'Catálogos' });
    $('#fp', sh).onsubmit = async (ev) => { ev.preventDefault(); const f = ev.target;
      const d = { codigo: f.codigo.value.trim(), descripcion: f.descripcion.value.trim(), unidad: f.unidad.value.trim() || 'UN', activo: f.activo.checked };
      const { error } = n ? await sb.from('ent_productos').insert(d) : await sb.from('ent_productos').update(d).eq('codigo', p.codigo);
      if (error) return toast(errMsg(error)); closeSheet(); recargar(); };
  };
  $('#cP').onclick = () => formProd(null);
  $$('[data-p]', el).forEach(tr => tr.onclick = () => formProd(S.productos.find(p => p.codigo === tr.dataset.p)));
  $('#cPP').onclick = () => {
    const sh = openSheet('Pegar productos', `<div class="form"><div class="ctx">Columnas: <b>Código · Descripción · Unidad</b>. Si el código ya existe, se actualiza.</div>
      ${fld('Filas', '<textarea id="tp" style="min-height:220px;font-family:var(--f-mono);font-size:12.5px"></textarea>', 1)}<div class="actions"><button class="btn primary" id="bp">Cargar</button></div></div>`, { eyebrow: 'Catálogos' });
    $('#bp', sh).onclick = async () => {
      const regs = $('#tp', sh).value.split(/\r?\n/).map(l => l.split('\t').map(s => s.trim())).filter(c => c[0] && c[1] && !/^c[oó]digo$/i.test(c[0])).map(c => ({ codigo: c[0], descripcion: c[1], unidad: c[2] || 'UN', activo: true }));
      if (!regs.length) return toast('Sin filas válidas');
      const { error } = await sb.from('ent_productos').upsert(regs, { onConflict: 'codigo' });
      if (error) return toast(errMsg(error)); toast(`${regs.length} productos cargados`); closeSheet(); recargar();
    };
  };
  const formMot = (m) => {
    const n = !m; m = m || { activo: true };
    const sh = openSheet(n ? 'Nuevo motivo' : 'Editar motivo', `<form id="fm" class="form"><fieldset><legend>Motivo de devolución</legend>${fld('Motivo', `<input name="motivo" required value="${esc(m.motivo || '')}">`, 1)}${chk('activo', m.activo)}</fieldset><div class="actions"><button class="btn primary">Guardar</button></div></form>`, { eyebrow: 'Catálogos' });
    $('#fm', sh).onsubmit = async (ev) => { ev.preventDefault(); const d = { motivo: ev.target.motivo.value.trim(), activo: ev.target.activo.checked };
      const { error } = n ? await sb.from('ent_motivos').insert(d) : await sb.from('ent_motivos').update(d).eq('id', m.id);
      if (error) return toast(errMsg(error)); closeSheet(); recargar(); };
  };
  $('#cM').onclick = () => formMot(null);
  $$('[data-m]', el).forEach(li => li.onclick = () => formMot(S.motivos.find(m => m.id === +li.dataset.m)));
  const formVeh = (v) => {
    const n = !v; v = v || { activo: true };
    const sh = openSheet(n ? 'Nuevo vehículo' : 'Editar vehículo', `<form id="fv" class="form"><fieldset><legend>Vehículo</legend>
      ${fld('Patente', `<input name="patente" required value="${esc(v.patente || '')}" ${n ? '' : 'readonly'} class="mono" style="text-transform:uppercase">`, 1)}
      ${fld('Descripción', `<input name="descripcion" value="${esc(v.descripcion || '')}" placeholder="Camión rampla, 3/4…">`)}
      ${fld('ID en GPSur', `<input name="gpsur_id" value="${esc(v.gpsur_id || '')}">`)}${chk('activo', v.activo)}</fieldset>
      <div class="actions"><button class="btn primary">Guardar</button></div></form>`, { eyebrow: 'Catálogos' });
    $('#fv', sh).onsubmit = async (ev) => { ev.preventDefault(); const f = ev.target;
      const d = { patente: f.patente.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), descripcion: f.descripcion.value.trim() || null, gpsur_id: f.gpsur_id.value.trim() || null, activo: f.activo.checked };
      const { error } = n ? await sb.from('ent_vehiculos').insert(d) : await sb.from('ent_vehiculos').update(d).eq('patente', v.patente);
      if (error) return toast(errMsg(error)); closeSheet(); recargar(); };
  };
  $('#cV').onclick = () => formVeh(null);
  $$('[data-v]', el).forEach(tr => tr.onclick = () => formVeh(S.vehiculos.find(v => v.patente === tr.dataset.v)));
}

/* ---------- arranque ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
iniciar();
