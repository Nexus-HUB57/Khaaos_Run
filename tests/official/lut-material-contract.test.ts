// Contrato: assets de LUT + material de PostProcess gerados pelo commandlet.
// Protege contra: (1) divergência entre os parâmetros que o RUNTIME
// (UKhaaosPostProcessLUTMaterial) define nos MIDs e os que o COMMANDLET
// (KhaaosLUTMaterialBuilder) cria no material; (2) path do material alterado
// só num dos lados (o runtime carregaria null e cairia no fallback); (3)
// remoção do mirror Source.Init (assets salvos perderiam pixels ao re-cozinhar);
// (4) remoção do step de geração de assets no CI headless.
// Lição do ciclo #127/#132: contratos de fonte previnem reversões silenciosas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const CMDLET_H = 'Unreal/KhaaosRun/Source/KhaaosRunEditor/Commandlets/KhaaosLUTMaterialBuilderCommandlet.h';
const CMDLET_CPP = 'Unreal/KhaaosRun/Source/KhaaosRunEditor/Commandlets/KhaaosLUTMaterialBuilderCommandlet.cpp';
const RUNTIME_CPP = 'Unreal/KhaaosRun/Source/KhaaosRun/Game/Graphics/KhaaosPostProcessLUTMaterial.cpp';
const FACTORY_CPP = 'Unreal/KhaaosRun/Source/KhaaosRun/Game/Graphics/KhaaosLUTTextureFactory.cpp';
const EDITOR_BUILDCS = 'Unreal/KhaaosRun/Source/KhaaosRunEditor/KhaaosRunEditor.Build.cs';
const WORKFLOW = '.github/workflows/ue5-headless-compile.yml';

const MATERIAL_PATH = '/Game/Graphics/Materials/M_KhaaosColorGradeLUT.M_KhaaosColorGradeLUT';
const PARAMS = ['LUTTexture', 'LUTSize', 'LUTBlend', 'AdditionalTint', 'AdditionalSaturation', 'DebugSplitScreen'];

test('commandlet do LUT builder existe com UCLASS Commandlet', () => {
  assert.ok(existsSync(path.join(root, CMDLET_H)), `header ausente: ${CMDLET_H}`);
  assert.ok(existsSync(path.join(root, CMDLET_CPP)), `impl ausente: ${CMDLET_CPP}`);
  const h = read(CMDLET_H);
  assert.match(h, /UCLASS\(\)/, 'UCLASS ausente no header do commandlet');
  assert.match(h, /class\s+\w+\s*:\s*public UCommandlet/, 'commandlet não herda de UCommandlet');
  assert.match(h, /GENERATED_BODY\(\)/, 'GENERATED_BODY ausente');
  assert.match(h, /virtual int32 Main\(const FString& Params\) override/, 'Main override ausente');
});

