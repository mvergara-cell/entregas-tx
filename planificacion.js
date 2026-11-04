/* ================== Entregas TX · Pendientes, armado de rutas y flota ================== */
const EST_RUTA = { propuesta: 'Propuesta', asignada: 'Asignada', aceptada: 'Aceptada', en_ruta: 'En ruta', finalizada: 'Finalizada', cancelada: 'Cancelada' };
const EST_RUTA_CHIP = { propuesta: '', asignada: 'warn', aceptada: 'info', en_ruta: 'brand', finalizada: 'ok', cancelada: 'plain' };
const chipRuta = (e) => `<span class="chip ${EST_RUTA_CHIP[e] ?? ''}">${EST_RUTA[e] || esc(e)}</span>`;
const fmtT = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('es-CL', { maximumFractionDigits: 2 });
const normRut = (r) => (r || '').replace(/[^0-9kK]/g, '').toLowerCase() || null;

async function cargarConfig() {
  const { data } = await sb.from('ent_config').select('*');
  S.config = Object.fromEntries((data || []).map(r => [r.clave, r.valor]));
  return S.config;
}
async function guardarConfig(clave, valor) {
  const { error } = await sb.from('ent_config').upsert({ clave, valor, updated_at: new Date().toISOString() });
  if (error) throw error;
  S.config[clave] = valor;
}

/* ---------- Importar Excel de pendientes ---------- */
const CAMPOS_EXCEL = [
  ['pedido', 'N° pedido / guía', ['pedido', 'nro pedido', 'n° pedido', 'guia', 'guía', 'folio', 'documento', 'programacion', 'programación', 'oc']],
  ['fecha', 'Fecha de entrega', ['fecha', 'fecha entrega', 'fecha despacho', 'fecha programada', 'f. entrega']],
  ['cliente', 'Cliente', ['cliente', 'razon social', 'razón social', 'nombre cliente', 'destinatario']],
  ['cliente_rut', 'RUT cliente', ['rut', 'rut cliente', 'rut destinatario']],
  ['obra', 'Obra', ['obra', 'proyecto', 'nombre obra']],
  ['direccion', 'Dirección', ['direccion', 'dirección', 'direccion despacho', 'dirección despacho', 'direccion entrega', 'dirección de entrega']],
  ['comuna', 'Comuna', ['comuna', 'ciudad', 'localidad']],
  ['producto_codigo', 'Código producto', ['codigo', 'código', 'cod producto', 'código producto', 'material', 'sku', 'articulo', 'artículo']],
  ['producto', 'Descripción producto', ['producto', 'descripcion', 'descripción', 'texto material', 'descripcion material']],
  ['cantidad', 'Cantidad', ['cantidad', 'cant', 'cant.', 'unidades', 'sacos', 'cantidad pendiente', 'saldo']],
  ['unidad', 'Unidad', ['unidad', 'um', 'u.m.', 'unidad medida']],
  ['peso', 'Peso', ['peso', 'kilos', 'kg', 'toneladas', 'ton', 'peso kg', 'peso ton', 'tons', 'tonelaje']],
  ['requiere_peoneta', 'Requiere peoneta (SI/NO)', ['peoneta', 'requiere peoneta', 'descarga']],
  ['observacion', 'Observación', ['observacion', 'observación', 'obs', 'comentario', 'glosa']],
];
const normTxt = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
function fechaExcel(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().slice(0, 10); }
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
const numExcel = (v) => { if (typeof v === 'number') return v; const s = String(v ?? '').trim(); if (!s) return null; const n = +s.replace(/\./g, '').replace(',', '.'); return isNaN(n) ? (isNaN(+s) ? null : +s) : n; };

