/* EmprenLive — Chats, Mostrador (estados de 24 h) y ventas desde la conversación.
   Datos reales en Supabase. Con ?demo funciona sin conexión con datos de ejemplo. */
(function () {
  'use strict';
  const SB_URL = 'https://otxigqqzczzsckhsaggq.supabase.co';
  const SB_KEY = 'sb_publishable_Osm049nAqujqAtTNdGidxQ_r-j_2qgp';
  const DEMO = new URLSearchParams(location.search).has('demo');
  const STORY_MS = 6000;
  const ANDROID = window.EmprenLiveAndroid || null;          // dentro del APK
  const PUBLIC_URL = 'https://catos0508.github.io/caserito/app/'; // dirección pública para los enlaces @alias

  // ===================================================================== utilidades
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clp = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hora = (d) => new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  function fechaLista(d) {
    if (!d) return ''; const x = new Date(d), now = new Date(), ay = new Date(now - 864e5);
    if (sameDay(x, now)) return hora(x); if (sameDay(x, ay)) return 'Ayer';
    if (now - x < 6 * 864e5) return x.toLocaleDateString('es-CL', { weekday: 'long' });
    return x.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function diaSep(d) {
    const x = new Date(d), now = new Date();
    if (sameDay(x, now)) return 'Hoy'; if (sameDay(x, new Date(now - 864e5))) return 'Ayer';
    return x.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function hace(d) {
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return 'ahora'; if (s < 3600) return `hace ${Math.floor(s / 60)} min`; return `hace ${Math.floor(s / 3600)} h`;
  }
  function ultVez(d) {
    if (!d) return ''; const x = new Date(d);
    if (Date.now() - x < 90e3) return 'en línea';
    if (sameDay(x, new Date())) return 'últ. vez hoy a las ' + hora(x);
    if (sameDay(x, new Date(Date.now() - 864e5))) return 'últ. vez ayer a las ' + hora(x);
    return 'últ. vez el ' + x.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  }
  const PALETTE = ['#E0313B', '#D9480F', '#C2255C', '#7048E8', '#1971C2', '#0C8599', '#2B8A3E', '#E67700', '#5F3DC4', '#A61E4D'];
  const colorFor = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const nombre = (u) => (u && (u.name || u.nombre || (u.username ? '@' + u.username : ''))) || 'Usuario';
  function av(u, s = 48, extra = '') {
    const style = `--s:${s}px;--c:${colorFor(u?.id || u?.username || '?')}`;
    if (u && u.avatar) return `<img class="av ${extra}" style="${style}" src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy">`;
    const ini = nombre(u).replace('@', '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w[0])).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    return `<span class="av ${extra}" style="${style}" aria-hidden="true">${esc(ini)}</span>`;
  }
  const linkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2800); }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  async function comprimir(file, max = 1280, q = 0.82) {
    if (file instanceof Blob && !/^image\//.test(file.type)) throw new Error('El archivo debe ser una imagen');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No se pudo leer la imagen')); i.src = url; });
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
    } finally { URL.revokeObjectURL(url); }
  }
  const blobToDataUrl = (b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });

  // Íconos (trazo, heredan color)
  const I = (d, w = 22) => `<svg class="ic" style="width:${w}px;height:${w}px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.2A8 8 0 1 1 21 12z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
    clip: '<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    store: '<path d="M4 9l1-5h14l1 5"/><path d="M4 9v11h16V9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/>',
    bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    out: '<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    heart: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    next: '<path d="M9 18l6-6-6-6"/>',
  };
  const TICK1 = '<svg class="tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>';
  const TICK2 = (read) => `<svg class="tick ${read ? 'read' : ''}" viewBox="0 0 18 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8.5l3 3 7-7"/><path d="M8 11.5l7-7"/></svg>`;
  const CLOCK = `<svg class="tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/></svg>`;

  const ESTADOS = { nuevo: 'Nuevo', confirmado: 'Confirmado', pagado: 'Pagado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
  const SIGUIENTE = { nuevo: [['confirmado', 'Confirmar', 'ok'], ['cancelado', 'Rechazar', 'bad']], confirmado: [['pagado', 'Marcar pagado', 'ok'], ['cancelado', 'Cancelar', 'bad']], pagado: [['enviado', 'Marcar enviado', 'ok']], enviado: [['entregado', 'Entregado', 'ok']] };
  const RAPIDAS = ['❤️ Me gusta este producto', '🛒 Lo quiero', '¿Sigue disponible?', '¿Haces envíos?'];

  // ===================================================================== datos: Supabase
  function supaApi() {
    const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'emprenlive_app', flowType: 'pkce', detectSessionInUrl: true } });
    const ok = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
    const urls = new Map(); const outbox = new Map();
    let uid = null; let handlers = {};
    const api = {
      demo: false,
      async session() { const { data } = await sb.auth.getSession(); uid = data.session?.user.id || null; return data.session?.user || null; },
      async google() {
        if (!ANDROID) return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } });
        // En el APK Google no permite iniciar sesión dentro de la app: se abre el navegador y vuelve por emprenlive://auth
        const { data, error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'emprenlive://auth', skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
        if (error) throw error;
        ANDROID.openExternal(data.url);
      },
      async login(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async register(email, password, name) {
        const d = ok(await sb.auth.signUp({ email, password, options: { data: { name, full_name: name }, emailRedirectTo: location.origin + location.pathname } }));
        return !!d.session;
      },
      async logout() { await sb.removeAllChannels(); await sb.auth.signOut(); },
      async me() { return ok(await sb.from('profiles').select('id, name, email, phone, avatar, username, bio, status').eq('id', uid).maybeSingle()); },
      async saveProfile(p) { ok(await sb.rpc('guardar_perfil', { p_username: p.username, p_name: p.name, p_bio: p.bio || '', p_phone: p.phone || null })); },
      ping() { return sb.rpc('ping').then(() => {}, () => {}); },
      async chats() { return ok(await sb.rpc('mis_chats')); },
      async openChat(otro) { return ok(await sb.rpc('abrir_chat', { p_otro: otro })); },
      async messages(chat, before) {
        let q = sb.from('mensajes').select('*').eq('chat_id', chat).order('id', { ascending: false }).limit(60);
        if (before) q = q.lt('id', before);
        return ok(await q).reverse();
      },
      async send(chat, m) {
        let imagen = null;
        if (m.file) { const blob = await comprimir(m.file); imagen = `${chat}/${uuid()}.jpg`; ok(await sb.storage.from('chat').upload(imagen, blob, { contentType: 'image/jpeg' })); }
        return ok(await sb.from('mensajes').insert({ chat_id: chat, sender_id: uid, tipo: m.tipo, texto: m.texto || null, imagen, meta: m.meta || {} }).select().single());
      },
      markRead(chat) { return sb.rpc('marcar_leido', { p_chat: chat }).then(() => {}, () => {}); },
      async search(q) { return ok(await sb.rpc('buscar_usuarios', { q })); },
      async profile(id, username) { return (ok(await sb.rpc('perfil_publico', { p_id: id || null, p_username: username || null })) || [])[0] || null; },
      async contacts() { return ok(await sb.rpc('mis_contactos')); },
      async addContact(id) { ok(await sb.rpc('agregar_contacto', { p_id: id })); },
      async removeContact(id) { ok(await sb.from('contactos').delete().eq('owner_id', uid).eq('contact_id', id)); },
      async catalog(owner) { return ok(await sb.from('catalogo').select('*').eq('owner_id', owner).order('created_at', { ascending: false })); },
      async saveItem(it, file) {
        let imagen_url = it.imagen_url || null;
        if (file) {
          const blob = await comprimir(file, 1080); const path = `${uid}/${uuid()}.jpg`;
          ok(await sb.storage.from('catalogo').upload(path, blob, { contentType: 'image/jpeg' }));
          imagen_url = sb.storage.from('catalogo').getPublicUrl(path).data.publicUrl;
        }
        const row = { titulo: it.titulo, precio: it.precio, descripcion: it.descripcion || null, imagen_url, activo: it.activo !== false };
        return it.id ? ok(await sb.from('catalogo').update(row).eq('id', it.id).select().single()) : ok(await sb.from('catalogo').insert(row).select().single());
      },
      async deleteItem(id) { ok(await sb.from('catalogo').delete().eq('id', id)); },
      async order(chat, item, qty, nota) { return ok(await sb.rpc('crear_pedido', { p_chat: chat, p_item: item, p_cantidad: qty, p_nota: nota || null })); },
      async orderStatus(msg, estado) { ok(await sb.rpc('estado_pedido', { p_msg: msg, p_estado: estado })); },
      async orders() { return ok(await sb.from('mensajes').select('*').eq('tipo', 'pedido').order('id', { ascending: false }).limit(500)); },
      async feed() { return ok(await sb.rpc('mostrador_feed')); },
      async postStory(file, texto, precio, catalogo_id) {
        const blob = await comprimir(file, 1440, 0.85); const path = `${uid}/${Date.now()}-${uuid().slice(0, 8)}.jpg`;
        ok(await sb.storage.from('mostrador').upload(path, blob, { contentType: 'image/jpeg' }));
        try { ok(await sb.from('mostrador').insert({ imagen_path: path, texto: texto || null, precio: precio ?? null, catalogo_id: catalogo_id || null })); }
        catch (e) { await sb.storage.from('mostrador').remove([path]); throw e; }
      },
      async deleteStory(st) { ok(await sb.from('mostrador').delete().eq('id', st.id)); await sb.storage.from('mostrador').remove([st.imagen_path]); },
      async viewStory(id) { await sb.from('mostrador_vistas').upsert({ mostrador_id: id, viewer_id: uid }, { ignoreDuplicates: true }); },
      async storyViews(id) { return ok(await sb.rpc('vistas_mostrador', { p_id: id })); },
      async replyStory(id, texto) { return ok(await sb.rpc('responder_mostrador', { p_id: id, p_texto: texto })); },
      // Borra las fotos propias del Mostrador que ya tienen más de 24 h (el nombre empieza con la hora de subida).
      async cleanMine() {
        const { data } = await sb.storage.from('mostrador').list(uid, { limit: 200 });
        const old = (data || []).filter((f) => Number(f.name.split('-')[0]) < Date.now() - 864e5).map((f) => `${uid}/${f.name}`);
        if (old.length) await sb.storage.from('mostrador').remove(old);
      },
      // URL firmada (los archivos privados caducan; las del Mostrador nunca duran más que el estado)
      async img(bucket, path, maxSec = 3600) {
        if (!path) return '';
        const k = bucket + '/' + path, c = urls.get(k);
        if (c && c.exp > Date.now() + 30e3) return c.url;
        const ttl = Math.max(30, Math.floor(maxSec));
        const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, ttl);
        if (error) return '';
        urls.set(k, { url: data.signedUrl, exp: Date.now() + ttl * 1000 });
        return data.signedUrl;
      },
      subscribe(h) {
        handlers = h;
        sb.channel('db')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (p) => h.message(p.new, 'INSERT'))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes' }, (p) => h.message(p.new, 'UPDATE'))
          .subscribe();
        const pres = sb.channel('online', { config: { presence: { key: uid } } });
        pres.on('presence', { event: 'sync' }, () => h.online(new Set(Object.keys(pres.presenceState()))))
          .subscribe(async (s) => { if (s === 'SUBSCRIBED') await pres.track({ t: Date.now() }); });
        sb.channel('t:' + uid).on('broadcast', { event: 't' }, ({ payload }) => h.typing(payload.chat, payload.from)).subscribe();
      },
      typing(chat, to) {
        let ch = outbox.get(to);
        if (!ch) { ch = sb.channel('t:' + to); ch.subscribe(); outbox.set(to, ch); }
        ch.send({ type: 'broadcast', event: 't', payload: { chat, from: uid } }).catch(() => {});
      },
    };
    void handlers;
    return api;
  }

  // ===================================================================== datos: demo (sin conexión)
  function demoApi() {
    const art = (emoji, c1, c2, w = 600, h = 600, label = '') => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 40 + Math.random() * 120, 0, 7); g.fill(); }
      g.font = `${Math.round(Math.min(w, h) * 0.42)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, w / 2, h / 2 - (label ? h * 0.05 : 0));
      if (label) { g.font = `800 ${Math.round(w * 0.075)}px system-ui`; g.fillStyle = '#fff'; g.fillText(label, w / 2, h * 0.8); }
      return c.toDataURL('image/jpeg', 0.8);
    };
    const now = Date.now(), min = 60e3, h = 3600e3;
    const me = { id: 'me', username: 'tu.tienda', name: 'Tu Tienda', bio: 'Accesorios hechos a mano', phone: '+56 9 1234 5678', status: 'active' };
    const U = {
      vale: { id: 'vale', username: 'dulces.vale', name: 'Dulces de la Vale', bio: 'Tortas y cupcakes por encargo · Maipú' },
      cami: { id: 'cami', username: 'moda.cami', name: 'Camila · Moda', bio: 'Ropa de temporada, envíos a todo Chile' },
      juan: { id: 'juan', username: 'tecno.juan', name: 'Juan Tecno', bio: 'Accesorios para celular' },
      pepe: { id: 'pepe', username: 'huerta.pepe', name: 'Huerta Don Pepe', bio: 'Verduras orgánicas a domicilio' },
      ana: { id: 'ana', username: 'ana.compras', name: 'Ana Rojas', bio: '' },
    };
    const users = [me, ...Object.values(U)];
    let seq = 100;
    const cat = [
      { id: 1, owner_id: 'me', titulo: 'Aros de mostacilla', precio: 6990, descripcion: 'Hechos a mano, varios colores', imagen_url: art('💎', '#C2255C', '#F783AC'), activo: true },
      { id: 2, owner_id: 'me', titulo: 'Pulsera tejida', precio: 4500, descripcion: '', imagen_url: art('📿', '#7048E8', '#B197FC'), activo: true },
      { id: 3, owner_id: 'vale', titulo: 'Torta tres leches (15 p.)', precio: 22000, descripcion: 'Pedir con 2 días de anticipación', imagen_url: art('🎂', '#E67700', '#FFD43B'), activo: true },
      { id: 4, owner_id: 'vale', titulo: 'Caja 6 cupcakes', precio: 9900, descripcion: '', imagen_url: art('🧁', '#D6336C', '#FCC2D7'), activo: true },
      { id: 5, owner_id: 'cami', titulo: 'Polerón oversize', precio: 18990, descripcion: 'Tallas S a XL', imagen_url: art('🧥', '#1971C2', '#74C0FC'), activo: true },
      { id: 6, owner_id: 'cami', titulo: 'Jeans mom', precio: 21990, descripcion: '', imagen_url: art('👖', '#364FC7', '#91A7FF'), activo: true },
      { id: 7, owner_id: 'juan', titulo: 'Audífonos bluetooth', precio: 14990, descripcion: 'Garantía 3 meses', imagen_url: art('🎧', '#212529', '#868E96'), activo: true },
      { id: 8, owner_id: 'pepe', titulo: 'Caja de verduras', precio: 12000, descripcion: 'Lechuga, tomate, zapallo, cilantro', imagen_url: art('🥬', '#2B8A3E', '#8CE99A'), activo: true },
    ];
    const chats = [{ id: 1, a: 'me', b: 'vale' }, { id: 2, a: 'me', b: 'cami' }, { id: 3, a: 'me', b: 'ana' }, { id: 4, a: 'me', b: 'juan' }];
    const contactos = new Set(['vale', 'cami', 'juan', 'ana']);
    const msgs = [];
    const add = (chat, sender, tipo, texto, at, extra = {}) => { const m = { id: ++seq, chat_id: chat, sender_id: sender, tipo, texto, imagen: null, meta: {}, created_at: new Date(at).toISOString(), leido_at: sender === 'me' ? new Date(at + min).toISOString() : (now - at > 30 * min ? new Date(at + min).toISOString() : null), ...extra }; msgs.push(m); return m; };
    add(1, 'vale', 'texto', 'Hola! Vi tus aros en el Mostrador 😍', now - 26 * h);
    add(1, 'me', 'texto', 'Hola Vale! Sí, me quedan en rojo y turquesa', now - 26 * h + 3 * min);
    add(1, 'vale', 'producto', 'Te dejo mi torta por si te tinca para el cumpleaños 🎂', now - 25 * h, { meta: { catalogo_id: 3, titulo: cat[2].titulo, precio: cat[2].precio, imagen_url: cat[2].imagen_url, vendedor_id: 'vale' } });
    add(1, 'vale', 'texto', '¿Me guardas unos turquesa para el sábado?', now - 40 * min);
    add(1, 'vale', 'texto', 'Te transfiero hoy 🙌', now - 38 * min);
    add(2, 'me', 'texto', 'Hola Cami, ¿el polerón viene en talla M?', now - 3 * h);
    add(2, 'cami', 'texto', 'Siii, en negro y beige', now - 3 * h + 4 * min);
    add(2, 'me', 'pedido', 'Color beige porfa', now - 2 * h, { meta: { catalogo_id: 5, titulo: cat[4].titulo, precio: cat[4].precio, cantidad: 1, imagen_url: cat[4].imagen_url, vendedor_id: 'cami', estado: 'confirmado' } });
    add(2, 'cami', 'texto', 'Confirmado! Te lo envío mañana por Starken 📦', now - 2 * h + 6 * min);
    add(3, 'ana', 'mostrador', '❤️ Me gusta este producto', now - 50 * min, { meta: { mostrador_id: 900, imagen_path: 'demo-story-me', texto: '¡Llegaron aros nuevos!', precio: 6990, expira_at: new Date(now + 20 * h).toISOString() } });
    add(3, 'ana', 'pedido', '¿Me los puedes enviar a Ñuñoa?', now - 45 * min, { meta: { catalogo_id: 1, titulo: cat[0].titulo, precio: cat[0].precio, cantidad: 2, imagen_url: cat[0].imagen_url, vendedor_id: 'me', estado: 'nuevo' } });
    add(4, 'juan', 'texto', 'Gracias por la compra! Cualquier cosa me escribes', now - 4 * 864e5);
    add(4, 'me', 'texto', 'Gracias a ti 🙌', now - 4 * 864e5 + 10 * min);
    const imgs = { 'demo-story-me': art('💎', '#C2255C', '#F783AC', 720, 1120, 'AROS NUEVOS') };
    const stories = [
      { id: 900, owner_id: 'me', imagen_path: 'demo-story-me', texto: '¡Llegaron aros nuevos!', precio: 6990, catalogo_id: 1, created_at: new Date(now - 4 * h).toISOString(), vistas: ['ana', 'vale', 'cami'] },
      { id: 901, owner_id: 'vale', imagen_path: 's1', texto: 'Tortas para este fin de semana 🎂 ¡Quedan 3 cupos!', precio: 22000, catalogo_id: 3, created_at: new Date(now - 2 * h).toISOString(), vistas: [] },
      { id: 902, owner_id: 'vale', imagen_path: 's2', texto: 'Cupcakes de frutilla, solo hoy', precio: 9900, catalogo_id: 4, created_at: new Date(now - 70 * min).toISOString(), vistas: [] },
      { id: 903, owner_id: 'cami', imagen_path: 's3', texto: 'Nueva colección otoño 🍂', precio: null, created_at: new Date(now - 5 * h).toISOString(), vistas: [] },
      { id: 904, owner_id: 'pepe', imagen_path: 's4', texto: 'Cajas de verduras frescas, despacho martes y jueves', precio: 12000, catalogo_id: 8, created_at: new Date(now - 9 * h).toISOString(), vistas: ['me'] },
    ];
    imgs.s1 = art('🎂', '#E67700', '#FFD43B', 720, 1120, 'TRES LECHES'); imgs.s2 = art('🧁', '#D6336C', '#FCC2D7', 720, 1120, 'SOLO HOY');
    imgs.s3 = art('🍂', '#1971C2', '#74C0FC', 720, 1120, 'COLECCIÓN OTOÑO'); imgs.s4 = art('🥕', '#2B8A3E', '#8CE99A', 720, 1120, 'DESPACHO GRATIS');
    stories.forEach((s) => { s.expira_at = new Date(new Date(s.created_at).getTime() + 864e5).toISOString(); });
    let H = {}; const online = new Set(['me', 'vale', 'ana']);
    const lastSeen = { cami: new Date(now - 12 * min).toISOString(), juan: new Date(now - 26 * h).toISOString(), pepe: new Date(now - 3 * h).toISOString() };
    const pub = (u) => u && ({ id: u.id, username: u.username, name: u.name, avatar: u.avatar || null, bio: u.bio || '', last_seen: lastSeen[u.id] || new Date().toISOString(), es_contacto: contactos.has(u.id), productos: cat.filter((k) => k.owner_id === u.id && k.activo).length });
    const other = (c) => (c.a === 'me' ? c.b : c.a);
    const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
    const emit = (m, ev) => setTimeout(() => H.message && H.message(JSON.parse(JSON.stringify(m)), ev), 30);
    const REPLIES = ['¡Hola! Sí, todavía me queda 😊', 'Dale, te lo guardo', 'Hago envíos por Starken o retiro en Metro', 'Te paso los datos para transferir 👍', 'Perfecto, ¡gracias por tu compra!'];
    let ri = 0;
    function botReply(chatId) {
      const c = chats.find((x) => x.id === chatId); const o = other(c); if (o === 'me') return;
      online.add(o); H.online && H.online(new Set(online));
      setTimeout(() => {
        const theirs = msgs.filter((m) => m.chat_id === chatId && m.sender_id === 'me' && !m.leido_at);
        theirs.forEach((m) => { m.leido_at = new Date().toISOString(); emit(m, 'UPDATE'); });
        H.typing && H.typing(chatId, o);
      }, 900);
      setTimeout(() => {
        const ped = msgs.filter((m) => m.chat_id === chatId && m.tipo === 'pedido' && m.meta.estado === 'nuevo' && m.meta.vendedor_id === o).pop();
        if (ped) { ped.meta = { ...ped.meta, estado: 'confirmado' }; emit(ped, 'UPDATE'); }
        const m = add(chatId, o, 'texto', ped ? '¡Pedido confirmado! Te escribo para coordinar el envío 📦' : REPLIES[ri++ % REPLIES.length], Date.now());
        m.leido_at = null; emit(m, 'INSERT');
      }, 2600);
    }
    return {
      demo: true,
      async session() { return { id: 'me' }; },
      async me() { return { ...me }; },
      async saveProfile(p) { Object.assign(me, { username: p.username, name: p.name, bio: p.bio, phone: p.phone || me.phone }); },
      ping() {}, logout() { location.href = location.pathname; },
      async chats() {
        await wait();
        return chats.map((c) => {
          const o = users.find((u) => u.id === other(c)); const l = msgs.filter((m) => m.chat_id === c.id).pop();
          return { chat_id: c.id, otro_id: o.id, username: o.username, name: o.name, avatar: null, last_seen: pub(o).last_seen, ultimo_tipo: l?.tipo, ultimo_texto: l?.texto, ultimo_sender: l?.sender_id, ultimo_leido: l?.leido_at, ultimo_at: l?.created_at || new Date().toISOString(), no_leidos: msgs.filter((m) => m.chat_id === c.id && m.sender_id !== 'me' && !m.leido_at).length };
        }).sort((a, b) => new Date(b.ultimo_at) - new Date(a.ultimo_at));
      },
      async openChat(o) { let c = chats.find((x) => other(x) === o); if (!c) { c = { id: chats.length + 1, a: 'me', b: o }; chats.push(c); } contactos.add(o); return c.id; },
      async messages(chat, before) { await wait(); const l = msgs.filter((m) => m.chat_id === chat && (!before || m.id < before)); return JSON.parse(JSON.stringify(l.slice(-60))); },
      async send(chat, m) {
        await wait(250); let imagen = null;
        if (m.file) { const b = await comprimir(m.file); imagen = 'up-' + (++seq); imgs[imagen] = await blobToDataUrl(b); }
        const r = add(chat, 'me', m.tipo, m.texto || null, Date.now(), { imagen, meta: m.meta || {} }); r.leido_at = null;
        emit(r, 'INSERT'); botReply(chat); return JSON.parse(JSON.stringify(r));
      },
      markRead(chat) { msgs.filter((m) => m.chat_id === chat && m.sender_id !== 'me' && !m.leido_at).forEach((m) => { m.leido_at = new Date().toISOString(); }); },
      async search(q) { q = q.toLowerCase().replace(/^@/, ''); await wait(); return users.filter((u) => u.id !== 'me' && (u.username.startsWith(q) || u.name.toLowerCase().includes(q))).map(pub); },
      async profile(id, username) { await wait(); return pub(users.find((u) => (id && u.id === id) || (username && u.username === username.replace(/^@/, '')))) || null; },
      async contacts() { return users.filter((u) => contactos.has(u.id)).map(pub); },
      async addContact(id) { contactos.add(id); },
      async removeContact(id) { contactos.delete(id); },
      async catalog(owner) { await wait(); return cat.filter((k) => k.owner_id === owner && (k.activo || owner === 'me')).map((k) => ({ ...k })); },
      async saveItem(it, file) {
        let imagen_url = it.imagen_url || null; if (file) imagen_url = await blobToDataUrl(await comprimir(file, 1080));
        if (it.id) { const k = cat.find((x) => x.id === it.id); Object.assign(k, it, { imagen_url }); return { ...k }; }
        const k = { ...it, id: ++seq, owner_id: 'me', imagen_url, activo: true, created_at: new Date().toISOString() }; cat.unshift(k); return { ...k };
      },
      async deleteItem(id) { cat.splice(cat.findIndex((k) => k.id === id), 1); },
      async order(chat, item, qty, nota) {
        const k = cat.find((x) => x.id === item);
        const r = add(chat, 'me', 'pedido', nota || null, Date.now(), { meta: { catalogo_id: k.id, titulo: k.titulo, precio: k.precio, cantidad: qty, imagen_url: k.imagen_url, vendedor_id: k.owner_id, estado: 'nuevo' } });
        r.leido_at = null; emit(r, 'INSERT'); botReply(chat); return r.id;
      },
      async orderStatus(id, estado) { const m = msgs.find((x) => x.id === id); m.meta = { ...m.meta, estado }; emit(m, 'UPDATE'); },
      async orders() { return JSON.parse(JSON.stringify(msgs.filter((m) => m.tipo === 'pedido').reverse())); },
      async feed() {
        await wait();
        const live = stories.filter((s) => new Date(s.expira_at) > Date.now());
        const owners = [...new Set(live.map((s) => s.owner_id))];
        return owners.map((o) => { const u = users.find((x) => x.id === o); return { owner_id: o, username: u.username, name: u.name, avatar: null, items: live.filter((s) => s.owner_id === o).map((s) => ({ ...s, visto: s.vistas.includes('me'), vistas: o === 'me' ? s.vistas.length : null })) }; })
          .sort((a, b) => (b.owner_id === 'me') - (a.owner_id === 'me') || new Date(b.items.at(-1).created_at) - new Date(a.items.at(-1).created_at));
      },
      async postStory(file, texto, precio, catalogo_id) {
        await wait(400); const p = 'st-' + (++seq); imgs[p] = await blobToDataUrl(await comprimir(file, 1440, 0.85));
        stories.push({ id: ++seq, owner_id: 'me', imagen_path: p, texto, precio, catalogo_id, created_at: new Date().toISOString(), expira_at: new Date(Date.now() + 864e5).toISOString(), vistas: [] });
      },
      async deleteStory(st) { stories.splice(stories.findIndex((s) => s.id === st.id), 1); },
      async viewStory(id) { const s = stories.find((x) => x.id === id); if (s && !s.vistas.includes('me')) s.vistas.push('me'); },
      async storyViews(id) { const s = stories.find((x) => x.id === id); return (s?.vistas || []).map((v, i) => ({ ...pub(users.find((u) => u.id === v)), visto_at: new Date(Date.now() - (i + 1) * 23 * min).toISOString() })); },
      async replyStory(id, texto) {
        const s = stories.find((x) => x.id === id); const cid = await this.openChat(s.owner_id);
        const r = add(cid, 'me', 'mostrador', texto, Date.now(), { meta: { mostrador_id: s.id, imagen_path: s.imagen_path, texto: s.texto, precio: s.precio, expira_at: s.expira_at } });
        r.leido_at = null; emit(r, 'INSERT'); botReply(cid); return cid;
      },
      async cleanMine() {},
      async img(bucket, path) { return imgs[path] || path || ''; },
      subscribe(h) { H = h; setTimeout(() => h.online(new Set(online)), 50); },
      typing() {},
    };
  }

  // ===================================================================== estado
  const api = DEMO ? demoApi() : supaApi();
  const S = {
    me: null, tab: 'chats', side: null, pane: null, chats: [], feed: [], contacts: [],
    chat: null, msgs: [], loadingOlder: false, noMore: false,
    online: new Set(), typing: {}, myCatalog: [], orders: null, filter: 'todos',
  };
  const root = $('#root'), layer = $('#layer');
  const isMobile = () => matchMedia('(max-width:820px)').matches;

  // ===================================================================== arranque y acceso
  async function boot() {
    if (location.hash.startsWith('#@')) sessionStorage.setItem('el_link', location.hash.slice(2));
    try { applyTheme(localStorage.getItem('el_theme')); } catch { /* sin almacenamiento */ }
    let user = null;
    try { user = await api.session(); } catch { /* sin sesión */ }
    if (!user) return authView();
    if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + (DEMO ? '?demo' : '') + location.hash);
    try { S.me = await api.me(); } catch (e) { return authView('No se pudo cargar tu perfil: ' + e.message); }
    if (!S.me) return authView('Tu cuenta aún no tiene perfil. Termina el registro en la app de EmprenLive o vuelve a intentarlo.');
    if (S.me.status && S.me.status !== 'active') { await api.logout(); return authView('Tu cuenta está suspendida.'); }
    if (!S.me.username) return onboarding();
    startApp();
  }

  function authView(err = '', mode = 'login') {
    root.innerHTML = `<div class="auth"><section class="auth-art">
      <div class="logo"><img src="icon.svg" alt="">EmprenLive</div>
      <div style="position:relative;display:flex;flex-direction:column;gap:14px"><h1>Vende conversando, como en tu chat de siempre.</h1><p>Agrega contactos por su @alias, chatea en vivo, recibe pedidos dentro de la conversación y muestra tus productos en tu Mostrador de 24 horas.</p></div>
      <div class="feats">
        <div class="feat"><i>💬</i><div><b>Chat en vivo</b>Mensajes al instante, con visto y "escribiendo…".</div></div>
        <div class="feat"><i>🕒</i><div><b>Mostrador de 24 h</b>Fotos de tus productos que desaparecen solas al día siguiente.</div></div>
        <div class="feat"><i>🧾</i><div><b>Pedidos en el chat</b>Tu cliente pide desde tu vitrina y tú confirmas con un toque.</div></div>
      </div></section>
      <section class="auth-box"><form class="auth-card" id="af">
        <h2 style="font-size:26px">${mode === 'login' ? 'Ingresa a tus chats' : 'Crea tu cuenta'}</h2>
        <div class="seg"><button type="button" data-m="login" class="${mode === 'login' ? 'on' : ''}">Ingresar</button><button type="button" data-m="reg" class="${mode === 'reg' ? 'on' : ''}">Crear cuenta</button></div>
        ${err ? `<div class="err">${esc(err)}</div>` : ''}
        <button class="btn lg ghost" type="button" id="gBtn"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continuar con Google</button>
        <div class="sep">o con tu correo</div>
        ${mode === 'reg' ? '<div class="field"><label for="nm">Nombre</label><input class="input" id="nm" required autocomplete="name"></div>' : ''}
        <div class="field"><label for="em">Correo</label><input class="input" id="em" type="email" required autocomplete="email"></div>
        <div class="field"><label for="pw">Contraseña</label><input class="input" id="pw" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></div>
        <button class="btn brand lg" type="submit">${mode === 'login' ? 'Ingresar' : 'Crear cuenta'}</button>
        ${mode === 'reg' ? '<p class="small muted" style="margin:0">Al crear tu cuenta aceptas los <a href="../terminos.html" target="_blank">términos</a> y la <a href="../privacidad.html" target="_blank">política de privacidad</a>.</p>' : ''}
        <p class="demo-link">¿Solo quieres mirar? <a href="?demo">Prueba la demo</a></p>
      </form></section></div>`;
    root.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => authView('', b.dataset.m); });
    $('#gBtn').onclick = () => Promise.resolve(api.google()).catch((er) => authView(er.message, mode));
    $('#af').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, b = f.querySelector('[type=submit]'); b.disabled = true;
      try {
        if (mode === 'login') await api.login(f.em.value.trim(), f.pw.value);
        else { const ses = await api.register(f.em.value.trim(), f.pw.value, f.nm.value.trim()); if (!ses) { b.disabled = false; return authView('Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego ingresa aquí.', 'login'); } }
        boot();
      } catch (er) { b.disabled = false; authView(mode === 'login' ? 'Correo o contraseña incorrectos.' : er.message, mode); }
    };
  }

  function onboarding(err = '') {
    const sug = (S.me.username || (S.me.name || S.me.email || '').split('@')[0]).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_.]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 20);
    root.innerHTML = `<div class="auth"><section class="auth-art"><div class="logo"><img src="icon.svg" alt="">EmprenLive</div>
      <div style="position:relative"><h1>Elige tu @alias</h1><p>Es tu nombre de usuario: con él te encuentran, te agregan a contactos y te escriben. Compártelo en tus redes para recibir pedidos.</p></div><span></span></section>
      <section class="auth-box"><form class="auth-card" id="of">
        <h2 style="font-size:24px">Tu perfil</h2>${err ? `<div class="err">${esc(err)}</div>` : ''}
        <div class="field"><label for="us">Alias</label><div class="prefix"><span>@</span><input class="input" id="us" required minlength="3" maxlength="20" pattern="[a-z0-9_.]{3,20}" value="${esc(sug)}" autocapitalize="off" autocomplete="username"></div><span class="hint">3 a 20 caracteres: minúsculas, números, punto o guion bajo.</span></div>
        <div class="field"><label for="nm">Nombre o nombre de tu tienda</label><input class="input" id="nm" required maxlength="60" value="${esc(S.me.name || '')}"></div>
        <div class="field"><label for="ph">Celular con WhatsApp</label><input class="input" id="ph" type="tel" required value="${esc(S.me.phone || '')}" placeholder="+56 9 1234 5678" autocomplete="tel"><span class="hint">Obligatorio según los términos. No se muestra a otros usuarios.</span></div>
        <div class="field"><label for="bi">Descripción (opcional)</label><input class="input" id="bi" maxlength="140" value="${esc(S.me.bio || '')}" placeholder="Ej: Tortas por encargo · Maipú"></div>
        <button class="btn brand lg" type="submit">Continuar</button>
        <button class="btn lg ghost" type="button" id="lo">Cerrar sesión</button>
      </form></section></div>`;
    $('#us').oninput = (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''); };
    $('#lo').onclick = async () => { await api.logout(); authView(); };
    $('#of').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target; f.querySelector('[type=submit]').disabled = true;
      const p = { username: f.us.value.trim(), name: f.nm.value.trim(), bio: f.bi.value.trim(), phone: f.ph.value.trim() };
      try { await api.saveProfile(p); Object.assign(S.me, p); startApp(); } catch (er) { onboarding(er.message); }
    };
  }

  // ===================================================================== aplicación
  async function startApp() {
    root.innerHTML = `<div class="app" id="app">
      <aside class="side">${DEMO ? '<div class="demo-flag">Modo demo · nada se guarda · <a href="./">Ingresar de verdad</a></div>' : ''}<header class="side-h"><span class="brand">EmprenLive</span>
        <button class="icon-btn" data-act="addStory" title="Publicar en mi Mostrador" aria-label="Publicar en mi Mostrador">${I(IC.camera)}</button>
        <button class="icon-btn" data-act="newChat" title="Nuevo chat" aria-label="Nuevo chat">${I(IC.chat)}</button>
        <button data-act="profile" title="Mi perfil" aria-label="Mi perfil" style="border-radius:50%">${av(S.me, 34)}</button></header>
        <nav class="tabs" id="tabs"></nav><div class="side-body" id="sideBody"></div><div id="fab"></div></aside>
      <main class="pane" id="pane"></main></div>`;
    renderTabs(); renderSide(); renderPane();
    api.subscribe({ message: onMessage, online: (set) => { S.online = set; refreshPresence(); }, typing: onTyping });
    await Promise.all([loadChats(), loadFeed(), loadOrders()]);
    api.ping(); setInterval(() => api.ping(), 60e3);
    setInterval(() => { if (S.tab === 'mostrador' || S.tab === 'chats') loadFeed(); }, 120e3);
    api.cleanMine().catch(() => {});
    const link = sessionStorage.getItem('el_link');
    if (link) { sessionStorage.removeItem('el_link'); history.replaceState(null, '', location.pathname + location.search); openByAlias(link); }
    window.addEventListener('focus', () => { if (S.chat) api.markRead(S.chat.chat_id); });
  }

  async function loadChats() { try { S.chats = await api.chats(); } catch (e) { toast(e.message); } renderTabs(); if (S.tab === 'chats' && !S.side) renderSide(); updateTitle(); }
  async function loadFeed() { try { S.feed = await api.feed(); } catch { /* el Mostrador puede no estar disponible aún */ } renderTabs(); if ((S.tab === 'chats' || S.tab === 'mostrador') && !S.side) renderSide(); }
  async function loadOrders() { try { S.orders = await api.orders(); } catch { S.orders = []; } renderTabs(); if (S.tab === 'ventas' && !S.side) renderSide(); if (S.pane && (S.pane.v === 'recibidos' || S.pane.v === 'compras')) renderPane(); }
  function updateTitle() { const n = S.chats.reduce((a, c) => a + (c.no_leidos ? 1 : 0), 0); document.title = (n ? `(${n}) ` : '') + 'EmprenLive · Chats'; }

  function renderTabs() {
    const el = $('#tabs'); if (!el) return;
    const unread = S.chats.filter((c) => c.no_leidos).length;
    const newStories = S.feed.filter((g) => g.owner_id !== S.me.id && g.items.some((i) => !i.visto)).length;
    const pend = (S.orders || []).filter((o) => o.meta.vendedor_id === S.me.id && o.meta.estado === 'nuevo').length;
    const t = (id, label, n) => `<button data-act="tab" data-id="${id}" class="${S.tab === id ? 'on' : ''}">${label}${n ? `<span class="badge">${n}</span>` : ''}</button>`;
    el.innerHTML = t('chats', 'Chats', unread) + t('mostrador', 'Mostrador', newStories) + t('ventas', 'Ventas', pend);
  }

  // ---------------------------------------------------------- columna izquierda
  function renderSide() {
    const body = $('#sideBody'); if (!body) return;
    const fab = $('#fab');
    if (S.side === 'nuevo') { fab.innerHTML = ''; return sideNewChat(body); }
    if (S.side === 'perfil') { fab.innerHTML = ''; return sideProfile(body); }
    if (S.tab === 'chats') {
      fab.innerHTML = `<button class="fab" data-act="newChat" aria-label="Nuevo chat">${I(IC.chat)}</button>`;
      const q = (S.q || '').toLowerCase();
      const list = S.chats.filter((c) => !q || (c.name + ' ' + c.username).toLowerCase().includes(q));
      body.innerHTML = storyStrip() + `<div class="search">${I(IC.search)}<input class="input" id="cq" placeholder="Buscar chat" value="${esc(S.q || '')}" aria-label="Buscar chat"></div>` +
        (list.map(chatRow).join('') || `<div class="empty"><b>${q ? 'Sin resultados' : 'Aún no tienes chats'}</b>${q ? '' : 'Toca el botón de chat para buscar a alguien por su @alias.'}</div>`);
      const inp = $('#cq'); inp.oninput = () => { S.q = inp.value; const pos = inp.selectionStart; renderSide(); const n = $('#cq'); n.focus(); n.setSelectionRange(pos, pos); };
    } else if (S.tab === 'mostrador') {
      fab.innerHTML = `<button class="fab" data-act="addStory" aria-label="Publicar en mi Mostrador">${I(IC.camera)}</button>`;
      body.innerHTML = mostradorList();
    } else {
      fab.innerHTML = '';
      body.innerHTML = ventasMenu();
    }
  }

  function chatRow(c) {
    const mine = c.ultimo_sender === S.me.id; const typing = S.typing[c.chat_id] && Date.now() - S.typing[c.chat_id] < 4000;
    const prev = { imagen: '📷 Foto', producto: '🛍️ Producto', pedido: '🧾 Pedido', mostrador: '🕒 Respondió a un Mostrador' }[c.ultimo_tipo];
    const txt = c.ultimo_tipo === 'texto' || !prev ? (c.ultimo_texto || '') : prev + (c.ultimo_texto && c.ultimo_tipo !== 'mostrador' ? ': ' + c.ultimo_texto : c.ultimo_tipo === 'mostrador' && c.ultimo_texto ? ': ' + c.ultimo_texto : '');
    const ring = S.feed.find((g) => g.owner_id === c.otro_id);
    const u = { id: c.otro_id, name: c.name, username: c.username, avatar: c.avatar };
    const avh = av(u, 50, S.online.has(c.otro_id) ? 'online-dot' : '');
    return `<button class="row ${S.chat && S.chat.chat_id === c.chat_id ? 'on' : ''}" data-act="openChat" data-id="${c.chat_id}">
      ${ring ? `<span class="ring ${ring.items.every((i) => i.visto) ? 'seen' : ''}" data-act="story" data-id="${esc(c.otro_id)}" title="Ver su Mostrador">${avh}</span>` : avh}
      <span class="mid"><span class="l1"><b class="ell">${esc(nombre(c))}</b><time class="${c.no_leidos ? 'unread' : ''}">${esc(fechaLista(c.ultimo_at))}</time></span>
      <span class="l2">${typing ? '<span class="t typing">escribiendo…</span>' : `${mine && c.ultimo_tipo ? TICK2(!!c.ultimo_leido) : ''}<span class="t ell">${esc(txt) || '<i>Chat nuevo</i>'}</span>`}${c.no_leidos ? `<span class="badge">${c.no_leidos}</span>` : ''}</span></span></button>`;
  }

  function storyStrip() {
    const mine = S.feed.find((g) => g.owner_id === S.me.id);
    const others = S.feed.filter((g) => g.owner_id !== S.me.id).sort((a, b) => a.items.every((i) => i.visto) - b.items.every((i) => i.visto));
    return `<div class="strip" aria-label="Mostrador">
      <button data-act="${mine ? 'story' : 'addStory'}" data-id="${esc(S.me.id)}"><span style="position:relative" class="${mine ? 'ring seen' : ''}">${av(S.me, 56)}${mine ? '' : '<span class="add-badge">+</span>'}</span><span class="n ell">Mi mostrador</span></button>
      ${others.map((g) => `<button data-act="story" data-id="${esc(g.owner_id)}"><span class="ring ${g.items.every((i) => i.visto) ? 'seen' : ''}">${av({ id: g.owner_id, name: g.name, avatar: g.avatar }, 56)}</span><span class="n ell">${esc(nombre(g).split(' ')[0])}</span></button>`).join('')}
      ${others.length ? '' : '<span class="small muted" style="align-self:center;max-width:200px">Aquí verás los productos que tus contactos publiquen hoy.</span>'}</div>`;
  }

  function mostradorList() {
    const mine = S.feed.find((g) => g.owner_id === S.me.id);
    const others = S.feed.filter((g) => g.owner_id !== S.me.id);
    const recent = others.filter((g) => g.items.some((i) => !i.visto)), seen = others.filter((g) => g.items.every((i) => i.visto));
    const row = (g) => { const last = g.items[g.items.length - 1]; return `<button class="row" data-act="story" data-id="${esc(g.owner_id)}"><span class="ring ${g.items.every((i) => i.visto) ? 'seen' : ''}">${av({ id: g.owner_id, name: g.name, avatar: g.avatar }, 48)}</span><span class="mid"><span class="l1"><b class="ell">${esc(nombre(g))}</b></span><span class="l2"><span class="t">${esc(hace(last.created_at))} · ${g.items.length} ${g.items.length === 1 ? 'foto' : 'fotos'}</span></span></span></button>`; };
    return `<button class="row" data-act="${mine ? 'story' : 'addStory'}" data-id="${esc(S.me.id)}"><span style="position:relative" class="${mine ? 'ring seen' : ''}">${av(S.me, 52)}${mine ? '' : '<span class="add-badge">+</span>'}</span>
        <span class="mid"><span class="l1"><b>Mi mostrador</b></span><span class="l2"><span class="t">${mine ? `${mine.items.length} ${mine.items.length === 1 ? 'foto' : 'fotos'} · ${mine.items.reduce((a, i) => a + (i.vistas || 0), 0)} vistas · toca para ver` : 'Muestra un producto por 24 horas'}</span></span></span></button>
      ${mine ? `<div style="padding:0 16px 6px"><button class="btn sm ghost" data-act="addStory">${I(IC.plus, 16)}Agregar otra foto</button></div>` : ''}
      <div class="sys" style="margin:8px 16px;max-width:none;text-align:left;display:flex;gap:8px;align-items:center">${I(IC.clock, 18)}<span>Las fotos del Mostrador desaparecen solas a las 24 horas y no se guardan. Lo ven tus contactos y quienes chatean contigo.</span></div>
      ${recent.length ? '<div class="section-t">Recientes</div>' + recent.map(row).join('') : ''}
      ${seen.length ? '<div class="section-t">Vistos</div>' + seen.map(row).join('') : ''}
      ${!others.length ? '<div class="empty"><b>Nada nuevo por ahora</b>Agrega contactos por su @alias para ver sus productos del día.</div>' : ''}`;
  }

  function ventasMenu() {
    const o = S.orders || [];
    const rec = o.filter((x) => x.meta.vendedor_id === S.me.id), com = o.filter((x) => x.sender_id === S.me.id);
    const item = (v, color, icon, t, sub, n) => `<button class="row ${S.pane && S.pane.v === v ? 'on' : ''}" data-act="pane" data-id="${v}"><span class="menu-ic" style="background:${color}">${I(icon)}</span><span class="mid"><span class="l1"><b>${t}</b>${n ? `<span class="badge">${n}</span>` : ''}</span><span class="l2"><span class="t">${sub}</span></span></span></button>`;
    return `<div class="menu-list">
      ${item('vitrina', '#E0313B', IC.store, 'Mi vitrina', 'Tus productos para compartir en el chat', 0)}
      ${item('recibidos', '#2B8A3E', IC.receipt, 'Pedidos recibidos', `${rec.length} ${rec.length === 1 ? 'pedido' : 'pedidos'} · ${rec.filter((x) => x.meta.estado === 'nuevo').length} por confirmar`, rec.filter((x) => x.meta.estado === 'nuevo').length)}
      ${item('compras', '#1971C2', IC.bag, 'Mis compras', `${com.length} ${com.length === 1 ? 'pedido hecho' : 'pedidos hechos'}`, 0)}
      ${item('compartir', '#7048E8', IC.link, 'Compartir mi chat de ventas', `Tu enlace: @${esc(S.me.username)}`, 0)}
    </div>`;
  }

  // ---- nuevo chat / contactos
  async function sideNewChat(body) {
    body.innerHTML = `<div class="side-sub"><button class="icon-btn" data-act="sideBack" aria-label="Volver">${I(IC.back)}</button>Nuevo chat</div>
      <div class="search" style="margin-top:10px">${I(IC.search)}<input class="input" id="uq" placeholder="Busca por @alias o nombre" autocapitalize="off" aria-label="Buscar usuarios"></div>
      <div id="ures"></div><div class="section-t">Mis contactos</div><div id="clist"><div class="empty"><span class="spin"></span></div></div>`;
    const inp = $('#uq'); setTimeout(() => inp.focus(), 50);
    const run = debounce(async () => {
      const q = inp.value.trim(); const box = $('#ures'); if (!box) return;
      if (q.replace('@', '').length < 2) { box.innerHTML = ''; return; }
      box.innerHTML = '<div class="empty"><span class="spin"></span></div>';
      try { const r = await api.search(q); box.innerHTML = '<div class="section-t">Resultados</div>' + (r.map(userRow).join('') || '<div class="empty">No encontramos a nadie con ese alias</div>'); }
      catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    }, 280);
    inp.oninput = run;
    try { S.contacts = await api.contacts(); } catch { S.contacts = []; }
    const cl = $('#clist'); if (cl) cl.innerHTML = S.contacts.map(userRow).join('') || '<div class="empty"><b>Sin contactos todavía</b>Busca a alguien por su @alias para agregarlo.</div>';
  }
  const userRow = (u) => `<button class="row" data-act="startChat" data-id="${esc(u.id)}">${av(u, 46, S.online.has(u.id) ? 'online-dot' : '')}<span class="mid"><span class="l1"><b class="ell">${esc(nombre(u))}</b></span><span class="l2"><span class="t ell">@${esc(u.username)}${u.bio ? ' · ' + esc(u.bio) : ''}</span></span></span></button>`;

  // ---- perfil propio
  function sideProfile(body) {
    const link = shareLink(S.me.username);
    body.innerHTML = `<div class="side-sub"><button class="icon-btn" data-act="sideBack" aria-label="Volver">${I(IC.back)}</button>Mi perfil</div>
      <div class="profile-hero">${av(S.me, 96)}<h2>${esc(S.me.name || '')}</h2><span class="muted">@${esc(S.me.username)}</span>${S.me.bio ? `<span class="small">${esc(S.me.bio)}</span>` : ''}</div>
      <div style="padding:0 16px 12px;display:flex;flex-direction:column;gap:10px">
        <div class="share">${I(IC.link, 18)}<span class="ell">${esc(link)}</span><button class="btn sm brand" data-act="copyLink">Copiar</button></div>
        <span class="small muted">Comparte este enlace en Instagram o Facebook: quien lo abra llega directo a tu chat.</span></div>
      <div class="menu-list">
        <button class="row" data-act="editProfile"><span class="menu-ic" style="background:#495057">${I(IC.user)}</span><span class="mid"><span class="l1"><b>Editar perfil y alias</b></span></span></button>
        <button class="row" data-act="notif"><span class="menu-ic" style="background:#E67700">${I(IC.bell)}</span><span class="mid"><span class="l1"><b>Notificaciones</b></span><span class="l2"><span class="t">${'Notification' in window ? (Notification.permission === 'granted' ? 'Activadas en este navegador' : 'Toca para activarlas') : 'No disponibles en este navegador'}</span></span></span></button>
        <button class="row" data-act="theme"><span class="menu-ic" style="background:#343A40">${I(IC.moon)}</span><span class="mid"><span class="l1"><b>Tema</b></span><span class="l2"><span class="t">${{ dark: 'Oscuro', light: 'Claro' }[document.documentElement.dataset.theme] || 'Automático'}</span></span></span></button>
        <button class="row" data-act="logout"><span class="menu-ic" style="background:#A11D1D">${I(IC.out)}</span><span class="mid"><span class="l1"><b>Cerrar sesión</b></span></span></button>
      </div>
      <p class="small muted" style="padding:12px 16px"><a href="../privacidad.html" target="_blank">Privacidad</a> · <a href="../terminos.html" target="_blank">Términos</a> · <a href="../eliminar-cuenta.html" target="_blank">Eliminar cuenta</a></p>`;
  }
  const shareLink = (u) => (location.protocol === 'https:' && !ANDROID ? location.origin + location.pathname : PUBLIC_URL) + '#@' + u;
  function applyTheme(t) { if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

  // ---------------------------------------------------------- panel derecho
  function setOpen(on) { $('#app')?.classList.toggle('open', on); }
  function renderPane() {
    const p = $('#pane'); if (!p) return;
    if (S.chat) return; // el chat se dibuja aparte
    if (!S.pane) {
      setOpen(false);
      p.innerHTML = `<div class="welcome"><div class="art">${I(IC.bag, 64)}</div><h2>Vende conversando</h2>
        <p>Elige un chat o busca a alguien por su @alias. Comparte productos de tu vitrina, recibe pedidos dentro del chat y publica tu Mostrador de 24 horas.</p>
        <span class="lock">${I(IC.lock, 14)}Tus mensajes solo los ven tú y la otra persona.</span></div>`;
      return;
    }
    setOpen(true);
    const v = S.pane.v;
    if (v === 'vitrina') return paneVitrina(p);
    if (v === 'recibidos' || v === 'compras') return panePedidos(p, v);
    if (v === 'compartir') return paneCompartir(p);
    if (v === 'perfilDe') return panePerfilDe(p, S.pane.id);
  }
  const paneHead = (title, sub = '', right = '') => `<div class="pane-h"><button class="icon-btn back" data-act="closePane" aria-label="Volver">${I(IC.back)}</button><div class="who" style="cursor:default"><div class="ell"><b class="ell">${title}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>${right}</div>`;

  async function paneVitrina(p) {
    p.innerHTML = paneHead('Mi vitrina', 'Lo que vendes, listo para compartir en tus chats', `<button class="btn sm brand" data-act="editItem">${I(IC.plus, 16)}Agregar</button>`) + '<div class="scroll" id="vs"><div class="empty"><span class="spin"></span></div></div>';
    try { S.myCatalog = await api.catalog(S.me.id); } catch (e) { $('#vs').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const el = $('#vs'); if (!el) return;
    const act = S.myCatalog.filter((k) => k.activo);
    el.innerHTML = `<div class="kpis"><div class="kpi"><span>Productos publicados</span><b>${act.length}</b></div><div class="kpi"><span>Ocultos</span><b>${S.myCatalog.length - act.length}</b></div></div>` +
      (S.myCatalog.length ? `<div class="grid-p">${S.myCatalog.map((k) => `<div class="prod ${k.activo ? '' : 'off'}">${k.imagen_url ? `<img src="${esc(k.imagen_url)}" alt="" loading="lazy">` : '<div class="ph">Sin foto</div>'}
        <div class="pi"><b class="ell">${esc(k.titulo)}</b><span class="pr">${clp(k.precio)}</span>${k.activo ? '' : '<span class="small muted">Oculto</span>'}
        <div class="acts"><button class="btn sm" data-act="editItem" data-id="${k.id}">Editar</button><button class="btn sm ghost" data-act="storyFromItem" data-id="${k.id}" title="Publicar en el Mostrador">${I(IC.camera, 16)}</button></div></div></div>`).join('')}</div>`
        : `<div class="empty"><b>Tu vitrina está vacía</b>Agrega tu primer producto con foto y precio. Luego lo envías en cualquier chat con el clip 📎.</div>`);
  }

  function panePedidos(p, v) {
    const all = (S.orders || []).filter((o) => (v === 'recibidos' ? o.meta.vendedor_id === S.me.id : o.sender_id === S.me.id));
    const list = all.filter((o) => S.filter === 'todos' || (S.filter === 'activos' ? !['entregado', 'cancelado'].includes(o.meta.estado) : o.meta.estado === S.filter));
    const total = (o) => o.meta.precio * o.meta.cantidad;
    const vendido = all.filter((o) => ['pagado', 'enviado', 'entregado'].includes(o.meta.estado)).reduce((a, o) => a + total(o), 0);
    const quien = (o) => { const c = S.chats.find((x) => x.chat_id === o.chat_id); return c ? nombre(c) : 'Chat'; };
    p.innerHTML = paneHead(v === 'recibidos' ? 'Pedidos recibidos' : 'Mis compras', v === 'recibidos' ? 'Pedidos que te hicieron desde el chat' : 'Lo que pediste a otras tiendas') +
      `<div class="scroll"><div class="kpis">
        <div class="kpi"><span>${v === 'recibidos' ? 'Por confirmar' : 'Esperando confirmación'}</span><b>${all.filter((o) => o.meta.estado === 'nuevo').length}</b></div>
        <div class="kpi"><span>En curso</span><b>${all.filter((o) => ['confirmado', 'pagado', 'enviado'].includes(o.meta.estado)).length}</b></div>
        <div class="kpi"><span>${v === 'recibidos' ? 'Vendido (pagado)' : 'Gastado (pagado)'}</span><b>${clp(vendido)}</b></div></div>
      <div class="filters">${[['todos', 'Todos'], ['activos', 'Activos'], ['nuevo', 'Nuevos'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados']].map(([k, t]) => `<button data-act="filter" data-id="${k}" class="${S.filter === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="list-card">${list.map((o) => `<button class="orow" data-act="openChat" data-id="${o.chat_id}" data-msg="${o.id}">${o.meta.imagen_url ? `<img src="${esc(o.meta.imagen_url)}" alt="">` : '<span class="ph"></span>'}
        <span style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(o.meta.titulo)}</b><span class="small muted">${o.meta.cantidad} × ${clp(o.meta.precio)} · ${esc(quien(o))} · ${esc(fechaLista(o.created_at))}</span></span>
        <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><b>${clp(total(o))}</b><span class="pill p-${o.meta.estado}">${ESTADOS[o.meta.estado]}</span></span></button>`).join('') || `<div class="empty"><b>Sin pedidos aquí</b>${v === 'recibidos' ? 'Cuando un cliente pida desde tu vitrina en el chat, aparecerá en esta lista.' : 'Pide desde la vitrina de una tienda dentro del chat.'}</div>`}</div></div>`;
  }

  function paneCompartir(p) {
    const link = shareLink(S.me.username);
    p.innerHTML = paneHead('Compartir mi chat de ventas') + `<div class="scroll"><div class="list-card" style="padding:22px;display:flex;flex-direction:column;gap:14px;max-width:560px">
      <div style="display:flex;gap:12px;align-items:center">${av(S.me, 56)}<div><b style="font-size:18px">${esc(S.me.name || '')}</b><div class="muted">@${esc(S.me.username)}</div></div></div>
      <p style="margin:0">Pega este enlace en tu bio de Instagram, TikTok o en tus publicaciones. Quien lo abra entra directo a un chat contigo y te queda como contacto.</p>
      <div class="share">${I(IC.link, 18)}<span class="ell">${esc(link)}</span><button class="btn sm brand" data-act="copyLink">Copiar</button></div>
      ${navigator.share || ANDROID ? '<button class="btn" data-act="shareLink">Compartir…</button>' : ''}
      <p class="small muted" style="margin:0">También pueden encontrarte en "Nuevo chat" escribiendo <b>@${esc(S.me.username)}</b>.</p></div></div>`;
  }

  async function panePerfilDe(p, id) {
    p.innerHTML = paneHead('Vitrina') + '<div class="scroll" id="pv"><div class="empty"><span class="spin"></span></div></div>';
    let u, items;
    try { [u, items] = await Promise.all([api.profile(id), api.catalog(id)]); } catch (e) { $('#pv').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (!u || !$('#pv')) return;
    const story = S.feed.find((g) => g.owner_id === id);
    p.innerHTML = paneHead(esc(nombre(u)), '@' + esc(u.username)) + `<div class="scroll"><div class="profile-hero" style="padding-top:6px">
      ${story ? `<button class="ring ${story.items.every((i) => i.visto) ? 'seen' : ''}" data-act="story" data-id="${esc(id)}">${av(u, 92)}</button>` : av(u, 92)}
      <h2>${esc(nombre(u))}</h2><span class="muted">@${esc(u.username)}</span>${u.bio ? `<span class="small">${esc(u.bio)}</span>` : ''}
      <div style="display:flex;gap:8px;margin-top:6px"><button class="btn brand" data-act="startChat" data-id="${esc(id)}">${I(IC.chat, 18)}Chatear</button>
      <button class="btn ghost" data-act="toggleContact" data-id="${esc(id)}" data-on="${u.es_contacto ? 1 : 0}">${u.es_contacto ? 'Quitar de contactos' : 'Agregar a contactos'}</button></div></div>
      <div class="h2"><h2>Vitrina</h2><span class="small muted">${items.length} ${items.length === 1 ? 'producto' : 'productos'}</span></div>
      ${items.length ? `<div class="grid-p">${items.map((k) => `<div class="prod">${k.imagen_url ? `<img src="${esc(k.imagen_url)}" alt="" loading="lazy">` : '<div class="ph">Sin foto</div>'}<div class="pi"><b class="ell">${esc(k.titulo)}</b><span class="pr">${clp(k.precio)}</span>${k.descripcion ? `<span class="small muted">${esc(k.descripcion)}</span>` : ''}<div class="acts"><button class="btn sm brand" data-act="pedir" data-id="${k.id}" data-owner="${esc(id)}">Pedir</button><button class="btn sm" data-act="askItem" data-id="${k.id}" data-owner="${esc(id)}">Preguntar</button></div></div></div>`).join('')}</div>` : '<div class="empty">Esta persona aún no publica productos.</div>'}</div>`;
    S.pane.items = items;
  }

  // ---------------------------------------------------------- chat
  async function openChat(chatId, focusMsg) {
    let c = S.chats.find((x) => x.chat_id === chatId);
    if (!c) { await loadChats(); c = S.chats.find((x) => x.chat_id === chatId); }
    if (!c) return toast('No se encontró el chat');
    S.chat = c; S.pane = null; S.msgs = []; S.noMore = false; S.attach = false;
    if (S.tab !== 'chats') { S.tab = 'chats'; S.side = null; renderTabs(); }
    renderSide(); setOpen(true);
    const p = $('#pane');
    p.innerHTML = `<div class="pane-h"><button class="icon-btn back" data-act="closeChat" aria-label="Volver">${I(IC.back)}</button>
      <button class="who" data-act="perfilDe" data-id="${esc(c.otro_id)}">${av({ id: c.otro_id, name: c.name, username: c.username, avatar: c.avatar }, 42)}<span class="ell"><b class="ell">${esc(nombre(c))}</b><small id="sub">@${esc(c.username)}</small></span></button>
      <button class="icon-btn" data-act="perfilDe" data-id="${esc(c.otro_id)}" title="Ver su vitrina" aria-label="Ver su vitrina">${I(IC.store)}</button></div>
      <div id="vbar"></div>
      <div class="msgs" id="msgs" role="log" aria-live="polite"><div class="empty"><span class="spin"></span></div></div>
      <form class="composer" id="cmp"><div id="att"></div>
        <button type="button" class="icon-btn" data-act="attach" aria-label="Adjuntar">${I(IC.clip)}</button>
        <textarea id="tx" rows="1" placeholder="Escribe un mensaje" aria-label="Mensaje" maxlength="4000"></textarea>
        <button class="send" type="submit" aria-label="Enviar">${I(IC.send, 20)}</button></form>`;
    refreshPresence();
    const tx = $('#tx'), form = $('#cmp');
    let lastTyping = 0;
    tx.addEventListener('input', () => {
      tx.style.height = 'auto'; tx.style.height = Math.min(140, tx.scrollHeight) + 'px';
      if (Date.now() - lastTyping > 2500 && tx.value.trim()) { lastTyping = Date.now(); api.typing(c.chat_id, c.otro_id); }
    });
    tx.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !isMobile()) { e.preventDefault(); form.requestSubmit(); } });
    form.onsubmit = (e) => { e.preventDefault(); const t = tx.value.trim(); if (!t) return; tx.value = ''; tx.style.height = 'auto'; sendMsg({ tipo: 'texto', texto: t }); tx.focus(); };
    if (!isMobile()) tx.focus();
    $('#msgs').addEventListener('scroll', onMsgsScroll);
    try { S.msgs = await api.messages(c.chat_id); } catch (e) { $('#msgs').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (S.chat !== c) return;
    S.noMore = S.msgs.length < 60;
    drawMsgs(true, focusMsg);
    if (c.no_leidos) { c.no_leidos = 0; renderTabs(); renderSide(); updateTitle(); }
    api.markRead(c.chat_id);
    vitrinaBar(c);
  }

  async function vitrinaBar(c) {
    let items = []; try { items = await api.catalog(c.otro_id); } catch { return; }
    const el = $('#vbar'); if (!el || S.chat !== c || !items.length) return;
    S.chat.items = items;
    el.innerHTML = `<div class="vit-bar"><span class="thumbs">${items.slice(0, 3).map((k) => (k.imagen_url ? `<img src="${esc(k.imagen_url)}" alt="">` : '')).join('')}</span><span class="ell"><b>Vitrina de ${esc(nombre(c).split(' ')[0])}</b> · ${items.length} ${items.length === 1 ? 'producto' : 'productos'}</span><button class="btn sm brand" data-act="perfilDe" data-id="${esc(c.otro_id)}">Ver y pedir</button></div>`;
  }

  async function onMsgsScroll(e) {
    const el = e.target;
    if (el.scrollTop > 80 || S.loadingOlder || S.noMore || !S.msgs.length || !S.chat) return;
    S.loadingOlder = true; const c = S.chat;
    try {
      const older = await api.messages(c.chat_id, S.msgs[0].id);
      if (S.chat !== c) return;
      if (older.length < 60) S.noMore = true;
      if (older.length) { const h = el.scrollHeight; S.msgs = older.concat(S.msgs); drawMsgs(false); el.scrollTop = el.scrollHeight - h; }
    } finally { S.loadingOlder = false; }
  }

  function drawMsgs(toBottom, focusMsg) {
    const el = $('#msgs'); if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    let html = S.noMore ? `<div class="sys">${I(IC.lock, 13)} Los mensajes de este chat solo los ven ustedes dos. Las fotos del Mostrador que respondas dejan de verse a las 24 h.</div>` : '';
    let prev = null;
    for (const m of S.msgs) {
      const d = new Date(m.created_at);
      if (!prev || !sameDay(new Date(prev.created_at), d)) html += `<div class="day">${esc(diaSep(d))}</div>`;
      const cont = prev && prev.sender_id === m.sender_id && sameDay(new Date(prev.created_at), d) && d - new Date(prev.created_at) < 5 * 60e3;
      html += msgHTML(m, cont); prev = m;
    }
    el.innerHTML = html || '<div class="empty">Escribe el primer mensaje 👋</div>';
    hydrateImages(el);
    if (focusMsg) { const t = el.querySelector(`[data-mid="${focusMsg}"]`); if (t) { t.scrollIntoView({ block: 'center' }); t.querySelector('.bub').animate([{ boxShadow: '0 0 0 3px #E0313B' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1600 }); return; } }
    if (toBottom || atBottom) el.scrollTop = el.scrollHeight;
  }

  function msgHTML(m, cont) {
    const mine = m.sender_id === S.me.id; const t = m.meta || {};
    const meta = `<span class="meta">${hora(m.created_at)}${mine ? (m._pending ? CLOCK : m.leido_at ? TICK2(true) : TICK1) : ''}</span>`;
    let inner = '';
    if (m.tipo === 'imagen') inner = `<img class="photo" data-bucket="chat" data-path="${esc(m.imagen)}" alt="Foto" data-act="zoom">${m.texto ? `<div class="txt">${linkify(m.texto)}</div>` : ''}`;
    else if (m.tipo === 'producto') {
      inner = `<div class="card-p"><span class="tag">${I(IC.tag, 14)}Producto</span>${t.imagen_url ? `<img src="${esc(t.imagen_url)}" alt="">` : ''}<span class="pt">${esc(t.titulo)}</span><span class="pp">${clp(t.precio)}</span>${t.descripcion ? `<span class="pd">${esc(t.descripcion)}</span>` : ''}
        ${!mine && t.catalogo_id ? `<button class="btn sm brand" data-act="pedir" data-id="${t.catalogo_id}" data-owner="${esc(t.vendedor_id)}">Pedir este producto</button>` : ''}</div>${m.texto ? `<div class="txt" style="margin-top:6px">${linkify(m.texto)}</div>` : ''}`;
    } else if (m.tipo === 'pedido') {
      const vend = t.vendedor_id === S.me.id; const st = t.estado || 'nuevo';
      const acts = vend ? (SIGUIENTE[st] || []) : (mine && st === 'nuevo' ? [['cancelado', 'Cancelar pedido', 'bad']] : []);
      inner = `<div class="order"><span class="tag">${I(IC.receipt, 14)}${vend ? 'Pedido recibido' : 'Pedido'}</span>
        <div class="oh">${t.imagen_url ? `<img src="${esc(t.imagen_url)}" alt="">` : '<span class="ph"></span>'}<div style="min-width:0"><b>${esc(t.titulo)}</b><div class="small">${t.cantidad} × ${clp(t.precio)}</div></div></div>
        ${m.texto ? `<div class="note">${linkify(m.texto)}</div>` : ''}
        <div class="tot"><span>Total</span><span>${clp(t.precio * t.cantidad)}</span></div>
        <div style="display:flex;align-items:center;gap:8px"><span class="pill p-${st}">${ESTADOS[st]}</span>${vend && st === 'nuevo' ? '<span class="small">Confírmalo para avisarle al cliente</span>' : ''}</div>
        ${acts.length ? `<div class="acts">${acts.map(([e, l, k]) => `<button class="btn sm ${k}" data-act="estado" data-id="${m.id}" data-e="${e}">${l}</button>`).join('')}</div>` : ''}</div>`;
    } else if (m.tipo === 'mostrador') {
      const vivo = t.expira_at && new Date(t.expira_at) > Date.now();
      inner = `<div class="quote" ${vivo ? `data-act="storyById" data-id="${t.mostrador_id}"` : ''}>${vivo ? `<img data-bucket="mostrador" data-path="${esc(t.imagen_path)}" data-exp="${esc(t.expira_at)}" alt="">` : '<span class="ph">Ya no disponible</span>'}
        <span class="qt"><b>${mine ? 'Respondiste a su Mostrador' : 'Respondió a tu Mostrador'}</b>${t.texto ? `<span class="ell">${esc(t.texto)}</span>` : ''}${t.precio != null ? `<span class="b">${clp(t.precio)}</span>` : ''}${vivo ? '' : '<span class="small muted">La foto expiró a las 24 h</span>'}</span></div><div class="txt">${linkify(m.texto || '')}</div>`;
    } else inner = `<div class="txt">${linkify(m.texto || '')}</div>`;
    return `<div class="m ${mine ? 'me' : ''} ${cont ? 'cont' : ''}" data-mid="${m.id}"><div class="bub ${m._pending ? 'pending' : ''}">${inner}${meta}</div></div>`;
  }

  async function hydrateImages(scope) {
    scope.querySelectorAll('img[data-path]:not([src])').forEach(async (img) => {
      const exp = img.dataset.exp ? (new Date(img.dataset.exp) - Date.now()) / 1000 : 3600;
      const u = await api.img(img.dataset.bucket, img.dataset.path, Math.min(3600, exp));
      if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('span'), { className: 'ph', textContent: 'No disponible' }));
    });
  }

  async function sendMsg(m) {
    const c = S.chat; if (!c) return;
    const tmp = { id: 'tmp' + Date.now(), chat_id: c.chat_id, sender_id: S.me.id, tipo: m.tipo, texto: m.texto || null, meta: m.meta || {}, created_at: new Date().toISOString(), _pending: true, imagen: null };
    if (m.tipo !== 'imagen') { S.msgs.push(tmp); drawMsgs(true); }
    try {
      const r = await api.send(c.chat_id, m);
      const i = S.msgs.indexOf(tmp); if (i >= 0) S.msgs.splice(i, 1);
      if (S.chat === c && !S.msgs.some((x) => x.id === r.id)) S.msgs.push(r);
      if (S.chat === c) drawMsgs(true);
      bumpChat(r);
    } catch (e) {
      const i = S.msgs.indexOf(tmp); if (i >= 0) S.msgs.splice(i, 1); drawMsgs(false);
      toast('No se envió: ' + e.message);
    }
  }

  function bumpChat(m) {
    const c = S.chats.find((x) => x.chat_id === m.chat_id); if (!c) return false;
    Object.assign(c, { ultimo_tipo: m.tipo, ultimo_texto: m.texto, ultimo_sender: m.sender_id, ultimo_leido: m.leido_at, ultimo_at: m.created_at });
    S.chats.sort((a, b) => new Date(b.ultimo_at) - new Date(a.ultimo_at));
    if (S.tab === 'chats' && !S.side) renderSide();
    return true;
  }

  // ---------------------------------------------------------- tiempo real
  function onMessage(m, ev) {
    const open = S.chat && S.chat.chat_id === m.chat_id;
    if (ev === 'INSERT') {
      if (open) {
        if (!S.msgs.some((x) => x.id === m.id)) {
          if (m.sender_id === S.me.id) { const tmp = S.msgs.find((x) => x._pending && x.tipo === m.tipo && x.texto === m.texto); if (tmp) S.msgs.splice(S.msgs.indexOf(tmp), 1); }
          S.msgs.push(m); drawMsgs(m.sender_id === S.me.id);
        }
        if (m.sender_id !== S.me.id) { delete S.typing[m.chat_id]; refreshPresence(); if (document.hasFocus()) api.markRead(m.chat_id); else bumpUnread(m.chat_id); }
      } else if (m.sender_id !== S.me.id) bumpUnread(m.chat_id);
      if (!bumpChat(m)) loadChats();
      if (m.sender_id !== S.me.id) { notify(m); if (m.tipo === 'pedido') loadOrders(); }
    } else {
      if (open) { const i = S.msgs.findIndex((x) => x.id === m.id); if (i >= 0) { S.msgs[i] = m; drawMsgs(false); } }
      const c = S.chats.find((x) => x.chat_id === m.chat_id);
      if (c && m.sender_id === S.me.id && m.leido_at) { c.ultimo_leido = c.ultimo_leido || m.leido_at; if (S.tab === 'chats' && !S.side) renderSide(); }
      if (m.tipo === 'pedido') { const o = (S.orders || []).find((x) => x.id === m.id); if (o) { o.meta = m.meta; renderTabs(); if (S.tab === 'ventas' && !S.side) renderSide(); if (S.pane && /recibidos|compras/.test(S.pane.v)) renderPane(); } }
    }
  }
  function bumpUnread(chatId) { const c = S.chats.find((x) => x.chat_id === chatId); if (c) c.no_leidos = (c.no_leidos || 0) + 1; renderTabs(); updateTitle(); }
  function onTyping(chatId) {
    S.typing[chatId] = Date.now(); refreshPresence(); if (S.tab === 'chats' && !S.side) renderSide();
    setTimeout(() => { if (Date.now() - (S.typing[chatId] || 0) >= 3900) { delete S.typing[chatId]; refreshPresence(); if (S.tab === 'chats' && !S.side) renderSide(); } }, 4000);
  }
  function refreshPresence() {
    const sub = $('#sub'); if (!sub || !S.chat) return;
    const c = S.chat, typing = S.typing[c.chat_id] && Date.now() - S.typing[c.chat_id] < 4000;
    sub.className = typing ? 'live' : '';
    sub.textContent = typing ? 'escribiendo…' : S.online.has(c.otro_id) ? 'en línea' : (ultVez(c.last_seen) || '@' + c.username);
  }
  function notify(m) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    const c = S.chats.find((x) => x.chat_id === m.chat_id);
    const body = m.tipo === 'pedido' ? '🧾 Nuevo pedido: ' + (m.meta?.titulo || '') : m.tipo === 'imagen' ? '📷 Foto' : m.tipo === 'mostrador' ? '🕒 ' + (m.texto || 'Respondió a tu Mostrador') : m.texto || '';
    try { const n = new Notification(c ? nombre(c) : 'EmprenLive', { body, icon: 'icon.svg', tag: 'chat' + m.chat_id }); n.onclick = () => { window.focus(); openChat(m.chat_id); n.close(); }; } catch { /* navegador sin soporte */ }
  }

  // ---------------------------------------------------------- modales
  function modal(title, body, onMount) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><span>${title}</span><button class="icon-btn" data-close aria-label="Cerrar">${I(IC.x)}</button></div><div class="modal-b">${body}</div></div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', key);
    layer.appendChild(bg); if (onMount) onMount(bg.querySelector('.modal'), close);
    return close;
  }
  function pickImage(box, onFile) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; const u = URL.createObjectURL(f); box.innerHTML = `<img src="${u}" alt="">`; onFile(f); };
    inp.click();
  }

  function editProfileModal() {
    modal('Editar perfil', `<form id="pf" style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label for="us">Alias</label><div class="prefix"><span>@</span><input class="input" id="us" required pattern="[a-z0-9_.]{3,20}" maxlength="20" value="${esc(S.me.username)}" autocapitalize="off"></div><span class="hint">Si lo cambias, tu enlace anterior deja de funcionar.</span></div>
      <div class="field"><label for="nm">Nombre</label><input class="input" id="nm" required maxlength="60" value="${esc(S.me.name || '')}"></div>
      <div class="field"><label for="bi">Descripción</label><input class="input" id="bi" maxlength="140" value="${esc(S.me.bio || '')}"></div>
      <div class="err" id="pe" hidden></div><button class="btn brand lg">Guardar</button></form>`, (m, close) => {
      m.querySelector('#us').oninput = (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''); };
      m.querySelector('#pf').onsubmit = async (e) => {
        e.preventDefault(); const f = e.target; const p = { username: f.us.value.trim(), name: f.nm.value.trim(), bio: f.bi.value.trim() };
        try { await api.saveProfile(p); Object.assign(S.me, p); close(); toast('Perfil actualizado'); renderSide(); }
        catch (er) { const pe = m.querySelector('#pe'); pe.hidden = false; pe.textContent = er.message; }
      };
    });
  }

  function itemModal(item) {
    const k = item || { titulo: '', precio: '', descripcion: '', activo: true };
    let file = null;
    modal(item ? 'Editar producto' : 'Nuevo producto', `<form id="itf" style="display:flex;flex-direction:column;gap:14px">
      <div class="pick" id="pk">${k.imagen_url ? `<img src="${esc(k.imagen_url)}" alt="">` : `${I(IC.image, 34)}<span>Toca para elegir una foto</span>`}</div>
      <div class="field"><label for="ti">Nombre del producto</label><input class="input" id="ti" required maxlength="120" value="${esc(k.titulo)}"></div>
      <div class="field"><label for="pr">Precio (CLP)</label><input class="input" id="pr" type="number" inputmode="numeric" min="0" step="1" required value="${esc(k.precio)}"></div>
      <div class="field"><label for="de">Descripción (opcional)</label><textarea class="textarea" id="de" maxlength="1000">${esc(k.descripcion || '')}</textarea></div>
      ${item ? `<label style="display:flex;gap:10px;align-items:center;font-weight:600"><input type="checkbox" id="ac" ${k.activo ? 'checked' : ''}> Visible en mi vitrina</label>` : ''}
      <div style="display:flex;gap:8px">${item ? '<button type="button" class="btn bad" id="del">Eliminar</button>' : ''}<button class="btn brand lg" style="flex:1">Guardar</button></div></form>`, (m, close) => {
      const pk = m.querySelector('#pk'); pk.onclick = () => pickImage(pk, (f) => { file = f; });
      if (item) m.querySelector('#del').onclick = async (e) => {
        if (!e.target.dataset.armed) { e.target.dataset.armed = 1; e.target.textContent = '¿Seguro?'; return; }
        try { await api.deleteItem(item.id); close(); toast('Producto eliminado'); renderPane(); } catch (er) { toast(er.message); }
      };
      m.querySelector('#itf').onsubmit = async (e) => {
        e.preventDefault(); const f = e.target, b = f.querySelector('.btn.lg'); b.disabled = true; b.textContent = 'Guardando…';
        try {
          await api.saveItem({ id: item?.id, titulo: f.ti.value.trim(), precio: Math.round(Number(f.pr.value)), descripcion: f.de.value.trim(), imagen_url: k.imagen_url, activo: item ? f.ac.checked : true }, file);
          close(); toast('Producto guardado'); if (S.pane?.v === 'vitrina') renderPane();
        } catch (er) { toast(er.message); b.disabled = false; b.textContent = 'Guardar'; }
      };
    });
  }

  function orderModal(k, chatId) {
    let qty = 1;
    modal('Hacer pedido', `<div style="display:flex;gap:12px;align-items:center">${k.imagen_url ? `<img src="${esc(k.imagen_url)}" alt="" style="width:72px;height:72px;border-radius:12px;object-fit:cover">` : ''}<div><b>${esc(k.titulo)}</b><div class="b" style="color:var(--brand)">${clp(k.precio)}</div></div></div>
      <div class="field"><label>Cantidad</label><div class="qty"><button type="button" data-q="-1" aria-label="Menos">−</button><b id="qv">1</b><button type="button" data-q="1" aria-label="Más">+</button><span style="flex:1;text-align:right" class="b" id="qt">${clp(k.precio)}</span></div></div>
      <div class="field"><label for="nt">Nota para la tienda (opcional)</label><textarea class="textarea" id="nt" maxlength="500" placeholder="Talla, color, dirección o cómo quieres pagar"></textarea></div>
      <button class="btn brand lg" id="go">Enviar pedido por el chat</button>
      <span class="small muted">El pedido llega al chat. La tienda lo confirma y coordinan el pago y la entrega entre ustedes.</span>`, (m, close) => {
      m.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { qty = Math.max(1, Math.min(99, qty + Number(b.dataset.q))); m.querySelector('#qv').textContent = qty; m.querySelector('#qt').textContent = clp(qty * k.precio); }; });
      m.querySelector('#go').onclick = async (e) => {
        e.target.disabled = true;
        try { const cid = chatId || await api.openChat(k.owner_id); await api.order(cid, k.id, qty, m.querySelector('#nt').value.trim()); close(); toast('Pedido enviado'); await loadChats(); openChat(cid); loadOrders(); }
        catch (er) { toast(er.message); e.target.disabled = false; }
      };
    });
  }

  async function sendProductModal() {
    let items = []; try { items = (await api.catalog(S.me.id)).filter((k) => k.activo); } catch (e) { return toast(e.message); }
    modal('Enviar producto', items.length ? `<div class="list-card" style="box-shadow:none;border:1px solid var(--line)">${items.map((k) => `<button class="orow" data-k="${k.id}">${k.imagen_url ? `<img src="${esc(k.imagen_url)}" alt="">` : '<span class="ph"></span>'}<span style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(k.titulo)}</b><span class="small muted">${clp(k.precio)}</span></span>${I(IC.send, 18)}</button>`).join('')}</div>`
      : `<div class="empty"><b>Tu vitrina está vacía</b>Primero agrega productos en Ventas → Mi vitrina.</div><button class="btn brand lg" id="gov">Ir a mi vitrina</button>`, (m, close) => {
      const g = m.querySelector('#gov'); if (g) g.onclick = () => { close(); goPane('vitrina'); };
      m.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { const k = items.find((x) => x.id === Number(b.dataset.k)); close(); sendMsg({ tipo: 'producto', texto: null, meta: { catalogo_id: k.id, titulo: k.titulo, precio: k.precio, imagen_url: k.imagen_url, descripcion: k.descripcion, vendedor_id: S.me.id } }); }; });
    });
  }

  function photoModal() {
    let file = null;
    modal('Enviar foto', `<div class="pick" id="pk">${I(IC.image, 34)}<span>Toca para elegir una foto</span></div><input class="input" id="cap" placeholder="Agrega un comentario" maxlength="1000"><button class="btn brand lg" id="go" disabled>Enviar</button>`, (m, close) => {
      const pk = m.querySelector('#pk'); const go = m.querySelector('#go');
      pk.onclick = () => pickImage(pk, (f) => { file = f; go.disabled = false; }); pk.click();
      go.onclick = async () => {
        go.disabled = true; go.textContent = 'Enviando…'; const c = S.chat;
        try { const r = await api.send(c.chat_id, { tipo: 'imagen', texto: m.querySelector('#cap').value.trim(), file }); close(); if (S.chat === c && !S.msgs.some((x) => x.id === r.id)) { S.msgs.push(r); drawMsgs(true); } bumpChat(r); }
        catch (er) { toast(er.message); go.disabled = false; go.textContent = 'Enviar'; }
      };
    });
  }

  async function storyComposer(preItem) {
    let file = null, items = [];
    try { items = (await api.catalog(S.me.id)).filter((k) => k.activo); } catch { /* sin vitrina */ }
    let sel = preItem ? preItem.id : null;
    modal('Publicar en mi Mostrador', `<div class="pick tall" id="pk">${preItem?.imagen_url ? `<img src="${esc(preItem.imagen_url)}" alt="">` : `${I(IC.camera, 36)}<span><b>Toca para elegir una foto</b><br>Desaparece sola en 24 horas</span>`}</div>
      ${items.length ? `<div class="field"><label>Vincular a un producto de tu vitrina (opcional)</label><div class="chips" id="ch">${items.map((k) => `<button type="button" data-k="${k.id}" class="${sel === k.id ? 'on' : ''}">${esc(k.titulo)}</button>`).join('')}</div></div>` : ''}
      <div class="field"><label for="tx2">Texto</label><input class="input" id="tx2" maxlength="300" placeholder="Ej: ¡Llegaron nuevos colores!" value="${esc(preItem?.titulo || '')}"></div>
      <div class="field"><label for="pr2">Precio (opcional)</label><input class="input" id="pr2" type="number" min="0" inputmode="numeric" value="${preItem ? esc(preItem.precio) : ''}"></div>
      <button class="btn brand lg" id="go" ${preItem?.imagen_url ? '' : 'disabled'}>${I(IC.clock, 18)}Publicar por 24 horas</button>`, (m, close) => {
      const pk = m.querySelector('#pk'), go = m.querySelector('#go');
      pk.onclick = () => pickImage(pk, (f) => { file = f; go.disabled = false; });
      m.querySelectorAll('[data-k]').forEach((b) => {
        b.onclick = () => {
          const k = items.find((x) => x.id === Number(b.dataset.k)); const on = sel !== k.id; sel = on ? k.id : null;
          m.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', on && x === b));
          if (on) { m.querySelector('#tx2').value = m.querySelector('#tx2').value || k.titulo; m.querySelector('#pr2').value = k.precio; if (!file && k.imagen_url) { pk.innerHTML = `<img src="${esc(k.imagen_url)}" alt="">`; go.disabled = false; } }
        };
      });
      go.onclick = async () => {
        go.disabled = true; go.textContent = 'Publicando…';
        try {
          let f = file;
          if (!f) { const k = items.find((x) => x.id === sel) || preItem; if (!k?.imagen_url) throw new Error('Elige una foto'); f = await (await fetch(k.imagen_url)).blob(); }
          const pv = m.querySelector('#pr2').value;
          await api.postStory(f, m.querySelector('#tx2').value.trim(), pv === '' ? null : Math.round(Number(pv)), sel);
          close(); toast('Publicado en tu Mostrador por 24 horas'); await loadFeed();
        } catch (er) { toast(er.message); go.disabled = false; go.textContent = 'Publicar por 24 horas'; }
      };
    });
  }

  async function viewsModal(st) {
    let v = []; try { v = await api.storyViews(st.id); } catch (e) { return toast(e.message); }
    modal(`Visto por ${v.length}`, v.length ? `<div>${v.map((u) => `<button class="row" data-close data-act="startChat" data-id="${esc(u.id)}" style="padding:8px 0">${av(u, 42)}<span class="mid" style="border:0;margin:0;padding:0"><span class="l1"><b class="ell">${esc(nombre(u))}</b></span><span class="l2"><span class="t">${esc(hace(u.visto_at))}</span></span></span></button>`).join('')}</div>` : '<div class="empty">Nadie lo ha visto todavía.</div>');
  }

  // ---------------------------------------------------------- visor del Mostrador
  function openStories(ownerId, storyId) {
    let groups = S.feed;
    if (ownerId !== S.me.id) groups = S.feed.filter((g) => g.owner_id !== S.me.id);
    let gi = groups.findIndex((g) => g.owner_id === ownerId); if (gi < 0) return toast('Este Mostrador ya no está disponible');
    let si = storyId ? Math.max(0, groups[gi].items.findIndex((i) => i.id === storyId)) : Math.max(0, groups[gi].items.findIndex((i) => !i.visto));
    if (ownerId === S.me.id) si = storyId ? si : 0;
    const el = document.createElement('div'); el.className = 'story'; layer.appendChild(el);
    let t0 = 0, elapsed = 0, paused = false, raf = 0, closed = false;
    const close = () => { closed = true; cancelAnimationFrame(raf); el.remove(); document.removeEventListener('keydown', key); renderTabs(); if (!S.side) renderSide(); };
    const key = (e) => { if (layer.querySelector('.modal-bg')) return; if (e.key === 'Escape') close(); else if (e.target.closest && e.target.closest('input,textarea')) return; else if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); };
    document.addEventListener('keydown', key);
    function next() { const g = groups[gi]; if (si < g.items.length - 1) si++; else if (gi < groups.length - 1 && ownerId !== S.me.id) { gi++; si = 0; } else return close(); show(); }
    function prev() { if (si > 0) si--; else if (gi > 0 && ownerId !== S.me.id) { gi--; si = groups[gi].items.length - 1; } else elapsed = 0; show(); }
    function tick(ts) {
      if (closed) return;
      if (!paused) { elapsed += ts - (t0 || ts); }
      t0 = ts; const bar = el.querySelector(`.story-bars i:nth-child(${si + 1}) b`);
      if (bar) bar.style.width = Math.min(100, (elapsed / STORY_MS) * 100) + '%';
      if (elapsed >= STORY_MS) return next();
      raf = requestAnimationFrame(tick);
    }
    async function show() {
      cancelAnimationFrame(raf); elapsed = 0; t0 = 0; paused = false;
      const g = groups[gi], st = g.items[si], own = g.owner_id === S.me.id;
      const u = { id: g.owner_id, name: g.name, username: g.username, avatar: g.avatar };
      const left = Math.max(0, Math.ceil((new Date(st.expira_at) - Date.now()) / 3600e3));
      el.innerHTML = `<div class="story-in">
        <div class="story-bars">${g.items.map((_, i) => `<i><b style="width:${i < si ? 100 : 0}%"></b></i>`).join('')}</div>
        <div class="story-top">${av(u, 38)}<div class="who ell"><b class="ell">${own ? 'Mi mostrador' : esc(nombre(g))}</b><small>${esc(hace(st.created_at))} · se borra en ${left} h</small></div>
          <button class="icon-btn" data-s="close" aria-label="Cerrar">${I(IC.x)}</button></div>
        <div class="story-img"><span class="spin" style="position:absolute"></span><img alt="${esc(st.texto || 'Mostrador')}" id="si">
          <div class="story-nav"><span data-s="prev"></span><span data-s="next"></span></div>
          <div class="story-cap">${st.precio != null ? `<span class="price-tag">${clp(st.precio)}</span>` : ''}${st.texto ? `<p>${esc(st.texto)}</p>` : ''}</div>
          <button class="story-side-btn l" data-s="prev" aria-label="Anterior">${I(IC.back)}</button><button class="story-side-btn r" data-s="next" aria-label="Siguiente">${I(IC.next)}</button></div>
        <div class="story-foot">${own
          ? `<div class="story-own"><button data-s="views">${I(IC.eye)}${st.vistas || 0} vistas</button><button data-s="del">${I(IC.trash)}Eliminar</button></div>`
          : `<div class="chips">${RAPIDAS.map((r) => `<button data-q="${esc(r)}">${esc(r)}</button>`).join('')}</div>
             <form class="story-reply" id="sr"><input id="sri" placeholder="Responder a ${esc(nombre(g).split(' ')[0])}…" maxlength="1000" autocomplete="off"><button class="send" aria-label="Enviar">${I(IC.send, 20)}</button></form>`}</div></div>`;
      const url = await api.img('mostrador', st.imagen_path, Math.min(3600, (new Date(st.expira_at) - Date.now()) / 1000));
      if (closed || groups[gi].items[si] !== st) return;
      const img = el.querySelector('#si');
      img.onload = () => { el.querySelector('.story-img .spin')?.remove(); t0 = 0; raf = requestAnimationFrame(tick); };
      img.onerror = () => { el.querySelector('.story-img .spin')?.remove(); next(); };
      img.src = url;
      if (!own && !st.visto) { st.visto = true; api.viewStory(st.id).catch(() => {}); }
      const inp = el.querySelector('#sri');
      if (inp) { inp.onfocus = () => { paused = true; }; inp.onblur = () => { if (!inp.value) paused = false; }; }
      const sr = el.querySelector('#sr');
      if (sr) sr.onsubmit = (e) => { e.preventDefault(); reply(st, g, inp.value.trim()); };
    }
    async function reply(st, g, text) {
      if (!text) return;
      try { await api.replyStory(st.id, text); toast(`Enviado a ${nombre(g)}`); const i = el.querySelector('#sri'); if (i) { i.value = ''; i.blur(); } paused = false; loadChats(); }
      catch (e) { toast(e.message); }
    }
    let downAt = 0;
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('.story-nav')) { downAt = Date.now(); paused = true; } });
    el.addEventListener('pointerup', (e) => { if (downAt && e.target.closest('.story-nav')) { const held = Date.now() - downAt > 250; downAt = 0; paused = false; if (!held) (e.target.dataset.s === 'prev' ? prev : next)(); } });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-s],[data-q]'); if (!b || b.closest('.story-nav')) return;
      const g = groups[gi], st = g.items[si];
      if (b.dataset.q) return reply(st, g, b.dataset.q);
      const s = b.dataset.s;
      if (s === 'close') close(); else if (s === 'prev') prev(); else if (s === 'next') next();
      else if (s === 'views') { paused = true; viewsModal(st); }
      else if (s === 'del') {
        if (!b.dataset.armed) { b.dataset.armed = 1; paused = true; b.innerHTML = I(IC.trash) + '¿Eliminar?'; return; }
        try { await api.deleteStory(st); toast('Eliminado del Mostrador'); g.items.splice(si, 1); await loadFeed(); if (!g.items.length) return close(); si = Math.min(si, g.items.length - 1); show(); } catch (er) { toast(er.message); }
      }
    });
    show();
  }

  // ---------------------------------------------------------- navegación
  async function startChatWith(userId) {
    try { const cid = await api.openChat(userId); S.side = null; await loadChats(); openChat(cid); } catch (e) { toast(e.message); }
  }
  async function openByAlias(alias) {
    try {
      const u = await api.profile(null, alias);
      if (!u) return toast(`No encontramos a @${alias}`);
      if (u.id === S.me.id) return toast('Este es tu propio enlace');
      startChatWith(u.id);
    } catch (e) { toast(e.message); }
  }
  function goPane(v, extra = {}) { closeChatState(); S.pane = { v, ...extra }; renderPane(); if (S.tab === 'ventas') renderSide(); }
  function closeChatState() { S.chat = null; S.msgs = []; }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b || !$('#app')) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'story') { e.stopPropagation(); if (b.closest('.row')) e.preventDefault(); return openStories(id); }
    switch (act) {
      case 'tab': S.tab = id; S.side = null; renderTabs(); renderSide(); if (id === 'mostrador') loadFeed(); if (id === 'ventas') loadOrders(); break;
      case 'openChat': openChat(Number(id), b.dataset.msg ? Number(b.dataset.msg) : null); break;
      case 'newChat': S.side = 'nuevo'; renderSide(); break;
      case 'profile': S.side = 'perfil'; renderSide(); break;
      case 'sideBack': S.side = null; renderSide(); break;
      case 'startChat': startChatWith(id); break;
      case 'closeChat': closeChatState(); renderSide(); renderPane(); break;
      case 'closePane': S.pane = null; renderPane(); renderSide(); break;
      case 'pane': goPane(id); break;
      case 'perfilDe': goPane('perfilDe', { id }); break;
      case 'addStory': storyComposer(); break;
      case 'storyFromItem': storyComposer(S.myCatalog.find((k) => k.id === Number(id))); break;
      case 'storyById': { const g = S.feed.find((x) => x.items.some((i) => i.id === Number(id))); if (g) openStories(g.owner_id, Number(id)); else toast('Este estado ya no está disponible'); break; }
      case 'editItem': itemModal(id ? S.myCatalog.find((k) => k.id === Number(id)) : null); break;
      case 'editProfile': editProfileModal(); break;
      case 'filter': S.filter = id; renderPane(); break;
      case 'estado': b.disabled = true; try { await api.orderStatus(Number(id), b.dataset.e); toast('Pedido: ' + ESTADOS[b.dataset.e]); loadOrders(); } catch (er) { toast(er.message); b.disabled = false; } break;
      case 'pedir': case 'askItem': {
        const owner = b.dataset.owner; let k = (S.pane?.items || S.chat?.items || []).find((x) => x.id === Number(id));
        if (!k) { try { k = (await api.catalog(owner)).find((x) => x.id === Number(id)); } catch { /* nada */ } }
        if (!k) return toast('Este producto ya no está disponible');
        k.owner_id = owner;
        if (act === 'pedir') return orderModal(k, S.chat && S.chat.otro_id === owner ? S.chat.chat_id : null);
        const cid = await api.openChat(owner); await loadChats(); await openChat(cid);
        const tx = $('#tx'); tx.value = `Hola! Te quería preguntar por "${k.titulo}" (${clp(k.precio)}) `; tx.focus(); break;
      }
      case 'attach': {
        const att = $('#att'); if (att.innerHTML) { att.innerHTML = ''; break; }
        att.innerHTML = `<div class="attach"><button type="button" data-act="attPhoto"><i style="background:#7048E8">${I(IC.image, 18)}</i>Foto</button>
          <button type="button" data-act="attProduct"><i style="background:#E0313B">${I(IC.tag, 18)}</i>Producto de mi vitrina</button>
          ${S.chat?.items?.length ? `<button type="button" data-act="perfilDe" data-id="${esc(S.chat.otro_id)}"><i style="background:#2B8A3E">${I(IC.bag, 18)}</i>Pedir de su vitrina</button>` : ''}</div>`;
        break;
      }
      case 'attPhoto': $('#att').innerHTML = ''; photoModal(); break;
      case 'attProduct': $('#att').innerHTML = ''; sendProductModal(); break;
      case 'zoom': { const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${esc(b.src)}" alt="">`; lb.onclick = () => lb.remove(); layer.appendChild(lb); break; }
      case 'copyLink': try { await navigator.clipboard.writeText(shareLink(S.me.username)); toast('Enlace copiado'); } catch { toast(shareLink(S.me.username)); } break;
      case 'shareLink': if (ANDROID) { ANDROID.share(`Hazme tu pedido por chat en EmprenLive: @${S.me.username} ${shareLink(S.me.username)}`); break; }
        navigator.share({ title: 'Escríbeme en EmprenLive', text: `Hazme tu pedido por chat: @${S.me.username}`, url: shareLink(S.me.username) }).catch(() => {}); break;
      case 'toggleContact': try { if (b.dataset.on === '1') await api.removeContact(id); else await api.addContact(id); toast(b.dataset.on === '1' ? 'Quitado de contactos' : 'Agregado a contactos'); renderPane(); loadFeed(); } catch (er) { toast(er.message); } break;
      case 'notif': if ('Notification' in window) { await Notification.requestPermission(); renderSide(); } break;
      case 'theme': { const cur = document.documentElement.dataset.theme; const n = !cur ? 'dark' : cur === 'dark' ? 'light' : ''; applyTheme(n); try { localStorage.setItem('el_theme', n); } catch { /* sin almacenamiento */ } renderSide(); break; }
      case 'logout': await api.logout(); location.reload(); break;
    }
  });
  document.addEventListener('click', (e) => { const att = $('#att'); if (att && att.innerHTML && !e.target.closest('#att') && !e.target.closest('[data-act="attach"]')) att.innerHTML = ''; }, true);
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#@') && S.me?.username) { const a = location.hash.slice(2); history.replaceState(null, '', location.pathname + location.search); openByAlias(a); } });

  // Botón "atrás" de Android: cierra lo que esté abierto; devuelve false si no queda nada (la app se cierra).
  window.__elBack = () => {
    const top = layer.lastElementChild;
    if (top) { if (top.classList.contains('lightbox')) top.remove(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true; }
    const att = $('#att'); if (att && att.innerHTML) { att.innerHTML = ''; return true; }
    if (!$('#app')) return false;
    if (isMobile() && S.chat) { closeChatState(); renderSide(); renderPane(); return true; }
    if (isMobile() && S.pane) { S.pane = null; renderPane(); renderSide(); return true; }
    if (S.side) { S.side = null; renderSide(); return true; }
    if (S.tab !== 'chats') { S.tab = 'chats'; renderTabs(); renderSide(); return true; }
    return false;
  };

  boot();
})();
