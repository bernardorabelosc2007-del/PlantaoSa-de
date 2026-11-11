-- =====================================================================
-- Agenda Automática para Clínicas · esquema do banco (Supabase/Postgres)
-- Rode este arquivo inteiro no SQL Editor de um projeto Supabase NOVO.
--
-- Modelo de acesso:
--   visitante (anon)      -> vê profissionais e horários livres; agenda e
--                            responde ao lembrete SOMENTE por funções.
--                            Nunca lê a tabela de consultas.
--   recepção (equipe)     -> usuário logado E cadastrado em public.equipe.
--                            Acesso completo às consultas.
--   automação (service)   -> Make, com a chave service_role guardada no Make.
-- =====================================================================

-- ---------- Tabelas ----------

create table public.equipe (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nome      text not null,
  criado_em timestamptz not null default now()
);

create table public.profissionais (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (char_length(nome) between 2 and 120),
  especialidade text not null check (char_length(especialidade) between 2 and 80),
  ativo         boolean not null default true
);

-- Grade semanal de atendimento. dia_semana: 0 = domingo ... 6 = sábado.
create table public.horarios (
  id              uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  dia_semana      smallint not null check (dia_semana between 0 and 6),
  hora_inicio     time not null,
  hora_fim        time not null,
  duracao_min     smallint not null default 30 check (duracao_min between 10 and 240),
  check (hora_fim > hora_inicio)
);

create table public.consultas (
  id                  uuid primary key default gen_random_uuid(),
  profissional_id     uuid not null references public.profissionais(id),
  data                date not null,
  hora                time not null,
  paciente_nome       text not null check (char_length(paciente_nome) between 3 and 120),
  paciente_email      text check (paciente_email is null or char_length(paciente_email) between 5 and 160),
  paciente_telefone   text check (paciente_telefone is null or char_length(paciente_telefone) <= 30),
  status              text not null default 'pendente'
                        check (status in ('pendente', 'confirmada', 'cancelada')),
  origem              text not null default 'online' check (origem in ('online', 'recepcao')),
  token               uuid not null default gen_random_uuid() unique,
  lembrete_enviado_em timestamptz,
  criado_em           timestamptz not null default now()
);

-- Impede dois agendamentos ativos no mesmo horário do mesmo profissional.
-- Consulta cancelada libera o horário.
create unique index consultas_horario_unico
  on public.consultas (profissional_id, data, hora)
  where status <> 'cancelada';

create index consultas_data_idx on public.consultas (data);
create index consultas_email_idx on public.consultas (lower(paciente_email));

-- ---------- Funções de apoio ----------

create function public.hoje_sp() returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create function public.is_equipe() returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.equipe e where e.user_id = auth.uid()) $$;

-- ---------- Segurança em nível de linha (RLS) ----------

alter table public.equipe        enable row level security;
alter table public.profissionais enable row level security;
alter table public.horarios      enable row level security;
alter table public.consultas     enable row level security;

-- equipe: ninguém lê nem altera pelo site. Cadastro só pelo SQL Editor.

create policy "visitante ve profissionais ativos" on public.profissionais
  for select to anon, authenticated using (ativo);
create policy "equipe gerencia profissionais" on public.profissionais
  for all to authenticated using (public.is_equipe()) with check (public.is_equipe());

create policy "visitante ve grade" on public.horarios
  for select to anon, authenticated using (true);
create policy "equipe gerencia grade" on public.horarios
  for all to authenticated using (public.is_equipe()) with check (public.is_equipe());

-- consultas: somente a equipe. Não existe nenhuma política para anon.
create policy "equipe gerencia consultas" on public.consultas
  for all to authenticated using (public.is_equipe()) with check (public.is_equipe());

-- Defesa extra: mesmo sem RLS, o visitante não teria privilégio na tabela.
revoke all on public.consultas from anon;
revoke all on public.equipe    from anon, authenticated;

-- ---------- Funções públicas (o que o site do paciente pode chamar) ----------

-- Horários livres de um profissional em um dia. Não expõe dados de pacientes.
create function public.horarios_livres(p_profissional uuid, p_data date)
returns table (hora time)
language sql stable security definer
set search_path = ''
as $$
  select s.hora
  from (
    select gs::time as hora
    from public.horarios h
    cross join lateral generate_series(
      p_data + h.hora_inicio,
      p_data + h.hora_fim - make_interval(mins => h.duracao_min),
      make_interval(mins => h.duracao_min)
    ) as gs
    where h.profissional_id = p_profissional
      and h.dia_semana = extract(dow from p_data)::int
  ) s
  where p_data between public.hoje_sp() and public.hoje_sp() + 60
    and exists (select 1 from public.profissionais p where p.id = p_profissional and p.ativo)
    and not exists (
      select 1 from public.consultas c
      where c.profissional_id = p_profissional
        and c.data = p_data and c.hora = s.hora
        and c.status <> 'cancelada')
    and (p_data > public.hoje_sp()
         or s.hora > (now() at time zone 'America/Sao_Paulo')::time)
  order by s.hora