function importarExcel(alTerminar) {
  const sh = openSheet('Cargar pendientes de despacho', `
    <div class="form">
      <div class="ctx">Sube el Excel (.xlsx, .xls o .csv) con los pendientes de despacho. Reconozco las columnas por su nombre; revisa la asignación antes de cargar.</div>
      <fieldset><legend>Archivo</legend>
        <input type="file" id="xFile" accept=".xlsx,.xls,.csv">
        <div id="xHoja"></div>
      </fieldset>
      <div id="xMap"></div>
    </div>`, { eyebrow: 'Pendientes' });
  let filas = [], cabeceras = [], wb = null;
  const pintarMapeo = () => {
    const opts = (sel) => '<option value="">— no usar —</option>' + cabeceras.map((c, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(c || '(col ' + (i + 1) + ')')}</option>`).join('');
    const auto = {};
    CAMPOS_EXCEL.forEach(([k, , alias]) => { const i = cabeceras.findIndex(c => alias.includes(normTxt(c))); if (i >= 0) auto[k] = i; });
    $('#xMap', sh).innerHTML = `
      <fieldset><legend>Columnas</legend>
        <div class="fg">${CAMPOS_EXCEL.map(([k, t]) => fld(t, `<select data-campo="${k}">${opts(auto[k] ?? '')}</select>`, ['cliente', 'direccion'].includes(k))).join('')}</div>
      </fieldset>
      <fieldset><legend>Peso</legend>
        <div class="fg">
          ${fld('La columna de peso viene en', '<select id="xUnidadPeso"><option value="kg">Kilos</option><option value="ton">Toneladas</option></select>')}
          ${fld('Si no hay peso: kg por unidad', '<input id="xKgUnidad" type="number" step="any" value="25">')}
        </div>
        <div class="fg">
          ${fld('Fecha de despacho si no viene en el archivo', `<input id="xFecha" type="date" value="${sumarDias(hoy(), 1)}">`)}
          ${fld('Unidades que requieren peoneta (si no hay columna)', '<input id="xPeoUnid" value="SACO,SC,UN" placeholder="SACO,UN">')}
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="xGeo" style="width:auto" checked> Ubicar direcciones en el mapa al cargar</label>
      </fieldset>
      <div class="ctx" id="xPrev"></div>
      <div class="actions"><button class="btn primary" id="xOk">${I.download}Cargar ${filas.length} filas</button></div>`;
    if (auto.peso != null && /ton/.test(normTxt(cabeceras[auto.peso]))) $('#xUnidadPeso', sh).value = 'ton';
    const prev = () => { const r = construir(); $('#xPrev', sh).innerHTML = `${r.ok.length} filas válidas · ${fmtT(r.ok.reduce((a, b) => a + b.peso_ton, 0))} ton${r.malas ? ` · <b style="color:var(--bad)">${r.malas} sin cliente o dirección (se omiten)</b>` : ''}`; };
    $$('select,input', $('#xMap', sh)).forEach(e => e.onchange = prev);
    prev();
    $('#xOk', sh).onclick = async () => {
      const r = construir(); if (!r.ok.length) return toast('No hay filas válidas');
      const btn = $('#xOk', sh); btn.disabled = true; btn.textContent = 'Cargando…';
      const lote = 'L' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const regs = r.ok.map(x => ({ ...x, lote }));
      for (let i = 0; i < regs.length; i += 500) {
        const { error } = await sb.from('ent_cargas').insert(regs.slice(i, i + 500));
        if (error) { btn.disabled = false; btn.textContent = 'Cargar'; return toast(errMsg(error)); }
      }
      toast(`${regs.length} pendientes cargados`);
      const geo = $('#xGeo', sh).checked; closeSheet();
      if (geo) await geolocalizarCargas();
      alTerminar && alTerminar();
    };
  };
  const construir = () => {
    const col = {}; $$('[data-campo]', sh).forEach(s => { if (s.value !== '') col[s.dataset.campo] = +s.value; });
    const enTon = $('#xUnidadPeso', sh).value === 'ton', kgU = +$('#xKgUnidad', sh).value || 0;
    const peoU = $('#xPeoUnid', sh).value.split(',').map(s => normTxt(s)).filter(Boolean);
    const fechaDef = $('#xFecha', sh).value;
    const g = (f, k) => col[k] != null ? f[col[k]] : null;
    let malas = 0; const ok = [];
    for (const f of filas) {
      const cliente = String(g(f, 'cliente') ?? '').trim(), dir = String(g(f, 'direccion') ?? '').trim();
      if (!cliente && !dir) continue;
      if (!cliente || !dir) { malas++; continue; }
      const cant = numExcel(g(f, 'cantidad')), unidad = String(g(f, 'unidad') ?? '').trim() || null;
      let peso = numExcel(g(f, 'peso'));
      peso = peso != null ? (enTon ? peso : peso / 1000) : (cant != null ? cant * kgU / 1000 : 0);
      const rp = g(f, 'requiere_peoneta');
      ok.push({
        pedido: g(f, 'pedido') != null ? String(g(f, 'pedido')).trim() || null : null,
        fecha: fechaExcel(g(f, 'fecha')) || fechaDef || null,
        cliente, cliente_rut: g(f, 'cliente_rut') != null ? String(g(f, 'cliente_rut')).trim() : null,
        obra: g(f, 'obra') ? String(g(f, 'obra')).trim() : null, direccion: dir, comuna: g(f, 'comuna') ? String(g(f, 'comuna')).trim() : null,
        producto_codigo: g(f, 'producto_codigo') != null ? String(g(f, 'producto_codigo')).trim() : null, producto: g(f, 'producto') ? String(g(f, 'producto')).trim() : null,
        cantidad: cant, unidad, peso_ton: Math.round(peso * 1000) / 1000,
        requiere_peoneta: rp != null && String(rp).trim() !== '' ? /^(si|sí|s|x|1|true)$/i.test(String(rp).trim()) : (unidad ? peoU.includes(normTxt(unidad)) : false),
        observacion: g(f, 'observacion') ? String(g(f, 'observacion')).trim() : null,
      });
    }
    return { ok, malas };
  };
  const leerHoja = (nombre) => {
    const ws = wb.Sheets[nombre];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, cellDates: true });
    let hi = 0, best = -1;
    for (let i = 0; i < Math.min(15, aoa.length); i++) { const n = (aoa[i] || []).filter(c => c != null && String(c).trim() !== '' && isNaN(+c)).length; if (n > best) { best = n; hi = i; } }
    cabeceras = (aoa[hi] || []).map(c => String(c ?? '').trim());
    filas = aoa.slice(hi + 1).filter(r => r && r.some(c => c != null && String(c).trim() !== ''));
    pintarMapeo();
  };
  $('#xFile', sh).onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    if (!window.XLSX) return toast('No se pudo cargar el lector de Excel. Revisa tu conexión.');
    try {
      wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      const hojas = wb.SheetNames;
      $('#xHoja', sh).innerHTML = hojas.length > 1 ? fld('Hoja', `<select id="xH">${hojas.map(h => `<option>${esc(h)}</option>`).join('')}</select>`) : '';
      if ($('#xH', sh)) $('#xH', sh).onchange = e => leerHoja(e.target.value);
      leerHoja(hojas[0]);
    } catch (e) { toast('No se pudo leer el archivo: ' + errMsg(e)); }
  };
}

async function geolocalizarCargas() {
  const { data } = await sb.from('ent_cargas').select('id,direccion,comuna').is('dest_lat', null).in('estado', ['pendiente', 'planificada']).limit(500);
  const grupos = {};
  (data || []).forEach(c => { const k = normTxt(c.direccion) + '|' + normTxt(c.comuna); (grupos[k] = grupos[k] || { direccion: c.direccion, comuna: c.comuna, ids: [] }).ids.push(c.id); });
  const lista = Object.values(grupos); let ok = 0;
  for (let i = 0; i < lista.length; i++) {
    banner(`Ubicando direcciones en el mapa ${i + 1}/${lista.length}…`);
    try { const r = await geocodificar(lista[i].direccion, lista[i].comuna); if (r) { await sb.from('ent_cargas').update({ dest_lat: r.lat, dest_lng: r.lng }).in('id', lista[i].ids); ok++; } } catch {}
    if (i < lista.length - 1) await new Promise(r => setTimeout(r, 1100));
  }
  banner('');
  if (lista.length) toast(`${ok} de ${lista.length} direcciones ubicadas${ok < lista.length ? '. Ubica las que faltan desde la lista' : ''}`);
}

/* ---------- Vista Pendientes ---------- */
async function vistaPendientes(el) {
  await cargarConfig();
  $('#top-actions').innerHTML = `<button class="btn" id="pImp">${I.download}<span>Cargar Excel</span></button><button class="btn primary" id="pArmar">${I.truck}<span>Armar rutas</span></button>`;
  S.fPen = S.fPen || { estado: 'pendiente', fecha: '' };
  const F = S.fPen;
  el.innerHTML = `
    <div class="filters">
      ${fld('Estado', `<select id="pE"><option value="pendiente">Pendientes</option><option value="planificada">Planificadas (en propuesta)</option><option value="asignada">Asignadas</option><option value="">Todas</option></select>`)}
      ${fld('Fecha de entrega', `<input type="date" id="pF" value="${F.fecha}">`)}
      <div class="grow"></div>
      <button class="btn" id="pGeo">${I.pin}<span>Ubicar faltantes</span></button>
      <button class="btn danger" id="pDel">Eliminar seleccionadas</button>
    </div>
    <div class="kpis k4" id="pK"></div>
    <div class="card tbl-wrap" id="pT"><div class="empty"><b>Cargando…</b></div></div>`;
  $('#pE').value = F.estado;
  const recargar = () => go('pendientes');
  $('#pImp').onclick = () => importarExcel(recargar);
  $('#pGeo').onclick = async () => { await geolocalizarCargas(); recargar(); };
  $('#pE').onchange = e => { F.estado = e.target.value; cargar(); };
  $('#pF').onchange = e => { F.fecha = e.target.value; cargar(); };
  let filas = [];
  $('#pArmar').onclick = () => {
    const sel = $$('#pT input[data-sel]:checked').map(c => c.dataset.sel);
    const base = sel.length ? filas.filter(f => sel.includes(f.id)) : filas.filter(f => f.estado === 'pendiente');
    if (!base.length) return toast('No hay pendientes para armar rutas');
    armarRutas(base.filter(f => f.estado === 'pendiente'));
  };
  $('#pDel').onclick = async () => {
    const sel = $$('#pT input[data-sel]:checked').map(c => c.dataset.sel);
    if (!sel.length) return toast('Selecciona filas');
    const asign = filas.filter(f => sel.includes(f.id) && f.estado === 'asignada').length;
    if (asign) return toast('Hay filas ya asignadas a un camión; cancela la ruta primero');
    if (!confirm(`¿Eliminar ${sel.length} fila(s) de pendientes?`)) return;
    const { error } = await sb.from('ent_cargas').delete().in('id', sel);
    toast(error ? errMsg(error) : 'Eliminadas'); cargar();
  };
  async function cargar() {
    const fab = () => { let q = sb.from('ent_cargas').select('*').order('fecha').order('cliente').order('created_at'); if (F.estado) q = q.eq('estado', F.estado); else q = q.neq('estado', 'anulada'); if (F.fecha) q = q.eq('fecha', F.fecha); return q; };
    try { filas = await traerTodo(fab); } catch (e) { return $('#pT') && ($('#pT').innerHTML = `<div class="ctx err">${esc(errMsg(e))}</div>`); }
    if (!$('#pT')) return;
    const peso = filas.reduce((a, b) => a + (+b.peso_ton || 0), 0), sinGeo = filas.filter(f => f.dest_lat == null).length;
    const destinos = new Set(filas.map(f => normTxt(f.cliente) + '|' + normTxt(f.direccion))).size;
    $('#pK').innerHTML = `<div class="kpi"><span class="eyebrow">Líneas</span><b>${filas.length}</b></div><div class="kpi"><span class="eyebrow">Toneladas</span><b>${fmtT(peso)}</b></div><div class="kpi"><span class="eyebrow">Destinos</span><b>${destinos}</b></div><div class="kpi ${sinGeo ? 'alert' : ''}"><span class="eyebrow">Sin ubicar</span><b>${sinGeo}</b></div>`;
    if (!filas.length) return $('#pT').innerHTML = `<div class="empty"><b>Sin pendientes</b>Carga el Excel de pendientes de despacho para armar las rutas.<br><button class="btn primary" onclick="importarExcel(()=>go('pendientes'))">${I.download}Cargar Excel</button></div>`;
    $('#pT').innerHTML = `<table><thead><tr><th><input type="checkbox" id="pAll" style="width:auto"></th><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Dirección</th><th>Producto</th><th class="r">Cant.</th><th class="r">Ton</th><th>Peoneta</th><th>Mapa</th><th>Estado</th></tr></thead><tbody>
      ${filas.map(f => `<tr><td><input type="checkbox" data-sel="${f.id}" style="width:auto"></td><td class="num">${f.fecha ? fechaCL(f.fecha) : ''}</td><td class="num">${esc(f.pedido || '')}</td>
        <td>${esc(f.cliente)}<div class="sub">${esc(f.obra || '')}</div></td><td>${esc(f.direccion)}<div class="sub">${esc(f.comuna || '')}</div></td>
        <td>${esc(f.producto || f.producto_codigo || '')}</td><td class="r num">${f.cantidad != null ? fmtT(f.cantidad) + ' ' + esc(f.unidad || '') : ''}</td><td class="r num">${fmtT(f.peso_ton)}</td>
        <td>${f.requiere_peoneta ? 'Sí' : ''}</td><td>${f.dest_lat != null ? '✔' : `<button class="btn sm" data-ubicar="${f.id}">Ubicar</button>`}</td>
        <td><span class="chip ${f.estado === 'pendiente' ? 'warn' : f.estado === 'asignada' ? 'ok' : 'info'}">${esc(f.estado)}</span></td></tr>`).join('')}</tbody></table>`;
    $('#pAll').onchange = e => $$('#pT input[data-sel]').forEach(c => c.checked = e.target.checked);
    $$('[data-ubicar]', el).forEach(b => b.onclick = () => ubicarCarga(filas.find(f => f.id === b.dataset.ubicar), cargar));
  }
  cargar();
}

function ubicarCarga(c, alTerminar) {
  const sh = openSheet('Ubicar destino', `<div class="form"><div class="ctx"><b>${esc(c.cliente)}</b><span style="width:100%">${esc(c.direccion)}${c.comuna ? ', ' + esc(c.comuna) : ''}</span></div>
    <div style="display:flex;gap:8px"><button class="btn sm" id="uB">${I.pin}Buscar dirección</button><span class="sub">o toca el mapa</span></div>
    <div class="picker" id="uM" style="height:340px"></div><div class="actions"><button class="btn primary" id="uOk">Guardar ubicación</button></div></div>`, { eyebrow: 'Pendientes' });
  const m = nuevoMapa($('#uM', sh)); let mk = null, pos = null;
  S.sheetCleanup = () => { try { m.remove(); } catch {} };
  const fijar = (lat, lng, c2) => { pos = { lat, lng }; if (mk) mk.setLatLng([lat, lng]); else mk = L.marker([lat, lng], { draggable: true, icon: pin('var(--brand)') }).addTo(m).on('dragend', e => { const p = e.target.getLatLng(); pos = { lat: p.lat, lng: p.lng }; }); if (c2) m.setView([lat, lng], 16); };
  m.on('click', e => fijar(e.latlng.lat, e.latlng.lng));
  $('#uB', sh).onclick = async () => { const r = await geocodificar(c.direccion, c.comuna).catch(() => null); if (r) fijar(r.lat, r.lng, true); else toast('No encontrada; marca el punto en el mapa'); };
  $('#uOk', sh).onclick = async () => {
    if (!pos) return toast('Marca el punto en el mapa');
    const { error } = await sb.from('ent_cargas').update({ dest_lat: pos.lat, dest_lng: pos.lng }).eq('direccion', c.direccion).eq('cliente', c.cliente).in('estado', ['pendiente', 'planificada']);
    if (error) return toast(errMsg(error)); closeSheet(); alTerminar && alTerminar();
  };
}

/* ---------- Motor de armado de rutas ---------- */
function planificar(cargas, camiones, planta, opt) {
  const maxCap = Math.max(...camiones.map(c => +c.capacidad_ton || 0), 0);
  if (!maxCap) throw new Error('No hay camiones disponibles con capacidad registrada');
  // las cargas con peoneta solo pueden ir en camiones con peoneta: su límite es el mayor de ellos
  const capPeo = Math.max(...camiones.filter(c => c.peoneta).map(c => +c.capacidad_ton || 0), 0) || maxCap;
  const lim = peo => peo ? capPeo : maxCap;
  // 1) dividir líneas que superan el camión más grande
  const piezas = [];
  for (const c of cargas) {
    let p = +c.peso_ton || 0; const L = lim(!!c.requiere_peoneta);
    if (p <= L) { piezas.push({ ...c, _peso: p }); continue; }
    const n = Math.ceil(p / L); const cant = c.cantidad;
    for (let i = 0; i < n; i++) {
      const parte = i < n - 1 ? L : p - L * (n - 1);
      piezas.push({ ...c, _peso: parte, _split: i > 0, _frac: parte / p, cantidad: cant != null ? Math.round(cant * parte / p * 100) / 100 : null });
    }
  }
  // 2) agrupar en destinos
  const destinos = {};
  for (const p of piezas) {
    const k = (normRut(p.cliente_rut) || normTxt(p.cliente)) + '|' + normTxt(p.direccion) + '|' + normTxt(p.comuna);
    const d = destinos[k] = destinos[k] || { k, cliente: p.cliente, direccion: p.direccion, comuna: p.comuna, lat: p.dest_lat, lng: p.dest_lng, piezas: [], peso: 0, peoneta: false };
    d.piezas.push(p); d.peso += p._peso; d.peoneta = d.peoneta || !!p.requiere_peoneta;
    if (d.lat == null && p.dest_lat != null) { d.lat = p.dest_lat; d.lng = p.dest_lng; }
  }
  const dist = (a, b) => (a.lat == null || b.lat == null) ? 0 : distM(a.lat, a.lng, b.lat, b.lng) / 1000 * 1.3;
  const viajes = [];
  // 3) destinos grandes: camiones completos dedicados
  const chicos = [];
  for (const d of Object.values(destinos)) {
    const L = lim(d.peoneta);
    if (d.peso <= L) { chicos.push(d); continue; }
    const bins = [];
    d.piezas.sort((a, b) => b._peso - a._peso).forEach(p => { const b = bins.find(b => b.peso + p._peso <= L + 1e-6); if (b) { b.piezas.push(p); b.peso += p._peso; } else bins.push({ piezas: [p], peso: p._peso }); });
    bins.forEach(b => viajes.push({ paradas: [{ ...d, piezas: b.piezas, peso: b.peso }], peso: b.peso, peoneta: d.peoneta }));
  }
  // 4) barrido angular desde planta para destinos chicos
  const ang = d => d.lat == null ? 999 : Math.atan2(d.lat - planta.lat, d.lng - planta.lng);
  chicos.sort((a, b) => ang(a) - ang(b) || dist(planta, a) - dist(planta, b));
  let cur = null;
  for (const d of chicos) {
    const lejos = cur && cur.paradas.length && dist(cur.paradas[cur.paradas.length - 1], d) > opt.maxDesvioKm;
    if (!cur || cur.peso + d.peso > lim(cur.peoneta || d.peoneta) + 1e-6 || cur.paradas.length >= opt.maxParadas || lejos) { cur = { paradas: [], peso: 0, peoneta: false }; viajes.push(cur); }
    cur.paradas.push(d); cur.peso += d.peso; cur.peoneta = cur.peoneta || d.peoneta;
  }
  // 5) ordenar paradas (vecino más cercano desde planta) y calcular km
  for (const v of viajes) {
    const rest = [...v.paradas], ord = []; let p = planta, km = 0;
    while (rest.length) { let bi = 0, bd = Infinity; rest.forEach((r, i) => { const dd = dist(p, r); if (dd < bd) { bd = dd; bi = i; } }); km += bd; p = rest.splice(bi, 1)[0]; ord.push(p); }
    v.paradas = ord; v.km = Math.round(km);
  }
  // 6) sugerir camión: el más chico que alcance (respetando peoneta y vueltas por camión)
  const uso = {}; const capacidades = [...new Set(camiones.map(c => +c.capacidad_ton))].sort((a, b) => a - b);
  viajes.sort((a, b) => b.peso - a.peso);
  for (const v of viajes) {
    const cand = camiones.filter(c => +c.capacidad_ton >= v.peso - 1e-6 && (!v.peoneta || c.peoneta) && (uso[c.patente] || 0) < opt.vueltas)
      .sort((a, b) => (+a.capacidad_ton - +b.capacidad_ton) || ((a.tipo_flota === 'interna' ? 0 : 1) - (b.tipo_flota === 'interna' ? 0 : 1)));
    const caps = v.peoneta ? [...new Set(camiones.filter(c => c.peoneta).map(c => +c.capacidad_ton))].sort((a, b) => a - b) : capacidades;
    v.capacidad = caps.find(c => c >= v.peso - 1e-6) || lim(v.peoneta);
    if (cand[0]) { v.camion = cand[0]; uso[cand[0].patente] = (uso[cand[0].patente] || 0) + 1; }
  }
  return viajes;
}

async function armarRutas(cargas) {
  await cargarConfig();
  const { data: flota } = await sb.from('ent_vehiculos').select('*').eq('activo', true).eq('disponible', true);
  const planta = S.config.planta;
  const fechas = [...new Set(cargas.map(c => c.fecha).filter(Boolean))].sort();
  const sinGeo = cargas.filter(c => c.dest_lat == null).length;
  const sh = openSheet('Armar rutas', `
    <div class="form">
      ${!planta ? `<div class="ctx err">${I.alert}<span>Falta definir la ubicación de la planta de carga. Hazlo en <b>Flota → Planta de carga</b>.</span></div>` : ''}
      ${sinGeo ? `<div class="ctx">${I.pin}<span>${sinGeo} línea(s) sin ubicación: se agruparán por dirección pero sin optimizar su recorrido.</span></div>` : ''}
      <fieldset><legend>Parámetros</legend>
        <div class="fg">
          ${fld('Fecha de despacho de las rutas', `<input type="date" id="aF" value="${fechas[0] || sumarDias(hoy(), 1)}">`, 1)}
          ${fld('Flota a usar', '<select id="aFlota"><option value="">Interna y externa</option><option value="interna">Solo interna</option><option value="externa">Solo externa</option></select>')}
          ${fld('Máximo de paradas por camión', '<input type="number" id="aP" min="1" value="4">')}
          ${fld('Vueltas por camión en el día', '<input type="number" id="aV" min="1" value="1">')}
          ${fld('Distancia máx. entre paradas (km)', '<input type="number" id="aD" min="1" value="25">')}
        </div>
        <div class="sub">${cargas.length} líneas · ${fmtT(cargas.reduce((a, b) => a + (+b.peso_ton || 0), 0))} ton · ${(flota || []).length} camiones disponibles</div>
      </fieldset>
      <div id="aRes"></div>
      <div class="actions"><button class="btn" id="aCalc">${I.refresh}Calcular</button><button class="btn primary" id="aOk" disabled>Guardar rutas propuestas</button></div>
    </div>`, { eyebrow: 'Planificación' });
  let viajes = [];
  const calc = () => {
    try {
      const tipo = $('#aFlota', sh).value; const cam = (flota || []).filter(c => +c.capacidad_ton > 0 && (!tipo || c.tipo_flota === tipo));
      viajes = planificar(cargas, cam, planta || { lat: -33.45, lng: -70.66 }, { maxParadas: +$('#aP', sh).value || 4, vueltas: +$('#aV', sh).value || 1, maxDesvioKm: +$('#aD', sh).value || 25 });
      const sinCamion = viajes.filter(v => !v.camion).length;
      $('#aRes', sh).innerHTML = `<div class="kpis k4"><div class="kpi"><span class="eyebrow">Rutas</span><b>${viajes.length}</b></div><div class="kpi"><span class="eyebrow">Toneladas</span><b>${fmtT(viajes.reduce((a, v) => a + v.peso, 0))}</b></div><div class="kpi"><span class="eyebrow">Uso promedio</span><b>${Math.round(viajes.reduce((a, v) => a + v.peso / v.capacidad, 0) / (viajes.length || 1) * 100)}%</b></div><div class="kpi ${sinCamion ? 'alert' : ''}"><span class="eyebrow">Sin camión sugerido</span><b>${sinCamion}</b></div></div>
        <div class="grid" style="gap:10px">${viajes.map((v, i) => `<div class="card" style="padding:12px;display:grid;gap:6px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>Ruta ${i + 1} · camión de ${v.capacidad} ton${v.peoneta ? ' con peoneta' : ''}</b><span class="mono">${fmtT(v.peso)} ton · ${v.km} km</span></div>
          <div class="hbar" style="grid-template-columns:minmax(0,1fr) auto;padding:0"><span class="b"><i style="width:${Math.min(100, v.peso / v.capacidad * 100)}%"></i></span><span class="mono sub">${Math.round(v.peso / v.capacidad * 100)}%</span></div>
          <div class="sub">${v.paradas.map((p, j) => `${j + 1}. ${esc(p.cliente)} (${esc(p.comuna || p.direccion)}) ${fmtT(p.peso)} t`).join(' → ')}</div>
          <div class="sub">Sugerido: ${v.camion ? `<b style="color:var(--ink)">${esc(v.camion.patente)}</b> · ${esc(v.camion.contratista || (v.camion.tipo_flota === 'interna' ? 'Flota interna' : ''))} · ${v.camion.capacidad_ton} t` : '<span style="color:var(--bad)">sin camión disponible que calce</span>'}</div></div>`).join('')}</div>`;
      $('#aOk', sh).disabled = !viajes.length;
    } catch (e) { $('#aRes', sh).innerHTML = `<div class="ctx err">${esc(errMsg(e))}</div>`; $('#aOk', sh).disabled = true; }
  };
  $('#aCalc', sh).onclick = calc;
  ['#aFlota', '#aP', '#aV', '#aD'].forEach(s => $(s, sh).onchange = calc);
  calc();
  $('#aOk', sh).onclick = async () => {
    const fecha = $('#aF', sh).value; if (!fecha) return toast('Indica la fecha de despacho');
    const btn = $('#aOk', sh); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      for (let i = 0; i < viajes.length; i++) {
        const v = viajes[i];
        const { data: r, error } = await sb.from('ent_rutas').insert({ fecha, nombre: `Ruta ${i + 1}`, estado: 'propuesta', capacidad_sugerida: v.capacidad, patente_sugerida: v.camion?.patente || null, peso_ton: Math.round(v.peso * 1000) / 1000, requiere_peoneta: v.peoneta, paradas: v.paradas.length, distancia_km: v.km }).select().single();
        if (error) throw error;
        for (let j = 0; j < v.paradas.length; j++) {
          const enteras = v.paradas[j].piezas.filter(p => !p._frac), partes = v.paradas[j].piezas.filter(p => p._frac);
          if (enteras.length) { const { error: e2 } = await sb.from('ent_cargas').update({ ruta_id: r.id, parada: j + 1, estado: 'planificada' }).in('id', enteras.map(p => p.id)); if (e2) throw e2; }
          for (const p of partes) {
            if (!p._split) { const { error: e3 } = await sb.from('ent_cargas').update({ ruta_id: r.id, parada: j + 1, estado: 'planificada', peso_ton: p._peso, cantidad: p.cantidad }).eq('id', p.id); if (e3) throw e3; }
            else {
              const { id, _peso, _split, _frac, created_at, ...resto } = p;
              const { error: e4 } = await sb.from('ent_cargas').insert({ ...resto, peso_ton: _peso, ruta_id: r.id, parada: j + 1, estado: 'planificada', observacion: ((resto.observacion || '') + ' (parte de carga dividida)').trim() });
              if (e4) throw e4;
            }
          }
        }
      }
      toast(`${viajes.length} rutas propuestas guardadas`);
      closeSheet(); S.fRutas = { fecha }; go('rutas');
    } catch (e) { toast(errMsg(e)); btn.disabled = false; btn.textContent = 'Guardar rutas propuestas'; }
  };
}

/* ---------- Vista Rutas ---------- */
async function vistaRutas(el) {
  S.fRutas = S.fRutas || { fecha: sumarDias(hoy(), 1) };
  const F = S.fRutas;
  $('#top-actions').innerHTML = `<button class="btn" data-act="go" data-to="pendientes">${I.list}<span>Pendientes</span></button>`;
  el.innerHTML = `<div class="mapbar"><input type="date" id="rF" value="${F.fecha}" style="width:auto"><button class="btn sm" id="rHoy">Hoy</button><button class="btn sm" id="rMan">Mañana</button><span class="grow"></span><button class="btn sm danger" id="rBorrar">Descartar propuestas</button></div>
    <div class="kpis k4" id="rK"></div>
    <div class="seg-wrap"><div id="rL" style="display:grid;gap:12px;align-content:start"></div><div><div id="rMap" class="map full" style="position:sticky;top:90px"></div></div></div>`;
  $('#rF').onchange = e => { F.fecha = e.target.value; go('rutas'); };
  $('#rHoy').onclick = () => { F.fecha = hoy(); go('rutas'); };
  $('#rMan').onclick = () => { F.fecha = sumarDias(hoy(), 1); go('rutas'); };
  await Promise.all([cargarConfig(), cargarUsuarios()]);
  const [rr, rv, ro] = await Promise.all([
    sb.from('ent_rutas').select('*').eq('fecha', F.fecha).neq('estado', 'cancelada').order('created_at'),
    sb.from('ent_vehiculos').select('*').eq('activo', true).order('capacidad_ton', { ascending: false }),
    sb.from('ent_rutas').select('id,patente,estado').eq('fecha', F.fecha).in('estado', ['asignada', 'aceptada', 'en_ruta']),
  ]);
  if (rr.error) { el.innerHTML = `<div class="ctx err">${esc(errMsg(rr.error))}</div>`; return; }
  const rc = rr.data.length ? await sb.from('ent_cargas').select('*').in('ruta_id', rr.data.map(r => r.id)) : { data: [] };
  const rutas = rr.data, cargas = rc.data || [], flota = rv.data || [], ocupados = ro.data || [];
  $('#rBorrar').onclick = async () => {
    const prop = rutas.filter(r => r.estado === 'propuesta'); if (!prop.length) return toast('No hay propuestas');
    if (!confirm(`¿Descartar ${prop.length} ruta(s) propuesta(s)? Sus cargas vuelven a Pendientes.`)) return;
    const ids = prop.map(r => r.id);
    await sb.from('ent_cargas').update({ ruta_id: null, parada: null, estado: 'pendiente' }).in('ruta_id', ids);
    const { error } = await sb.from('ent_rutas').delete().in('id', ids);
    toast(error ? errMsg(error) : 'Propuestas descartadas'); go('rutas');
  };
  const tot = rutas.reduce((a, r) => a + +r.peso_ton, 0);
  $('#rK').innerHTML = `<div class="kpi"><span class="eyebrow">Rutas</span><b>${rutas.length}</b></div><div class="kpi"><span class="eyebrow">Toneladas</span><b>${fmtT(tot)}</b></div><div class="kpi"><span class="eyebrow">Por asignar</span><b>${rutas.filter(r => r.estado === 'propuesta').length}</b></div><div class="kpi"><span class="eyebrow">En ruta</span><b>${rutas.filter(r => r.estado === 'en_ruta').length}</b></div>`;
  const mapa = nuevoMapa($('#rMap')); S.mapa = mapa; const bounds = [];
  if (S.config.planta && mapa) { L.marker([S.config.planta.lat, S.config.planta.lng], { icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: '<div class="mpin" style="background:#111214;width:30px;height:30px">🏭</div>' }) }).bindTooltip('Planta').addTo(mapa); bounds.push([S.config.planta.lat, S.config.planta.lng]); }
  if (!rutas.length) { $('#rL').innerHTML = `<div class="card empty"><b>Sin rutas para el ${fechaCL(F.fecha)}</b>Ve a Pendientes, carga el Excel y presiona “Armar rutas”.<br><button class="btn primary" data-act="go" data-to="pendientes">${I.list}Ir a pendientes</button></div>`; return; }
  const ocupadoPor = (pat, rid) => ocupados.filter(o => o.patente === pat && o.id !== rid).length;
  $('#rL').innerHTML = rutas.map((r, i) => {
    const cs = cargas.filter(c => c.ruta_id === r.id).sort((a, b) => a.parada - b.parada);
    const paradas = [...new Set(cs.map(c => c.parada))].map(n => { const g = cs.filter(c => c.parada === n); return { n, cliente: g[0].cliente, comuna: g[0].comuna, direccion: g[0].direccion, lat: g.find(x => x.dest_lat != null)?.dest_lat, lng: g.find(x => x.dest_lng != null)?.dest_lng, peso: g.reduce((a, b) => a + +b.peso_ton, 0), pedidos: [...new Set(g.map(x => x.pedido).filter(Boolean))].join(', ') }; });
    const color = COLORES[i % COLORES.length];
    if (mapa) {
      const pts = (S.config.planta ? [[S.config.planta.lat, S.config.planta.lng]] : []).concat(paradas.filter(p => p.lat != null).map(p => [p.lat, p.lng]));
      if (pts.length > 1) L.polyline(pts, { color, weight: 4, opacity: .8 }).addTo(mapa);
      paradas.filter(p => p.lat != null).forEach(p => { bounds.push([p.lat, p.lng]); L.marker([p.lat, p.lng], { icon: pin(color, p.n) }).bindPopup(`<b>${esc(r.nombre)} · parada ${p.n}</b><br>${esc(p.cliente)}<br>${esc(p.direccion)}<br>${fmtT(p.peso)} ton`).addTo(mapa); });
    }
    const cap = r.patente ? (flota.find(f => f.patente === r.patente)?.capacidad_ton || r.capacidad_sugerida) : r.capacidad_sugerida;
    const opcion = (f) => {
      const prob = [];
      if (+f.capacidad_ton < +r.peso_ton - 1e-6) prob.push('capacidad insuficiente');
      if (r.requiere_peoneta && !f.peoneta) prob.push('sin peoneta');
      if (!f.disponible) prob.push('no disponible');
      if (ocupadoPor(f.patente, r.id)) prob.push('ya tiene ruta');
      return `<option value="${esc(f.patente)}" ${f.patente === (r.patente || r.patente_sugerida) ? 'selected' : ''} ${prob.length ? 'data-prob="' + esc(prob.join(', ')) + '"' : ''}>${esc(f.patente)} · ${f.capacidad_ton} t${f.peoneta ? ' · peoneta' : ''} · ${esc(f.tipo_flota === 'interna' ? 'Interna' : (f.contratista || 'Externa'))}${prob.length ? ' ⚠ ' + prob.join(', ') : ''}</option>`;
    };
    const habitual = flota.find(f => f.patente === (r.patente || r.patente_sugerida))?.chofer_id;
    return `<div class="card" style="padding:14px;display:grid;gap:10px;border-left:4px solid ${color}" data-ruta="${r.id}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><span class="eyebrow">${fechaCL(r.fecha)}${r.requiere_peoneta ? ' · requiere peoneta' : ''}</span><div style="font-weight:800;font-size:16px">${esc(r.nombre || 'Ruta')} · ${fmtT(r.peso_ton)} ton</div></div>${chipRuta(r.estado)}</div>
      <div class="hbar" style="grid-template-columns:auto minmax(0,1fr) auto;padding:0"><span class="sub">Uso de ${cap || '—'} t</span><span class="b"><i style="width:${Math.min(100, r.peso_ton / (cap || r.peso_ton || 1) * 100)}%"></i></span><span class="mono sub">${cap ? Math.round(r.peso_ton / cap * 100) : 0}%</span></div>
      <ol style="margin:0;padding-left:18px;display:grid;gap:3px;font-size:13px">${paradas.map(p => `<li><b>${esc(p.cliente)}</b> · ${esc(p.comuna || p.direccion)} · ${fmtT(p.peso)} t${p.pedidos ? ` <span class="sub">(${esc(p.pedidos)})</span>` : ''}</li>`).join('')}</ol>
      <div class="sub">${r.distancia_km != null ? `~${r.distancia_km} km de recorrido · ` : ''}sugerido: camión de ${r.capacidad_sugerida || '—'} t${r.patente_sugerida ? ' (' + esc(r.patente_sugerida) + ')' : ''}</div>
      ${r.estado === 'propuesta' ? `
        <div class="fg">${fld('Camión', `<select data-pat>${'<option value="">Elegir camión…</option>' + flota.map(opcion).join('')}</select>`, 1)}${fld('Chofer', `<select data-cho>${optsChoferes(habitual || '', 'Elegir chofer…')}</select>`, 1)}</div>
        <div class="ctx err" data-warn hidden></div>
        <div class="actions"><button class="btn primary" data-asignar>${I.check}Asignar y notificar al chofer</button></div>`
      : `<div class="ctx" style="justify-content:space-between"><span><b class="mono">${esc(r.patente || '')}</b> · ${esc(nombreUsuario(r.chofer_id))}</span><span class="sub">${r.asignada_at ? 'Asignada ' + horaCL(r.asignada_at) : ''}${r.aceptada_at ? ' · aceptada ' + horaCL(r.aceptada_at) : ''}${r.salida_at ? ' · salió ' + horaCL(r.salida_at) : ''}</span></div>
        <div class="actions">${['asignada', 'aceptada'].includes(r.estado) ? `<button class="btn" data-wsp>Avisar por WhatsApp</button><button class="btn danger" data-cancelar>Cancelar asignación</button>` : ''}</div>`}
    </div>`;
  }).join('');
  if (mapa && bounds.length) mapa.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  $$('[data-ruta]', el).forEach(card => {
    const r = rutas.find(x => x.id === card.dataset.ruta);
    const selP = $('[data-pat]', card), selC = $('[data-cho]', card), warn = $('[data-warn]', card);
    const revisar = () => { const o = selP?.selectedOptions[0]; const p = o?.dataset.prob; if (warn) { warn.hidden = !p; warn.textContent = p ? `Atención: ${p}.` : ''; } const f = flota.find(x => x.patente === selP?.value); if (f?.chofer_id && selC && !selC.dataset.tocado) selC.value = f.chofer_id; };
    if (selP) { selP.onchange = revisar; revisar(); }
    if (selC) selC.onchange = () => selC.dataset.tocado = '1';
    const bA = $('[data-asignar]', card);
    if (bA) bA.onclick = async () => {
      if (!selP.value || !selC.value) return toast('Elige camión y chofer');
      const prob = selP.selectedOptions[0]?.dataset.prob;
      if (prob && !confirm(`El camión ${selP.value} tiene observaciones: ${prob}.\n¿Asignar de todas formas?`)) return;
      bA.disabled = true;
      const { data, error } = await sb.rpc('ent_asignar_ruta', { p_ruta: r.id, p_patente: selP.value, p_chofer: selC.value, p_forzar: !!prob });
      if (error) { bA.disabled = false; return toast(errMsg(error)); }
      toast(`Asignada a ${data.chofer}: ${data.guias} guía(s). El chofer fue notificado en la app.`);
      go('rutas');
    };
    const bC = $('[data-cancelar]', card);
    if (bC) bC.onclick = async () => { if (!confirm('¿Cancelar la asignación? La ruta vuelve a “Propuesta” y se avisa al chofer.')) return; const { error } = await sb.rpc('ent_cancelar_ruta', { p_ruta: r.id }); toast(error ? errMsg(error) : 'Asignación cancelada'); go('rutas'); };
    const bW = $('[data-wsp]', card);
    if (bW) bW.onclick = () => {
      const u = S.usuarios.find(x => x.id === r.chofer_id); const tel = (u?.telefono || '').replace(/[^0-9]/g, '');
      const msg = `Hola ${u?.nombre?.split(' ')[0] || ''}, tienes una carga asignada para el ${fechaCL(r.fecha)} en el camión ${r.patente}: ${r.paradas} parada(s), ${fmtT(r.peso_ton)} ton. Preséntate en planta y confírmala en la app: ${location.href.split('#')[0]}`;
      window.open(`https://wa.me/${tel.length === 9 ? '56' + tel : tel}?text=${encodeURIComponent(msg)}`, '_blank');
    };
  });
}

