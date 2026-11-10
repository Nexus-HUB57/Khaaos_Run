# Brief de modelagem 3D — Khael Vance / CIGKV

**Status:** pronto para geração econômica do primeiro asset hero
**Escopo:** vertical slice humano do CIGKV
**Referência de acabamento:** battle royale competitivo com legibilidade tática e realismo cinematográfico; identidade original de Khaaos Run, sem copiar personagens existentes.

## Perfil de custo aprovado para a primeira passagem

Esta primeira geração é um **blockout hero texturizado**, não o acabamento final de produção. Usar o perfil `text/P1` ou equivalente econômico, geometria entre 12k e 20k faces, textura PBR em qualidade standard e sem geração de partes separadas. O objetivo é validar silhueta, identidade, materiais principais e prontidão para retarget; detalhes finos, microtextura extrema, LODs e acessórios completos ficam para etapas posteriores.

## Identidade canônica

- **Asset:** `CHR_Zheers_Male_Vanguard`
- **Operador:** Khael Vance, Operador Vanguarda M-01
- **Perfil:** afro-latino / pardo brasileiro, 26 anos, assalto urbano e incursão ZEX
- **Aparência:** atlético, 182 cm, buzz-cut fade escuro, cicatriz tática na sobrancelha direita, olhos âmbar, pele realista marcada por suor e fuligem
- **Roupa:** colete modular grafite, calça cargo ripstop, luvas sem dedos com proteção, PackBack compacto, joelheiras articuladas de carbono, coturnos; detalhes sutis laranja-vulcânico `#F97316`, roxo Khaaos `#7C3AED` e emblema dourado `#EAB308`

## Requisitos de geração

- Um único corpo humano masculino, anatomicamente coerente, simétrico e isolado.
- T-pose limpa para posterior rig/retarget; braços horizontais, dedos retos e separados, pernas afastadas.
- Mãos vazias: não incorporar rifle, mochila rígida complexa ou props que deformem com o corpo.
- Texturas PBR compactas em qualidade standard, UVs e materiais distinguindo apenas as zonas essenciais: pele, tecido, metal e cabelo; borracha pode compartilhar a instância de tecido/metal na primeira passagem.
- Silhueta legível a 20–30 m; proporções naturais; sem estética cartoon, sem HUD, sem logos de terceiros.
- Saída inicial: GLB de trabalho otimizado; normalização futura para 182 cm, origem nos pés, eixo forward `+X` e export FBX para UE5.8.

### O que fica fora da primeira geração

- Sem arma, coldre, mochila detalhada, joias, patches ou props separados.
- Sem cabelo groom; usar cabelo mesh simples com silhueta limpa.
- Sem microdetalhe extremo de poros, costuras ou desgaste; esses detalhes entram no material master/texture pass.
- Sem quad topology, smart low poly ou múltiplas partes exportadas nesta etapa.

## Pós-geração obrigatória

1. Auditoria estrutural (`>= 5.000` vértices/triângulos, UV, material e textura; skin será adicionado no passo de rig).
2. Normalização para T-pose, 182 cm, origem nos pés e escala aplicada.
3. Rig/retarget para `SK_Manny`, preservando fingers/twist e validando IK de mãos/pés.
4. Materiais master `M_CIGKV_Character_Master` e instâncias econômicas de pele, tecido, metal e cabelo.
5. Criar LOD0–LOD3 por redução local após a validação do LOD0; adicionar sockets de arma/acessórios e testar clipping nas ações de combate.
6. Importação no Unreal 5.8 licenciado e captura inicial em Medium; expandir para Low/High/Ultra depois do aceite do vertical slice.

## Proveniência

O arquivo gerado deve ser registrado depois da geração com modelo, prompt completo, seed quando houver, SHA-256, tamanho, escala, rig e status de licença. Até a decisão jurídica/comercial, tratar como `unverified_internal_prototype` e não declarar uso comercial liberado.
