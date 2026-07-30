import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnosticarEmail,
  diagnosticarPopup,
  diagnosticarWhatsapp,
  WHATSAPP_DISPONIVEL,
  type EstadoEmail,
} from './configuracao-alertas';

const email = (over: Partial<EstadoEmail> = {}): EstadoEmail => ({
  habilitado: true,
  provedor: 'resend',
  remetente: 'Monitor <avisos@avisos.exemplo.com.br>',
  destinatario: 'dono@exemplo.com',
  ...over,
});

test('ligado e completo é ativo', () => {
  assert.equal(diagnosticarEmail(email()).situacao, 'ativo');
  assert.equal(diagnosticarEmail(email({ provedor: 'smtp' })).situacao, 'ativo');
});

test('desligado pelo usuário é "desligado", não "não entrega"', () => {
  // A distinção importa: "desligado" é escolha, "não entrega" é defeito. Pintar
  // os dois igual esconderia justamente o caso que precisa de ação.
  const d = diagnosticarEmail(email({ habilitado: false }));
  assert.equal(d.situacao, 'desligado');
  assert.match(d.detalhe, /não descarta/i);
});

test('desligado tem precedência sobre a falta de credencial', () => {
  // Sem isso, quem desligou o canal veria um alarme vermelho pedindo para
  // configurar um provedor que ele deliberadamente não quer usar.
  const d = diagnosticarEmail(email({ habilitado: false, provedor: null, destinatario: null }));
  assert.equal(d.situacao, 'desligado');
});

test('ligado sem provedor é "incompleto" e nomeia as variáveis que faltam', () => {
  // Este é o modo de falha que a tela existe para expor: tudo parece
  // configurado e nenhum alerta sai.
  const d = diagnosticarEmail(email({ provedor: null, remetente: null }));
  assert.equal(d.situacao, 'incompleto');
  assert.match(d.detalhe, /RESEND_API_KEY/);
  assert.match(d.detalhe, /EMAIL_REMETENTE/);
});

test('ligado com provedor mas sem destinatário também é "incompleto"', () => {
  const d = diagnosticarEmail(email({ destinatario: null }));
  assert.equal(d.situacao, 'incompleto');
  assert.match(d.detalhe, /RESUMO_PRAZOS_PARA/);
});

test('o diagnóstico do e-mail nunca ecoa credencial', () => {
  // Blindagem contra alguém passar a montar o detalhe com a config inteira: o
  // que sai daqui vai para a tela e para o JSON da API.
  for (const estado of [email(), email({ habilitado: false }), email({ provedor: null })]) {
    assert.doesNotMatch(diagnosticarEmail(estado).detalhe, /re_[A-Za-z0-9]/);
  }
});

test('pop-up desligado avisa que é o canal que não depende de credencial', () => {
  assert.equal(diagnosticarPopup(true).situacao, 'ativo');
  const d = diagnosticarPopup(false);
  assert.equal(d.situacao, 'desligado');
  assert.match(d.detalhe, /credencial/i);
});

test('WhatsApp é indisponível enquanto a Cloud API não estiver aprovada', () => {
  assert.equal(WHATSAPP_DISPONIVEL, false);
  assert.equal(diagnosticarWhatsapp().situacao, 'indisponivel');
  // Se um dia alguém implementar o canal, este teste cai junto com a constante —
  // que é o momento certo de rever o texto da tela.
  assert.match(diagnosticarWhatsapp().detalhe, /Meta/);
});