/* ---------- Vista Flota ---------- */
async function vistaFlota(el) {
  await Promise.all([cargarConfig(), cargarUsuarios()]);
  $('#top-actions').innerHTML = `<button class="btn primary" id="fN">${I.plus}<span>Agregar camión</span></button>`;
  const [rv, ro] = await Promise.all([sb.from('ent_vehiculos').select('*').order('tipo_flota').order('contratista').order('capacidad_ton', { ascending: false }), sb.from('ent_rutas').select('patente,estado').eq('fecha', hoy()).in('estado', ['asignada', 'aceptada', 'en_ruta'])]);
  const flota = rv.data || [], ocup = ro.data || [];
  S.fFlota = S.fFlota || { tipo: '', texto: '' };
  const F = S.fFlota;
  const pl = S.config.planta;
  el.innerHTML = `
    <div class="card" style="padding:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px"><span style="font-size:24px">🏭</span><div class="grow" style="flex:1"><b>Planta de carga</b><div class="sub">${pl ? `${esc(pl.nombre || 'Planta')} · ${pl.lat.toFixed(5)}, ${pl.lng.toFixed(5)}` : 'Sin definir: necesaria para armar rutas'}</div></div><button class="btn sm" id="fPl">${I.pin}${pl ? 'Cambiar' : 'Definir'} ubicación</button></div>
    <div class="kpis k4">${[['Camiones', flota.length], ['Flota interna', flota.filter(f => f.tipo_flota === 'interna').length], ['Flota externa', flota.filter(f => f.tipo_flota === 'externa').length], ['Disponibles hoy', flota.filter(f => f.activo && f.disponible && !ocup.some(o => o.patente === f.patente)).length]].map(([l, v]) => `<div class="kpi"><span class="eyebrow">${l}</span><b>${v}</b></div>`).join('')}</div>
    <div class="filters">${fld('Flota', `<select id="fT"><option value="">Todas</option><option value="interna">Interna</option><option value="externa">Externa</option></select>`)}<div class="grow">${fld('Buscar', `<input id="fB" value="${esc(F.texto)}" placeholder="Patente o contratista">`)}</div></div>
    <div class="card tbl-wrap" id="fTab"></div>`;
  $('#fT').value = F.tipo;
  const pintar = () => {
    const t = normTxt(F.texto);
    const lista = flota.filter(f => (!F.tipo || f.tipo_flota === F.tipo) && (!t || normTxt(f.patente + ' ' + (f.contratista || '')).includes(t)));
    $('#fTab').innerHTML = lista.length ? `<table><thead><tr><th>Patente</th><th>Flota</th><th>Contratista</th><th class="r">Capacidad</th><th>Peoneta</th><th>Chofer habitual</th><th>Hoy</th><th>Disponible</th></tr></thead><tbody>
      ${lista.map(f => { const o = ocup.find(x => x.patente === f.patente); return `<tr class="click" data-p="${esc(f.patente)}"><td class="num"><b>${esc(f.patente)}</b>${f.observacion ? `<div class="sub">${esc(f.observacion)}</div>` : ''}</td><td><span class="chip ${f.tipo_flota === 'interna' ? 'brand' : ''}">${f.tipo_flota === 'interna' ? 'Interna' : 'Externa'}</span></td><td>${esc(f.contratista || '')}</td><td class="r num">${f.capacidad_ton ?? '—'} t</td><td>${f.peoneta ? 'Sí' : 'No'}</td><td>${f.chofer_id ? esc(nombreUsuario(f.chofer_id)) : '<span class="sub">—</span>'}</td><td>${!f.activo ? '<span class="chip">Inactivo</span>' : o ? chipRuta(o.estado) : '<span class="chip ok">Libre</span>'}</td><td><input type="checkbox" data-disp="${esc(f.patente)}" ${f.disponible ? 'checked' : ''} style="width:auto"></td></tr>`; }).join('')}</tbody></table>`
      : '<div class="empty"><b>Sin camiones</b>Agrega la flota interna y externa con su capacidad.</div>';
    $$('#fTab tr.click').forEach(tr => tr.onclick = (e) => { if (e.target.matches('input')) return; formCamion(flota.find(f => f.patente === tr.dataset.p)); });
    $$('#fTab [data-disp]').forEach(c => c.onchange = async () => { const { error } = await sb.from('ent_vehiculos').update({ disponible: c.checked }).eq('patente', c.dataset.disp); toast(error ? errMsg(error) : (c.checked ? 'Disponible' : 'Marcado no disponible')); });
  };
  $('#fT').onchange = e => { F.tipo = e.target.value; pintar(); };
  $('#fB').oninput = e => { F.texto = e.target.value; pintar(); };
  $('#fN').onclick = () => formCamion(null);
  $('#fPl').onclick = () => definirPlanta();
  pintar();
}

