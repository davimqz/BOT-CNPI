import test from 'node:test';
import assert from 'node:assert/strict';
import { descreverConfig, montarPayloadResend, type ConfigEmail } from './email';

const resend: Extract<ConfigEmail, { provedor: 'resend' }> = {
  provedor: 'resend',
  apiKey: 're_teste',
  remetente: 'Monitor de Marcas <avisos@avisos.trilhafinance.com.br>',
  responderPara: 'trilhafinance@gmail.com',
};

const mensagem = {
  para: 'destino@exemplo.com',
  assunto: 'Prazos INPI — 1 prazo(s)',
  html: '<p>corpo</p>',
  texto: 'corpo',
};

test('payload do Resend leva HTML e texto puro juntos', () => {
  const p = montarPayloadResend(mensagem, resend);
  assert.equal(p.html, '<p>corpo</p>');
  // Sem o texto, cliente que bloqueia HTML mostraria alerta de prazo vazio.
  assert.equal(p.text, 'corpo');
  assert.deepEqual(p.to, ['destino@exemplo.com']);
  assert.equal(p.from, resend.remetente);
  assert.equal(p.subject, mensagem.assunto);
});

test('reply_to só entra quando configurado', () => {
  assert.equal(montarPayloadResend(mensagem, resend).reply_to, 'trilhafinance@gmail.com');
  const semResposta = montarPayloadResend(mensagem, { ...resend, responderPara: null });
  assert.ok(!('reply_to' in semResposta), 'reply_to vazio não deve ir no corpo');
});

test('a chave da API nunca vaza para o payload', () => {
  // O corpo vira log/telemetria com facilidade; a chave dá envio no domínio todo.
  const serializado = JSON.stringify(montarPayloadResend(mensagem, resend));
  assert.ok(!serializado.includes('re_teste'));
});

test('descreverConfig identifica o provedor sem expor credencial', () => {
  const descricaoResend = descreverConfig(resend);
  assert.match(descricaoResend, /^Resend/);
  assert.ok(!descricaoResend.includes('re_teste'));

  const descricaoSmtp = descreverConfig({
    provedor: 'smtp',
    host: 'smtp.gmail.com',
    porta: 587,
    usuario: 'eu@gmail.com',
    senha: 'senha-de-app',
    remetente: 'eu@gmail.com',
    criptografia: null,
  });
  assert.match(descricaoSmtp, /^SMTP smtp\.gmail\.com:587/);
  assert.ok(!descricaoSmtp.includes('senha-de-app'));
});
