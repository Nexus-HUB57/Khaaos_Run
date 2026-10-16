# Testes de integração PostgreSQL

A suíte `tests/integration/` usa o `DatabaseStorage` real e o pool Drizzle/`pg` do servidor. Diferente de `npm run test:official`, ela **não substitui métodos de storage por mocks**: cria e lê linhas, atualiza atributos e testa atualizações concorrentes de durabilidade em PostgreSQL.

## Segurança e isolamento

- A suíte exige `TEST_DATABASE_URL` explícita.
- O host precisa ser local (`localhost`, `127.0.0.1` ou `::1`) e o nome do banco precisa terminar em `_test`; URLs remotas, ambientes de produção e bancos sem esse sufixo são rejeitados.
- Cada caso usa IDs exclusivos e apaga somente as linhas daquele fixture; não usa `TRUNCATE`, `DROP DATABASE` ou reset global de sequências.
- O pool é fechado ao fim do processo. O banco local deste Compose usa `tmpfs`, sem volume nomeado, e deve ser descartado após o teste.
- Não copie a URL/credenciais de teste para staging ou produção.

## Executar localmente com Docker Compose

Na raiz do repositório:

```bash
docker compose -p khaaos-integration -f docker-compose.test.yml up -d --wait postgres
export TEST_DATABASE_URL='postgresql://test:test_pw@127.0.0.1:55432/khaaos_test'
export DATABASE_URL="$TEST_DATABASE_URL"
npm run db:migrate
npm run test:postgres
docker compose -p khaaos-integration -f docker-compose.test.yml down -v --remove-orphans
```

O último comando deve ser executado mesmo se o teste falhar. O banco é descartável. Se a porta `55432` estiver ocupada, use `POSTGRES_TEST_PORT=<porta>` no `up` e ajuste a URL.

A suíte pode ser executada com qualquer PostgreSQL local efêmero compatível; apenas a URL validada é aceita:

```bash
TEST_DATABASE_URL='postgresql://test:test_pw@127.0.0.1:5432/khaaos_test' \
DATABASE_URL='postgresql://test:test_pw@127.0.0.1:5432/khaaos_test' \
npm run db:migrate && npm run test:postgres
```

## GitHub Actions

O job `test-unit` já provisiona `postgres:16-alpine`, aguarda `pg_isready` e aplica migrations versionadas. `TEST_DATABASE_URL` aponta para `khaaos_test`; em seguida, `npm run test:postgres` é um gate bloqueante. O service container é efêmero por execução do job e não recebe volume persistente.

## Cobertura atual

1. Inicialização de `player_stats` e `bank_accounts`, defaults e leitura após atualização persistida.
2. Criação/leitura de item JSONB, isolamento de owner na query, equipagem e persistência da durabilidade após cinco `UPDATE`s concorrentes.

Esta suíte é a primeira camada de integração de banco; **não** cobre ainda compra/ledger, transações multi-tabela, rollback, corrida entre duas partidas, recuperação de backup, latência nem PostgreSQL gerenciado remoto. Esses cenários permanecem no roadmap.