function formCamion(v) {
  const n = !v; v = v || { activo: true, disponible: true, tipo_flota: 'interna', peoneta: false };
  const sh = openSheet(n ? 'Agregar camión' : `Camión ${esc(v.patente)}`, `<form id="fv" class="form">
    <fieldset><legend>Camión</legend>
      <div class="types" style="grid-template-columns:1fr 1fr">${['interna', 'externa'].map(t => `<label><input type="radio" name="tipo" value="${t}" ${v.tipo_flota === t ? 'checked' : ''}><span>${t === 'interna' ? I.home : I.truck}${t === 'interna' ? 'Flota interna' : 'Flota externa'}<small>${t === 'interna' ? 'Camión propio Grupo TX' : 'Contratista / transportista'}</small></span></label>`).join('')}</div>
      <div class="fg">${fld('Patente', `<input name="patente" required value="${esc(v.patente || '')}" class="mono" style="text-transform:uppercase">`, 1)}${fld('Capacidad (toneladas)', `<input name="capacidad_ton" type="number" step="any" min="0" required value="${v.capacidad_ton ?? ''}">`, 1)}</div>
      <div class="fg">${fld('Contratista', `<input name="contratista" value="${esc(v.contratista || '')}" list="dlCont">`)}${fld('Descripción', `<input name="descripcion" value="${esc(v.descripcion || '')}" placeholder="Rampla, 3/4, pluma…">`)}</div>
      <datalist id="dlCont">${[...new Set((S.vehiculos || []).map(x => x.contratista).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="fg">${fld('Chofer habitual', `<select name="chofer_id">${optsChoferes(v.chofer_id || '', '— Sin chofer fijo —')}</select>`)}${fld('ID en GPSur', `<input name="gpsur_id" value="${esc(v.gpsur_id || '')}">`)}</div>
      ${fld('Observación', `<input name="observacion" value="${esc(v.observacion || '')}">`)}
      <label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" name="peoneta" style="width:auto" ${v.peoneta ? 'checked' : ''}> Incluye servicio de peoneta</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" name="disponible" style="width:auto" ${v.disponible ? 'checked' : ''}> Disponible para asignar</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" name="activo" style="width:auto" ${v.activo ? 'checked' : ''}> Activo</label>
    </fieldset>
    <div class="actions">${!n ? '<button type="button" class="btn danger" id="vDel">Eliminar</button>' : ''}<button class="btn primary">Guardar</button></div></form>`, { eyebrow: 'Flota' });
  const f = $('#fv', sh);
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = { patente: f.patente.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), tipo_flota: f.tipo.value, capacidad_ton: +f.capacidad_ton.value || null, contratista: f.contratista.value.trim() || null, descripcion: f.descripcion.value.trim() || null, chofer_id: f.chofer_id.value || null, gpsur_id: f.gpsur_id.value.trim() || null, observacion: f.observacion.value.trim() || null, peoneta: f.peoneta.checked, disponible: f.disponible.checked, activo: f.activo.checked };
    if (d.patente.length < 4) return toast('Patente inválida');
    const { error } = n ? await sb.from('ent_vehiculos').insert(d) : await sb.from('ent_vehiculos').update(d).eq('patente', v.patente);
    if (error) return toast(error.message.includes('duplicate') ? 'Ya existe un camión con esa patente' : errMsg(error));
    toast('Camión guardado'); closeSheet(); go('flota');
  };
  if ($('#vDel', sh)) $('#vDel', sh).onclick = async () => {
    if (!confirm(`¿Eliminar el camión ${v.patente}? Si tiene historial, mejor desactívalo.`)) return;
    const { error } = await sb.from('ent_vehiculos').delete().eq('patente', v.patente);
    if (error) return toast('No se puede eliminar porque tiene historial; desmarca “Activo”.'); closeSheet(); go('flota');
  };
}

