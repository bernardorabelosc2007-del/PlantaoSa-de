# Agenda Automática para Clínicas · demo

Site de clínica com agendamento online, lembrete automático por e-mail e painel da recepção.
Feito com HTML, CSS e JavaScript puros, Supabase (banco e login), Netlify (hospedagem) e Make (lembretes).

**Todos os dados desta demo são fictícios.** Não cadastre pacientes reais nela.

## O que tem aqui

| Arquivo | Para que serve |
| --- | --- |
| `index.html` | Site da clínica, com o botão "Agendar consulta" |
| `agendar.html` | O paciente escolhe profissional, dia e horário e agenda |
| `confirmar.html` | Página do link do lembrete: confirmar ou cancelar |
| `painel.html` | Painel da recepção, com login |
| `config.js` | URL e chave pública do Supabase, nome e contato da clínica |
| `supabase/schema.sql` | Tabelas, regras de acesso e funções do banco |
| `supabase/seed.sql` | Profissionais, grade e consultas fictícias |

## Como a segurança funciona

O PlantãoMed original deixava qualquer pessoa ler e apagar dados, porque o banco aceitava tudo da chave pública. Aqui a regra é outra:

- **Visitante (sem login):** vê profissionais e horários livres. Agenda e responde ao lembrete somente por funções do banco, que validam tudo. **Nunca lê a tabela de consultas.**
- **Recepção:** precisa de login **e** de estar na tabela `equipe`. Criar uma conta sozinho não dá acesso.
- **Make:** usa a chave `service_role`, que fica guardada só dentro do Make.
- **Horário duplicado:** impossível. Um índice único no banco impede dois agendamentos ativos no mesmo horário.
- **Link do lembrete:** cada consulta tem um código aleatório próprio. Abrir o link só mostra a consulta; confirmar ou cancelar exige tocar no botão.
- **Nada no navegador chama o Make.** Não existe URL de webhook no código do site.

A chave `anon` em `config.js` é pública por natureza. A chave `service_role` **nunca** pode aparecer em nenhum arquivo do site nem no GitHub.

## Instalação

### 1. Supabase

1. Crie um projeto **novo** em supabase.com. Não reutilize o projeto do PlantãoMed.
2. Abra **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e execute.
3. Faça o mesmo com `supabase/seed.sql`.
4. Em **Authentication > Users**, clique em **Add user** e crie o usuário da recepção (e-mail e senha). Marque a opção de confirmar o e-mail automaticamente.
5. No SQL Editor, coloque esse usuário na equipe (troque o e-mail):

   ```sql
   insert into public.equipe (user_id, nome)
   select id, 'Recepção' from auth.users where email = 'recepcao@exemplo.com';
   ```

6. Recomendado: nas configurações de Authentication, desative o cadastro de novos usuários (sign up). Mesmo ligado, quem se cadastra não entra no painel, mas desligar reduz ruído.
7. Em **Project Settings > API**, copie a **URL do projeto** e a chave pública (**anon**; em projetos mais novos aparece como *publishable*).

### 2. Configuração do site

Abra `config.js` e preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e os dados da clínica.

### 3. Publicação no Netlify

1. Suba esta pasta para um repositório no GitHub.
2. No Netlify: **Add new site > Import an existing project** e escolha o repositório. Não há comando de build; a pasta publicada é a raiz.
3. Abra o site, entre em `agendar.html` e faça um agendamento de teste.
4. Abra `painel.html`, entre com o usuário da recepção e confira se a consulta apareceu.

### 4. Lembrete automático no Make

Crie um cenário com quatro módulos:

1. **Agendamento:** todos os dias, em um horário fixo (por exemplo, 9h, fuso de São Paulo).
2. **HTTP > Make a request** (busca as consultas de amanhã)
   - URL: `https://SEU-PROJETO.supabase.co/rest/v1/rpc/consultas_para_lembrete`
   - Método: `POST`
   - Headers: `apikey: <service_role>`, `Authorization: Bearer <service_role>`, `Content-Type: application/json`
   - Body: `{}`
   - Marque **Parse response**.
3. **Iterator** sobre a lista devolvida, seguido de **Gmail > Send an email**
   - Para: `paciente_email`
   - Assunto: `Lembrete: sua consulta é amanhã, às {{hora}}`
   - Corpo (HTML):

     ```html
     <p>Olá, {{paciente_nome}}!</p>
     <p>Sua consulta com <strong>{{profissional}}</strong> é amanhã, às <strong>{{hora}}</strong>.</p>
     <p><a href="https://SEU-SITE.netlify.app/confirmar.html?token={{token}}">Confirmar ou cancelar a consulta</a></p>
     <p>Clínica Exemplo</p>
     ```

4. **HTTP > Make a request** (marca como enviado, para não repetir)
   - URL: `https://SEU-PROJETO.supabase.co/rest/v1/rpc/marcar_lembrete_enviado`
   - Método: `POST`, mesmos headers
   - Body: `{"p_id": "{{id}}"}`

A chave `service_role` (ou *secret*, em projetos mais novos) fica em **Project Settings > API** do Supabase. Ela ignora todas as regras de acesso: guarde apenas dentro do Make.

Para testar sem esperar um dia, agende uma consulta para amanhã e clique em **Run once** no cenário.

## Roteiro de teste antes de gravar o vídeo

- [ ] Agendar pelo celular, do início ao fim
- [ ] Tentar agendar o mesmo horário em outra aba: deve ser recusado
- [ ] Rodar o cenário do Make e receber o e-mail
- [ ] Confirmar pelo link e ver o status mudar no painel
- [ ] Cancelar pelo link e ver o horário voltar a ficar livre
- [ ] Abrir `painel.html` em janela anônima: deve pedir login
- [ ] Criar um agendamento pela recepção ("Novo agendamento")

## Adaptando para uma clínica de verdade

- Troque profissionais e grade em `profissionais` e `horarios` (pelo Table Editor do Supabase).
- Ajuste nome, telefone, endereço e textos em `config.js` e `index.html`.
- Se a clínica já tem site, publique só `agendar.html`, `confirmar.html` e `painel.html` e coloque no site dela um botão apontando para `agendar.html`.
- Use um projeto Supabase separado por clínica. Assim os dados de uma nunca se misturam com os de outra.

## Limites conhecidos desta versão

- **Sem captcha.** O limite de 3 consultas ativas por e-mail reduz abuso, mas não impede um robô insistente. Para produção, adicione um captcha (por exemplo, Cloudflare Turnstile) no agendamento.
- **Lembrete só por e-mail.** WhatsApp exige a API oficial do WhatsApp Business, contratada pela clínica.
- **Sem e-mail de confirmação na hora do agendamento.** Dá para adicionar com um Database Webhook do Supabase chamando o Make.
- **Fuso fixo em America/Sao_Paulo** nas funções do banco.
- **Sem tela para editar a grade.** Por enquanto, a grade é alterada no Table Editor do Supabase.
- **Testado no banco, não no ar.** As regras de acesso foram testadas em um Postgres local que imita os papéis do Supabase. As páginas ainda não foram testadas contra um projeto Supabase real: siga o roteiro de teste acima depois de publicar.
