// EmprenLive · Borra las fotos y filas del Mostrador que ya cumplieron 24 h.
// Desplegar:  supabase functions deploy limpiar-mostrador
// Programar:  cada hora (ver supabase/README.md).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) return new Response('no autorizado', { status: 401 });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let borrados = 0;
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const { data, error } = await sb.from('mostrador').select('id, imagen_path')
      .lt('expira_at', new Date().toISOString()).limit(500);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    if (!data.length) break;
    const rem = await sb.storage.from('mostrador').remove(data.map((r) => r.imagen_path));
    if (rem.error) return Response.json({ ok: false, error: rem.error.message }, { status: 500 });
    const del = await sb.from('mostrador').delete().in('id', data.map((r) => r.id));
    if (del.error) return Response.json({ ok: false, error: del.error.message }, { status: 500 });
    borrados += data.length;
  }
  return Response.json({ ok: true, borrados });
});
