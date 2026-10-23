/* ================== Entregas TX ================== */
const SUPABASE_URL = 'https://xinnonzltoaoptnvkhhy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DoSRSj0wmAR_UIX8tENXXQ_X5BS5a1q';
const DOMINIO_CHOFER = 'choferes.grupotx.cl';
const RADIO_ALERTA_M = 300;        // distancia máxima esperada entre "Llegué" y el destino
const TRACK_MIN_MS = 60000;        // guardar posición cada 60 s ...
const TRACK_MIN_M = 30;            // ... si se movió al menos 30 m (o 200 m antes)

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const fechaCL = (iso) => iso ? new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)) : '';
const horaCL = (iso) => iso ? new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '';
const fechaHoraCL = (iso) => iso ? `${fechaCL(iso)} ${horaCL(iso)}` : '';
const diaCL = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(iso));
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const limpiarRut = (r) => (r || '').replace(/[^0-9kK]/g, '').toLowerCase();
const fmtM = (m) => m == null ? '—' : (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');
const ESTADOS = { asignada: 'Pendiente', en_destino: 'En destino', entregada: 'Entregada', entregada_con_devolucion: 'Con devolución', rechazada: 'Rechazada', anulada: 'Anulada' };
const badge = (e) => `<span class="badge b-${e}">${ESTADOS[e] || e}</span>`;
const COLORES = ['#1d4f86', '#f28c28', '#1f9d55', '#9b51e0', '#d64545', '#00a3bf', '#8a6d3b', '#e83e8c', '#2d3748', '#6b8e23'];
function distM(a, b, c, d) { const R = 6371000, r = x => x * Math.PI / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

function toast(msg, tipo = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast ' + tipo;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), tipo === 'err' ? 5500 : 3000);
}
function errMsg(e) { return (e && (e.message || e.error_description || e.error)) || String(e); }

function abrirModal(html, { ancho } = {}) {
  const m = $('#modal'), box = $('.modal-box', m);
  box.style.maxWidth = ancho || '720px';
  box.innerHTML = `<button class="x" aria-label="Cerrar">×</button>` + html;
  m.classList.remove('hidden');
  $('.x', box).onclick = cerrarModal;
  m.onclick = (ev) => { if (ev.target === m) cerrarModal(); };
  return box;
}
function cerrarModal() { $('#modal').classList.add('hidden'); $('.modal-box').innerHTML = ''; }

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
  catch {
    fuente = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = URL.createObjectURL(file); });
  }
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