function definirPlanta() {
  const pl = S.config.planta;
  const sh = openSheet('Planta de carga', `<div class="form"><div class="ctx">Toca el mapa en la ubicación de la planta donde los camiones cargan. Desde aquí parten todas las rutas.</div>
    ${fld('Nombre', `<input id="plN" value="${esc(pl?.nombre || 'Planta Morteros TX')}">`)}
    <div class="picker" id="plM" style="height:360px"></div><div class="actions"><button class="btn primary" id="plOk">Guardar</button></div></div>`, { eyebrow: 'Flota' });
  const m = nuevoMapa($('#plM', sh)); let mk = null, pos = pl ? { lat: pl.lat, lng: pl.lng } : null;
  S.sheetCleanup = () => { try { m.remove(); } catch {} };
  const fijar = (lat, lng) => { pos = { lat, lng }; if (mk) mk.setLatLng([lat, lng]); else mk = L.marker([lat, lng], { draggable: true }).addTo(m).on('dragend', e => { const p = e.target.getLatLng(); pos = { lat: p.lat, lng: p.lng }; }); };
  if (pos) { fijar(pos.lat, pos.lng); m.setView([pos.lat, pos.lng], 15); }
  m.on('click', e => fijar(e.latlng.lat, e.latlng.lng));
  $('#plOk', sh).onclick = async () => {
    if (!pos) return toast('Marca la planta en el mapa');
    try { await guardarConfig('planta', { ...pos, nombre: $('#plN', sh).value.trim() }); toast('Planta guardada'); closeSheet(); go('flota'); } catch (e) { toast(errMsg(e)); }
  };
}
