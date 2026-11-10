# CIGKV — Realismo máximo de avatares

## Escopo

O perfil hero cobre Kane e Zheers com foco em credibilidade cinematográfica em tempo real, sem transformar o contrato em uma promessa de screenshots que ainda dependem do runner UE5.8.

### Pele

O master exige BaseColor, normal, micro-normal, roughness detail, specular, máscara de subsurface e micro poros. O alvo é variação de roughness entre 0,28 e 0,78, radius SSS entre 0,8 e 1,8 cm e detalhe de poro entre 0,15 e 1,2 mm. Pele uniforme, highlight plástico, halo de SSS ou tiling de poros são rejeições.

### Olhos

O avatar hero não usa um único material opaco para o olho. A separação mínima é córnea, íris, esclera e tearline, com IOR 1,376, refração, wetness mask, detalhe de íris e parallax. O contrato rejeita olho morto, córnea opaca, íris flutuante e ausência de tearline.

### Cabelo

O caminho preferencial é Groom; cards direcionais são o fallback controlado. O fluxo usa mapa de direção, anisotropia entre 0,55 e 0,82, largura de fio entre 0,03 e 0,09 mm e revisão contra highlight plano, aliasing e silhueta rígida de cards.

### Face e boca

São exigidos pelo menos 52 blendshapes, corretivos para mandíbula, sorriso, blink e sobrancelhas, além de dentes, língua, cavidade oral e lip wetline. Expressões não podem ser resolvidas somente com troca de textura.

### Deformação e performance

O runner deve revisar idle, run, crouch, ADS, reload, hit react, jaw open, blink e facial anger. O gate permite zero frames visíveis de clipping, até 2 cm de foot slide e até 0,5 cm de desalinhamento do socket da arma. Medium deve sustentar GPU p95 de 16,67 ms, com teto de 2 GB de VRAM e zero shader hitch no caso de aceite.

## Execução

O gate engine-less é:

```bash
python3 scripts/ue5/validate_cigkv_avatar_realism.py
```

Ele confere o contrato e os parâmetros do master, mas não mede topologia, morfologia, deformação ou aparência. O aceite final exige importação no Editor, materiais reais, morph targets, Physics Assets, execução dos testes de deformação, screenshots da matriz de iluminação e métricas de GPU.

Arquivos canônicos:

- `Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_avatar_realism_profile.json`
- `scripts/ue5/validate_cigkv_avatar_realism.py`
- `Unreal/KhaaosRun/Content/Materials/CIGKV/M_CIGKV_character_materials.json`
