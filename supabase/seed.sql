-- =====================================================================
-- Dados FICTÍCIOS para a demonstração. Rode depois do schema.sql.
-- Nenhum nome, e-mail ou telefone aqui pertence a uma pessoa real.
-- =====================================================================

insert into public.profissionais (id, nome, especialidade) values
  ('11111111-1111-4111-8111-111111111111', 'Dra. Helena Prado',  'Clínica Geral'),
  ('22222222-2222-4222-8222-222222222222', 'Dr. Rafael Moura',   'Ortopedia'),
  ('33333333-3333-4333-8333-333333333333', 'Dra. Camila Antunes', 'Fisioterapia');

-- Grade: segunda a sexta, 08h–12h e 14h–18h, consultas de 30 minutos.
insert into public.horarios (profissional_id, dia_semana, hora_inicio, hora_fim, duracao_min)
select p.id, d.dia, t.ini, t.fim, 30
from public.profissionais p
cross join generate_series(1, 5) as d(dia)
cross join (values (time '08:00', time '12:00'), (time '14:00', time '18:00')) as t(ini, fim);

-- Sábado de manhã só para a fisioterapia.
insert into public.horarios (profissional_id, dia_semana, hora_inicio, hora_fim, duracao_min)
values ('33333333-3333-4333-8333-333333333333', 6, '08:00', '12:00', 30);

-- Consultas de exemplo para hoje e amanhã, para o painel não aparecer vazio.
insert into public.consultas (profissional_id, data, hora, paciente_nome, paciente_email, paciente_telefone, status, origem) values
  ('11111111-1111-4111-8111-111111111111', public.hoje_sp(),     '08:30', 'Marina Exemplo',   'marina@exemplo.com',   '(24) 90000-0001', 'confirmada', 'online'),
  ('11111111-1111-4111-8111-111111111111', public.hoje_sp(),     '09:30', 'Paulo Demonstração','paulo@exemplo.com',   '(24) 90000-0002', 'pendente',   'online'),
  ('22222222-2222-4222-8222-222222222222', public.hoje_sp(),     '10:00', 'Sônia Fictícia',   'sonia@exemplo.com',    '(24) 90000-0003', 'cancelada',  'recepcao'),
  ('22222222-2222-4222-8222-222222222222', public.hoje_sp(),     '14:30', 'Tiago Modelo',     'tiago@exemplo.com',    '(24) 90000-0004', 'confirmada', 'online'),
  ('33333333-3333-4333-8333-333333333333', public.hoje_sp(),     '15:00', 'Lúcia Teste',      null,                   '(24) 90000-0005', 'pendente',   'recepcao'),
  ('11111111-1111-4111-8111-111111111111', public.hoje_sp() + 1, '08:00', 'Bruno Amostra',    'bruno@exemplo.com',    '(24) 90000-0006', 'pendente',   'online'),
  ('33333333-3333-4333-8333-333333333333', public.hoje_sp() + 1, '10:30', 'Carla Simulada',   'carla@exemplo.com',    '(24) 90000-0007', 'pendente',   'online');
