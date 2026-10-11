# Lighthouse — impacto do code splitting

## Método

Comparação local controlada entre dois builds de produção do mesmo projeto:

- **Baseline:** commit `fe657f4`, antes do carregamento lazy das páginas.
- **Otimizado:** código atual com `React.lazy`/`Suspense` em `client/src/App.tsx`.
- Lighthouse `12.8.2` com Chromium `154.0.8037.57`, em HTTP local.
- Dois perfis por versão: mobile padrão Lighthouse e desktop (`--preset=desktop`), com throttling simulado.
- Apenas categoria Performance foi habilitada. São execuções pontuais, não média estatística.

A rota medida é a entrada `/` servida do build estático. Isso mede o carregamento inicial dos assets e da shell da SPA, não uma sessão OIDC autenticada nem a experiência completa dentro de `/zona` ou `/batalha`. Os resultados são comparativos dentro do mesmo ambiente e não devem ser interpretados como Web Vitals reais de produção.

## Resultados observados

| Perfil | Build | Performance | FCP | LCP | TBT | CLS | Speed Index | Transferência total |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Mobile | Baseline | 66 | 5,3 s | 5,6 s | 20 ms | 0,021 | 5,3 s | 757 KiB |
| Mobile | Code split | 75 | 3,7 s | 4,7 s | 30 ms | 0,007 | 540 KiB |
| Desktop | Baseline | 96 | 1,0 s | 1,1 s | 0 ms | 0,003 | 757 KiB |
| Desktop | Code split | 98 | 0,9 s | 1,0 s | 0 ms | 0,003 | 540 KiB |

A transferência total estimada pelo Lighthouse caiu **217 KiB (cerca de 28,7%)** nos dois perfis. No mobile, FCP caiu 1,6 s e LCP 0,9 s; a pontuação subiu 9 pontos. No desktop, a pontuação subiu 2 pontos, com reduções de aproximadamente 0,1 s em FCP/LCP. TBT permaneceu baixo; a variação móvel de 20 ms para 30 ms é pequena e pode ser ruído de uma amostra única. CLS permaneceu baixo.

O JavaScript inicial visto no build caiu de **613,39 kB minificados / 181,47 kB gzip** para **385,62 kB / 121,84 kB gzip**, cerca de 37% menos bytes de JavaScript inicial minificado. A transferência Lighthouse inclui HTML, CSS, JS e outros recursos solicitados, por isso a queda percentual total é diferente.

## Interpretação e próximos passos

O code splitting melhorou a transferência e os tempos iniciais na medição local, com maior relevância em mobile. O LCP mobile otimizado continua em 4,7 s nesta simulação; é uma oportunidade de investigação. As páginas com maior chunk próprio incluem `bank` (~44 kB), `mundos` (~22 kB) e `zona` (~19 kB) antes de considerar módulos compartilhados. Não se deve adicionar mais fragmentação sem inspecionar o waterfall e a navegação subsequente: o split posterga parte do custo para a rota visitada e pode gerar requests adicionais.

Para estabelecer budgets confiáveis, repetir várias execuções em runner/browser fixo, publicar os JSON/HTML reports como artefatos CI, testar a rota real de onboarding sem depender de identidade pessoal e medir uma sessão autenticada em staging. Correlacionar Lighthouse sintético com CrUX/RUM, p75 de LCP/INP/CLS e navegação entre rotas antes de definir limite bloqueante.
