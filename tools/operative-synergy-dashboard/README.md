# Khaaos Run — Operative Synergy Lab

Dashboard interativo de timeline para as janelas das 16 habilidades e suas sobreposições modeladas. O frontend é servido pelo FastAPI; o adaptador importa `scripts/operative-synergy-sim.py` do repositório, sem manter outra cópia dos dados dentro da aplicação.

## Executar em desenvolvimento

Na raiz de uma cópia do repositório oficial:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r tools/operative-synergy-dashboard/requirements-dev.txt
python -m uvicorn app:app --app-dir tools/operative-synergy-dashboard --host 0.0.0.0 --port 3000 --reload
```

Abra `/` no Preview. `GET /api/roster` retorna os 16 perfis. `GET /api/simulation?horizon=180&lineup=ID1,ID2,ID3,ID4` retorna a timeline completa, todas as 120 duplas, a composição e o resumo temporal. O horizonte aceito pela API é maior que 0 e até 3600 segundos; a interface oferece 60–600 s. A composição aceita dois a quatro IDs únicos.

## Testes

```bash
python -m unittest discover -s tools/operative-synergy-dashboard/tests -v
npm run verify:all
```

Para o teste FastAPI, instale antes `requirements-dev.txt` em um ambiente Python 3.12. O `verify:all` também executa TypeScript, build, cobertura, regras UE5 e testes/build do runtime.

## Interpretação

O modelo agenda habilidades em `t=0` e repete pela duração do cooldown; a agenda não decide como um jogador real deve usar Q. A sobreposição é a interseção dos intervalos efetivos compatíveis. A janela de 5 s para sinais instantâneos é convenção de análise, não duração da habilidade. O relatório não calcula dano ou vitória, e o runtime online ainda não sincroniza essas habilidades.
