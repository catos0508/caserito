-- ============================================================================
-- EmprenLive · Chat en vivo, contactos por @alias, vitrina, pedidos y Mostrador
-- Ejecutar una vez en Supabase → SQL Editor (es idempotente: se puede re-ejecutar).
-- Requiere la tabla public.profiles existente (id, name, email, phone, avatar, role, status).
-- ============================================================================

-- ---------------------------------------------------------------- perfiles
alter table public.profiles add column if not exists username  text;
alter table public.profiles add column if not exists bio       text;
alter table public.profiles add column if not exists last_seen timestamptz;

create unique index if not exists profiles_username_key on public.profiles (lower(username));
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_.]{3,20}$');

-- ¿La cuenta que llama está activa?
create or replace function public.yo_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and coalesce(status, 'active') = 'active');
$$;

-- ---------------------------------------------------------------- contactos
create table if not exists public.contactos (
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);
alter table public.contactos enable row level security;
drop policy if exists contactos_sel on public.contactos;
create policy contactos_sel on public.contactos for select using (owner_id = auth.uid());
drop policy if exists contactos_del on public.contactos;
create policy contactos_del on public.contactos for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------- chats 1 a 1
create table if not exists public.chats (
  id              bigint generated always as identity primary key,
  user_a          uuid not null references public.profiles(id) on delete cascade,
  user_b          uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists chats_b_idx on public.chats (user_b);
alter table public.chats enable row level security;
drop policy if exists chats_sel on public.chats;
create policy chats_sel on public.chats for select using (auth.uid() in (user_a, user_b));

create or replace function public.es_participante(p_chat bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chats where id = p_chat and auth.uid() in (user_a, user_b));
$$;

-- ---------------------------------------------------------------- mensajes
create table if not exists public.mensajes (
  id         bigint generated always as identity primary key,
  chat_id    bigint not null references public.chats(id) on delete cascade,
  sender_id  uuid   not null references public.profiles(id) on delete cascade,
  tipo       text   not null default 'texto'
             check (tipo in ('texto', 'imagen', 'producto', 'pedido', 'mostrador')),
  texto      text   check (char_length(texto) <= 4000),
  imagen     text,                       -- ruta en el bucket "chat"
  meta       jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  leido_at   timestamptz
);
create index if not exists mensajes_chat_idx on public.mensajes (chat_id, id desc);
create index if not exists mensajes_pedidos_idx on public.mensajes ((meta->>'vendedor_id')) where tipo = 'pedido';
alter table public.mensajes enable row level security;
drop policy if exists mensajes_sel on public.mensajes;
create policy mensajes_sel on public.mensajes for select using (public.es_participante(chat_id));
drop policy if exists mensajes_ins on public.mensajes;
create policy mensajes_ins on public.mensajes for insert with check (
  sender_id = auth.uid() and public.yo_activo() and public.es_participante(chat_id)
  and tipo in ('texto', 'imagen', 'producto')       -- pedidos y respuestas al Mostrador van por RPC
);

create or replace function public.tg_mensaje_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  new.leido_at := null;
  update chats set last_message_at = now() where id = new.chat_id;
  return new;
end $$;
drop trigger if exists mensaje_nuevo on public.mensajes;
create trigger mensaje_nuevo before insert on public.mensajes for each row execute function public.tg_mensaje_nuevo();

-- ---------------------------------------------------------------- vitrina (catálogo personal)
create table if not exists public.catalogo (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  titulo      text not null check (char_length(titulo) between 1 and 120),
  precio      integer not null default 0 check (precio >= 0),
  descripcion text check (char_length(descripcion) <= 1000),
  imagen_url  text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists catalogo_owner_idx on public.catalogo (owner_id, created_at desc);
alter table public.catalogo enable row level security;
drop policy if exists catalogo_sel on public.catalogo;
create policy catalogo_sel on public.catalogo for select using (activo or owner_id = auth.uid());
drop policy if exists catalogo_ins on public.catalogo;
create policy catalogo_ins on public.catalogo for insert with check (owner_id = auth.uid() and public.yo_activo());
drop policy if exists catalogo_upd on public.catalogo;
create policy catalogo_upd on public.catalogo for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists catalogo_del on public.catalogo;
create policy catalogo_del on public.catalogo for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------- Mostrador (estados de 24 h)
create table if not exists public.mostrador (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  imagen_path text not null,             -- ruta en el bucket privado "mostrador"
  texto       text check (char_length(texto) <= 300),
  precio      integer check (precio >= 0),
  catalogo_id bigint references public.catalogo(id) on delete set null,
  created_at  timestamptz not null default now(),
  expira_at   timestamptz not null default now() + interval '24 hours'
);
create index if not exists mostrador_owner_idx on public.mostrador (owner_id, expira_at);
create index if not exists mostrador_expira_idx on public.mostrador (expira_at);

-- Quién puede ver el Mostrador de alguien: él mismo, quien lo tiene en contactos, o quien ya chatea con él.
create or replace function public.puede_ver_mostrador(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid()
      or exists (select 1 from contactos where owner_id = auth.uid() and contact_id = p_owner)
      or exists (select 1 from chats where (user_a = auth.uid() and user_b = p_owner) or (user_b = auth.uid() and user_a = p_owner));
$$;

alter table public.mostrador enable row level security;
drop policy if exists mostrador_sel on public.mostrador;
create policy mostrador_sel on public.mostrador for select using (expira_at > now() and public.puede_ver_mostrador(owner_id));
drop policy if exists mostrador_ins on public.mostrador;
create policy mostrador_ins on public.mostrador for insert with check (
  owner_id = auth.uid() and public.yo_activo() and imagen_path like auth.uid()::text || '/%');
drop policy if exists mostrador_del on public.mostrador;
create policy mostrador_del on public.mostrador for delete using (owner_id = auth.uid());

-- La duración no se puede manipular desde el cliente: siempre 24 h desde ahora.
create or replace function public.tg_mostrador_nuevo() returns trigger language plpgsql as $$
begin
  new.created_at := now();
  new.expira_at  := now() + interval '24 hours';
  return new;
end $$;
drop trigger if exists mostrador_nuevo on public.mostrador;
create trigger mostrador_nuevo before insert on public.mostrador for each row execute function public.tg_mostrador_nuevo();

create table if not exists public.mostrador_vistas (
  mostrador_id bigint not null references public.mostrador(id) on delete cascade,
  viewer_id    uuid   not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (mostrador_id, viewer_id)
);
alter table public.mostrador_vistas enable row level security;
drop policy if exists vistas_sel on public.mostrador_vistas;
create policy vistas_sel on public.mostrador_vistas for select using (
  viewer_id = auth.uid() or exists (select 1 from mostrador m where m.id = mostrador_id and m.owner_id = auth.uid()));
drop policy if exists vistas_ins on public.mostrador_vistas;
create policy vistas_ins on public.mostrador_vistas for insert with check (
  viewer_id = auth.uid() and exists (select 1 from mostrador m where m.id = mostrador_id));

-- ---------------------------------------------------------------- RPC: perfil y contactos
create or replace function public.guardar_perfil(p_username text, p_name text, p_bio text, p_phone text default null)
returns void language plpgsql security definer set search_path = public as $$
declare u text := lower(trim(p_username));
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if u !~ '^[a-z0-9_.]{3,20}$' then
    raise exception 'El alias debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo';
  end if;
  if exists (select 1 from profiles where lower(username) = u and id <> auth.uid()) then
    raise exception 'El alias @% ya está en uso', u;
  end if;
  update profiles set username = u,
         name  = coalesce(nullif(trim(p_name), ''), name),
         bio   = nullif(trim(coalesce(p_bio, '')), ''),
         phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone)
   where id = auth.uid();
  if not found then raise exception 'No encontramos tu perfil. Cierra sesión y vuelve a entrar.'; end if;
end $$;

create or replace function public.ping() returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen = now() where id = auth.uid();
$$;

create or replace function public.buscar_usuarios(q text)
returns table (id uuid, username text, name text, avatar text, bio text, es_contacto boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.name, p.avatar, p.bio,
         exists (select 1 from contactos c where c.owner_id = auth.uid() and c.contact_id = p.id)
    from profiles p
   where p.username is not null and coalesce(p.status, 'active') = 'active' and p.id <> auth.uid()
     and length(trim(q)) >= 2
     and (starts_with(p.username, lower(ltrim(trim(q), '@'))) or p.name ilike '%' || trim(q) || '%')
   order by (p.username = lower(ltrim(trim(q), '@'))) desc, p.username
   limit 25;
$$;

create or replace function public.perfil_publico(p_id uuid default null, p_username text default null)
returns table (id uuid, username text, name text, avatar text, bio text, last_seen timestamptz, es_contacto boolean, productos int)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.name, p.avatar, p.bio, p.last_seen,
         exists (select 1 from contactos c where c.owner_id = auth.uid() and c.contact_id = p.id),
         (select count(*)::int from catalogo k where k.owner_id = p.id and k.activo)
    from profiles p
   where p.username is not null and coalesce(p.status, 'active') = 'active'
     and (p.id = p_id or lower(p.username) = lower(ltrim(p_username, '@')))
   limit 1;
$$;

create or replace function public.mis_contactos()
returns table (id uuid, username text, name text, avatar text, bio text, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.name, p.avatar, p.bio, p.last_seen
    from contactos c join profiles p on p.id = c.contact_id
   where c.owner_id = auth.uid() and coalesce(p.status, 'active') = 'active'
   order by lower(coalesce(p.name, p.username));
$$;

create or replace function public.agregar_contacto(p_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into contactos (owner_id, contact_id)
  select auth.uid(), p_id where auth.uid() is not null and auth.uid() <> p_id
  on conflict do nothing;
$$;

-- ---------------------------------------------------------------- RPC: chats
create or replace function public.abrir_chat(p_otro uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare a uuid := least(auth.uid(), p_otro); b uuid := greatest(auth.uid(), p_otro); cid bigint;
begin
  if auth.uid() is null or p_otro is null or p_otro = auth.uid() then raise exception 'Chat no válido'; end if;
  if not yo_activo() then raise exception 'Tu cuenta está suspendida'; end if;
  if not exists (select 1 from profiles where id = p_otro and username is not null and coalesce(status, 'active') = 'active') then
    raise exception 'Usuario no disponible';
  end if;
  insert into chats (user_a, user_b) values (a, b) on conflict (user_a, user_b) do nothing;
  select id into cid from chats where user_a = a and user_b = b;
  insert into contactos (owner_id, contact_id) values (auth.uid(), p_otro) on conflict do nothing;
  return cid;
end $$;

create or replace function public.mis_chats()
returns table (chat_id bigint, otro_id uuid, username text, name text, avatar text, last_seen timestamptz,
               ultimo_tipo text, ultimo_texto text, ultimo_sender uuid, ultimo_leido timestamptz,
               ultimo_at timestamptz, no_leidos int)
language sql stable security definer set search_path = public as $$
  select c.id, p.id, p.username, p.name, p.avatar, p.last_seen,
         m.tipo, m.texto, m.sender_id, m.leido_at, coalesce(m.created_at, c.created_at),
         (select count(*)::int from mensajes x where x.chat_id = c.id and x.sender_id <> auth.uid() and x.leido_at is null)
    from chats c
    join profiles p on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
    left join lateral (select * from mensajes y where y.chat_id = c.id order by y.id desc limit 1) m on true
   where auth.uid() in (c.user_a, c.user_b)
   order by coalesce(m.created_at, c.created_at) desc;
$$;

create or replace function public.marcar_leido(p_chat bigint) returns void
language sql security definer set search_path = public as $$
  update mensajes set leido_at = now()
   where chat_id = p_chat and sender_id <> auth.uid() and leido_at is null and es_participante(p_chat);
$$;

-- ---------------------------------------------------------------- RPC: pedidos dentro del chat
create or replace function public.crear_pedido(p_chat bigint, p_item bigint, p_cantidad int, p_nota text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare k catalogo; c chats; mid bigint;
begin
  if not es_participante(p_chat) or not yo_activo() then raise exception 'Chat no válido'; end if;
  select * into c from chats where id = p_chat;
  select * into k from catalogo where id = p_item and activo;
  if k.id is null then raise exception 'Producto no disponible'; end if;
  if k.owner_id = auth.uid() or k.owner_id not in (c.user_a, c.user_b) then raise exception 'Ese producto no es de esta conversación'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 999 then raise exception 'Cantidad no válida'; end if;
  insert into mensajes (chat_id, sender_id, tipo, texto, meta)
  values (p_chat, auth.uid(), 'pedido', nullif(left(trim(coalesce(p_nota, '')), 500), ''),
          jsonb_build_object('catalogo_id', k.id, 'titulo', k.titulo, 'precio', k.precio, 'cantidad', p_cantidad,
                             'imagen_url', k.imagen_url, 'vendedor_id', k.owner_id, 'estado', 'nuevo'))
  returning id into mid;
  return mid;
end $$;

create or replace function public.estado_pedido(p_msg bigint, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare m mensajes; vend uuid; actual text;
begin
  select * into m from mensajes where id = p_msg and tipo = 'pedido';
  if m.id is null or not es_participante(m.chat_id) then raise exception 'Pedido no encontrado'; end if;
  vend := (m.meta->>'vendedor_id')::uuid; actual := m.meta->>'estado';
  if p_estado not in ('confirmado', 'pagado', 'enviado', 'entregado', 'cancelado') then raise exception 'Estado no válido'; end if;
  if auth.uid() = vend then null;                                     -- el vendedor maneja todo el flujo
  elsif auth.uid() = m.sender_id and p_estado = 'cancelado' and actual = 'nuevo' then null;  -- el comprador puede cancelar antes de confirmar
  else raise exception 'No puedes cambiar este pedido'; end if;
  update mensajes set meta = meta || jsonb_build_object('estado', p_estado, 'estado_at', now()) where id = p_msg;
end $$;

-- ---------------------------------------------------------------- RPC: Mostrador
create or replace function public.mostrador_feed()
returns table (owner_id uuid, username text, name text, avatar text, items jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.name, p.avatar,
         jsonb_agg(jsonb_build_object(
           'id', m.id, 'imagen_path', m.imagen_path, 'texto', m.texto, 'precio', m.precio, 'catalogo_id', m.catalogo_id,
           'created_at', m.created_at, 'expira_at', m.expira_at,
           'visto', exists (select 1 from mostrador_vistas v where v.mostrador_id = m.id and v.viewer_id = auth.uid()),
           'vistas', case when m.owner_id = auth.uid() then (select count(*) from mostrador_vistas v where v.mostrador_id = m.id) end
         ) order by m.created_at)
    from mostrador m join profiles p on p.id = m.owner_id
   where m.expira_at > now() and puede_ver_mostrador(m.owner_id) and coalesce(p.status, 'active') = 'active'
   group by p.id, p.username, p.name, p.avatar
   order by (p.id = auth.uid()) desc, max(m.created_at) desc;
$$;

create or replace function public.vistas_mostrador(p_id bigint)
returns table (id uuid, username text, name text, avatar text, visto_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.name, p.avatar, v.created_at
    from mostrador_vistas v join mostrador m on m.id = v.mostrador_id join profiles p on p.id = v.viewer_id
   where v.mostrador_id = p_id and m.owner_id = auth.uid()
   order by v.created_at desc;
$$;

-- Responder a un estado: llega como mensaje al chat del dueño ("Me gusta este producto", etc.)
create or replace function public.responder_mostrador(p_id bigint, p_texto text) returns bigint
language plpgsql security definer set search_path = public as $$
declare m mostrador; cid bigint; mid bigint;
begin
  select * into m from mostrador where id = p_id and expira_at > now();
  if m.id is null or not puede_ver_mostrador(m.owner_id) then raise exception 'Este estado ya no está disponible'; end if;
  if m.owner_id = auth.uid() then raise exception 'No puedes responder tu propio estado'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escribe un mensaje'; end if;
  cid := abrir_chat(m.owner_id);
  insert into mensajes (chat_id, sender_id, tipo, texto, meta)
  values (cid, auth.uid(), 'mostrador', left(trim(p_texto), 1000),
          jsonb_build_object('mostrador_id', m.id, 'imagen_path', m.imagen_path, 'texto', m.texto,
                             'precio', m.precio, 'catalogo_id', m.catalogo_id, 'expira_at', m.expira_at))
  returning id into mid;
  return cid;
end $$;

-- ---------------------------------------------------------------- permisos de ejecución
revoke all on function public.yo_activo, public.es_participante, public.puede_ver_mostrador from anon;
grant execute on function
  public.guardar_perfil, public.ping, public.buscar_usuarios, public.perfil_publico, public.mis_contactos,
  public.agregar_contacto, public.abrir_chat, public.mis_chats, public.marcar_leido, public.crear_pedido,
  public.estado_pedido, public.mostrador_feed, public.vistas_mostrador, public.responder_mostrador
  to authenticated;
revoke execute on function
  public.guardar_perfil, public.ping, public.buscar_usuarios, public.perfil_publico, public.mis_contactos,
  public.agregar_contacto, public.abrir_chat, public.mis_chats, public.marcar_leido, public.crear_pedido,
  public.estado_pedido, public.mostrador_feed, public.vistas_mostrador, public.responder_mostrador
  from anon, public;

-- ---------------------------------------------------------------- tiempo real
do $$ begin
  begin alter publication supabase_realtime add table public.mensajes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chats;    exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------- almacenamiento
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('mostrador', 'mostrador', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('chat',      'chat',      false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('catalogo',  'catalogo',  true,  5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Mostrador: privado. Cada uno sube a su carpeta; solo se puede leer mientras el estado exista y no haya expirado.
drop policy if exists "mostrador subir" on storage.objects;
create policy "mostrador subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'mostrador' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "mostrador leer" on storage.objects;
create policy "mostrador leer" on storage.objects for select to authenticated
  using (bucket_id = 'mostrador' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.mostrador m where m.imagen_path = objects.name)));   -- RLS de mostrador filtra expirados
drop policy if exists "mostrador borrar" on storage.objects;
create policy "mostrador borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'mostrador' and (storage.foldername(name))[1] = auth.uid()::text);

-- Fotos del chat: privadas, carpeta = id del chat; solo participantes.
drop policy if exists "chat subir" on storage.objects;
create policy "chat subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and public.es_participante(((storage.foldername(name))[1])::bigint));
drop policy if exists "chat leer" on storage.objects;
create policy "chat leer" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.es_participante(((storage.foldername(name))[1])::bigint));

-- Vitrina: pública para leer; cada uno escribe en su carpeta.
drop policy if exists "catalogo subir" on storage.objects;
create policy "catalogo subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogo' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "catalogo borrar" on storage.objects;
create policy "catalogo borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'catalogo' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------- limpieza de estados vencidos
-- Las filas vencidas ya son invisibles (RLS + URLs firmadas que caducan al vencer).
-- La función Edge "limpiar-mostrador" borra las fotos y filas vencidas; prográmala cada hora
-- (ver supabase/README.md). Como respaldo, si pg_cron está activo, borra filas vencidas hace +2 días:
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'mostrador-vencidos';
    perform cron.schedule('mostrador-vencidos', '17 * * * *',
      $q$delete from public.mostrador where expira_at < now() - interval '2 days'$q$);
  end if;
end $$;
