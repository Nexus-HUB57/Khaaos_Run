# Autenticação local por email e senha

## Escopo entregue

O app web passa a oferecer cadastro com nome, email, senha e confirmação; login por email/senha; verificação obrigatória do email; reenvio de confirmação; solicitação e conclusão de recuperação de senha. O login OIDC existente permanece disponível. Criar uma conta não conclui o alistamento nem representa pagamento.

Credenciais locais ficam em `local_auth_credentials`, separadas da linha pública `users`. Senhas são guardadas como hashes scrypt com sal aleatório e comparação em tempo constante. Tokens de verificação/recuperação são aleatórios, salvos apenas como SHA-256, expiram e são consumidos em transações. Contas OIDC não são vinculadas automaticamente por email; um endereço já associado a uma conta OIDC não pode criar uma conta local concorrente.

## Migração

Aplicar a migration `0013_local-auth.sql` com o procedimento de migração normal do ambiente. A migration adiciona somente as tabelas de credenciais e tokens; não modifica nem migra senhas OIDC. Executar testes PostgreSQL somente contra uma base de teste descartável cujo nome termina em `_test`; nunca apontar suites que apagam dados a um banco compartilhado.

## Transporte de email

Sem a configuração SMTP, as rotas de cadastro, reenvio e recuperação respondem `503` e o app não cria novos cadastros por email. Defina em secret manager do ambiente, sem commitar valores:

- `SMTP_HOST`: hostname do provedor SMTP.
- `SMTP_PORT`: porta SMTP, normalmente `587` para STARTTLS ou `465` para TLS implícito.
- `SMTP_SECURE`: `false` para STARTTLS, `true` para TLS implícito; se omitido, a porta 465 ativa TLS implícito. Quando `false`, o transporte exige STARTTLS e falha fechado se o servidor não o oferecer.
- `SMTP_USER` e `SMTP_PASSWORD`: ambos ou nenhum, conforme o provedor.
- `SMTP_FROM`: remetente verificado e autorizado pelo provedor.

Os testes locais do adaptador usam um transporte simulado para verificar configuração e conteúdo sem abrir conexão nem enviar mensagens. Isso não substitui o teste de entrega em caixa real no staging.

Antes de disponibilizar o cadastro ao público, configurar um remetente verificado, confirmar entrega em caixa real e spam, validar SPF/DKIM/DMARC do domínio e monitorar rejeições/atrasos. Isso não foi executado nesta branch porque não há credenciais ou domínio de email fornecidos.

## Restrições e configuração operacional

- Senha: 12–128 caracteres Unicode; no máximo 1024 bytes UTF-8. O cadastro e reset exigem confirmação igual no cliente e no servidor.
- Verificação: link de uso único, 24 horas. Reset: link de uso único, 30 minutos; a redefinição invalida sessões armazenadas para a identidade.
- Cadastro, login e envio de token têm limites dedicados por IP e exigem `Origin` igual à origem pública configurada; requisições cross-site são rejeitadas.
- Login só cria sessão após confirmação de email. Falha de autenticação usa resposta genérica; pedidos de recuperação/reenvio não confirmam se o email existe.
- Sessões permanecem no store PostgreSQL compartilhado com OIDC; cookie é `HttpOnly`, `Secure; SameSite=None` em HTTPS (incluindo Preview embutido) e `SameSite=Lax` sem HTTPS para desenvolvimento local.
- Logout revoga as sessões/tickets emitidos antes dele, fecha sockets ativos e permite uma sessão nova após login; o registro temporal de revogação não deve bloquear reautenticação legítima.
- O valor efetivo de secrets, DNS, SMTP e os cookies do ambiente hospedado precisam ser revisados no deploy. A implementação não habilita cobrança Stripe live nem o entitlement de alistamento pago.

## Próximos gates

Antes de produção: aplicar migration em staging, testar migração e rollback dentro da política local, configurar SMTP via secrets, enviar e receber os dois tipos de mensagem em caixa real, auditar logs/retention, confirmar rate limits Redis no ambiente, verificar comportamento dos cookies atrás do proxy HTTPS e executar o fluxo no domínio de staging. Política de exclusão/retention dos tokens e resposta operacional a email já usado por OIDC também devem ser documentadas pelo produto.
