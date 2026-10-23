/* ================== Entregas TX · núcleo + chofer ================== */
const SUPABASE_URL = 'https://xinnonzltoaoptnvkhhy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DoSRSj0wmAR_UIX8tENXXQ_X5BS5a1q';
const DOMINIO_CHOFER = 'choferes.grupotx.cl';
const RADIO_ALERTA_M = 300;        // distancia máxima esperada entre "Llegué" y el destino
const TRACK_MIN_MS = 60000;        // guardar posición cada 60 s ...
const TRACK_MIN_M = 30;            // ... si se movió al menos 30 m (o 200 m antes)

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const fechaCL = (iso) => iso ? new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)) : '';
const fechaLarga = (iso) => new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso));
const horaCL = (iso) => iso ? new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '';
const fechaHoraCL = (iso) => iso ? `${fechaCL(iso)} ${horaCL(iso)}` : '';
const diaCL = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(iso));
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const limpiarRut = (r) => (r || '').replace(/[^0-9kK]/g, '').toLowerCase();
const fmtM = (m) => m == null ? '—' : (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');
const minutos = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 60000) : null;
const iniciales = (n) => (n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const ESTADOS = { asignada: 'Pendiente', en_destino: 'En destino', entregada: 'Entregada', entregada_con_devolucion: 'Con devolución', rechazada: 'Rechazada', anulada: 'Anulada' };
const EST_CHIP = { asignada: '', en_destino: 'warn', entregada: 'ok', entregada_con_devolucion: 'info', rechazada: 'bad', anulada: 'plain' };
const EST_COLOR = { asignada: 'var(--muted)', en_destino: 'var(--warn)', entregada: 'var(--ok)', entregada_con_devolucion: 'var(--info)', rechazada: 'var(--bad)', anulada: 'var(--muted)' };
const badge = (e) => `<span class="chip ${EST_CHIP[e] ?? ''}">${ESTADOS[e] || esc(e)}</span>`;
const COLORES = ['#e4032e', '#2459a8', '#18864a', '#b86e00', '#7a3fb0', '#0e8a9a', '#5e6066', '#c2185b', '#3d5a1e', '#8a5a2b'];
const ROL_CORTO = { admin: 'Admin', logistica: 'Logística', chofer: 'Chofer', pendiente: 'Pendiente' };
function distM(a, b, c, d) { const R = 6371000, r = x => x * Math.PI / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const entregaDe = (g) => Array.isArray(g.ent_entregas) ? g.ent_entregas[0] : g.ent_entregas;

/* ---------- íconos (mismo trazo que Silos TX) ---------- */
const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  home: ic('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  map: ic('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  chart: ic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
  alert: ic('<path d="M12 3l9.5 17h-19L12 3z"/><path d="M12 10v4M12 17.5v.01"/>'),
  truck: ic('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
  clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  doc: ic('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
  check: ic('<path d="M4 12l5 5L20 6"/>'),
  pin: ic('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  download: ic('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  users: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.6 5.2"/>'),
  ret: ic('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  ban: ic('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
  box: ic('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'),
  cam: ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  list: ic('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  tag: ic('<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
  phone: ic('<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>'),
  nav: ic('<path d="M3 11l18-8-8 18-2-8-8-2z"/>'),
  refresh: ic('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
};

/* ---------- interfaz común (shell al estilo Silos TX) ---------- */
let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, m.length > 60 ? 5500 : 3200); }
function banner(m) { const b = $('#banner'); b.textContent = m || ''; b.hidden = !m; }
function errMsg(e) { return (e && (e.message || e.error_description || e.error)) || String(e); }
const fld = (label, inner, req) => `<label class="f"><span>${label}${req ? ' <i>*</i>' : ''}</span>${inner}</label>`;

function openSheet(title, html, opts = {}) {
  closeSheet(true);
  const sh = $('#sheet');
  sh.innerHTML = `<div class="sheet-h"><div>${opts.eyebrow ? `<span class="eyebrow">${opts.eyebrow}</span>` : ''}<h2>${title}</h2></div><button class="xbtn" id="sheet-x" aria-label="Cerrar">${I.x}</button></div>${html}`;
  $('#sheet-bg').hidden = false; document.body.style.overflow = 'hidden';
  $('#sheet-x').onclick = () => (opts.onClose ? opts.onClose() : closeSheet());
  S.sheetClose = opts.onClose || null;
  sh.scrollTop = 0;
  return sh;
}
function closeSheet() {
  if (S.sheetCleanup) { try { S.sheetCleanup(); } catch (e) {} S.sheetCleanup = null; }
  S.sheetClose = null;
  $('#sheet-bg').hidden = true; document.body.style.overflow = '';
}
$('#sheet-bg').addEventListener('click', e => { if (e.target.id === 'sheet-bg') (S.sheetClose ? S.sheetClose() : closeSheet()); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet-bg').hidden) (S.sheetClose ? S.sheetClose() : closeSheet()); });

function pintarLogos() { const l = $('#logo-tpl').innerHTML; $$('[data-logo]').forEach(e => e.innerHTML = l); }

async function traerTodo(fabrica, tam = 1000) {
  let out = [], desde = 0;
  for (;;) {
    const { data, error } = await fabrica().range(desde, desde + tam - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < tam) break;
    desde += tam;
  }
  return out;
}

function descargarCSV(nombre, filas) {
  if (!filas.length) return toast('No hay datos para exportar');
  const cols = Object.keys(filas[0]);
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + [cols.join(';'), ...filas.map(f => cols.map(c => q(f[c])).join(';'))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function obtenerPosicion(timeout = 15000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Este teléfono no permite geolocalización'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      e => rej(new Error(e.code === 1 ? 'Permiso de ubicación denegado. Actívalo en el navegador (candado junto a la dirección) y vuelve a intentar.' : 'No se pudo obtener la ubicación (' + e.message + '). Sal a un lugar abierto y reintenta.')),
      { enableHighAccuracy: true, timeout, maximumAge: 10000 });
  });
}

async function comprimirImagen(file, max = 1400, calidad = 0.78) {
  let fuente;
  try { fuente = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { fuente = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = URL.createObjectURL(file); }); }
  const w = fuente.width, h = fuente.height, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(fuente, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', calidad));
}

async function urlFirmada(path) {
  if (!path) return '';
  const { data } = await sb.storage.from('entregas').createSignedUrl(path, 3600);
  return data?.signedUrl || '';
}

/* mapa con el mismo estilo que Silos TX (calles / satélite, modo oscuro) */
function nuevoMapa(el, opts = {}) {
  if (!window.L) { el.innerHTML = '<div class="empty"><b>Mapa no disponible</b>No se pudo cargar el visor de mapas.</div>'; return null; }
  const m = L.map(el, { zoomControl: !opts.mini, minZoom: 4, maxZoom: 19, scrollWheelZoom: !opts.mini });
  m.attributionControl.setPrefix('');
  m.setView(opts.center || [-33.47, -70.65], opts.zoom || 10);
  const calles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'tiles-calles', attribution: '© OpenStreetMap' }).addTo(m);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imágenes © Esri' });
  if (!opts.mini) {
    const Ctl = L.Control.extend({ onAdd() { const d = L.DomUtil.create('div', 'seg-f map-layers'); d.innerHTML = '<button type="button" aria-pressed="true" data-l="c">Calles</button><button type="button" aria-pressed="false" data-l="s">Satélite</button>';
      L.DomEvent.disableClickPropagation(d);
      d.querySelectorAll('button').forEach(btn => btn.onclick = () => { const s = btn.dataset.l === 's'; if (s) { m.removeLayer(calles); sat.addTo(m); } else { m.removeLayer(sat); calles.addTo(m); } d.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === btn))); });
      return d; } });
    new Ctl({ position: 'topright' }).addTo(m);
  }
  setTimeout(() => m.invalidateSize(), 150);
  return m;
}
const pin = (color, txt = '') => L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="mpin" style="background:${color}">${txt}</div>` });
const pinCamion = () => L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: '<div class="mtruck">🚚</div>' });

async function geocodificar(direccion, comuna) {
  const q = [direccion, comuna, 'Chile'].filter(Boolean).join(', ');
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'es' } });
  const j = await r.json();
  return j && j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
}

/* ---------- estado y navegación ---------- */
const S = { user: null, perfil: null, view: null, modo: null, productos: [], motivos: [], vehiculos: [], usuarios: [], choferes: [] };
let VIEWS = [];

function construirNav() {
  const btn = (v, bottom) => v.act
    ? `<button class="navbtn cta" data-act="${v.act}" aria-label="${v.label}">${v.icon}${bottom ? '' : `<span>${v.label}</span>`}</button>`
    : `<button class="navbtn" data-view="${v.id}" aria-label="${v.label}">${v.icon}<span>${v.label}</span></button>`;
  const rail = VIEWS.filter(v => !v.act).concat(VIEWS.filter(v => v.act));
  $('#nav-rail').innerHTML = rail.map(v => btn(v, false)).join('');
  $('#nav-bottom').innerHTML = VIEWS.filter(v => v.bottom).sort((a, b) => (a.bo ?? 0) - (b.bo ?? 0)).map(v => btn(v, true)).join('');
  $$('.navbtn[data-view]').forEach(b => b.onclick = () => go(b.dataset.view));
}
function go(v) {
  const def = VIEWS.find(x => x.id === v && x.render) || VIEWS.find(x => x.render);
  S.view = def.id;
  clearInterval(S.timer); S.timer = null;
  if (S.mapa) { try { S.mapa.remove(); } catch {} S.mapa = null; }
  $$('.navbtn[data-view]').forEach(b => b.dataset.view === def.id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('#view-title').textContent = def.title;
  $('#top-actions').innerHTML = '';
  try { localStorage.setItem('entregastx.view.' + S.modo, def.id); } catch {}
  const el = $('#view'); el.innerHTML = '<div class="card empty"><b>Cargando…</b></div>';
  window.scrollTo(0, 0);
  def.render(el);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'nueva-guia' && typeof editarGuia === 'function') editarGuia(null, () => go(S.view));
  if (a === 'go') go(t.dataset.to);
  if (a === 'ver-guia' && typeof verEntrega === 'function') verEntrega(t.dataset.id);
});

function montarShell(modo) {
  S.modo = modo;
  $('#splash').hidden = true; $('#auth').hidden = true; $('#app-shell').hidden = false;
  const p = S.perfil;
  $('#user-chip').innerHTML = `<span class="av">${esc(iniciales(p.nombre))}</span><span class="un"><b>${esc(p.nombre || '')}</b><small>${modo === 'chofer' && p.rol === 'admin' ? 'Vista chofer' : ROL_CORTO[p.rol]}</small></span>`;
  $('#user-chip').onclick = menuUsuario;
  construirNav();
  let v = null; try { v = localStorage.getItem('entregastx.view.' + modo); } catch {}
  go(v);
}

function menuUsuario() {
  const p = S.perfil, staff = ['logistica', 'admin'].includes(p.rol);
  const extra = S.modo === 'staff' ? [
    ['devoluciones', I.ret, 'Devoluciones', 'Motivos y productos devueltos'],
    ['usuarios', I.users, 'Choferes y usuarios', 'Crear choferes, roles y claves'],
    ['catalogos', I.tag, 'Catálogos', 'Productos, motivos y vehículos'],
  ] : [];
  const sh = openSheet(esc(p.nombre || ''), `
    <div class="card" style="padding:14px;display:grid;gap:6px"><div class="sub">${esc(p.email?.endsWith('@' + DOMINIO_CHOFER) ? 'RUT ' + (p.rut || '') : (p.email || ''))}</div><div>Perfil: <b>${ROL_CORTO[p.rol]}</b></div>
      ${S.modo === 'chofer' && S.jornada ? `<div>Patente de la jornada: <b class="mono">${esc(S.jornada.patente)}</b></div>` : ''}</div>
    ${extra.length ? `<div class="menu block">${extra.map(([id, icn, t, s]) => `<button data-ir="${id}">${icn}<span>${t}<small>${s}</small></span></button>`).join('')}</div>` : ''}
    <div class="menu block">
      ${S.modo === 'chofer' && S.jornada ? `<button id="m-pat">${I.truck}<span>Cambiar patente<small>Si cambiaste de camión</small></span></button><button id="m-fin">${I.clock}<span>Terminar jornada<small>Deja de registrar tu ubicación</small></span></button>` : ''}
      ${p.rol === 'admin' && S.modo === 'staff' ? `<button id="m-chofer">${I.truck}<span>Probar vista chofer<small>Ver la app como la ve un chofer</small></span></button>` : ''}
      ${staff && S.modo === 'chofer' ? `<button id="m-staff">${I.home}<span>Volver a Logística</span></button>` : ''}
    </div>
    <div class="actions block"><button class="btn danger" id="m-out">Cerrar sesión</button></div>`, { eyebrow: 'Mi cuenta' });
  $$('[data-ir]', sh).forEach(b => b.onclick = () => { closeSheet(); go(b.dataset.ir); });
  $('#m-out', sh).onclick = async () => { closeSheet(); await sb.auth.signOut(); };
  if ($('#m-pat', sh)) $('#m-pat', sh).onclick = () => { closeSheet(); pedirPatente(true); };
  if ($('#m-fin', sh)) $('#m-fin', sh).onclick = terminarJornada;
  if ($('#m-chofer', sh)) $('#m-chofer', sh).onclick = () => { closeSheet(); iniciarChofer(); };
  if ($('#m-staff', sh)) $('#m-staff', sh).onclick = () => { closeSheet(); detenerTracking(); iniciarStaff(); };
}

/* ================== AUTENTICACIÓN ================== */
function pantallaAuth(modo = 'chofer', msg = '') {
  $('#splash').hidden = true; $('#app-shell').hidden = true; $('#auth').hidden = false;
  const titulos = { chofer: 'Ingreso choferes', staff: 'Ingreso personal TX', signup: 'Crear cuenta', reset: 'Recuperar contraseña', newpass: 'Nueva contraseña' };
  const f = $('#auth .auth-form');
  f.innerHTML = `
    <h2>${titulos[modo]}</h2>
    ${['chofer', 'staff'].includes(modo) ? `<div class="seg-f" style="width:100%;display:grid;grid-template-columns:1fr 1fr"><button type="button" data-m="chofer" aria-pressed="${modo === 'chofer'}">Soy chofer</button><button type="button" data-m="staff" aria-pressed="${modo === 'staff'}">Personal TX</button></div>` : ''}
    ${msg ? `<div class="ctx">${msg}</div>` : ''}
    <form id="af" class="form" novalidate style="gap:12px">
      ${modo === 'signup' ? fld('Nombre y apellido', '<input id="a-nombre" autocomplete="name">', 1) : ''}
      ${modo === 'chofer' ? fld('RUT', '<input id="a-rut" autocomplete="username" placeholder="12.345.678-9">', 1) : ''}
      ${['staff', 'signup', 'reset'].includes(modo) ? fld('Correo', '<input id="a-email" type="email" autocomplete="email" inputmode="email" placeholder="nombre@grupotx.cl">', 1) : ''}
      ${modo !== 'reset' ? fld(modo === 'newpass' ? 'Nueva contraseña' : 'Contraseña', `<input id="a-pass" type="password" autocomplete="${['chofer', 'staff'].includes(modo) ? 'current-password' : 'new-password'}">`, 1) : ''}
      <div class="ctx err" id="a-err" hidden></div>
      <button class="btn primary" id="a-go" style="width:100%;padding:13px">${{ chofer: 'Ingresar', staff: 'Ingresar', signup: 'Crear cuenta', reset: 'Enviar enlace', newpass: 'Guardar contraseña' }[modo]}</button>
    </form>
    <div class="auth-links">${modo === 'staff' ? '<button data-m="signup">Crear cuenta</button><button data-m="reset">Olvidé mi contraseña</button>'
      : modo === 'chofer' ? '<span class="sub">Tu cuenta la crea Logística. Si olvidaste tu clave, pídeles que la restablezcan.</span>'
      : '<button data-m="staff">Volver a ingresar</button>'}</div>`;
  $$('[data-m]', f).forEach(b => b.onclick = () => pantallaAuth(b.dataset.m));
  const err = (m) => { const e = $('#a-err'); e.textContent = m; e.hidden = !m; };
  $('#af').onsubmit = async (ev) => {
    ev.preventDefault(); err('');
    const go = $('#a-go'); go.disabled = true;
    try {
      const pass = $('#a-pass')?.value || '';
      if (modo === 'chofer' || modo === 'staff') {
        const email = modo === 'chofer' ? `${limpiarRut($('#a-rut').value)}@${DOMINIO_CHOFER}` : $('#a-email').value.trim().toLowerCase();
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw new Error(error.message.includes('Invalid') ? (modo === 'chofer' ? 'RUT o clave incorrectos' : 'Correo o contraseña incorrectos') : error.message);
        await cargarPerfil(data.user);
      } else if (modo === 'signup') {
        if (pass.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
        const { data, error } = await sb.auth.signUp({ email: $('#a-email').value.trim().toLowerCase(), password: pass, options: { data: { nombre: $('#a-nombre').value.trim() } } });
        if (error) throw error;
        if (data.session) await cargarPerfil(data.user); else pantallaAuth('staff', 'Cuenta creada. Revisa tu correo para confirmarla y luego ingresa.');
      } else if (modo === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail($('#a-email').value.trim(), { redirectTo: location.href.split('#')[0] });
        if (error) throw error;
        pantallaAuth('staff', 'Te enviamos un correo con el enlace para crear una nueva contraseña.');
      } else if (modo === 'newpass') {
        if (pass.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
        const { data, error } = await sb.auth.updateUser({ password: pass });
        if (error) throw error;
        toast('Contraseña actualizada'); await cargarPerfil(data.user);
      }
    } catch (e) { err(errMsg(e)); }
    go.disabled = false;
  };
  setTimeout(() => $('#af input')?.focus(), 50);
}

function pantallaPendiente(msg) {
  $('#splash').hidden = true; $('#app-shell').hidden = true; $('#auth').hidden = false;
  $('#auth .auth-form').innerHTML = `<h2>${S.perfil && !S.perfil.activo ? 'Cuenta bloqueada' : 'Cuenta en revisión'}</h2>
    <p class="muted" style="margin:0">Hola ${esc(S.perfil?.nombre || '')}. ${esc(msg)}</p>
    <div style="display:grid;gap:10px;margin-top:6px"><button class="btn primary" id="p-retry">Ya me asignaron perfil</button><button class="btn" id="p-out">Cerrar sesión</button></div>`;
  $('#p-retry').onclick = async () => { const { data } = await sb.auth.getSession(); if (data.session) cargarPerfil(data.session.user); };
  $('#p-out').onclick = () => sb.auth.signOut();
}

async function cargarPerfil(user) {
  S.user = user;
  const { data, error } = await sb.rpc('ent_registrarme', { p_nombre: user.user_metadata?.nombre || null });
  if (error) return pantallaAuth('staff', 'No se pudo cargar tu perfil: ' + esc(errMsg(error)));
  S.perfil = data;
  if (!data.activo) return pantallaPendiente('Tu acceso fue desactivado. Habla con Logística.');
  if (data.rol === 'pendiente') return pantallaPendiente('Tu cuenta está creada. Un administrador debe asignarte un perfil (Chofer, Logística o Admin) para que puedas usar la aplicación.');
  await cargarCatalogos();
  if (data.rol === 'chofer') return iniciarChofer();
  return iniciarStaff();
}

async function cargarCatalogos() {
  const [p, m, v] = await Promise.all([
    sb.from('ent_productos').select('*').order('codigo'),
    sb.from('ent_motivos').select('*').order('id'),
    sb.from('ent_vehiculos').select('*').order('patente'),
  ]);
  S.productos = p.data || []; S.motivos = m.data || []; S.vehiculos = v.data || [];
}

async function iniciar() {
  pintarLogos();
  $('#auth-art2').innerHTML = `<div style="display:flex;gap:18px;align-items:end;color:#f3f3f1;opacity:.9">${[56, 76, 56].map(w => `<svg viewBox="0 0 24 24" style="width:${w}px;height:${w}px" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2" stroke="#e4032e"/><circle cx="17" cy="18" r="2" stroke="#e4032e"/></svg>`).join('')}</div>`;
  let recuperando = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') { recuperando = true; pantallaAuth('newpass'); }
    if (ev === 'SIGNED_OUT') { detenerTracking(); S.user = S.perfil = null; S.jornada = null; pantallaAuth('chofer'); }
  });
  const { data } = await sb.auth.getSession();
  if (recuperando && data.session) return pantallaAuth('newpass');
  if (data.session) await cargarPerfil(data.session.user);
  else pantallaAuth('chofer');
}

/* ================== VISTA CHOFER ================== */
const J_KEY = 'entx_jornada';
function jornadaLocal() { try { const j = JSON.parse(localStorage.getItem(J_KEY) || 'null'); return j && j.uid === S.perfil.id && j.fecha === hoy() ? j : null; } catch { return null; } }
function guardarJornada(j) { try { j ? localStorage.setItem(J_KEY, JSON.stringify(j)) : localStorage.removeItem(J_KEY); } catch {} }

async function iniciarChofer() {
  VIEWS = [
    { id: 'ruta', label: 'Mi ruta', icon: I.truck, title: 'Mi ruta de hoy', bottom: true, render: vistaRuta },
    { id: 'historial', label: 'Historial', icon: I.list, title: 'Mis entregas', bottom: true, render: vistaHistorial },
  ];
  let j = jornadaLocal();
  if (!j) {
    const { data } = await sb.from('ent_jornadas').select('*').eq('chofer_id', S.perfil.id).eq('fecha', hoy()).is('fin_at', null).order('inicio_at', { ascending: false }).limit(1);
    if (data && data[0]) { j = { uid: S.perfil.id, fecha: hoy(), patente: data[0].patente, id: data[0].id }; guardarJornada(j); }
  }
  S.jornada = j;
  montarShell('chofer');
  if (j) iniciarTracking();
}

function topChofer() {
  $('#top-actions').innerHTML = S.jornada
    ? `<span class="gps" id="gpsInd"></span><button class="pat" id="bPat" title="Cambiar patente">${esc(S.jornada.patente)}</button>`
    : '';
  if ($('#bPat')) $('#bPat').onclick = () => pedirPatente(true);
  pintarGps();
}

function pedirPatente(cambio = false) {
  const opciones = S.vehiculos.filter(v => v.activo).map(v => `<option value="${esc(v.patente)}">${esc(v.descripcion || '')}</option>`).join('');
  const html = `<form id="fpat" class="form">
      <fieldset><legend>Vehículo</legend>
        <p class="muted" style="margin:0">${cambio ? 'Ingresa la nueva patente del camión.' : 'Para comenzar, ingresa la patente del camión que manejas hoy. Tu nombre se completa solo con tu cuenta.'}</p>
        ${fld('Patente', `<input id="p-pat" class="pat-in" list="lpat" required placeholder="ABCD12" autocomplete="off" value="${esc(S.jornada?.patente || '')}"><datalist id="lpat">${opciones}</datalist>`, 1)}
        <div class="ctx">${I.pin}<span>Mientras la app esté abierta se registra tu ubicación para mostrar el trayecto a Logística.</span></div>
      </fieldset>
      <button class="btn primary xl">${I.truck}${cambio ? 'Cambiar patente' : 'Iniciar jornada'}</button>
    </form>`;
  let box;
  if (cambio) box = openSheet('Cambiar patente', html, { eyebrow: 'Jornada' });
  else { box = $('#view'); box.innerHTML = `<div style="max-width:520px;margin:0 auto">${html}</div>`; }
  $('#fpat', box).onsubmit = async (ev) => {
    ev.preventDefault();
    const pat = $('#p-pat', box).value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pat.length < 5) return toast('Patente inválida');
    if (S.jornada?.id) await sb.from('ent_jornadas').update({ fin_at: new Date().toISOString() }).eq('id', S.jornada.id);
    const { data, error } = await sb.from('ent_jornadas').insert({ chofer_id: S.perfil.id, patente: pat }).select().single();
    if (error) return toast(errMsg(error));
    S.jornada = { uid: S.perfil.id, fecha: hoy(), patente: pat, id: data.id };
    guardarJornada(S.jornada);
    if (cambio) closeSheet();
    toast('Jornada iniciada con ' + pat);
    iniciarTracking();
    go(S.view || 'ruta');
  };
}

async function terminarJornada() {
  if (!confirm('¿Terminar la jornada? Se deja de registrar tu ubicación.')) return;
  if (S.jornada?.id) await sb.from('ent_jornadas').update({ fin_at: new Date().toISOString() }).eq('id', S.jornada.id);
  guardarJornada(null); S.jornada = null; detenerTracking(); closeSheet(); go('ruta');
}

/* --- tracking del celular --- */
const T = { watch: null, ultimo: null, estado: 'off', wake: null };
function iniciarTracking() {
  if (T.watch != null || !navigator.geolocation) return;
  T.watch = navigator.geolocation.watchPosition(async (p) => {
    T.estado = 'on'; pintarGps();
    const pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, vel: p.coords.speed, t: Date.now() };
    S.posActual = pos;
    const u = T.ultimo;
    const d = u ? distM(u.lat, u.lng, pos.lat, pos.lng) : Infinity;
    if (!u || (pos.t - u.t >= TRACK_MIN_MS && d >= TRACK_MIN_M) || d >= 200) {
      if (pos.acc > 500) return;
      T.ultimo = pos;
      const { error } = await sb.from('ent_posiciones').insert({ chofer_id: S.perfil.id, patente: S.jornada?.patente, lat: pos.lat, lng: pos.lng, precision_m: Math.round(pos.acc), velocidad_kmh: pos.vel != null ? Math.round(pos.vel * 3.6) : null, fuente: 'celular' });
      if (error) console.warn('posición', error.message);
    }
  }, (e) => { T.estado = 'err'; pintarGps(); console.warn(e); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 60000 });
  pedirWakeLock();
}
function detenerTracking() { if (T.watch != null) navigator.geolocation.clearWatch(T.watch); T.watch = null; T.estado = 'off'; }
async function pedirWakeLock() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') T.wake = await navigator.wakeLock.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.modo === 'chofer') { pedirWakeLock(); if (S.view === 'ruta' && $('#sheet-bg').hidden) go('ruta'); } });
function pintarGps() {
  const el = $('#gpsInd'); if (!el) return;
  el.className = 'gps ' + (T.estado === 'on' ? 'on' : T.estado === 'err' ? 'err' : '');
  el.innerHTML = `<i></i>${T.estado === 'on' ? 'GPS activo' : T.estado === 'err' ? 'Sin GPS' : 'GPS…'}`;
}

function tarjetaGuia(g, conAcciones = true) {
  const nav = g.dest_lat ? `${g.dest_lat},${g.dest_lng}` : encodeURIComponent([g.direccion, g.comuna].filter(Boolean).join(', '));
  return `<div class="card gcard ${g.estado}" data-id="${g.id}">
    <div class="top"><div><span class="eyebrow">${g.orden ? 'Parada ' + g.orden + ' · ' : ''}Guía</span><div class="folio">${esc(g.folio)}</div></div>${badge(g.estado)}</div>
    <div class="cli">${esc(g.cliente)}${g.obra ? ` <span class="muted" style="font-weight:500">· ${esc(g.obra)}</span>` : ''}</div>
    <div class="dir">${I.pin}<span>${esc(g.direccion)}${g.comuna ? ', ' + esc(g.comuna) : ''}</span></div>
    ${g.contacto || g.telefono ? `<div class="sub">${esc(g.contacto || '')}${g.telefono ? ` · <a href="tel:${esc(g.telefono)}">${esc(g.telefono)}</a>` : ''}</div>` : ''}
    ${g.detalle ? `<div class="det">${esc(g.detalle)}</div>` : ''}
    ${g.observacion ? `<div class="sub"><b>Obs:</b> ${esc(g.observacion)}</div>` : ''}
    ${g.fecha !== hoy() ? `<div class="sub" style="color:var(--bad)">Guía del ${fechaCL(g.fecha)}</div>` : ''}
    ${conAcciones ? `<div class="act">
      ${g.estado === 'asignada' ? `
        <a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${nav}">${I.nav}Google Maps</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://waze.com/ul?${g.dest_lat ? 'll=' + nav : 'q=' + nav}&navigate=yes">${I.nav}Waze</a>
        <button class="btn primary xl" data-acc="llegue">${I.pin}Llegué al destino</button>` : ''}
      ${g.estado === 'en_destino' ? `<button class="btn okb xl" data-acc="registrar">${I.box}Registrar entrega</button>` : ''}
    </div>` : ''}
  </div>`;
}

async function vistaRuta(el) {
  if (!S.jornada) { topChofer(); return pedirPatente(false); }
  topChofer();
  const { data, error } = await sb.from('ent_guias').select('*')
    .eq('chofer_id', S.perfil.id).neq('estado', 'anulada')
    .or(`fecha.eq.${hoy()},estado.in.(asignada,en_destino)`)
    .order('fecha').order('orden').order('created_at');
  if (error) { el.innerHTML = `<div class="ctx err">${esc(errMsg(error))}</div>`; return; }
  S.guiasChofer = data;
  const pend = data.filter(g => ['asignada', 'en_destino'].includes(g.estado));
  const hechas = data.filter(g => !['asignada', 'en_destino'].includes(g.estado));
  const tot = data.length || 1;
  const n = (e) => data.filter(g => g.estado === e).length;
  el.innerHTML = `
    <div class="hero" style="grid-template-columns:minmax(0,1fr)">
      <div>
        <span class="eyebrow" style="color:color-mix(in srgb,var(--bg) 70%,transparent)">${esc(S.perfil.nombre)} · ${fechaLarga(hoy())}</span>
        <div class="big" style="margin-top:12px">
          <div class="red"><b>${pend.length}</b><span>Por entregar</span></div>
          <div><b>${hechas.length}</b><span>Completadas</span></div>
          <div style="opacity:.75"><b>${data.length}</b><span>Guías hoy</span></div>
        </div>
        <div class="ratio">${['entregada', 'entregada_con_devolucion', 'rechazada', 'en_destino'].map(e => `<i style="width:${n(e) / tot * 100}%;background:${EST_COLOR[e]}"></i>`).join('')}</div>
        <div class="legend"><span style="--c:var(--ok)">Entregadas ${n('entregada')}</span><span style="--c:var(--info)">Con devolución ${n('entregada_con_devolucion')}</span><span style="--c:var(--bad)">Rechazadas ${n('rechazada')}</span><span style="--c:var(--warn)">En destino ${n('en_destino')}</span></div>
      </div>
    </div>
    <div class="sec-h"><div><h2>Por entregar</h2><p>En el orden en que Logística las asignó.</p></div><button class="btn sm" id="bRef">${I.refresh}Actualizar</button></div>
    <div class="grid" style="gap:12px">${pend.length ? pend.map(g => tarjetaGuia(g)).join('') : `<div class="card empty"><b>No tienes entregas pendientes</b>Si esperas guías, pide a Logística que te las asigne y presiona Actualizar.</div>`}</div>
    ${hechas.length ? `<div class="sec-h block"><div><h2>Completadas hoy</h2></div></div><div class="grid" style="gap:12px">${hechas.map(g => tarjetaGuia(g, false)).join('')}</div>` : ''}`;
  $('#bRef').onclick = () => go('ruta');
  $$('[data-acc=llegue]', el).forEach(b => b.onclick = () => marcarLlegada(b.closest('.gcard').dataset.id, b));
  $$('[data-acc=registrar]', el).forEach(b => b.onclick = () => formEntrega(S.guiasChofer.find(g => g.id === b.closest('.gcard').dataset.id)));
}

async function vistaHistorial(el) {
  topChofer();
  const desde = sumarDias(hoy(), -14);
  const { data, error } = await sb.from('ent_guias').select('*, ent_entregas(*)').eq('chofer_id', S.perfil.id).gte('fecha', desde).not('estado', 'in', '(asignada,en_destino,anulada)').order('fecha', { ascending: false }).order('orden');
  if (error) { el.innerHTML = `<div class="ctx err">${esc(errMsg(error))}</div>`; return; }
  el.innerHTML = `<div class="sec-h"><div><h2>Últimos 14 días</h2><p>${data.length} entregas registradas.</p></div></div>
    <div class="card tbl-wrap">${data.length ? `<table><thead><tr><th>Fecha</th><th>Guía</th><th>Cliente</th><th>Llegada</th><th>Recibió</th><th>Estado</th></tr></thead><tbody>
    ${data.map(g => { const e = entregaDe(g) || {}; return `<tr><td class="num">${fechaCL(g.fecha)}</td><td class="num"><b>${esc(g.folio)}</b></td><td>${esc(g.cliente)}</td><td class="num">${horaCL(e.llegada_at)}</td><td>${esc(e.receptor_nombre || '')}</td><td>${badge(g.estado)}</td></tr>`; }).join('')}
    </tbody></table>` : '<div class="empty"><b>Sin entregas</b>Aún no registras entregas en este período.</div>'}</div>`;
}

async function marcarLlegada(id, btn) {
  const g = S.guiasChofer.find(x => x.id === id);
  if (!confirm(`¿Confirmas que llegaste a ${g.cliente || 'destino'} (guía ${g.folio})?`)) return;
  btn.disabled = true; btn.innerHTML = `${I.pin}Obteniendo ubicación…`;
  try {
    const pos = await obtenerPosicion();
    const { data, error } = await sb.rpc('ent_marcar_llegada', { p_guia: id, p_patente: S.jornada.patente, p_lat: pos.lat, p_lng: pos.lng, p_precision: Math.round(pos.acc) });
    if (error) throw error;
    if (data.distancia_destino_m != null && data.distancia_destino_m > RADIO_ALERTA_M) toast(`Llegada registrada. Ojo: estás a ${fmtM(data.distancia_destino_m)} del destino informado.`);
    else toast('Llegada registrada');
    g.estado = 'en_destino';
    go('ruta');
    formEntrega(g);
  } catch (e) {
    toast(errMsg(e)); btn.disabled = false; btn.innerHTML = `${I.pin}Llegué al destino`;
  }
}

/* --- formulario de entrega (hoja lateral, igual que los formularios de Silos TX) --- */
function formEntrega(g) {
  const F = { fotos: [], resultado: 'entregada', devs: [] };
  const optsProd = '<option value="">Selecciona producto…</option>' + S.productos.filter(p => p.activo).map(p => `<option value="${esc(p.codigo)}">${esc(p.codigo)} — ${esc(p.descripcion)}</option>`).join('');
  const optsMot = '<option value="">Motivo…</option>' + S.motivos.filter(m => m.activo).map(m => `<option>${esc(m.motivo)}</option>`).join('');
  const salir = () => { if (confirm('¿Salir sin guardar? La llegada ya quedó registrada; puedes completar la entrega después.')) { F.fotos.forEach(f => URL.revokeObjectURL(f.url)); closeSheet(); } };
  const sh = openSheet(`Guía ${esc(g.folio)}`, `
    <div class="ctx" style="margin-bottom:16px"><b>${esc(g.cliente)}</b>${g.obra ? ' · ' + esc(g.obra) : ''}<span class="sub" style="width:100%">${esc(g.direccion)}${g.comuna ? ', ' + esc(g.comuna) : ''}</span><span class="chip dark plain">Chofer: ${esc(S.perfil.nombre)}</span><span class="chip dark plain mono">${esc(S.jornada.patente)}</span></div>
    <div class="form" id="fEntrega">
      <fieldset><legend>1 · Fotos de la mercadería</legend>
        <div class="photos" id="fotos"></div>
        <input type="file" id="inFoto" accept="image/*" capture="environment" hidden>
        <div class="sub">Toma al menos una foto de la carga descargada (máx. 6).</div>
      </fieldset>
      <fieldset><legend>2 · Resultado</legend>
        <div class="types" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <label><input type="radio" name="res" value="entregada" checked><span>${I.check}Conforme<small>Todo recibido</small></span></label>
          <label><input type="radio" name="res" value="entregada_con_devolucion"><span>${I.ret}Con devolución<small>Parte vuelve</small></span></label>
          <label><input type="radio" name="res" value="rechazada"><span>${I.ban}Rechazo<small>No recibe</small></span></label>
        </div>
        <div id="devBox" hidden style="display:grid;gap:10px">
          <div class="sub">Detalla cada producto devuelto:</div>
          <div id="devs" style="display:grid;gap:10px"></div>
          <div><button class="btn sm" id="bAddDev" type="button">${I.plus}Agregar producto</button></div>
        </div>
      </fieldset>
      <fieldset><legend>3 · Quién recibe</legend>
        ${fld('Nombre completo', '<input id="rNom" autocomplete="off">', 1)}
        <div class="fg">${fld('RUT', '<input id="rRut" autocomplete="off" placeholder="12.345.678-9">')}${fld('Cargo', '<input id="rCargo" autocomplete="off" placeholder="Bodeguero, jefe de obra…">')}</div>
        ${fld('Teléfono', '<input id="rTel" type="tel" autocomplete="off">')}
        ${fld('Observaciones', '<textarea id="rObs" placeholder="Opcional"></textarea>')}
      </fieldset>
      <fieldset><legend>4 · Firma de quien recibe</legend>
        <canvas class="firma" id="firma"></canvas>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="sub">Firma con el dedo dentro del recuadro</span><button class="btn sm" id="bLimpiar" type="button">Limpiar</button></div>
      </fieldset>
      <button class="btn okb xl" id="bConfirmar">${I.check}Confirmar entrega</button>
    </div>`, { eyebrow: 'Registrar entrega', onClose: salir });

  const pintarFotos = () => {
    $('#fotos', sh).innerHTML = F.fotos.map((f, i) => `<div class="ph"><img src="${f.url}" alt="foto ${i + 1}"><button data-i="${i}" aria-label="Quitar" type="button">${I.x}</button></div>`).join('')
      + (F.fotos.length < 6 ? `<button type="button" class="addph" id="bFoto">${I.cam}Agregar foto</button>` : '');
    $$('#fotos .ph button', sh).forEach(b => b.onclick = () => { URL.revokeObjectURL(F.fotos[b.dataset.i].url); F.fotos.splice(+b.dataset.i, 1); pintarFotos(); });
    const bf = $('#bFoto', sh); if (bf) bf.onclick = () => $('#inFoto', sh).click();
  };
  $('#inFoto', sh).onchange = async (ev) => {
    const file = ev.target.files[0]; ev.target.value = '';
    if (!file) return;
    try { const blob = await comprimirImagen(file); F.fotos.push({ blob, url: URL.createObjectURL(blob) }); pintarFotos(); }
    catch { toast('No se pudo leer la foto'); }
  };
  pintarFotos();

  const pintarDevs = () => {
    $('#devs', sh).innerHTML = F.devs.map((d, i) => `<div class="devl" data-i="${i}">
      <div class="w">${fld('Producto', `<select data-k="codigo">${optsProd}</select>`, 1)}</div>
      ${fld('Cantidad', '<input data-k="cantidad" type="number" inputmode="decimal" min="0" step="any">', 1)}
      ${fld('Motivo', `<select data-k="motivo">${optsMot}</select>`, 1)}
      <button class="rep-x" data-del="${i}" type="button" aria-label="Quitar">×</button>
      <div class="w" style="grid-column:1/-1">${fld('Comentario', '<input data-k="comentario" placeholder="Opcional">')}</div></div>`).join('');
    $$('#devs .devl', sh).forEach(div => {
      const d = F.devs[+div.dataset.i];
      $$('[data-k]', div).forEach(inp => { inp.value = d[inp.dataset.k] ?? ''; inp.oninput = inp.onchange = () => d[inp.dataset.k] = inp.value; });
    });
    $$('#devs [data-del]', sh).forEach(b => b.onclick = () => { F.devs.splice(+b.dataset.del, 1); pintarDevs(); });
  };
  $('#bAddDev', sh).onclick = () => { F.devs.push({ codigo: '', cantidad: '', motivo: '', comentario: '' }); pintarDevs(); };
  $$('input[name=res]', sh).forEach(r => r.onchange = () => {
    F.resultado = r.value;
    const conDev = F.resultado !== 'entregada';
    $('#devBox', sh).hidden = !conDev;
    if (conDev && !F.devs.length) { F.devs.push({ codigo: '', cantidad: '', motivo: '', comentario: '' }); pintarDevs(); }
  });

  const pad = crearFirma($('#firma', sh));
  $('#bLimpiar', sh).onclick = () => pad.limpiar();

  $('#bConfirmar', sh).onclick = async () => {
    const nom = $('#rNom', sh).value.trim();
    if (!F.fotos.length) return toast('Falta al menos una foto de la mercadería');
    if (!nom) return toast('Falta el nombre de quien recibe');
    if (pad.vacia()) return toast('Falta la firma de quien recibe');
    let devs = [];
    if (F.resultado !== 'entregada') {
      devs = F.devs.filter(d => d.codigo || d.cantidad || d.motivo);
      if (F.resultado === 'entregada_con_devolucion' && !devs.length) return toast('Indica al menos un producto devuelto');
      for (const d of devs) if (!d.codigo || !(+d.cantidad > 0) || !d.motivo) return toast('Cada devolución necesita producto, cantidad y motivo');
    }
    if (!confirm('¿Confirmar y enviar la entrega?')) return;
    const btn = $('#bConfirmar', sh); btn.disabled = true;
    try {
      const ts = Date.now(), paths = [];
      for (let i = 0; i < F.fotos.length; i++) {
        btn.textContent = `Subiendo foto ${i + 1} de ${F.fotos.length}…`;
        const p = `${g.id}/foto_${ts}_${i + 1}.jpg`;
        const { error } = await sb.storage.from('entregas').upload(p, F.fotos[i].blob, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
        paths.push(p);
      }
      btn.textContent = 'Subiendo firma…';
      const firmaPath = `${g.id}/firma_${ts}.png`;
      const { error: ef } = await sb.storage.from('entregas').upload(firmaPath, await pad.blob(), { contentType: 'image/png', upsert: true });
      if (ef) throw ef;
      btn.textContent = 'Guardando…';
      let pos = S.posActual;
      if (!pos || Date.now() - pos.t > 120000) { try { pos = await obtenerPosicion(8000); } catch { pos = null; } }
      const { error } = await sb.rpc('ent_cerrar_entrega', {
        p_guia: g.id, p_resultado: F.resultado, p_fotos: paths, p_receptor_nombre: nom,
        p_receptor_rut: $('#rRut', sh).value.trim() || null, p_receptor_cargo: $('#rCargo', sh).value.trim() || null,
        p_receptor_telefono: $('#rTel', sh).value.trim() || null, p_firma_path: firmaPath, p_observacion: $('#rObs', sh).value.trim() || null,
        p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null,
        p_devoluciones: devs.map(d => ({ codigo: d.codigo, cantidad: +d.cantidad, motivo: d.motivo, comentario: d.comentario || null })),
      });
      if (error) throw error;
      F.fotos.forEach(f => URL.revokeObjectURL(f.url));
      closeSheet();
      toast('Entrega registrada');
      go('ruta');
    } catch (e) {
      toast('No se pudo guardar: ' + errMsg(e) + '. Revisa tu señal y reintenta.');
      btn.disabled = false; btn.innerHTML = `${I.check}Confirmar entrega`;
    }
  };
}

function crearFirma(canvas) {
  const ctx = canvas.getContext('2d');
  let dib = false, tinta = false, ult = null;
  const ajustar = () => {
    const r = canvas.getBoundingClientRect(), k = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, r.width * k); canvas.height = Math.max(1, r.height * k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111214';
    tinta = false;
  };
  ajustar();
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); if (!canvas.width || canvas.width < 5) ajustar(); canvas.setPointerCapture(e.pointerId); dib = true; ult = pt(e); ctx.beginPath(); ctx.arc(ult.x, ult.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#111214'; ctx.fill(); tinta = true; });
  canvas.addEventListener('pointermove', e => { if (!dib) return; e.preventDefault(); const p = pt(e); ctx.beginPath(); ctx.moveTo(ult.x, ult.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ult = p; tinta = true; });
  const fin = () => { dib = false; };
  canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin); canvas.addEventListener('pointerleave', fin);
  return { limpiar: ajustar, vacia: () => !tinta, blob: () => new Promise(r => canvas.toBlob(r, 'image/png')) };
}
