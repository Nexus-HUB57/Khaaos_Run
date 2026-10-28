// Contrato: validação VISUAL dos LUTs com captura PNG (KhaaosLUTVisualValidator).
// Protege contra: (1) remoção do commandlet de validação visual; (2) divergência
// entre a matemática de sampling do validador e a do material M_KhaaosColorGradeLUT
// (o preview deixaria de provar o que o material vai renderizar); (3) troca da
// fonte de pixels de Source → PlatformData-only (quebra em -NullRHI/re-cozimento);
// (4) remoção do step/artifact no CI; (5) regressão do PlatformAllowList do módulo
// KhaaosRunEditor que bloquearia TODO o pipeline de assets no runner Linux/GPU.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const CMDLET_H = 'Unreal/KhaaosRun/Source/KhaaosRunEditor/Commandlets/KhaaosLUTVisualValidatorCommandlet.h';
const CMDLET_CPP = 'Unreal/KhaaosRun/Source/KhaaosRunEditor/Commandlets/KhaaosLUTVisualValidatorCommandlet.cpp';
const FACTORY_CPP = 'Unreal/KhaaosRun/Source/KhaaosRun/Game/Graphics/KhaaosLUTTextureFactory.cpp';
const BUILDER_CPP = 'Unreal/KhaaosRun/Source/KhaaosRunEditor/Commandlets/KhaaosLUTMaterialBuilderCommandlet.cpp';
const WORKFLOW = '.github/workflows/ue5-headless-compile.yml';
const UPROJECT = 'Unreal/KhaaosRun/KhaaosRun.uproject';

const MOODS = ['PadraoBattle', 'NoiteNeon', 'NebulosaAlien', 'AmanhecerVenenoso', 'LowEndLeve'];

test('commandlet de validação visual existe e herda de UCommandlet', () => {
  assert.ok(existsSync(path.join(root, CMDLET_H)), `header ausente: ${CMDLET_H}`);
  assert.ok(existsSync(path.join(root, CMDLET_CPP)), `impl ausente: ${CMDLET_CPP}`);
  const h = read(CMDLET_H);
  assert.match(h, /UCLASS\(\)/, 'UCLASS ausente no header do validador');
  assert.match(h, /class\s+\w+\s*:\s*public UCommandlet/, 'validador não herda de UCommandlet');
  assert.match(h, /GENERATED_BODY\(\)/, 'GENERATED_BODY ausente');
  assert.match(h, /virtual int32 Main\(const FString& Params\) override/, 'Main override ausente');
});

test('validador carrega os 5 assets LUT persistentes com fallback para a factory', () => {
  const cpp = read(CMDLET_CPP);
  const h = read(CMDLET_H);
  for (const m of MOODS) {
    assert.match(h, new RegExp(`T_KhaaosLUT_${m}`), `asset T_KhaaosLUT_${m} não documentado no header`);
  }
  assert.match(cpp, /StaticLoadObject\(UTexture2D::StaticClass/, 'asset persistente não carregado');
  assert.match(cpp, /GenerateLUTForMood\(Mood\)/, 'fallback GenerateLUTForMood ausente');
  assert.match(read(FACTORY_CPP), /GetLUTForMood/, 'factory sem GetLUTForMood (fallback quebra)');
});

test('extração de pixels usa Source (mip 0) — sobrevive a -NullRHI e re-cozimento', () => {
  const cpp = read(CMDLET_CPP);
  assert.match(cpp, /Source\.GetMip\(0\)/, 'extração não lê Source.GetMip(0)');
  assert.match(cpp, /GetPlatformData\(\)/, 'fallback PlatformData ausente');
  assert.match(read(FACTORY_CPP), /Texture->Source\.GetMip\(0\)/, 'factory deixou de espelhar pixels no Source');
});

test('sampling replica EXATAMENTE a matemática de UV do material (centro de célula)', () => {
  const cpp = read(CMDLET_CPP);
  const builder = read(BUILDER_CPP);
  // U = (floor(B*q) * Size + R*q + 0.5) / (Size*Size)
  assert.match(cpp, /FloorToFloat\(B \* q\)/, 'floor da fatia azul ausente no sampling');
  assert.match(cpp, /static_cast<float>\(LUTSize\) \+ R \* q \+ 0\.5f/, 'fórmula U divergente do material');
  assert.match(cpp, /G \* q \+ 0\.5f/, 'fórmula V divergente do material');
  // O builder usa exatamente os mesmos componentes (Floor + Size² no denominador)
  assert.match(builder, /UMaterialExpressionFloor/, 'material sem floor da fatia (paridade sampling×material quebrada)');
  assert.match(builder, /LUTSizeParam\);\s*$/m, 'builder deveria multiplicar fatia por Size');
});

test('capturas PNG salvas via ImageWrapper nos 4 formatos por mood', () => {
  const cpp = read(CMDLET_CPP);
  assert.match(cpp, /EImageFormat::PNG/, 'export PNG ausente');
  assert.match(cpp, /FFileHelper::SaveArrayToFile/, 'save de binário ausente');
  for (const prefix of ['Strip_', 'Antes_', 'Depois_', 'Comparacao_']) {
    assert.ok(cpp.includes(prefix), `captura ${prefix} ausente`);
  }
});

test('relatório JSON numérico com evidência de delta do grading', () => {
  const cpp = read(CMDLET_CPP);
  // No C++ as chaves JSON aparecem escapadas: \"mood\" — o teste aceita a forma escapada
  for (const key of ['mood', 'meanDelta255', 'maxDelta255', 'pctPixelsChanged', 'capturesSaved']) {
    assert.match(cpp, new RegExp(`\\\\"${key}\\\\"`), `chave ${key} ausente no relatório JSON`);
  }
  assert.match(cpp, /lut_visual_report\.json/, 'nome do arquivo de relatório mudou');
});

test('CI: validação visual roda DEPOIS da geração dos assets LUT', () => {
  const wf = read(WORKFLOW);
  const builderIdx = wf.indexOf('-run=KhaaosLUTMaterialBuilder');
  const validatorIdx = wf.indexOf('-run=KhaaosLUTVisualValidator');
  assert.ok(builderIdx >= 0, 'step do builder LUT ausente no workflow');
  assert.ok(validatorIdx > builderIdx, 'validador deve rodar DEPOIS do builder (assets não existiriam ainda)');
  assert.match(wf, /Validate LUTs Visually/, 'step sem nome descritivo no workflow');
});

test('CI: capturas de validação publicadas como artifact com retenção', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /lut-visual-validation-\$\{\{ github\.sha \}\}/, 'artifact lut-visual-validation ausente');
  assert.match(wf, /Saved\/LUTValidation\/\*\*/, 'artifact não aponta para o diretório de capturas');
  assert.match(wf, /retention-days:\s*30/, 'retenção do artifact de capturas deve ser 30 dias');
});

test('.uproject permite o módulo KhaaosRunEditor no Linux (runner GPU compila o commandlet)', () => {
  const proj = read(UPROJECT);
  const editorBlock = proj.slice(proj.indexOf('"KhaaosRunEditor"'), proj.indexOf('"KhaaosEAC"'));
  assert.ok(editorBlock.length > 0, 'bloco do módulo KhaaosRunEditor não encontrado no .uproject');
  assert.match(editorBlock, /"Linux"/, 'KhaaosRunEditor sem Linux no PlatformAllowList — commandlets não carregam no runner Linux');
});
