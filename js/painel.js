// Painel da recepção. Exige login (Supabase Auth) E cadastro na tabela equipe.
// A proteção real está no banco (RLS): esconder a tela é só conveniência.
(function () {
  const { $, el, sb, iso, deIso, somaDias, dataLonga, hhmm, aviso, msgErro } = App;
  const alvo = $('#aviso');
  let consultas = [], profissionais = [], timer = null;

  // ---------- sessão ----------
  function mostrarLogin() {
    clearInterval(timer);
    $('#telaAgenda').hidden = true; $('#telaLogin').hidden = false;
    $('#sair').hidden = true; $('#usuario').textContent = '';
  }

  async function iniciar(sessao) {
    if (!sessao) return mostrarLogin();
    const { data: ehEquipe, error } = await sb.rpc('is_equipe');
    if (error || !ehEquipe) {
      await sb.auth.signOut();
      mostrarLogin();
      return aviso(alvo, 'erro', error ? msgErro(error) : 'Este usuário não tem acesso ao painel. Peça o cadastro ao administrador.');
    }
    aviso(alvo, '', '');
    $('#telaLogin').hidden = true; $('#telaAgenda').hidden = false;
    $('#sair').hidden = false; $('#usuario').textContent = sessao.user.email;
    if (!$('#dia').value) $('#dia').value = iso(new Date());
    await carregarProfissionais();
    await carregar();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden && !$('#dlgNovo').open) carregar(true); }, 30000);
  }

  $('#formLogin').addEventListener('submit', async ev => {
    ev.preventDefault();
    const botao = $('#entrar');
    botao.disabled = true; botao.textContent = 'Entrando…';
    const { data, error } = await sb.auth.signInWithPassword({ email: $('#loginEmail').value.trim(), password: $('#loginSenha').value });
    botao.disabled = false; botao.textContent = 'Entrar';
    $('#loginSenha').value = '';
    if (error) return aviso(alvo, 'erro', /fetch|network/i.test(error.message) ? msgErro(error) : 'E-mail ou senha incorretos.');
    iniciar(data.session);
  });

  $('#sair').addEventListener('click', async () => { await sb.auth.signOut(); mostrarLogin(); aviso(alvo, '', ''); });

  // ---------- agenda ----------
  async function carregarProfissionais() {
    const { data, error } = await sb.from('profissionais').select('id, nome').order('nome');
    if (error) return aviso(alvo, 'erro', msgErro(error));
    profissionais = data;
    const opcoes = () => data.map(p => el('option', { value: p.id, text: p.nome }));
    $('#filtroProf').replaceChildren(el('option', { value: '', text: 'Todos os profissionais' }), ...opcoes());
    $('#novoProf').replaceChildren(el('option', { value: '', text: 'Escolha…' }), ...opcoes());
  }

  async function carregar(silencioso) {
    const dia = $('#dia').value;
    if (!dia) return;
    $('#tituloDia').textContent = dataLonga(dia);
    const { data, error } = await sb.from('consultas')
      .select('id, hora, paciente_nome, paciente_telefone, paciente_email, status, origem, profissional_id, profissionais(nome)')
      .eq('data', dia).order('hora');
    if ($('#dia').value !== dia) return;
    if (error) { if (!silencioso) aviso(alvo, 'erro', msgErro(error)); return; }
    consultas = data;
    desenhar();
  }

  function desenhar() {
    const filtro = $('#filtroProf').value;
    const vis = consultas.filter(c => !filtro || c.profissional_id === filtro);
    const conta = s => vis.filter(c => c.status === s).length;
    $('#nConf').textContent = conta('confirmada');
    $('#nPend').textContent = conta('pendente');
    $('#nCanc').textContent = conta('cancelada');
    $('#nTotal').textContent = vis.length - conta('cancelada');

    if (!vis.length) return $('#lista').replaceChildren(el('p', { class: 'vazio', text: 'Nenhuma consulta neste dia.' }));
    const rotulo = { pendente: 'Pendente', confirmada: 'Confirmada', cancelada: 'Cancelada' };
    $('#lista').replaceChildren(...vis.map(c => {
      const contato = [c.paciente_telefone, c.paciente_email].filter(Boolean).join(' · ') || 'sem contato';
      const acoes = [];
      if (c.status !== 'confirmada') acoes.push(botaoStatus(c, 'confirmada', c.status === 'cancelada' ? 'Reativar e confirmar' : 'Confirmar', ''));
      if (c.status === 'confirmada') acoes.push(botaoStatus(c, 'pendente', 'Voltar para pendente', 'sec'));
      if (c.status !== 'cancelada') acoes.push(botaoStatus(c, 'cancelada', 'Cancelar', 'perigo'));
      return el('article', { class: 'consulta ' + c.status }, [
        el('div', { class: 'hora', text: hhmm(c.hora) }),
        el('div', {}, [
          el('div', { class: 'nome', text: c.paciente_nome }),
          el('div', { class: 'meta', text: (c.profissionais?.nome || '') + ' · ' + contato }),
          el('div', { class: 'meta' }, [
            el('span', { class: 'selo ' + c.status, text: rotulo[c.status] }),
            ' ' + (c.origem === 'online' ? 'agendou online' : 'agendado pela recepção')
          ])
        ]),
        el('div', { class: 'acoes' }, acoes)
      ]);
    }));
  }

  function botaoStatus(c, novo, texto, classe) {
    return el('button', { class: 'btn peq ' + classe, type: 'button', text: texto, onclick: async ev => {
      if (novo === 'cancelada' && !confirm('Cancelar a consulta de ' + c.paciente_nome + '?')) return;
      ev.currentTarget.disabled = true;
      const { error } = await sb.from('consultas').update({ status: novo }).eq('id', c.id);
      if (error) aviso(alvo, 'erro', error.code === '23505' ? 'Este horário já foi ocupado por outra consulta.' : msgErro(error));
      else aviso(alvo, '', '');
      carregar();
    } });
  }

  const mudarDia = n => { $('#dia').value = iso(somaDias(deIso($('#dia').value || iso(new Date())), n)); carregar(); };
  $('#diaAnterior').addEventListener('click', () => mudarDia(-1));
  $('#diaSeguinte').addEventListener('click', () => mudarDia(1));
  $('#hoje').addEventListener('click', () => { $('#dia').value = iso(new Date()); carregar(); });
  $('#dia').addEventListener('change', () => carregar());
  $('#filtroProf').addEventListener('change', desenhar);
  $('#atualizar').addEventListener('click', () => carregar());

  // ---------- novo agendamento pela recepção ----------
  const dlg = $('#dlgNovo'), avisoNovo = $('#avisoNovo');

  async function carregarHorasLivres() {
    const prof = $('#novoProf').value, dia = $('#novoData').value, sel = $('#novoHora');
    if (!prof || !dia) return sel.replaceChildren(el('option', { value: '', text: 'Escolha profissional e dia' }));
    sel.replaceChildren(el('option', { value: '', text: 'Carregando…' }));
    const { data, error } = await sb.rpc('horarios_livres', { p_profissional: prof, p_data: dia });
    if ($('#novoProf').value !== prof || $('#novoData').value !== dia) return;
    if (error) { sel.replaceChildren(el('option', { value: '', text: '—' })); return aviso(avisoNovo, 'erro', msgErro(error)); }
    sel.replaceChildren(
      el('option', { value: '', text: data.length ? 'Escolha…' : 'Sem horários livres neste dia' }),
      ...data.map(h => el('option', { value: h.hora, text: hhmm(h.hora) })));
  }

  $('#novo').addEventListener('click', () => {
    $('#formNovo').reset(); aviso(avisoNovo, '', '');
    $('#novoData').value = $('#dia').value; $('#novoData').min = iso(new Date());
    if ($('#filtroProf').value) $('#novoProf').value = $('#filtroProf').value;
    carregarHorasLivres();
    dlg.showModal();
  });
  $('#fecharNovo').addEventListener('click', () => dlg.close());
  $('#novoProf').addEventListener('change', carregarHorasLivres);
  $('#novoData').addEventListener('change', carregarHorasLivres);

  $('#formNovo').addEventListener('submit', async ev => {
    ev.preventDefault();
    const nome = $('#novoNome').value.trim(), email = $('#novoEmail').value.trim().toLowerCase(), tel = $('#novoTel').value.trim();
    if (!$('#novoProf').value || !$('#novoData').value || !$('#novoHora').value) return aviso(avisoNovo, 'erro', 'Escolha profissional, dia e horário.');
    if (nome.length < 3) return aviso(avisoNovo, 'erro', 'Informe o nome do paciente.');
    if (email && !$('#novoEmail').checkValidity()) return aviso(avisoNovo, 'erro', 'E-mail inválido.');
    const botao = $('#salvarNovo');
    botao.disabled = true;
    const { error } = await sb.from('consultas').insert({
      profissional_id: $('#novoProf').value, data: $('#novoData').value, hora: $('#novoHora').value,
      paciente_nome: nome, paciente_email: email || null, paciente_telefone: tel || null, origem: 'recepcao'
    });
    botao.disabled = false;
    if (error) {
      if (error.code === '23505') { carregarHorasLivres(); return aviso(avisoNovo, 'erro', 'Este horário acabou de ser ocupado. Escolha outro.'); }
      return aviso(avisoNovo, 'erro', msgErro(error));
    }
    dlg.close();
    $('#dia').value = $('#novoData').value;
    carregar();
  });

  // ---------- início ----------
  if (!App.exigeConfig(alvo)) return;
  sb.auth.getSession().then(({ data }) => iniciar(data.session));
  sb.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') mostrarLogin(); });
})();
