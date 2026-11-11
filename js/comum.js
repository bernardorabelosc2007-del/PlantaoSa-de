// Funções compartilhadas pelas páginas.
(function () {
  const cfg = window.APP_CONFIG || {};
  const configurado = /^https:\/\/.+\.supabase\.co$/.test(cfg.SUPABASE_URL || '') && !/COLE_AQUI/.test(cfg.SUPABASE_ANON_KEY || '');

  const App = {
    cfg,
    configurado,
    sb: configurado && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null,

    $: (sel, raiz = document) => raiz.querySelector(sel),

    // Cria elementos sem innerHTML: texto de paciente nunca é interpretado como HTML.
    el(tag, props = {}, filhos = []) {
      const n = document.createElement(tag);
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
        else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
      }
      for (const f of [].concat(filhos)) if (f != null) n.append(f);
      return n;
    },

    // Datas sempre no fuso local, sem passar por UTC.
    iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
    deIso(s) { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); },
    somaDias(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; },
    dataLonga(s) { return App.deIso(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); },
    hhmm(h) { return String(h).slice(0, 5); },

    aviso(alvo, tipo, msg) {
      alvo.replaceChildren(msg ? App.el('div', { class: 'aviso ' + tipo, role: tipo === 'erro' ? 'alert' : 'status', text: msg }) : '');
    },

    // Mensagem amigável: as funções do banco já devolvem texto em português.
    msgErro(e) {
      const m = (e && e.message) || '';
      if (/Failed to fetch|NetworkError|load failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
      if (/^[A-ZÀ-Ú].*[.!]$/.test(m) && !/\b(relation|column|function|syntax|permission|JWT|schema)\b/i.test(m)) return m;
      return 'Não foi possível concluir. Tente novamente em instantes.';
    },

    exigeConfig(alvo) {
      if (App.sb) return true;
      App.aviso(alvo, 'erro', 'Site ainda não configurado: preencha o arquivo config.js com a URL e a chave anon do Supabase.');
      return false;
    }
  };

  document.querySelectorAll('[data-clinica]').forEach(n => { n.textContent = cfg.CLINICA_NOME || 'Clínica'; });
  document.querySelectorAll('[data-telefone]').forEach(n => { n.textContent = cfg.CLINICA_TELEFONE || ''; });
  document.querySelectorAll('[data-endereco]').forEach(n => { n.textContent = cfg.CLINICA_ENDERECO || ''; });
  window.App = App;
})();
