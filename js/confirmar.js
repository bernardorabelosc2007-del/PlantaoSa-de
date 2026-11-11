// Página aberta pelo link do e-mail de lembrete: confirmar.html?token=...
// Abrir o link só MOSTRA a consulta. Confirmar ou cancelar exige um toque no
// botão, para que leitores automáticos de e-mail não alterem nada sozinhos.
(function () {
  const { $, el, sb, dataLonga, aviso, msgErro } = App;
  const alvo = $('#aviso');
  const token = new URLSearchParams(location.search).get('token') || '';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function mostrar(c, msg) {
    $('#resumo').hidden = false;
    $('#resumo').replaceChildren(
      el('strong', { text: c.profissional }),
      el('span', { text: dataLonga(c.data) + ', às ' + c.hora }));
    const aberta = !c.passou && c.status !== 'cancelada';
    $('#acoes').hidden = !aberta;
    $('#confirmar').hidden = c.status === 'confirmada';
    $('#rodape').hidden = false;
    if (msg) return aviso(alvo, 'ok', msg);
    if (c.status === 'cancelada') aviso(alvo, 'info', 'Esta consulta foi cancelada.');
    else if (c.passou) aviso(alvo, 'info', 'Esta consulta já passou.');
    else if (c.status === 'confirmada') aviso(alvo, 'ok', 'Presença confirmada. Esperamos você!');
    else aviso(alvo, 'info', 'Você confirma sua presença?');
  }

  async function chamar(acao, msg) {
    const botoes = [$('#confirmar'), $('#cancelar')];
    botoes.forEach(b => { b.disabled = true; });
    const { data, error } = await sb.rpc('responder_consulta', { p_token: token, p_acao: acao });
    botoes.forEach(b => { b.disabled = false; });
    if (error) return aviso(alvo, 'erro', msgErro(error));
    mostrar(data, msg);
  }

  $('#confirmar').addEventListener('click', () => chamar('confirmar', 'Presença confirmada. Esperamos você!'));
  $('#cancelar').addEventListener('click', () => chamar('cancelar', 'Consulta cancelada. O horário foi liberado.'));

  if (!App.exigeConfig(alvo)) return;
  if (!UUID.test(token)) return aviso(alvo, 'erro', 'Link inválido. Abra o link exatamente como veio no e-mail.');
  chamar('ver');
})();
