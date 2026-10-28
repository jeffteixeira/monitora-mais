// Recebe os webhooks do LiveKit (entrada/saída de participantes) e registra a presença.
// Sem JWT do Supabase: a autenticidade é verificada pela assinatura do LiveKit.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { WebhookReceiver } from 'npm:livekit-server-sdk@2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Método não permitido', { status: 405 });
  }

  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!apiKey || !apiSecret) {
    return new Response('Não configurado', { status: 503 });
  }

  // O corpo precisa ser o texto bruto: a assinatura inclui o hash dele.
  const body = await req.text();
  const receiver = new WebhookReceiver(apiKey, apiSecret);
  let event;
  try {
    event = await receiver.receive(body, req.headers.get('Authorization') ?? undefined);
  } catch {
    return new Response('Assinatura inválida', { status: 401 });
  }

  if (event.event !== 'participant_joined' && event.event !== 'participant_left') {
    return new Response('ok');
  }

  const sessionId = event.room?.name ?? '';
  const userId = event.participant?.identity ?? '';
  if (!UUID.test(sessionId) || !UUID.test(userId)) {
    return new Response('ok');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { error } = await supabase.rpc('record_presence', {
    p_session: sessionId,
    p_user: userId,
    p_event: event.event,
    p_at: new Date(Number(event.createdAt) * 1000).toISOString(),
    p_event_id: event.id,
  });
  if (error) {
    // 500 faz o LiveKit reenviar; o registro é idempotente pelo id do evento.
    return new Response(error.message, { status: 500 });
  }
  return new Response('ok');
});
