// Emite o token de acesso à sala de videochamada de uma sessão (LiveKit).
// A autorização é feita aqui, com o JWT do usuário: a RLS decide o que ele enxerga.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MINUTE = 60_000;

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return reply(405, { error: 'Método não permitido.' });
  }

  const url = Deno.env.get('LIVEKIT_URL');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !apiKey || !apiSecret) {
    return reply(503, { error: 'Videochamada ainda não configurada neste ambiente.' });
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    return reply(401, { error: 'Faça login para entrar na chamada.' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return reply(401, { error: 'Sessão inválida. Entre novamente.' });
  }

  let payload: { session_id?: string; action?: string };
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: 'Requisição inválida.' });
  }
  const sessionId = payload.session_id;
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return reply(400, { error: 'Sessão inválida.' });
  }

  // A RLS só devolve a sessão a membros ativos da organização.
  const { data: session } = await supabase
    .from('sessions')
    .select('id, monitor_id, mode, in_app_call, status, starts_at, ends_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) {
    return reply(404, { error: 'Sessão não encontrada.' });
  }
  if (session.mode !== 'online' || !session.in_app_call) {
    return reply(400, { error: 'Esta sessão não usa a videochamada do Monitora+.' });
  }

  const isMonitor = session.monitor_id === user.id;
  const now = Date.now();
  const starts = new Date(session.starts_at).getTime();
  const ends = new Date(session.ends_at).getTime();

  // Encerrar a sala depois que o monitor finaliza a sessão.
  if (payload.action === 'close') {
    if (!isMonitor) {
      return reply(403, { error: 'Apenas o monitor pode encerrar a chamada.' });
    }
    if (!['completed', 'cancelled'].includes(session.status)) {
      return reply(409, { error: 'Encerre a sessão antes de fechar a sala.' });
    }
    try {
      const rooms = new RoomServiceClient(url.replace(/^wss?:/, 'https:'), apiKey, apiSecret);
      await rooms.deleteRoom(session.id);
    } catch {
      // sala já inexistente: nada a fechar
    }
    return reply(200, { closed: true });
  }

  if (now < starts - 15 * MINUTE || now > ends + 30 * MINUTE) {
    return reply(403, { error: 'A chamada só fica disponível perto do horário da sessão.' });
  }

  if (isMonitor) {
    if (!['open', 'in_progress'].includes(session.status)) {
      return reply(403, { error: 'Esta sessão já foi encerrada.' });
    }
  } else {
    if (session.status !== 'in_progress') {
      return reply(403, { error: 'O monitor ainda não iniciou a sessão.' });
    }
    const { data: booking } = await supabase
      .from('session_bookings')
      .select('status')
      .eq('session_id', session.id)
      .eq('student_id', user.id)
      .in('status', ['booked', 'checked_in'])
      .maybeSingle();
    if (!booking) {
      return reply(403, { error: 'Você não tem reserva ativa nesta sessão.' });
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  // identity opaca (id do usuário): o nome exibido vai em `name`.
  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profile?.full_name ?? 'Participante',
    ttl: '10m',
  });
  token.addGrant({
    room: session.id,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isMonitor,
  });

  return reply(200, { token: await token.toJwt(), url, role: isMonitor ? 'monitor' : 'student' });
});
