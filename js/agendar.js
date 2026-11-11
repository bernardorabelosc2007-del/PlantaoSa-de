// Agendamento pelo paciente. Só usa funções públicas do banco:
// horarios_livres e agendar_consulta. Nunca lê a tabela de consultas.
(function () {
  const { $, el, sb, iso, somaDias, dataLonga, hhmm, aviso, msgErro } = App;
  const alvoAviso = $('#aviso');
  const estado = { prof: null, data: null, hora: null };
  const DIAS_A_MOSTRAR = 21;

  function irPara(n) {
    for (let i = 1; i <= 4; i++) $('#p' + i).hidden = i !== n;
    [...$('#passos').children].forEach((li, i) => {
      li.className = i + 1 < n ? 'feito' : i + 1 === n ? 'ativo' : '';
      if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    $('#passos').hidden = n === 4;
    aviso(alvoAviso, '', '');
    window.scrollTo({ top: 0 });
  }

  function resumo() {
    return [
      el('strong', { text: estado.prof.nome + ' · ' + estado.prof.especialidade }),
      el('span', { text: dataLonga(estado.data) + ', às ' + hhmm(estado.hora) })
    ];
  }

  async function carregarProfissionais() {
    const lista = $('#profissionais');
    const { data, error } = await sb.from('profissionais').select('id, nome, especialidade').order('nome');
    if (error) { lista.replaceChildren(); return aviso(alvoAviso, 'erro', msgErro(error)); }
    if (!data.length) return lista.replaceChildren(el('p', { class: 'vazio', text: 'Nenhum profissional disponível no momento.' }));
    lista.replaceChildren(...data.map(p =>
      el('button', { class: 'opcao', type: 'button', onclick: () => escolherProfissional(p) }, [
        el('strong', { text: p.nome }), el('small', { text: p.especialidade })
      ])));
  }

  function escolherProfissional(p) {
    estado.prof = p; estado.data = null; estado.hora = null;
    const hoje = new Date();
    $('#dias').replaceChildren(...Array.from({ length: DIAS_A_MOSTRAR }, (_, i) => {
      const d = somaDias(hoje, i), s = iso(d);
      return el('button', { class: 'chip', type: 'button', 'data-dia': s, 'aria-pressed': 'false', onclick: () => escolherDia(s) }, [
        el('small', { text: i === 0 ? 'hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') }),
        d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      ]);
    }));
    $('#horas').replaceChildren(el('p', { class: 'vazio', text: 'Escolha um dia.' }));
    irPara(2);
  }

  async function escolherDia(s) {
    estado.data = s; estado.hora = null;
    document.querySelectorAll('#dias .chip').forEach(c => {
      const sel = c.dataset.dia === s;
      c.classList.toggle('sel', sel); c.setAttribute('aria-pressed', String(sel));
    });
    const horas = $('#horas');
    horas.replaceChildren(el('p', { class: 'vazio', text: 'Carregando horários…' }));
    const { data, error } = await sb.rpc('horarios_livres', { p_profissional: estado.prof.id, p_data: s });
    if (estado.data !== s) return; // o usuário já trocou de dia
    if (error) { horas.replaceChildren(); return aviso(alvoAviso, 'erro', msgErro(error)); }
    aviso(alvoAviso, '', '');
    if (!data.length) return horas.replaceChildren(el('p', { class: 'vazio', text: 'Sem horários livres neste dia. Tente outro.' }));
    horas.replaceChildren(...data.map(h =>
      el('button', { class: 'chip', type: 'button', text: hhmm(h.hora), onclick: () => escolherHora(h.hora) })));
  }

  function escolherHora(h) {
    estado.hora = h;
    $('#resumo').replaceChildren(...resumo());
    irPara(3);
    $('#nome').focus();
  }

  async function enviar(ev) {
    ev.preventDefault();
    const nome = $('#nome').value.trim(), email = $('#email').value.trim(), tel = $('#tel').value.trim();
    if (nome.length < 3) { $('#nome').focus(); return aviso(alvoAviso, 'erro', 'Informe seu nome completo.'); }
    if (!$('#email').checkValidity() || !email) { $('#email').focus(); return aviso(alvoAviso, 'erro', 'Informe um e-mail válido.'); }
    if (!$('#aceite').checked) { $('#aceite').focus(); return aviso(alvoAviso, 'erro', 'Marque a autorização para continuar.'); }

    const botao = $('#enviar');
    botao.disabled = true; botao.textContent = 'Agendando…';
    const { error } = await sb.rpc('agendar_consulta', {
      p_profissional: estado.prof.id, p_data: estado.data, p_hora: estado.hora,
      p_nome: nome, p_email: email, p_telefone: tel || null
    });
    botao.disabled = false; botao.textContent = 'Confirmar agendamento';
    if (error) {
      aviso(alvoAviso, 'erro', msgErro(error));
      if (/hor[áa]rio/i.test(error.message || '')) { // horário ocupado: volta para escolher outro
        const dia = estado.data;
        irPara(2); aviso(alvoAviso, 'erro', msgErro(error)); escolherDia(dia);
      }
      return;
    }
    $('#resumoFinal').replaceChildren(...resumo());
    $('#form').reset();
    irPara(4);
  }

  $('#voltar1').addEventListener('click', () => irPara(1));
  $('#voltar2').addEventListener('click', () => { irPara(2); if (estado.data) escolherDia(estado.data); });
  $('#form').addEventListener('submit', enviar);

  irPara(1);
  if (App.exigeConfig(alvoAviso)) carregarProfissionais();
  else $('#profissionais').replaceChildren();
})();