$$;

-- Agendamento feito pelo paciente. Valida tudo no servidor.
create function public.agendar_consulta(
  p_profissional uuid, p_data date, p_hora time,
  p_nome text, p_email text, p_telefone text
) returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nome  text := btrim(coalesce(p_nome, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_tel   text := nullif(btrim(coalesce(p_telefone, '')), '');
begin
  if char_length(v_nome) not between 3 and 120 then
    raise exception 'Informe seu nome completo.' using errcode = 'P0001';
  end if;
  if char_length(v_email) > 160 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = 'P0001';
  end if;
  if v_tel is not null and char_length(v_tel) > 30 then
    raise exception 'Telefone inválido.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.horarios_livres(p_profissional, p_data) l where l.hora = p_hora) then
    raise exception 'Este horário não está mais disponível. Escolha outro.' using errcode = 'P0001';
  end if;

  -- Limite simples contra abuso: até 3 consultas futuras ativas por e-mail.
  if (select count(*) from public.consultas c
      where lower(c.paciente_email) = v_email
        and c.status <> 'cancelada'
        and c.data >= public.hoje_sp()) >= 3 then
    raise exception 'Você já tem consultas agendadas. Para marcar outras, fale com a recepção.' using errcode = 'P0001';
  end if;

  begin
    insert into public.consultas (profissional_id, data, hora, paciente_nome, paciente_email, paciente_telefone, origem)
    values (p_profissional, p_data, p_hora, v_nome, v_email, v_tel, 'online');
  exception when unique_violation then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro.' using errcode = 'P0001';
  end;

  return json_build_object('ok', true);
end;
$$;

-- Resposta ao lembrete, pelo link enviado por e-mail.
-- p_acao: 'ver' (só consulta), 'confirmar' ou 'cancelar'.
create function public.responder_consulta(p_token uuid, p_acao text)
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.consultas%rowtype;
  v_prof text;
begin
  if p_acao not in ('ver', 'confirmar', 'cancelar') then
    raise exception 'Ação inválida.' using errcode = 'P0001';
  end if;

  select * into c from public.consultas where token = p_token;
  if not found then
    raise exception 'Link inválido ou expirado.' using errcode = 'P0001';
  end if;

  if p_acao <> 'ver' then
    if c.data < public.hoje_sp() then
      raise exception 'Esta consulta já passou.' using errcode = 'P0001';
    end if;
    if c.status = 'cancelada' then
      raise exception 'Esta consulta já foi cancelada. Para remarcar, faça um novo agendamento.' using errcode = 'P0001';
    end if;
    update public.consultas
       set status = case p_acao when 'confirmar' then 'confirmada' else 'cancelada' end
     where id = c.id
     returning * into c;
  end if;

  select p.nome into v_prof from public.profissionais p where p.id = c.profissional_id;

  return json_build_object(
    'profissional', v_prof,
    'data', c.data,
    'hora', to_char(c.hora, 'HH24:MI'),
    'status', c.status,
    'passou', c.data < public.hoje_sp());
end;
$$;

-- ---------- Funções da automação (somente service_role / Make) ----------

-- Consultas de amanhã que ainda não receberam lembrete.
create function public.consultas_para_lembrete()
returns table (id uuid, paciente_nome text, paciente_email text,
               profissional text, data date, hora text, token uuid)
language sql stable security definer
set search_path = ''
as $$
  select c.id, c.paciente_nome, c.paciente_email, p.nome,
         c.data, to_char(c.hora, 'HH24:MI'), c.token
  from public.consultas c
  join public.profissionais p on p.id = c.profissional_id
  where c.data = public.hoje_sp() + 1
    and c.status = 'pendente'
    and c.paciente_email is not null
    and c.lembrete_enviado_em is null
  order by c.hora
$$;

create function public.marcar_lembrete_enviado(p_id uuid) returns void
language sql security definer
set search_path = ''
as $$ update public.consultas set lembrete_enviado_em = now() where id = p_id $$;

-- ---------- Permissões das funções ----------
-- O Supabase concede EXECUTE a anon e authenticated por padrão; aqui fica explícito.

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.hoje_sp()                              to anon, authenticated, service_role;
grant execute on function public.is_equipe()                            to authenticated, service_role;
grant execute on function public.horarios_livres(uuid, date)            to anon, authenticated, service_role;
grant execute on function public.agendar_consulta(uuid, date, time, text, text, text) to anon, authenticated;
grant execute on function public.responder_consulta(uuid, text)         to anon, authenticated;
grant execute on function public.consultas_para_lembrete()              to service_role;
grant execute on function public.marcar_lembrete_enviado(uuid)          to service_role;