function nuevoMapa(el, opts = {}) {
  const m = L.map(el, { zoomControl: true, ...opts }).setView([-33.45, -70.66], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
  setTimeout(() => m.invalidateSize(), 150);
  return m;
}
const pin = (color, txt = '') => L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13],
  html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${txt}</div>` });

async function geocodificar(direccion, comuna) {
  const q = [direccion, comuna, 'Chile'].filter(Boolean).join(', ');
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'es' } });
  const j = await r.json();
  return j && j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
}

/* ---------- estado global ---------- */
const S = { user: null, perfil: null, vista: null, tab: null, productos: [], motivos: [], vehiculos: [], usuarios: [] };

/* ================== AUTENTICACIÓN ================== */
async function iniciar() {
  const { data } = await sb.auth.getSession();
  if (data.session) await cargarPerfil(data.session.user);
  else pantallaLogin();
  sb.auth.onAuthStateChange((ev, ses) => {
    if (ev === 'SIGNED_OUT') { detenerTracking(); S.user = S.perfil = null; pantallaLogin(); }
  });
}

function pantallaLogin(modo = 'chofer') {
  $('#app').innerHTML = `
  <div class="login"><div class="card">
    <h1>Entregas TX</h1>
    <div class="muted">Registro de entregas en obra · Grupo TX</div>
    <div class="ltabs">
      <button data-m="chofer" class="${modo === 'chofer' ? 'on' : ''}">Soy chofer</button>
      <button data-m="staff" class="${modo === 'staff' ? 'on' : ''}">Personal TX</button>
    </div>
    <form id="flogin">
      ${modo === 'chofer' ? `
        <label>RUT</label><input name="rut" inputmode="text" autocomplete="username" placeholder="12.345.678-9" required>
      ` : `
        <label>Correo</label><input name="email" type="email" autocomplete="username" placeholder="nombre@grupotx.cl" required>
      `}
      <label>Clave</label><input name="pass" type="password" autocomplete="current-password" required>
      <div style="height:14px"></div>
      <button class="btn block" type="submit">Ingresar</button>
    </form>
    ${modo === 'staff' ? `<p class="small muted" style="margin-top:14px">¿Primera vez? <button class="link" id="lnkReg">Crear cuenta</button> · <button class="link" id="lnkRec">Olvidé mi clave</button></p>` :
      `<p class="small muted" style="margin-top:14px">Tu cuenta la crea el área de Logística. Si olvidaste tu clave, pídeles que la restablezcan.</p>`}
  </div></div>`;
  $$('.ltabs button').forEach(b => b.onclick = () => pantallaLogin(b.dataset.m));
  $('#flogin').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), btn = $('button[type=submit]', ev.target);
    const email = modo === 'chofer' ? `${limpiarRut(f.get('rut'))}@${DOMINIO_CHOFER}` : f.get('email').trim().toLowerCase();
    btn.disabled = true; btn.textContent = 'Ingresando…';
    const { data, error } = await sb.auth.signInWithPassword({ email, password: f.get('pass') });
    btn.disabled = false; btn.textContent = 'Ingresar';
    if (error) return toast(error.message.includes('Invalid') ? 'RUT/correo o clave incorrectos' : errMsg(error), 'err');
    await cargarPerfil(data.user);
  };
  if (modo === 'staff') {
    $('#lnkReg').onclick = () => {
      const box = abrirModal(`<h2>Crear cuenta (personal TX)</h2>
        <form id="freg"><label>Nombre y apellido</label><input name="nombre" required>
        <label>Correo</label><input name="email" type="email" required>
        <label>Clave (mín. 6)</label><input name="pass" type="password" minlength="6" required>
        <div style="height:12px"></div><button class="btn block">Crear cuenta</button></form>
        <p class="small muted">Después un administrador debe asignarte el rol (Logística o Admin).</p>`, { ancho: '420px' });
      $('#freg', box).onsubmit = async (ev) => {
        ev.preventDefault(); const f = new FormData(ev.target);
        const { data, error } = await sb.auth.signUp({ email: f.get('email').trim().toLowerCase(), password: f.get('pass'), options: { data: { nombre: f.get('nombre') } } });
        if (error) return toast(errMsg(error), 'err');
        cerrarModal();
        if (data.session) await cargarPerfil(data.user);
        else toast('Cuenta creada. Revisa tu correo para confirmarla y luego ingresa.', 'ok');
      };
    };
    $('#lnkRec').onclick = async () => {
      const email = prompt('Ingresa tu correo');
      if (!email) return;
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.href.split('#')[0] });
      toast(error ? errMsg(error) : 'Te enviamos un correo para restablecer la clave', error ? 'err' : 'ok');
    };
  }
}

async function cargarPerfil(user) {
  S.user = user;
  const { data, error } = await sb.rpc('ent_registrarme', { p_nombre: user.user_metadata?.nombre || null });
  if (error) { toast(errMsg(error), 'err'); return pantallaLogin(); }
  S.perfil = data;
  if (!data.activo) return pantallaBloqueo('Tu usuario está desactivado. Contacta a Logística.');
  if (data.rol === 'pendiente') return pantallaBloqueo('Tu cuenta está creada, pero un administrador aún debe asignarte un rol (Chofer, Logística o Admin).');
  await cargarCatalogos();
  if (data.rol === 'chofer') return vistaChofer();
  return vistaLogistica();
}

function pantallaBloqueo(msg) {
  $('#app').innerHTML = `<div class="login"><div class="card"><h1>Entregas TX</h1><p>${esc(msg)}</p>
    <p class="small muted">${esc(S.user?.email || '')}</p><button class="btn sec" id="bSalir">Salir</button></div></div>`;
  $('#bSalir').onclick = () => sb.auth.signOut();
}

async function cargarCatalogos() {
  const [p, m, v] = await Promise.all([
    sb.from('ent_productos').select('*').order('codigo'),
    sb.from('ent_motivos').select('*').order('id'),
    sb.from('ent_vehiculos').select('*').order('patente'),
  ]);
  S.productos = p.data || []; S.motivos = m.data || []; S.vehiculos = v.data || [];
}

/* ================== VISTA CHOFER ================== */
const J_KEY = 'entx_jornada';
function jornadaLocal() { try { const j = JSON.parse(localStorage.getItem(J_KEY) || 'null'); return j && j.uid === S.perfil.id && j.fecha === hoy() ? j : null; } catch { return null; } }
function guardarJornada(j) { try { localStorage.setItem(J_KEY, JSON.stringify(j)); } catch {} }

async function vistaChofer() {
  S.vista = 'chofer';
  let j = jornadaLocal();
  if (!j) {
    // ¿ya inició jornada hoy en otro dispositivo?
    const { data } = await sb.from('ent_jornadas').select('*').eq('chofer_id', S.perfil.id).eq('fecha', hoy()).is('fin_at', null).order('inicio_at', { ascending: false }).limit(1);
    if (data && data[0]) { j = { uid: S.perfil.id, fecha: hoy(), patente: data[0].patente, id: data[0].id }; guardarJornada(j); }
  }
  S.jornada = j;
  if (!j) return pedirPatente();
  pintarChofer();
  iniciarTracking();
}

function pedirPatente(cambio = false) {
  const opciones = S.vehiculos.filter(v => v.activo).map(v => `<option value="${esc(v.patente)}">${esc(v.descripcion || '')}</option>`).join('');
  $('#app').innerHTML = `
  <div class="top"><div class="brand">Entregas <b>TX</b></div><div class="sp"></div><button id="bSalir">Salir</button></div>
  <div class="wrap narrow">
    <div class="card">
      <h3>Hola, ${esc(S.perfil.nombre)}</h3>
      <p class="muted">${cambio ? 'Ingresa la nueva patente del vehículo.' : 'Para comenzar la jornada, ingresa la patente del camión que manejas hoy.'}</p>
      <form id="fpat">
        <label>Patente</label>
        <input name="pat" list="lpat" required placeholder="ABCD12" style="text-transform:uppercase;font-size:22px;letter-spacing:2px;text-align:center" autocomplete="off" value="${esc(S.jornada?.patente || '')}">
        <datalist id="lpat">${opciones}</datalist>
        <div style="height:14px"></div>
        <button class="btn block xl">${cambio ? 'Cambiar patente' : 'Iniciar jornada'}</button>
        ${cambio ? '<div style="height:8px"></div><button type="button" class="btn sec block" id="bCanc">Cancelar</button>' : ''}
      </form>
      <p class="small muted" style="margin-top:12px">Al iniciar, la app registra tu ubicación mientras esté abierta, para mostrar el trayecto a Logística.</p>
    </div>
  </div>`;
  $('#bSalir').onclick = () => sb.auth.signOut();
  if (cambio) $('#bCanc').onclick = () => pintarChofer();
  else if (S.perfil.rol === 'admin') { const b = document.createElement('button'); b.textContent = 'Logística'; b.onclick = () => vistaLogistica(); $('.top').insertBefore(b, $('#bSalir')); }
  $('#fpat').onsubmit = async (ev) => {
    ev.preventDefault();
    const pat = new FormData(ev.target).get('pat').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pat.length < 5) return toast('Patente inválida', 'err');
    if (S.jornada?.id) await sb.from('ent_jornadas').update({ fin_at: new Date().toISOString() }).eq('id', S.jornada.id);
    const { data, error } = await sb.from('ent_jornadas').insert({ chofer_id: S.perfil.id, patente: pat }).select().single();
    if (error) return toast(errMsg(error), 'err');
    S.jornada = { uid: S.perfil.id, fecha: hoy(), patente: pat, id: data.id };
    guardarJornada(S.jornada);
    pintarChofer();
    iniciarTracking();
  };
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
      if (pos.acc > 500) return; // descarta lecturas muy imprecisas
      T.ultimo = pos;
      const { error } = await sb.from('ent_posiciones').insert({ chofer_id: S.perfil.id, patente: S.jornada?.patente, lat: pos.lat, lng: pos.lng, precision_m: Math.round(pos.acc), velocidad_kmh: pos.vel != null ? Math.round(pos.vel * 3.6) : null, fuente: 'celular' });
      if (error) console.warn('posición', error.message);
    }
  }, (e) => { T.estado = 'err'; pintarGps(); console.warn(e); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 60000 });
  pedirWakeLock();
}
function detenerTracking() { if (T.watch != null) navigator.geolocation.clearWatch(T.watch); T.watch = null; T.estado = 'off'; }
async function pedirWakeLock() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') T.wake = await navigator.wakeLock.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.vista === 'chofer') { pedirWakeLock(); if (!$('#fEntrega')) cargarGuiasChofer(); } });
function pintarGps() {
  const el = $('#gpsInd'); if (!el) return;
  el.innerHTML = T.estado === 'on' ? '<span class="gpsdot on"></span>GPS activo' : T.estado === 'err' ? '<span class="gpsdot err"></span>GPS sin señal/permiso' : '<span class="gpsdot"></span>GPS…';
}

function pintarChofer() {
  $('#app').innerHTML = `
  <div class="top">
    <div class="brand">Entregas <b>TX</b></div><div class="sp"></div>
    <div class="who"><div>${esc(S.perfil.nombre)}</div><div><span class="patente" id="bPat" style="cursor:pointer" title="Cambiar patente">${esc(S.jornada.patente)}</span></div></div>
    <button id="bMenu">☰</button>
  </div>
  <div class="wrap narrow">
    <div class="row" style="margin-bottom:10px"><div class="small muted grow" id="gpsInd"></div><button class="btn sec sm" id="bRef">↻ Actualizar</button></div>
    <div id="lista"><div class="muted">Cargando guías…</div></div>
  </div>`;
  pintarGps();
  $('#bPat').onclick = () => pedirPatente(true);
  $('#bRef').onclick = cargarGuiasChofer;
  $('#bMenu').onclick = () => {
    const box = abrirModal(`<h2>${esc(S.perfil.nombre)}</h2>
      <p class="muted">Patente actual: <b>${esc(S.jornada.patente)}</b></p>
      <div class="row"><button class="btn sec" id="mPat">Cambiar patente</button>
      <button class="btn sec" id="mFin">Terminar jornada</button>
      ${S.perfil.rol === 'admin' ? '<button class="btn" id="mLog">Volver a Logística</button>' : ''}
      <button class="btn danger" id="mSalir">Cerrar sesión</button></div>`, { ancho: '420px' });
    if ($('#mLog', box)) $('#mLog', box).onclick = () => { cerrarModal(); detenerTracking(); vistaLogistica(); };
    $('#mPat', box).onclick = () => { cerrarModal(); pedirPatente(true); };
    $('#mFin', box).onclick = async () => {
      if (!confirm('¿Terminar la jornada? Se detiene el registro de ubicación.')) return;
      await sb.from('ent_jornadas').update({ fin_at: new Date().toISOString() }).eq('id', S.jornada.id);
      try { localStorage.removeItem(J_KEY); } catch {}
      detenerTracking(); cerrarModal(); S.jornada = null; pedirPatente();
    };
    $('#mSalir', box).onclick = () => { cerrarModal(); sb.auth.signOut(); };
  };
  cargarGuiasChofer();
}

async function cargarGuiasChofer() {
  const el = $('#lista'); if (!el) return;
  const { data, error } = await sb.from('ent_guias').select('*')
    .eq('chofer_id', S.perfil.id).neq('estado', 'anulada')
    .or(`fecha.eq.${hoy()},estado.in.(asignada,en_destino)`)
    .order('fecha').order('orden').order('created_at');
  if (error) { el.innerHTML = `<div class="alerta roja">${esc(errMsg(error))}</div>`; return; }
  S.guiasChofer = data;
  const pend = data.filter(g => ['asignada', 'en_destino'].includes(g.estado));
  const hechas = data.filter(g => !['asignada', 'en_destino'].includes(g.estado));
  const tarjeta = (g) => {
    const nav = g.dest_lat ? `${g.dest_lat},${g.dest_lng}` : encodeURIComponent([g.direccion, g.comuna].filter(Boolean).join(', '));
    return `<div class="card guia ${g.estado}" data-id="${g.id}">
      <div class="row"><div class="folio grow">Guía ${esc(g.folio)}</div>${badge(g.estado)}</div>
      <div><b>${esc(g.cliente)}</b>${g.obra ? ' · ' + esc(g.obra) : ''}</div>
      <div class="dir">📍 ${esc(g.direccion)}${g.comuna ? ', ' + esc(g.comuna) : ''}</div>
      ${g.contacto || g.telefono ? `<div class="small muted">Contacto: ${esc(g.contacto || '')} ${g.telefono ? `· <a href="tel:${esc(g.telefono)}">${esc(g.telefono)}</a>` : ''}</div>` : ''}
      ${g.detalle ? `<div class="small" style="margin-top:6px;white-space:pre-wrap">${esc(g.detalle)}</div>` : ''}
      ${g.observacion ? `<div class="small muted" style="margin-top:4px">Obs: ${esc(g.observacion)}</div>` : ''}
      ${g.fecha !== hoy() ? `<div class="small" style="color:var(--rojo);margin-top:4px">Guía del ${fechaCL(g.fecha)}</div>` : ''}
      <div class="acts">
        ${g.estado === 'asignada' ? `
          <a class="btn sec sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${nav}">Google Maps</a>
          <a class="btn sec sm" target="_blank" rel="noopener" href="https://waze.com/ul?${g.dest_lat ? 'll=' + nav : 'q=' + nav}&navigate=yes">Waze</a>
          <button class="btn warn block xl" data-acc="llegue">📍 LLEGUÉ AL DESTINO</button>` : ''}
        ${g.estado === 'en_destino' ? `<button class="btn ok block xl" data-acc="registrar">📦 Registrar entrega</button>` : ''}
      </div></div>`;
  };
  el.innerHTML = (pend.length ? pend.map(tarjeta).join('') : `<div class="card"><b>No tienes entregas pendientes.</b><div class="muted small">Si esperas guías, pide a Logística que te las asigne y presiona Actualizar.</div></div>`)
    + (hechas.length ? `<h3 style="margin:18px 4px 8px;font-size:15px" class="muted">Completadas hoy (${hechas.length})</h3>` + hechas.map(tarjeta).join('') : '');
  $$('[data-acc=llegue]', el).forEach(b => b.onclick = () => marcarLlegada(b.closest('.guia').dataset.id, b));
  $$('[data-acc=registrar]', el).forEach(b => b.onclick = () => formEntrega(S.guiasChofer.find(g => g.id === b.closest('.guia').dataset.id)));
}

async function marcarLlegada(id, btn) {
  const g = S.guiasChofer.find(x => x.id === id);
  if (!confirm(`¿Confirmas que llegaste a ${g.cliente || 'destino'} (Guía ${g.folio})?`)) return;
  btn.disabled = true; btn.textContent = 'Obteniendo ubicación…';
  try {
    const pos = await obtenerPosicion();
    const { data, error } = await sb.rpc('ent_marcar_llegada', { p_guia: id, p_patente: S.jornada.patente, p_lat: pos.lat, p_lng: pos.lng, p_precision: Math.round(pos.acc) });
    if (error) throw error;
    if (data.distancia_destino_m != null && data.distancia_destino_m > RADIO_ALERTA_M) toast(`Llegada registrada. Ojo: estás a ${fmtM(data.distancia_destino_m)} del destino informado.`, '');
    else toast('Llegada registrada ✔', 'ok');
    g.estado = 'en_destino';
    formEntrega(g);
  } catch (e) {
    toast(errMsg(e), 'err'); btn.disabled = false; btn.textContent = '📍 LLEGUÉ AL DESTINO';
  }
}

/* --- formulario de entrega --- */
function formEntrega(g) {
  const F = { fotos: [], resultado: 'entregada', devs: [] };
  const optsProd = '<option value="">Selecciona producto…</option>' + S.productos.filter(p => p.activo).map(p => `<option value="${esc(p.codigo)}">${esc(p.codigo)} — ${esc(p.descripcion)}</option>`).join('');
  const optsMot = '<option value="">Motivo…</option>' + S.motivos.filter(m => m.activo).map(m => `<option>${esc(m.motivo)}</option>`).join('');
  $('#app').innerHTML = `
  <div class="top"><button id="bVolver">←</button><div class="brand">Guía ${esc(g.folio)}</div><div class="sp"></div><span class="patente">${esc(S.jornada.patente)}</span></div>
  <div class="wrap narrow" id="fEntrega">
    <div class="card"><b>${esc(g.cliente)}</b>${g.obra ? ' · ' + esc(g.obra) : ''}<div class="muted small">${esc(g.direccion)}${g.comuna ? ', ' + esc(g.comuna) : ''}</div>
      <div class="small" style="margin-top:6px">Chofer: <b>${esc(S.perfil.nombre)}</b></div></div>

    <div class="card"><h3>1. Fotos de la mercadería *</h3>
      <div class="fotos" id="fotos"></div>
      <input type="file" id="inFoto" accept="image/*" capture="environment" class="hidden">
      <div class="small muted" style="margin-top:6px">Toma al menos una foto de la carga descargada (máx. 6).</div></div>

    <div class="card"><h3>2. Resultado</h3>
      <div class="seg" id="seg">
        <button data-r="entregada" class="on">✔ Conforme</button>
        <button data-r="entregada_con_devolucion">↩ Con devolución</button>
        <button data-r="rechazada">✖ Rechazo total</button>
      </div>
      <div id="devBox" class="hidden" style="margin-top:12px">
        <div class="small muted" style="margin-bottom:6px">Detalla cada producto devuelto:</div>
        <div id="devs"></div>
        <button class="btn sec sm" id="bAddDev" type="button">+ Agregar producto</button>
      </div></div>

    <div class="card"><h3>3. Quién recibe *</h3>
      <label>Nombre completo *</label><input id="rNom" autocomplete="off">
      <div class="grid2">
        <div><label>RUT</label><input id="rRut" autocomplete="off" placeholder="12.345.678-9"></div>
        <div><label>Cargo</label><input id="rCargo" autocomplete="off" placeholder="Bodeguero, jefe de obra…"></div>
      </div>
      <label>Teléfono</label><input id="rTel" type="tel" autocomplete="off">
      <label>Observaciones</label><textarea id="rObs" placeholder="Opcional"></textarea></div>

    <div class="card"><h3>4. Firma de quien recibe *</h3>
      <canvas class="firma" id="firma"></canvas>
      <div class="row" style="margin-top:6px"><div class="small muted grow">Firma con el dedo dentro del recuadro</div><button class="btn sec sm" id="bLimpiar" type="button">Limpiar</button></div></div>

    <button class="btn ok block xl" id="bConfirmar">Confirmar entrega</button>
    <div style="height:30px"></div>
  </div>`;

  $('#bVolver').onclick = () => { if (confirm('¿Salir sin guardar? La llegada ya quedó registrada; podrás completar la entrega después.')) pintarChofer(); };

  // fotos
  const pintarFotos = () => {
    $('#fotos').innerHTML = F.fotos.map((f, i) => `<div class="ph"><img src="${f.url}"><button data-i="${i}" aria-label="Quitar">×</button></div>`).join('')
      + (F.fotos.length < 6 ? `<div class="addph" id="bFoto"><span>📷</span>Agregar foto</div>` : '');
    $$('#fotos .ph button').forEach(b => b.onclick = () => { URL.revokeObjectURL(F.fotos[b.dataset.i].url); F.fotos.splice(+b.dataset.i, 1); pintarFotos(); });
    const bf = $('#bFoto'); if (bf) bf.onclick = () => $('#inFoto').click();
  };
  $('#inFoto').onchange = async (ev) => {
    const file = ev.target.files[0]; ev.target.value = '';
    if (!file) return;
    try { const blob = await comprimirImagen(file); F.fotos.push({ blob, url: URL.createObjectURL(blob) }); pintarFotos(); }
    catch { toast('No se pudo leer la foto', 'err'); }
  };
  pintarFotos();

  // resultado / devoluciones
  const pintarDevs = () => {
    $('#devs').innerHTML = F.devs.map((d, i) => `<div class="devline" data-i="${i}">
      <select data-k="codigo">${optsProd}</select>
      <div class="grid2" style="margin-top:6px">
        <div><input data-k="cantidad" type="number" inputmode="decimal" min="0" step="any" placeholder="Cantidad"></div>
        <div><select data-k="motivo">${optsMot}</select></div>
      </div>
      <input data-k="comentario" placeholder="Comentario (opcional)" style="margin-top:6px">
      <div class="right" style="margin-top:6px"><button class="btn sec sm" data-del="${i}" type="button">Quitar</button></div></div>`).join('');
    $$('#devs .devline').forEach(div => {
      const d = F.devs[+div.dataset.i];
      $$('[data-k]', div).forEach(inp => { inp.value = d[inp.dataset.k] ?? ''; inp.oninput = inp.onchange = () => d[inp.dataset.k] = inp.value; });
    });
    $$('#devs [data-del]').forEach(b => b.onclick = () => { F.devs.splice(+b.dataset.del, 1); pintarDevs(); });
  };
  $('#bAddDev').onclick = () => { F.devs.push({ codigo: '', cantidad: '', motivo: '', comentario: '' }); pintarDevs(); };
  $$('#seg button').forEach(b => b.onclick = () => {
    $$('#seg button').forEach(x => x.classList.toggle('on', x === b));
    F.resultado = b.dataset.r;
    const conDev = F.resultado !== 'entregada';
    $('#devBox').classList.toggle('hidden', !conDev);
    if (conDev && !F.devs.length) { F.devs.push({ codigo: '', cantidad: '', motivo: '', comentario: '' }); pintarDevs(); }
  });

  // firma
  const pad = crearFirma($('#firma'));
  $('#bLimpiar').onclick = () => pad.limpiar();

  // confirmar
  $('#bConfirmar').onclick = async () => {
    const nom = $('#rNom').value.trim();
    if (!F.fotos.length) return toast('Falta al menos una foto de la mercadería', 'err');
    if (!nom) return toast('Falta el nombre de quien recibe', 'err');
    if (pad.vacia()) return toast('Falta la firma de quien recibe', 'err');
    let devs = [];
    if (F.resultado !== 'entregada') {
      devs = F.devs.filter(d => d.codigo || d.cantidad || d.motivo);
      if (F.resultado === 'entregada_con_devolucion' && !devs.length) return toast('Indica al menos un producto devuelto', 'err');
      for (const d of devs) {
        if (!d.codigo || !(+d.cantidad > 0) || !d.motivo) return toast('Cada devolución necesita producto, cantidad y motivo', 'err');
      }
    }
    if (!confirm('¿Confirmar y enviar la entrega?')) return;
    const btn = $('#bConfirmar'); btn.disabled = true;
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
        p_receptor_rut: $('#rRut').value.trim() || null, p_receptor_cargo: $('#rCargo').value.trim() || null,
        p_receptor_telefono: $('#rTel').value.trim() || null, p_firma_path: firmaPath, p_observacion: $('#rObs').value.trim() || null,
        p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null,
        p_devoluciones: devs.map(d => ({ codigo: d.codigo, cantidad: +d.cantidad, motivo: d.motivo, comentario: d.comentario || null })),
      });
      if (error) throw error;
      F.fotos.forEach(f => URL.revokeObjectURL(f.url));
      toast('Entrega registrada ✔', 'ok');
      pintarChofer();
    } catch (e) {
      toast('No se pudo guardar: ' + errMsg(e) + '. Revisa tu señal y reintenta.', 'err');
      btn.disabled = false; btn.textContent = 'Confirmar entrega';
    }
  };
}

function crearFirma(canvas) {
  const ctx = canvas.getContext('2d');
  let dib = false, tinta = false, ult = null;
  const ajustar = () => {
    const r = canvas.getBoundingClientRect(), k = window.devicePixelRatio || 1;
    canvas.width = r.width * k; canvas.height = r.height * k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10223a';
    tinta = false;
  };
  ajustar();
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); dib = true; ult = pt(e); ctx.beginPath(); ctx.arc(ult.x, ult.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#10223a'; ctx.fill(); tinta = true; });
  canvas.addEventListener('pointermove', e => { if (!dib) return; e.preventDefault(); const p = pt(e); ctx.beginPath(); ctx.moveTo(ult.x, ult.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ult = p; tinta = true; });
  const fin = () => { dib = false; };
  canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin); canvas.addEventListener('pointerleave', fin);
  return { limpiar: ajustar, vacia: () => !tinta, blob: () => new Promise(r => canvas.toBlob(r, 'image/png')) };
}
