/* EmprenLive — Panel de administración (datos reales desde Supabase; solo administradores) */
(function () {
  'use strict';
  const SB_URL = 'https://otxigqqzczzsckhsaggq.supabase.co';
  const SB_KEY = 'sb_publishable_Osm049nAqujqAtTNdGidxQ_r-j_2qgp';
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'emprenlive_panel', flowType: 'pkce', detectSessionInUrl: true } });

  const app = document.getElementById('app');
  const CAT = { ropa: 'Ropa', belleza: 'Belleza', hogar: 'Hogar', accesorios: 'Accesorios', comida: 'Comida', ninos: 'Niños', tecnologia: 'Tecnología', otros: 'Otros' };
  const PLAN = { gratis: 'Gratis', profesional: 'Profesional', destacado: 'Destacado' };
  const ST_STORE = { pending: ['Por aprobar', 'p-warn'], approved: ['Aprobada', 'p-ok'], suspended: ['Suspendida', 'p-bad'] };
  const ST_ORDER = { nuevo: ['Nuevo', 'p-warn'], confirmado: ['Confirmado', 'p-info'], pagado: ['Pagado', 'p-ok'], enviado: ['Enviado', 'p-gray'], entregado: ['Entregado', 'p-ok'], cancelado: ['Cancelado', 'p-bad'] };
  const ROLE = { admin: 'Administrador', seller: 'Vendedor', buyer: 'Comprador' };
  const state = { user: null, days: 30, metric: 'orders', dash: null, cache: {} };

  // ---------- utilidades ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('es-CL');
  const clp = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
  const short = (n) => { n = Number(n || 0); if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' M'; if (n >= 1e4) return Math.round(n / 1e3) + ' mil'; return num(n); };
  const fdate = (d, time = true) => { if (!d) return ''; const x = new Date(d); return x.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: time ? undefined : 'numeric' }) + (time ? ' ' + x.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''); };
  const pill = (map, k) => { const v = map[k] || [k, 'p-gray']; return `<span class="pill ${v[1]}">${esc(v[0])}</span>`; };
  const planPill = (p) => `<span class="pill ${p === 'destacado' ? 'p-dest' : p === 'profesional' ? 'p-pro' : 'p-gray'}">${esc(PLAN[p] || p)}</span>`;
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  let tt; const toast = (m) => { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2800); };
  const ok = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  function csv(name, rows) {
    if (!rows.length) { toast('No hay datos para exportar'); return; }
    const cols = Object.keys(rows[0]);
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const body = '﻿' + [cols.map(q).join(';'), ...rows.map((r) => cols.map((c) => q(r[c])).join(';'))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const I = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    resumen: I('<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"/>'),
    tiendas: I('<path d="M4 9l1-5h14l1 5"/><path d="M4 9v11h16V9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/>'),
    usuarios: I('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>'),
    pedidos: I('<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
    productos: I('<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'),
    vivos: I('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'),
    mostrador: I('<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M9 17h6"/>'),
    denuncias: I('<path d="M5 21V4h12l-2 4 2 4H5"/>'),
  };

  // ---------- acceso ----------
  async function boot() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return loginView();
    const prof = await sb.from('profiles').select('id, name, email, role').eq('id', data.session.user.id).maybeSingle();
    if (!prof.data || prof.data.role !== 'admin') { await sb.auth.signOut(); return loginView('Esta cuenta no es de administrador.'); }
    state.user = prof.data;
    if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
    shell();
  }
  function loginView(err = '') {
    app.innerHTML = `<div class="login"><div class="login-art"><div class="logo"><i></i>EmprenLive</div>
      <div><h1>Panel de administración</h1><p>Tiendas, usuarios, grupos, historias, planes y analítica de toda la plataforma.</p></div>
      <span class="small" style="opacity:.6;position:relative">Acceso exclusivo para administradores</span></div>
      <div class="login-box"><form class="login-card" id="loginForm">
        <div class="logo"><i></i>EmprenLive</div><h2 style="font-size:24px">Ingresar al panel</h2>
        ${err ? `<div class="err">${esc(err)}</div>` : ''}
        <button class="btn lg" type="button" id="gBtn"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continuar con Google</button>
        <div class="sep">o con tu correo</div>
        <div class="field"><label for="em">Correo</label><input class="input" id="em" type="email" required autocomplete="email"></div>
        <div class="field"><label for="pw">Contraseña</label><input class="input" id="pw" type="password" required autocomplete="current-password"></div>
        <button class="btn dark lg" type="submit">Ingresar</button>
      </form></div></div>`;
    document.getElementById('gBtn').onclick = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } });
    document.getElementById('loginForm').onsubmit = async (e) => {
      e.preventDefault(); const b = e.target.querySelector('[type=submit]'); b.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: e.target.em.value.trim(), password: e.target.pw.value });
      b.disabled = false; if (error) return loginView('Correo o contraseña incorrectos.'); boot();
    };
  }

  // ---------- estructura ----------
  const SECTIONS = [['resumen', 'Resumen'], ['tiendas', 'Tiendas'], ['usuarios', 'Usuarios'], ['productos', 'Productos'], ['mostrador', 'Mostrador'], ['denuncias', 'Denuncias']];
  function shell() {
    app.innerHTML = `<div class="shell"><aside class="side"><div class="logo"><i></i>EmprenLive</div>
      <nav class="nav" id="nav"></nav>
      <div class="side-foot"><span>Conectado como</span><b>${esc(state.user.name)}</b><span>${esc(state.user.email)}</span><button class="btn sm" id="out" style="background:transparent;color:#fff;border-color:#3A3A44">Cerrar sesión</button></div></aside>
      <main class="main" id="main"></main></div>`;
    document.getElementById('out').onclick = async () => { await sb.auth.signOut(); loginView(); };
    window.onhashchange = route; route();
  }
  function nav(cur) {
    const k = state.dash ? state.dash.kpi : null;
    const counts = k ? { tiendas: k.stores_pending + k.plan_requests, denuncias: k.reports_open, vivos: k.lives_now } : {};
    document.getElementById('nav').innerHTML = SECTIONS.map(([id, n]) => `<a href="#/${id}" class="${cur === id ? 'on' : ''}">${ICONS[id]}${n}${counts[id] ? `<span class="cnt">${counts[id]}</span>` : ''}</a>`).join('');
  }
  async function route() {
    const sec = (location.hash.replace('#/', '').split('?')[0]) || 'resumen';
    const fn = VIEWS[sec] || VIEWS.resumen; nav(sec);
    const old = document.getElementById('main'); const main = old.cloneNode(false); old.replaceWith(main); // sin eventos repetidos
    main.innerHTML = '<div class="boot" style="min-height:50vh"><span class="spin"></span></div>';
    try { await fn(main); } catch (e) { main.innerHTML = `<div class="card pad err">No se pudo cargar: ${esc(e.message)}</div>`; }
    main.querySelectorAll('.card').forEach((c, i) => { c.style.animationDelay = Math.min(i, 12) * 35 + 'ms'; c.classList.add('reveal'); });
  }
  const head = (title, sub, right = '') => `<div class="top"><div><h1>${esc(title)}</h1><div class="sub">${sub}</div></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${right}</div></div>`;

  // ---------- gráfico de línea con área y tooltip ----------
  function lineChart(el, series, key, fmt) {
    const W = 760, H = 240, L = 46, R = 12, T = 14, B = 28;
    const vals = series.map((d) => Number(d[key] || 0));
    const max = Math.max(1, ...vals); const nice = niceMax(max);
    const x = (i) => L + (series.length <= 1 ? 0 : (i * (W - L - R)) / (series.length - 1));
    const y = (v) => T + (H - T - B) * (1 - v / nice);
    const pts = vals.map((v, i) => [x(i), y(v)]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = path + ` L ${x(vals.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => nice * f);
    const step = Math.ceil(series.length / 7);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0313B" stop-opacity=".22"/><stop offset="1" stop-color="#E0313B" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${esc(fmt === clp ? short(t) : short(t))}</text>`).join('')}
      ${series.map((d, i) => (i % step === 0 || i === series.length - 1) ? `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(d.day.slice(8, 10) + '/' + d.day.slice(5, 7))}</text>` : '').join('')}
      <path class="area" d="${area}"/><path class="line" d="${path}"/>
      <line class="cross" id="cx" y1="${T}" y2="${H - B}" style="display:none"/><circle id="cd" r="5" fill="#E0313B" stroke="#fff" stroke-width="2" style="display:none"/>
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/></svg><div class="tip" id="tp"></div>`;
    const svg = el.querySelector('svg'), tp = el.querySelector('#tp'), cx = el.querySelector('#cx'), cd = el.querySelector('#cd');
    const move = (ev) => {
      const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(series.length - 1, Math.round(((px - L) / (W - L - R)) * (series.length - 1))));
      const [X, Y] = pts[i]; cx.setAttribute('x1', X); cx.setAttribute('x2', X); cx.style.display = ''; cd.setAttribute('cx', X); cd.setAttribute('cy', Y); cd.style.display = '';
      tp.innerHTML = `<b>${esc(fmt(vals[i]))}</b>${esc(new Date(series[i].day + 'T12:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }))}`;
      tp.style.left = (X / W) * r.width + 'px'; tp.style.top = (Y / H) * r.height + 'px'; tp.style.opacity = 1;
    };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerleave', () => { tp.style.opacity = 0; cx.style.display = 'none'; cd.style.display = 'none'; });
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  const barList = (rows, fmt = num) => { const m = Math.max(1, ...rows.map((r) => r.v)); return `<div class="bars">${rows.map((r) => `<div class="bar-row" title="${esc(r.label)}: ${esc(fmt(r.v))}"><span class="ellipsis" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.label)}</span><div class="tr"><div class="fl" style="width:${(r.v / m) * 100}%"></div></div><span class="v">${esc(fmt(r.v))}</span></div>`).join('')}</div>`; };

  // ---------- vistas ----------
  const VIEWS = {};

  // Medidor del plan gratis de Supabase
  const MB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
  function usageCard(u) {
    const L = u.limits || {};
    const bar = (lab, val, lim, txt) => { const p = Math.min(100, lim ? val / lim * 100 : 0); const cls = p >= 85 ? 'bad' : p >= 60 ? 'warn' : 'ok';
      return `<div class="u-row"><div class="u-top"><span>${lab}</span><b>${txt}</b></div><div class="u-bar ${cls}"><i style="width:${Math.max(p, 1.5)}%"></i></div></div>`; };
    return `<div class="card pad usage"><div class="u-head"><b>Plan gratis · uso actual</b><span class="small muted">Si alguna barra pasa el 85 %, es momento de pasar a Supabase Pro (US$25/mes, precio fijo).</span></div>
      ${bar('Base de datos', u.db_bytes, L.db_bytes, MB(u.db_bytes) + ' de 500 MB')}
      ${bar('Fotos guardadas', u.storage_bytes, L.storage_bytes, MB(u.storage_bytes) + ' de 1 GB · ' + num(u.photos) + ' fotos')}
      ${bar('Usuarios activos del mes', u.mau, L.mau, num(u.mau) + ' de 50.000')}
      <div class="u-foot small muted">${num(u.users)} cuentas · ${num(u.stores)} tiendas · ${num(u.products)} productos · ${num(u.messages)} mensajes · ${num(u.groups || 0)} grupos</div></div>`;
  }

  VIEWS.resumen = async (main) => {
    const d = ok(await sb.rpc('admin_dashboard', { p_days: state.days })); state.dash = d; nav('resumen');
    const usageP = sb.rpc('admin_usage').then((r) => r.data).catch(() => null);
    setTimeout(async () => { const u = await usageP; const box = document.getElementById('usage'); if (u && box) box.innerHTML = usageCard(u); const kg = document.getElementById('kpiGroups'); if (kg && u) kg.textContent = num(u.groups || 0); }, 0);
    const k = d.kpi;
    const M = { orders: ['Pedidos', num], sales: ['Ventas', clp], users: ['Usuarios nuevos', num], devices: ['Visitantes únicos', num], views: ['Vistas', num], clicks: ['Clics en Pedir', num], messages: ['Mensajes', num] };
    main.innerHTML = head('Resumen', `Datos reales de los últimos ${d.days} días · actualizado ${esc(fdate(d.generated_at))}`,
      `<div class="seg" id="days">${[7, 30, 90].map((n) => `<button data-d="${n}" class="${state.days === n ? 'on' : ''}">${n} días</button>`).join('')}</div><button class="btn" id="reload">Actualizar</button>`) +
      `<div id="usage"></div><div class="grid alerts">
        <a class="card alert" href="#/tiendas?f=pending"><span class="ic" style="background:var(--warn-bg);color:var(--warn)">!</span><div><b>${num(k.stores_pending)}</b><br><span>Tiendas por aprobar</span></div></a>
        <a class="card alert" href="#/tiendas?f=req"><span class="ic" style="background:#F1E9FF;color:#5B21B6">★</span><div><b>${num(k.plan_requests)}</b><br><span>Solicitudes de plan</span></div></a>
        <a class="card alert" href="#/denuncias"><span class="ic" style="background:var(--bad-bg);color:var(--bad)">⚑</span><div><b>${num(k.reports_open)}</b><br><span>Denuncias abiertas</span></div></a>
      </div>
      <div class="grid kpis">
        <div class="card kpi accent"><span class="lab">Ingreso mensual por planes</span><span class="val">${clp(k.mrr)}</span><span class="hint">${num(k.plan_profesional)} Profesional · ${num(k.plan_destacado)} Destacado</span></div>
        <div class="card kpi"><span class="lab">Visitantes únicos</span><span class="val">${num(k.devices_7d)}</span><span class="hint">últimos 7 días · ${num(k.devices_today)} hoy</span></div>
        <div class="card kpi"><span class="lab">Usuarios registrados</span><span class="val">${num(k.users)}</span><span class="hint">+${num(k.users_new)} en el período · ${num(k.sellers)} vendedores</span></div>
        <div class="card kpi"><span class="lab">Tiendas activas</span><span class="val">${num(k.stores_approved)}</span><span class="hint">${num(k.stores)} en total · ${num(k.products_active)} productos publicados</span></div>
        <div class="card kpi"><span class="lab">Grupos</span><span class="val" id="kpiGroups">…</span><span class="hint">comunidades de emprendedores</span></div>
        <div class="card kpi"><span class="lab">Conversaciones</span><span class="val">${num(k.messages)}</span><span class="hint">mensajes en el período · ${num(k.follows)} seguidores totales</span></div>
      </div>
      <div class="grid two" style="margin-bottom:14px">
        <div class="card pad"><div class="hd"><h3 id="mTitle">${esc(M[state.metric][0])} por día</h3><div class="seg" id="metric">${Object.entries(M).map(([id, [n]]) => `<button data-m="${id}" class="${state.metric === id ? 'on' : ''}">${esc(n)}</button>`).join('')}</div></div><div class="chart" id="chart"></div></div>
        <div class="card pad"><div class="hd"><h3>Embudo de compra</h3><span class="small muted">${d.days} días</span></div>
          <div class="funnel">${[['Vistas de producto', k.views_product], ['Tocaron "Pedir"', k.clicks_order], ['Pedidos enviados', k.orders]].map(([n, v], i, a) => `<div class="fstep"><span>${esc(n)}<br><span class="pc">${i ? pct(v, a[i - 1][1]) + '% del paso anterior' : '100%'}</span></span><div class="tr"><div class="fl" style="width:${Math.max(2, (v / Math.max(1, a[0][1])) * 100)}%"></div></div><span class="v">${num(v)}</span></div>`).join('')}</div>
          <p class="small muted" style="margin:14px 0 0">Conversión total: <b style="color:var(--ink)">${pct(k.orders, k.views_product)}%</b> de las vistas terminan en pedido. Compartidos: <b style="color:var(--ink)">${num(k.shares)}</b>.</p></div>
      </div>
      <div class="grid three" style="margin-bottom:14px">
        <div class="card pad"><div class="hd"><h3>Tiendas por sector</h3></div>${barList(d.categories.map((c) => ({ label: CAT[c.category] || c.category, v: c.stores })))}</div>
        <div class="card pad"><div class="hd"><h3>Ciudades</h3></div>${d.cities.length ? barList(d.cities.map((c) => ({ label: c.city, v: c.stores }))) : '<div class="empty small">Sin datos</div>'}</div>
        <div class="card pad"><div class="hd"><h3>Lo más buscado</h3></div>${d.searches.length ? barList(d.searches.map((c) => ({ label: c.q, v: c.n }))) : '<div class="empty small">Aún no hay búsquedas registradas</div>'}</div>
      </div>
      <div class="grid two">
        <div class="card"><div class="pad hd" style="margin:0"><h3>Ranking de tiendas</h3><button class="btn sm" id="xTop">Exportar</button></div><div class="table-wrap"><table><thead><tr><th>Tienda</th><th>Plan</th><th class="num">Vistas</th><th class="num">Clics</th><th class="num">Pedidos</th><th class="num">Ventas</th></tr></thead><tbody>
          ${d.top_stores.map((s) => `<tr><td><div class="cell-main">${esc(s.name)}</div><div class="cell-sub">${esc(CAT[s.category] || '')}${s.city ? ' · ' + esc(s.city) : ''} · ${num(s.followers)} seguidores</div></td><td>${planPill(s.plan)}</td><td class="num">${num(s.views)}</td><td class="num">${num(s.clicks)}</td><td class="num">${num(s.orders)}</td><td class="num">${clp(s.sales)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin datos</td></tr>'}
        </tbody></table></div></div>
        <div class="card"><div class="pad hd" style="margin:0"><h3>Productos más vistos</h3></div><div class="table-wrap"><table><thead><tr><th>Producto</th><th class="num">Vistas</th><th class="num">Pedidos</th></tr></thead><tbody>
          ${d.top_products.map((p) => `<tr><td><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc(p.store)} · ${clp(p.price)}</div></td><td class="num">${num(p.views)}</td><td class="num">${num(p.orders)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sin datos</td></tr>'}
        </tbody></table></div></div>
      </div>`;
    const draw = () => { const [n, f] = M[state.metric]; document.getElementById('mTitle').textContent = n + ' por día'; lineChart(document.getElementById('chart'), d.series || [], state.metric, f); };
    draw();
    document.getElementById('metric').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; state.metric = b.dataset.m; document.querySelectorAll('#metric button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
    document.getElementById('days').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; state.days = Number(b.dataset.d); route(); };
    document.getElementById('reload').onclick = () => route();
    document.getElementById('xTop').onclick = () => csv('ranking-tiendas', d.top_stores.map((s) => ({ tienda: s.name, sector: CAT[s.category], ciudad: s.city, plan: PLAN[s.plan], seguidores: s.followers, vistas: s.views, clics: s.clicks, pedidos: s.orders, ventas: s.sales })));
  };

  VIEWS.tiendas = async (main) => {
    const f = new URLSearchParams(location.hash.split('?')[1] || '').get('f') || '';
    const [stores, reqs] = await Promise.all([
      sb.from('stores').select('*, profiles!owner_id(name, email, phone), products(count)').order('created_at', { ascending: false }).limit(1000).then(ok),
      sb.from('plan_requests').select('store_id, plan, created_at').eq('status', 'pendiente').then(ok),
    ]);
    const req = Object.fromEntries(reqs.map((r) => [r.store_id, r]));
    main.innerHTML = head('Tiendas', `${num(stores.length)} tiendas registradas`, '<button class="btn" id="x">Exportar CSV</button>') +
      `<div class="card"><div class="pad" style="padding-bottom:0"><div class="toolbar">
        <input class="input" id="q" placeholder="Buscar por nombre, dueño, correo o ciudad">
        <select class="select" id="fs"><option value="">Todos los estados</option><option value="pending">Por aprobar</option><option value="approved">Aprobadas</option><option value="suspended">Suspendidas</option><option value="req">Con solicitud de plan</option></select>
        <select class="select" id="fp"><option value="">Todos los planes</option>${Object.entries(PLAN).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
      <div class="table-wrap"><table><thead><tr><th>Tienda</th><th>Dueño</th><th>Estado</th><th>Plan</th><th class="num">Productos</th><th class="num">Seguidores</th><th>Creada</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
    const fs = document.getElementById('fs'); fs.value = f;
    const rows = () => {
      const q = document.getElementById('q').value.trim().toLowerCase(), st = fs.value, pl = document.getElementById('fp').value;
      return stores.filter((s) => (!q || [s.name, s.city, s.profiles?.name, s.profiles?.email].join(' ').toLowerCase().includes(q))
        && (!st || (st === 'req' ? req[s.id] : s.status === st)) && (!pl || s.plan === pl));
    };
    const draw = () => {
      const list = rows();
      document.getElementById('tb').innerHTML = list.map((s) => `<tr>
        <td><div class="cell-main">${esc(s.name)}</div><div class="cell-sub">${esc(CAT[s.category] || '')}${s.city ? ' · ' + esc(s.city) : ''} · WhatsApp +${esc(s.whatsapp)}</div>${req[s.id] ? `<span class="pill p-pro" style="margin-top:4px">Pide plan ${esc(PLAN[req[s.id].plan])}</span>` : ''}</td>
        <td><div>${esc(s.profiles?.name)}</div><div class="cell-sub">${esc(s.profiles?.email)}</div></td>
        <td>${pill(ST_STORE, s.status)}</td>
        <td><select class="select" style="height:34px" data-plan="${s.id}" aria-label="Plan de ${esc(s.name)}">${Object.entries(PLAN).map(([k, v]) => `<option value="${k}" ${s.plan === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td class="num">${num(s.products?.[0]?.count)}</td><td class="num">${num(s.followers)}</td><td class="small muted">${esc(fdate(s.created_at, false))}</td>
        <td><div class="actions">${s.status !== 'approved' ? `<button class="btn sm ok" data-st="approved" data-id="${s.id}">Aprobar</button>` : ''}${s.status !== 'suspended' ? `<button class="btn sm danger" data-st="suspended" data-id="${s.id}">Suspender</button>` : ''}<button class="btn sm danger" data-del-store="${s.id}" title="Eliminar tienda">Eliminar</button></div></td></tr>`).join('') || '<tr><td colspan="8" class="empty">No hay tiendas con esos filtros</td></tr>';
    };
    draw();
    ['q', 'fs', 'fp'].forEach((id) => document.getElementById(id).addEventListener('input', draw));
    main.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-del-store]');
      if (d) {
        const st = stores.find((x) => x.id === Number(d.dataset.delStore));
        if (!(await confirmDelete('¿Eliminar la tienda "' + st.name + '"?', `Se borrarán para siempre la tienda, sus <b>${num(st.products?.[0]?.count)} productos</b>, sus vivos, pregones, chats y pedidos. La cuenta del dueño (${esc(st.profiles?.email)}) no se borra. Si solo quieres ocultarla, usa <b>Suspender</b>.`))) return;
        d.disabled = true;
        try { ok(await sb.rpc('admin_delete_store', { p_id: st.id })); stores.splice(stores.indexOf(st), 1); toast('Tienda eliminada'); draw(); } catch (er) { toast(er.message); d.disabled = false; }
        return;
      }
      const b = e.target.closest('[data-st]'); if (!b) return;
      if (b.dataset.st === 'suspended' && !confirmInline(b, '¿Suspender?')) return;
      b.disabled = true;
      try { const r = ok(await sb.rpc('admin_update_store', { p_id: Number(b.dataset.id), p_status: b.dataset.st, p_plan: null })); Object.assign(stores.find((s) => s.id === r.id), { status: r.status }); toast(b.dataset.st === 'approved' ? 'Tienda aprobada' : 'Tienda suspendida'); draw(); }
      catch (er) { toast(er.message); b.disabled = false; }
    });
    main.addEventListener('change', async (e) => {
      const s = e.target.closest('[data-plan]'); if (!s) return;
      try { const r = ok(await sb.rpc('admin_update_store', { p_id: Number(s.dataset.plan), p_status: null, p_plan: s.value })); stores.find((x) => x.id === r.id).plan = r.plan; delete req[r.id]; toast('Plan actualizado a ' + PLAN[r.plan]); draw(); }
      catch (er) { toast(er.message); }
    });
    document.getElementById('x').onclick = () => csv('tiendas', rows().map((s) => ({ tienda: s.name, sector: CAT[s.category], ciudad: s.city, whatsapp: s.whatsapp, dueno: s.profiles?.name, correo: s.profiles?.email, estado: (ST_STORE[s.status] || [s.status])[0], plan: PLAN[s.plan], productos: s.products?.[0]?.count, seguidores: s.followers, creada: fdate(s.created_at, false) })));
  };
  // Ventana de confirmación para acciones que no se pueden deshacer: hay que escribir ELIMINAR
  function confirmDelete(title, detail) {
    return new Promise((resolve) => {
      const bg = document.createElement('div'); bg.className = 'modal-bg';
      bg.innerHTML = `<form class="modal card pad" role="dialog" aria-modal="true" aria-labelledby="mt"><h3 id="mt">${esc(title)}</h3><p class="small muted" style="margin:6px 0 12px">${detail}</p>
        <div class="field"><label for="mc">Escribe <b>ELIMINAR</b> para confirmar</label><input class="input" id="mc" autocomplete="off" autocapitalize="characters"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-x>Cancelar</button><button class="btn" style="background:var(--bad);border-color:var(--bad);color:#fff" type="submit" disabled>Eliminar definitivamente</button></div></form>`;
      document.body.appendChild(bg);
      const inp = bg.querySelector('#mc'), go = bg.querySelector('[type=submit]'); inp.focus();
      const close = (v) => { bg.remove(); resolve(v); };
      inp.oninput = () => { go.disabled = inp.value.trim().toUpperCase() !== 'ELIMINAR'; };
      bg.querySelector('[data-x]').onclick = () => close(false);
      bg.onclick = (e) => { if (e.target === bg) close(false); };
      bg.querySelector('form').onsubmit = (e) => { e.preventDefault(); if (!go.disabled) close(true); };
      document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', k); close(false); } });
    });
  }
  // confirmación de dos toques (sin ventanas emergentes)
  function confirmInline(b, txt) { if (b.dataset.armed) return true; b.dataset.armed = '1'; const o = b.textContent; b.textContent = txt; setTimeout(() => { delete b.dataset.armed; b.textContent = o; }, 3000); return false; }

  VIEWS.usuarios = async (main) => {
    const users = ok(await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(2000));
    main.innerHTML = head('Usuarios', `${num(users.length)} cuentas`, '<button class="btn" id="x">Exportar CSV</button>') +
      `<div class="card"><div class="pad" style="padding-bottom:0"><div class="toolbar"><input class="input" id="q" placeholder="Buscar por nombre, correo o @alias">
        <select class="select" id="fr"><option value="">Todos los roles</option>${Object.entries(ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select class="select" id="fs"><option value="">Todos</option><option value="active">Activos</option><option value="suspended">Suspendidos</option></select></div></div>
      <div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Teléfono</th><th>Registro</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
    const rows = () => { const q = document.getElementById('q').value.trim().toLowerCase(), r = document.getElementById('fr').value, s = document.getElementById('fs').value; return users.filter((u) => (!q || (u.name + ' ' + u.email + ' @' + (u.username || '')).toLowerCase().includes(q)) && (!r || u.role === r) && (!s || u.status === s)); };
    const draw = () => { document.getElementById('tb').innerHTML = rows().map((u) => `<tr><td><div class="user-cell">${u.avatar ? `<img class="uav" src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<span class="uav">${esc((u.name || '?').trim().charAt(0).toUpperCase())}</span>`}<div style="min-width:0"><div class="cell-main">${esc(u.name)}</div><div class="cell-sub">${u.username ? '<b style="color:var(--brand,#C2262E)">@' + esc(u.username) + '</b> · ' : ''}${esc(u.email)}</div></div></div></td>
      <td><span class="pill ${u.role === 'admin' ? 'p-brand' : u.role === 'seller' ? 'p-info' : 'p-gray'}">${esc(ROLE[u.role] || u.role)}</span></td>
      <td>${u.status === 'active' ? '<span class="pill p-ok">Activo</span>' : '<span class="pill p-bad">Suspendido</span>'}</td><td class="small">${esc(u.phone || '—')}</td><td class="small muted">${esc(fdate(u.created_at, false))}</td>
      <td><div class="actions">${u.role === 'admin' ? '' : u.status === 'active' ? `<button class="btn sm danger" data-u="${u.id}" data-s="suspended">Suspender</button>` : `<button class="btn sm ok" data-u="${u.id}" data-s="active">Reactivar</button>`}</div></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin resultados</td></tr>'; };
    draw(); ['q', 'fr', 'fs'].forEach((id) => document.getElementById(id).addEventListener('input', draw));
    main.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-u]'); if (!b) return;
      if (b.dataset.s === 'suspended' && !confirmInline(b, '¿Seguro?')) return;
      b.disabled = true;
      try { ok(await sb.rpc('admin_set_user_status', { p_id: b.dataset.u, p_status: b.dataset.s })); users.find((u) => u.id === b.dataset.u).status = b.dataset.s; toast(b.dataset.s === 'active' ? 'Usuario reactivado' : 'Usuario suspendido'); draw(); }
      catch (er) { toast(er.message); b.disabled = false; }
    });
    document.getElementById('x').onclick = () => csv('usuarios', rows().map((u) => ({ nombre: u.name, correo: u.email, telefono: u.phone, rol: ROLE[u.role], estado: u.status === 'active' ? 'Activo' : 'Suspendido', registro: fdate(u.created_at, false) })));
  };

  VIEWS.pedidos = async (main) => {
    const orders = ok(await sb.from('orders').select('*, stores(name, slug)').order('created_at', { ascending: false }).limit(2000));
    main.innerHTML = head('Pedidos', `${num(orders.length)} pedidos registrados`, '<button class="btn" id="x">Exportar CSV</button>') +
      `<div class="card"><div class="pad" style="padding-bottom:0"><div class="toolbar"><input class="input" id="q" placeholder="Buscar por código, cliente, producto o tienda">
        <select class="select" id="fs"><option value="">Todos los estados</option>${Object.entries(ST_ORDER).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select><span class="small muted" id="sum"></span></div></div>
      <div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Tienda</th><th>Estado</th><th class="num">Total</th><th>Fecha</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
    const rows = () => { const q = document.getElementById('q').value.trim().toLowerCase(), s = document.getElementById('fs').value; return orders.filter((o) => (!q || [o.code, o.buyer_name, o.product_name, o.stores?.name].join(' ').toLowerCase().includes(q)) && (!s || o.status === s)); };
    const draw = () => { const l = rows(); document.getElementById('sum').textContent = `${num(l.length)} pedidos · ${clp(l.filter((o) => o.status !== 'cancelado').reduce((a, o) => a + o.quantity * o.unit_price, 0))}`;
      document.getElementById('tb').innerHTML = l.map((o) => `<tr><td class="b">#${esc(o.code)}</td><td><div>${esc(o.buyer_name)}</div><div class="cell-sub">${esc(o.buyer_phone || '')}</div></td>
      <td><div>${esc(o.product_name)}</div><div class="cell-sub">${o.quantity} × ${clp(o.unit_price)}${o.option ? ' · ' + esc(o.option) : ''}</div></td><td>${esc(o.stores?.name || '')}</td><td>${pill(ST_ORDER, o.status)}</td><td class="num b">${clp(o.quantity * o.unit_price)}</td><td class="small muted">${esc(fdate(o.created_at))}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin pedidos</td></tr>'; };
    draw(); ['q', 'fs'].forEach((id) => document.getElementById(id).addEventListener('input', draw));
    document.getElementById('x').onclick = () => csv('pedidos', rows().map((o) => ({ codigo: o.code, fecha: fdate(o.created_at), cliente: o.buyer_name, telefono: o.buyer_phone, producto: o.product_name, opcion: o.option, cantidad: o.quantity, precio: o.unit_price, total: o.quantity * o.unit_price, tienda: o.stores?.name, estado: (ST_ORDER[o.status] || [o.status])[0], nota: o.note })));
  };

  VIEWS.productos = async (main) => {
    const prods = ok(await sb.from('products').select('*, stores(name, slug)').order('created_at', { ascending: false }).limit(3000));
    main.innerHTML = head('Productos', `${num(prods.length)} productos · ${num(prods.filter((p) => p.active).length)} publicados`, '<button class="btn" id="x">Exportar CSV</button>') +
      `<div class="card"><div class="pad" style="padding-bottom:0"><div class="toolbar"><input class="input" id="q" placeholder="Buscar producto o tienda">
        <select class="select" id="fa"><option value="">Todos</option><option value="1">Publicados</option><option value="0">Ocultos</option></select></div></div>
      <div class="table-wrap"><table><thead><tr><th>Producto</th><th>Tienda</th><th class="num">Precio</th><th>Estado</th><th>Creado</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
    const rows = () => { const q = document.getElementById('q').value.trim().toLowerCase(), a = document.getElementById('fa').value; return prods.filter((p) => (!q || (p.name + ' ' + (p.stores?.name || '')).toLowerCase().includes(q)) && (a === '' || String(+p.active) === a)); };
    const draw = () => { document.getElementById('tb').innerHTML = rows().slice(0, 500).map((p) => `<tr><td><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc((p.options || '').slice(0, 60))}</div></td><td>${esc(p.stores?.name || '')}</td><td class="num">${clp(p.price)}</td>
      <td>${p.active ? '<span class="pill p-ok">Publicado</span>' : '<span class="pill p-gray">Oculto</span>'}</td><td class="small muted">${esc(fdate(p.created_at, false))}</td>
      <td><div class="actions">${p.active ? `<button class="btn sm" data-p="${p.id}" data-a="0">Ocultar</button>` : `<button class="btn sm" data-p="${p.id}" data-a="1">Publicar</button>`}<button class="btn sm danger" data-del-prod="${p.id}">Eliminar</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin productos</td></tr>'; };
    draw(); ['q', 'fa'].forEach((id) => document.getElementById(id).addEventListener('input', draw));
    main.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-del-prod]');
      if (d) {
        const pr = prods.find((x) => x.id === Number(d.dataset.delProd));
        if (!(await confirmDelete('¿Eliminar "' + pr.name + '"?', `El producto de <b>${esc(pr.stores?.name || '')}</b> se borrará para siempre. Los pedidos anteriores se conservan con su nombre. Si solo quieres sacarlo de la vista, usa <b>Ocultar</b>.`))) return;
        d.disabled = true;
        try { ok(await sb.rpc('admin_delete_product', { p_id: pr.id })); prods.splice(prods.indexOf(pr), 1); toast('Producto eliminado'); draw(); } catch (er) { toast(er.message); d.disabled = false; }
        return;
      }
      const b = e.target.closest('[data-p]'); if (!b) return; b.disabled = true;
      try { ok(await sb.rpc('admin_set_product_active', { p_id: Number(b.dataset.p), p_active: b.dataset.a === '1' })); prods.find((p) => p.id === Number(b.dataset.p)).active = b.dataset.a === '1'; toast(b.dataset.a === '1' ? 'Producto publicado' : 'Producto ocultado'); draw(); }
      catch (er) { toast(/LIMITE_PLAN/.test(er.message) ? 'La tienda llegó al límite de su plan' : er.message); b.disabled = false; }
    });
    document.getElementById('x').onclick = () => csv('productos', rows().map((p) => ({ producto: p.name, tienda: p.stores?.name, precio: p.price, opciones: p.options, estado: p.active ? 'Publicado' : 'Oculto', creado: fdate(p.created_at, false) })));
  };

  VIEWS.vivos = async (main) => {
    const lives = ok(await sb.from('lives').select('*, stores(name, slug, plan)').order('starts_at', { ascending: false }).limit(500));
    const now = Date.now(); const t = (l) => new Date(l.starts_at).getTime();
    const isNow = (l) => l.status === 'programado' && now >= t(l) - 5 * 60e3 && now <= t(l) + 3 * 3600e3;
    const cur = lives.filter(isNow), next = lives.filter((l) => l.status === 'programado' && t(l) > now + 5 * 60e3).reverse(), past = lives.filter((l) => !isNow(l) && !(l.status === 'programado' && t(l) > now));
    const row = (l, act) => `<tr><td><div class="cell-main">${esc(l.title)}</div><div class="cell-sub">${esc(l.stores?.name || '')} · ${esc(PLAN[l.stores?.plan] || '')}</div></td>
      <td>${l.mode === 'camara' ? '<span class="pill p-brand">Cámara</span>' : '<span class="pill p-gray">Redes</span>'}</td><td class="small">${esc(fdate(l.starts_at))}</td>
      <td>${l.status === 'cancelado' ? '<span class="pill p-bad">Cancelado</span>' : l.status === 'terminado' ? '<span class="pill p-gray">Terminado</span>' : isNow(l) ? '<span class="pill p-brand">En vivo</span>' : '<span class="pill p-info">Programado</span>'}</td>
      <td><div class="actions">${l.link ? `<a class="btn sm" href="${esc(l.link)}" target="_blank" rel="noopener">Ver enlace</a>` : ''}${act ? `<button class="btn sm danger" data-end="${l.id}">Terminar</button>` : ''}</div></td></tr>`;
    const table = (list, act, empty) => `<div class="table-wrap"><table><thead><tr><th>Vivo</th><th>Tipo</th><th>Inicio</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((l) => row(l, act)).join('') || `<tr><td colspan="5" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
    main.innerHTML = head('Vivos', `${num(cur.length)} en este momento · ${num(next.length)} programados`) +
      `<div class="card" style="margin-bottom:14px"><div class="pad hd" style="margin:0"><h3><span class="dot ${cur.length ? 'live' : ''}"></span> En vivo ahora</h3></div>${table(cur, true, 'No hay vivos en este momento')}</div>
       <div class="card" style="margin-bottom:14px"><div class="pad hd" style="margin:0"><h3>Próximos</h3></div>${table(next, true, 'No hay vivos programados')}</div>
       <div class="card"><div class="pad hd" style="margin:0"><h3>Historial</h3></div>${table(past.slice(0, 100), false, 'Sin historial')}</div>`;
    main.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-end]'); if (!b) return; if (!confirmInline(b, '¿Terminar?')) return; b.disabled = true;
      try { ok(await sb.rpc('admin_end_live', { p_id: Number(b.dataset.end) })); toast('Vivo terminado'); route(); } catch (er) { toast(er.message); b.disabled = false; }
    });
  };

  VIEWS.mostrador = async (main) => {
    const items = ok(await sb.rpc('admin_mostrador'));
    const vig = items.filter((x) => x.vigente);
    main.innerHTML = head('Mostrador', `${num(vig.length)} publicaciones activas · se borran solas a las 24 h`) +
      `<div class="toolbar" style="margin-bottom:14px"><select class="select" id="fv"><option value="1">Activas</option><option value="">Todas (últimas 300)</option></select></div><div class="most-adm" id="mg"></div>`;
    const draw = () => { const v = document.getElementById('fv').value; const list = items.filter((x) => !v || x.vigente);
      document.getElementById('mg').innerHTML = list.map((x) => `<div class="card most-card"><div class="most-ph">${x.photo ? `<img src="${esc(x.photo)}" alt="" loading="lazy">` : ''}${x.vigente ? '' : '<span class="pill p-gray" style="position:absolute;left:8px;top:8px">Vencida</span>'}</div>
        <div class="pad" style="padding:10px 12px"><div class="cell-main">${esc(x.store)}</div><div class="small">${esc(x.caption || '—')}</div><div class="cell-sub">👁 ${num(x.views)} · ❤️ ${num(x.likes)} · ${esc(fdate(x.created_at))}</div>
        <button class="btn sm danger" style="margin-top:8px;width:100%" data-dm="${x.id}">Eliminar</button></div></div>`).join('') || '<div class="card empty">No hay publicaciones.</div>'; };
    draw(); document.getElementById('fv').addEventListener('input', draw);
    main.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-dm]'); if (!b) return;
      if (!(await confirmDelete('¿Eliminar esta publicación del Mostrador?', 'Desaparece para todos de inmediato.'))) return;
      b.disabled = true; try { ok(await sb.rpc('delete_mostrador', { p_id: Number(b.dataset.dm) })); toast('Publicación eliminada'); route(); } catch (er) { toast(er.message); b.disabled = false; }
    });
  };

  VIEWS.denuncias = async (main) => {
    const reps = ok(await sb.rpc('admin_reports'));
    const card = (r) => {
      const top = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>${esc(r.reporter || 'Usuario')}</b> <span class="small muted">${esc(r.reporter_email || '')}</span>
        <div class="small muted">${r.product_id != null ? 'Producto de ' + esc(r.store || 'tienda') : r.conversation_id != null ? 'Conversación con ' + esc(r.store || 'tienda') + (r.buyer_name ? ' · cliente ' + esc(r.buyer_name) : '') : 'Producto ya eliminado'} · ${esc(fdate(r.created_at))}</div></div>
        <div style="display:flex;gap:8px;align-items:center">${r.status === 'abierta' ? '<span class="pill p-bad">Abierta</span>' : '<span class="pill p-gray">Revisada</span>'}${r.status === 'abierta' ? `<button class="btn sm" data-rev="${r.id}">Marcar revisada</button>` : ''}</div></div>
        <div><span class="small muted">Motivo:</span> ${esc(r.reason)}</div>`;
      const prod = r.product_id != null ? `<div class="rep-prod">${r.product_photo ? `<img src="${esc(r.product_photo)}" alt="" loading="lazy">` : '<span class="rep-ph">📦</span>'}
        <div style="flex:1;min-width:0"><div class="cell-main">${esc(r.product_name || '')}</div><div class="cell-sub">${clp(r.product_price || 0)} · ${esc(r.store || '')} · <b>${num(r.product_reports || 0)}</b> denuncia(s)</div>
        <div style="margin-top:4px">${r.product_active ? '<span class="pill p-ok">Publicado</span>' : '<span class="pill p-gray">Oculto</span>'}</div></div>
        <div class="actions">${r.product_active ? `<button class="btn sm" data-pp="${r.product_id}" data-a="0">Ocultar</button>` : `<button class="btn sm" data-pp="${r.product_id}" data-a="1">Publicar</button>`}<button class="btn sm danger" data-delp="${r.product_id}" data-n="${esc(r.product_name || '')}" data-st="${esc(r.store || '')}">Eliminar producto</button></div></div>` : '';
      const msgs = r.last_messages && r.last_messages.length ? `<div class="msgs">${r.last_messages.slice().reverse().map((m) => `<div><b>${esc(m.from)}:</b>${esc(m.body || '(compartió un producto)')}</div>`).join('')}</div>` : '';
      return `<div class="report">${top}${prod}${msgs}</div>`;
    };
    const open = reps.filter((r) => r.status === 'abierta');
    main.innerHTML = head('Denuncias', `${num(open.length)} abiertas · ${num(reps.length)} en total`) +
      `<div class="card pad rules-box"><b>Reglas que se vigilan:</b> copias/réplicas, drogas, medicamentos, armas, tabaco/vapeadores, documentos falsos, contenido sexual, cosas robadas y cuentas piratas. El sistema bloquea solo los textos con esas palabras y oculta automáticamente un producto con 3 denuncias de personas distintas. Revisa, elimina el producto si incumple y suspende la tienda o el usuario si es grave.</div>
      <div class="toolbar" style="margin:14px 0"><select class="select" id="ft"><option value="">Todas</option><option value="p">Productos</option><option value="c">Conversaciones</option></select><select class="select" id="fs"><option value="abierta">Abiertas</option><option value="">Todas</option></select></div>
      <div class="card" id="rl"></div>`;
    const draw = () => { const t = document.getElementById('ft').value, st = document.getElementById('fs').value;
      document.getElementById('rl').innerHTML = reps.filter((r) => (!st || r.status === st) && (!t || (t === 'p' ? r.conversation_id == null : r.conversation_id != null))).map(card).join('') || '<div class="empty">No hay denuncias. 👍</div>'; };
    draw(); ['ft', 'fs'].forEach((id) => document.getElementById(id).addEventListener('input', draw));
    main.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-delp]');
      if (d) {
        if (!(await confirmDelete('¿Eliminar "' + d.dataset.n + '"?', `El producto de <b>${esc(d.dataset.st)}</b> se borrará para siempre. La denuncia queda marcada como revisada.`))) return;
        d.disabled = true; const pid = Number(d.dataset.delp);
        try { ok(await sb.rpc('admin_delete_product', { p_id: pid }));
          for (const r of reps.filter((x) => x.product_id === pid && x.status === 'abierta')) { try { ok(await sb.rpc('admin_review_report', { p_id: r.id })); } catch { /* sigue */ } }
          toast('Producto eliminado'); route(); } catch (er) { toast(er.message); d.disabled = false; }
        return;
      }
      const pp = e.target.closest('[data-pp]');
      if (pp) { pp.disabled = true;
        try { ok(await sb.rpc('admin_set_product_active', { p_id: Number(pp.dataset.pp), p_active: pp.dataset.a === '1' })); reps.filter((x) => x.product_id === Number(pp.dataset.pp)).forEach((x) => { x.product_active = pp.dataset.a === '1'; }); toast(pp.dataset.a === '1' ? 'Producto publicado' : 'Producto ocultado'); draw(); }
        catch (er) { toast(/LIMITE_PLAN/.test(er.message) ? 'La tienda llegó al límite de su plan' : er.message); pp.disabled = false; }
        return;
      }
      const b = e.target.closest('[data-rev]'); if (!b) return; b.disabled = true;
      try { ok(await sb.rpc('admin_review_report', { p_id: Number(b.dataset.rev) })); toast('Denuncia revisada'); route(); } catch (er) { toast(er.message); b.disabled = false; }
    });
  };

  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && state.user) { state.user = null; loginView(); } });
  boot();
})();