test('material usa domínio PostProcess (Unlit) + BlendableLocation AfterTonemapping', () => {
  const cpp = read(CMDLET_CPP);
  assert.match(cpp, /Material->MaterialDomain\s*=\s*MD_PostProcess/, 'domínio deve ser MD_PostProcess');
  assert.match(cpp, /Material->BlendableLocation\s*=\s*BL_AfterTonemapping/, 'blendable deve ser AfterTonemapping');
  // Cadeia mínima do grafo exigida: SceneColor + sample do LUT + saída emissiva
  assert.match(cpp, /UMaterialExpressionSceneTexture/, 'nó SceneTexture ausente');
  assert.match(cpp, /SceneTextureId\s*=\s*PPI_PostProcessInput0/, 'SceneTexture deve ler PostProcessInput0');
  assert.match(cpp, /UMaterialExpressionTextureSampleParameter2D/, 'sample paramétrico do LUT ausente');
  assert.match(cpp, /Material->EmissiveColor\.Connect\(/, 'saída EmissiveColor não conectada');
});

test('grafo do material implementa a matemática de UV do strip LUT', () => {
  const cpp = read(CMDLET_CPP);
  // U = (floor(B*q) * Size + R*q + 0.5) / (Size*Size)
  assert.match(cpp, /UMaterialExpressionFloor/, 'floor da fatia azul ausente');
  assert.match(cpp, /UMaterialExpressionAppendVector/, 'append U,V ausente');
  assert.match(cpp, /UMaterialExpressionDivide/, 'normalização por Size ausente');
  assert.match(cpp, /UMaterialExpressionLinearInterpolate/, 'lerp de blend ausente');
  assert.match(cpp, /UMaterialExpressionDesaturation/, 'desaturação p/ boost de saturação ausente');
  assert.match(cpp, /UMaterialExpressionIf/, 'debug split-screen ausente');
  assert.match(cpp, /UMaterialExpressionScreenPosition/, 'screen position p/ debug ausente');
});

test('parâmetros do material: commandlet cria EXATAMENTE os 6 que o runtime define', () => {
  const cmdlet = read(CMDLET_CPP);
  const runtime = read(RUNTIME_CPP);
  for (const p of PARAMS) {
    assert.ok(cmdlet.includes(`(TEXT("${p}")`),
      `parâmetro ${p} não declarado no commandlet`);
  }
  // O runtime define os mesmos nomes via PARAM_*
  assert.match(runtime, /PARAM_LUT_TEXTURE\(TEXT\("LUTTexture"\)\)/);
  assert.match(runtime, /PARAM_LUT_SIZE\(TEXT\("LUTSize"\)\)/);
  assert.match(runtime, /PARAM_LUT_BLEND\(TEXT\("LUTBlend"\)\)/);
  assert.match(runtime, /PARAM_ADDITIONAL_TINT\(TEXT\("AdditionalTint"\)\)/);
  assert.match(runtime, /PARAM_ADDITIONAL_SATURATION\(TEXT\("AdditionalSaturation"\)\)/);
  assert.match(runtime, /PARAM_DEBUG_SPLIT_SCREEN\(TEXT\("DebugSplitScreen"\)\)/);
});

test('path do material é idêntico no commandlet e no runtime', () => {
  const cmdlet = read(CMDLET_CPP);
  const runtime = read(RUNTIME_CPP);
  assert.match(cmdlet, /MATERIAL_PACKAGE_PATH = TEXT\("\/Game\/Graphics\/Materials"\)/,
    'package do material mudou no commandlet');
  assert.match(cmdlet, /MATERIAL_ASSET_NAME = TEXT\("M_KhaaosColorGradeLUT"\)/,
    'nome do material mudou no commandlet');
  assert.match(runtime, new RegExp(`PP_LUT_MATERIAL_PATH\\(TEXT\\("${MATERIAL_PATH.replace(/\./g, '\\.')}"\\)\\)`),
    'runtime não aponta mais para o path gerado pelo commandlet');
});

test('5 texturas LUT persistentes geradas em /Game/Graphics/LUTs', () => {
  const cpp = read(CMDLET_CPP);
  assert.match(cpp, /LUT_PACKAGE_PATH = TEXT\("\/Game\/Graphics\/LUTs"\)/,
    'package das texturas LUT ausente');
  const h = read(CMDLET_H);
  for (const suffix of ['PadraoBattle', 'NoiteNeon', 'NebulosaAlien', 'AmanhecerVenenoso', 'LowEndLeve']) {
    assert.match(h, new RegExp(`T_KhaaosLUT_${suffix}`), `asset T_KhaaosLUT_${suffix} não documentado`);
  }
  // Configurações obrigatórias de textura LUT salvável
  assert.match(cpp, /CompressionNone\s*=\s*true/, 'LUT deve ser sem compressão (valores exatos)');
  assert.match(cpp, /TMGS_NoMipmaps/, 'LUT strip não pode ter mips');
  assert.match(cpp, /TEXTUREGROUP_ColorLookupTable/, 'LODGroup deve ser ColorLookupTable');
});

test('factory espelha pixels no Source (WITH_EDITORONLY_DATA) — assets re-cozinham corretamente', () => {
  const factory = read(FACTORY_CPP);
  assert.match(factory, /WITH_EDITORONLY_DATA/, 'guard WITH_EDITORONLY_DATA ausente');
  assert.match(factory, /Texture->Source\.GetMip\(0\)/, 'mirror do Source ausente');
});

test('módulo editor declara dependências de asset (AssetRegistry/AssetTools)', () => {
  const buildcs = read(EDITOR_BUILDCS);
  assert.match(buildcs, /"AssetRegistry"/, 'AssetRegistry ausente no Build.cs do editor');
  assert.match(buildcs, /"AssetTools"/, 'AssetTools ausente no Build.cs do editor');
});

test('CI headless gera os assets antes dos testes unitários', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /-run=KhaaosLUTMaterialBuilder/, 'step do commandlet ausente no workflow');
  assert.match(wf, /Generate LUT \+ PostProcess Material Assets/, 'step sem nome descritivo');
  // Assets devem entrar no artifact de build
  assert.match(wf, /Content\/Graphics\/LUTs\/\*\*/, 'artifacts não incluem LUTs');
  assert.match(wf, /Content\/Graphics\/Materials\/\*\*/, 'artifacts não incluem materiais');
});
