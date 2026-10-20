export interface ProtectedConsolePathRule {
  pathPattern: string;
  subsystem: "MARSHAL_CONSOLE_API" | "ORCHESTRATION_COUNCIL" | "MARSHAL_CONSOLE_UI" | "CONSOLE_DOCS" | "CONSOLE_TESTS" | "CONSOLE_CI";
  ownerTeam: string;
  protectionLevel: "STRICT_NO_OVERWRITE" | "NO_DELETE" | "REVIEW_REQUIRED";
  description: string;
}

export interface TrackedRepoPR {
  prNumber: number;
  title: string;
  branch: string;
  base: string;
  wave: string;
  status:
    | "MERGED_BASE"
    | "ACTIVE_DEV_CONSOLE"
    | "ROADMAP_WAVE_1"
    | "ROADMAP_WAVE_2"
    | "ROADMAP_WAVE_3"
    | "ROADMAP_WAVE_4"
    | "ROADMAP_WAVE_5"
    | "CONCLUIDO_E2E";
  touchedPaths: string[];
  protectedConsoleOverlap: boolean;
  safeSyncStrategy: string;
}

export interface PRPathValidationResult {
  safeToCommitAndPush: boolean;
  blockedDeletions: string[];
  protectedConsoleTouches: {
    file: string;
    rule: ProtectedConsolePathRule;
  }[];
  overlappingPRs: {
    prNumber: number;
    title: string;
    branch: string;
    overlappingFiles: string[];
  }[];
  safeCommands: string[];
}

export const PROTECTED_CONSOLE_PATHS: ProtectedConsolePathRule[] = [
  {
    pathPattern: "server/game/marshalConsole.ts",
    subsystem: "MARSHAL_CONSOLE_API",
    ownerTeam: "Devs Console & Governança (/api/console/v1)",
    protectionLevel: "STRICT_NO_OVERWRITE",
    description: "Store TTL, guard OIDC MARSHAL_CONSOLE_OPERATOR_IDS, idempotência e rotas consultivas do Console do Marechal.",
  },
  {
    pathPattern: "server/game/orchestration.ts",
    subsystem: "ORCHESTRATION_COUNCIL",
    ownerTeam: "Devs Console & Special Class Council",
    protectionLevel: "STRICT_NO_OVERWRITE",
    description: "Domínio de deliberação da Classe Especial (Marechal Henricks, King Krapulla, Embaixador Uryan) e precedência de política.",
  },
  {
    pathPattern: "client/src/pages/marshal-console.tsx",
    subsystem: "MARSHAL_CONSOLE_UI",
    ownerTeam: "Devs Frontend Console (/marshal-console)",
    protectionLevel: "STRICT_NO_OVERWRITE",
    description: "Interface web restrita do operador, visão de mundo por catálogo e submissão idempotente de conselhos.",
  },
  {
    pathPattern: "client/src/lib/marshal-console-api.ts",
    subsystem: "MARSHAL_CONSOLE_UI",
    ownerTeam: "Devs Frontend Console (/marshal-console)",
    protectionLevel: "STRICT_NO_OVERWRITE",
    description: "Cliente HTTP tipado, preflight de allowlist e tratamento de erros CSRF/Idempotency do Console.",
  },
  {
    pathPattern: "docs/API_MARECHAL_CONTROL_PANEL.md",
    subsystem: "CONSOLE_DOCS",
    ownerTeam: "Devs Console & Segurança",
    protectionLevel: "NO_DELETE",
    description: "Contrato oficial de segurança e especificação HTTP v1 do Painel de Controle do Marechal.",
  },
  {
    pathPattern: "docs/Comandos de Console e Parâmetros de Configuração",
    subsystem: "CONSOLE_DOCS",
    ownerTeam: "Devs Engine & Console Runtime",
    protectionLevel: "NO_DELETE",
    description: "Parâmetros de referência de engine, Aim Assist, sensibilidade por escopo e GAS para o Console Khaaos Run.",
  },
  {
    pathPattern: "tests/official/marshal-console-client.test.ts",
    subsystem: "CONSOLE_TESTS",
    ownerTeam: "Devs Console QA",
    protectionLevel: "STRICT_NO_OVERWRITE",
    description: "Suíte de integração real cliente→servidor do Console do Marechal.",
  },
  {
    pathPattern: "tests/official/marshal-console-routes.test.ts",
    subsystem: "CONSOLE_TESTS",
    ownerTeam: "Devs Console QA",
    protectionLevel: "STRICT_NO_OVERWRITE",
    description: "Suíte de segurança OIDC, allowlist, CSRF, idempotência e isolamento por ator do Console.",
  },
  {
    pathPattern: "tests/official/orchestration.test.ts",
    subsystem: "CONSOLE_TESTS",
    ownerTeam: "Devs Console & Orquestração",
    protectionLevel: "STRICT_NO_OVERWRITE",
    description: "Testes unitários de precedência de governança e vetos da Classe Especial.",
  },
  {
    pathPattern: "tests/official/orchestration.integration.test.ts",
    subsystem: "CONSOLE_TESTS",
    ownerTeam: "Devs Console & Orquestração",
    protectionLevel: "STRICT_NO_OVERWRITE",
    description: "Testes assíncronos de falha parcial, timeout e isolamento de adapters do conselho.",
  },
  {
    pathPattern: ".github/workflows/Auto Merge PR 48",
    subsystem: "CONSOLE_CI",
    ownerTeam: "Devs Console CI/CD",
    protectionLevel: "NO_DELETE",
    description: "Workflow dedicado de sincronização da branch feat-console-e2e-phases-1-4 (PR #48).",
  },
];

export const TRACKED_REPO_PRS: TrackedRepoPR[] = [
  {
    prNumber: 48,
    title: "feat(console): merge main into feat-console-e2e-phases-1-4 (Console do Marechal & Orquestração)",
    branch: "pr-48/merge-main-into-feat-console-e2e-phases-1-4",
    base: "main",
    wave: "Console E2E Phases 1–4",
    status: "ACTIVE_DEV_CONSOLE",
    touchedPaths: [
      "server/game/marshalConsole.ts",
      "server/game/orchestration.ts",
      "client/src/pages/marshal-console.tsx",
      "client/src/lib/marshal-console-api.ts",
      "docs/API_MARECHAL_CONTROL_PANEL.md",
      "tests/official/marshal-console-client.test.ts",
      "tests/official/marshal-console-routes.test.ts",
    ],
    protectedConsoleOverlap: true,
    safeSyncStrategy: "Preservar 100% dos commits e arquivos do Console; atualizar apenas via fast-forward/merge sem --force e sem git add -A destrutivo.",
  },
  {
    prNumber: 52,
    title: "sec(core): bloqueadores de segurança, atomicidade financeira inicial, WS hardening e Redis adapter",
    branch: "main",
    base: "main",
    wave: "Base Consolidada",
    status: "MERGED_BASE",
    touchedPaths: [
      "server/routes.ts",
      "server/storage.ts",
      "game-runtime/",
      "docs/SECURITY_REMEDIATION_2026-10-17.md",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Base obrigatória em main para as ondas #53–#60.",
  },
  {
    prNumber: 53,
    title: "feat(economy): idempotência, constraints e gates de migração da economia",
    branch: "feat/pr53-economy-idempotency-gates",
    base: "main",
    wave: "Onda 1 — Consistência & Segurança",
    status: "ROADMAP_WAVE_1",
    touchedPaths: [
      "scripts/economy-reconcile.ts",
      "scripts/prune-economy-idempotency.ts",
      "server/storage.ts",
      "tests/official/economy-money.test.ts",
      "tests/official/economy-postgres.test.ts",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Staging seletivo em scripts/ e server/storage.ts; não tocar em server/game/marshalConsole.ts.",
  },
  {
    prNumber: 54,
    title: "sec(auth): rotação/revogação de identidade, rate limits de borda e origem WS",
    branch: "feat/pr54-identity-revocation-ws-origin",
    base: "main",
    wave: "Onda 1 — Consistência & Segurança",
    status: "ROADMAP_WAVE_1",
    touchedPaths: [
      "server/replit_integrations/auth/",
      "tests/official/auth.test.ts",
      "tests/official/ws-token.test.ts",
      "tests/official/websocket.test.ts",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Manter compatibilidade do middleware isAuthenticated consumido pelo Console do Marechal.",
  },
  {
    prNumber: 55,
    title: "feat(realtime): ownership distribuído de salas, presença e replay de reconnect",
    branch: "feat/pr55-distributed-room-ownership",
    base: "main",
    wave: "Onda 2 — Escala Operacional",
    status: "ROADMAP_WAVE_2",
    touchedPaths: [
      "game-runtime/",
      "tests/official/wari-websocket-e2e.test.ts",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Isolado em game-runtime/ e testes realtime; preserva store local do Console.",
  },
  {
    prNumber: 56,
    title: "ops(observability): readiness, métricas, SLOs, alertas e playbooks",
    branch: "feat/pr56-readiness-slos-playbooks",
    base: "main",
    wave: "Onda 2 — Escala Operacional",
    status: "ROADMAP_WAVE_2",
    touchedPaths: [
      "scripts/write-render-health.mjs",
      "server/routes.ts",
      "docs/",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Aditivo em /api/health e docs/; não sobrescrever docs/API_MARECHAL_CONTROL_PANEL.md.",
  },
  {
    prNumber: 57,
    title: "feat(matchmaking): matchmaking regional canônico e budgets de latência",
    branch: "feat/pr57-canonical-regional-matchmaking",
    base: "main",
    wave: "Onda 3 — Qualidade do Jogo",
    status: "ROADMAP_WAVE_3",
    touchedPaths: [
      "server/game/matchmaking.ts",
      "tests/official/matchmaking-algorithm.test.js",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Escopo restrito a matchmaking e filas regionais.",
  },
  {
    prNumber: 58,
    title: "feat(simulation): máquina authoritative de estados, validação biomecânica e replay determinístico",
    branch: "feat/pr58-authoritative-state-machine-replay",
    base: "main",
    wave: "Onda 3 — Qualidade do Jogo",
    status: "ROADMAP_WAVE_3",
    touchedPaths: [
      "shared/combat-damage-feedback.ts",
      "shared/worlds.ts",
      "server/game/worldProgression.ts",
      "client/src/pages/numero-tres.tsx",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Atualização aditiva em shared/ e client/src/pages/numero-tres.tsx sem alterar rotas do Console.",
  },
  {
    prNumber: 59,
    title: "feat(ux-ci): acessibilidade, HUD gamer, prompts Live-Action e budgets de performance no CI",
    branch: "feat/pr59-ux-live-action-studio-ci-budgets",
    base: "main",
    wave: "Onda 4 — Produto & Portabilidade",
    status: "ROADMAP_WAVE_4",
    touchedPaths: [
      "shared/character-studio.ts",
      "client/src/components/character-prompt-studio.tsx",
      "client/src/pages/profile.tsx",
      "client/src/pages/dashboard.tsx",
      "docs/LIGHTHOUSE_PERFORMANCE.md",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Escopo exclusivo de UX/Personagens/Perfil; zero mutação em marshal-console.tsx.",
  },
  {
    prNumber: 60,
    title: "feat(ue5): slice CIGKV compilável em UE5.8, Lyra mapping e contrato UE↔backend",
    branch: "feat/pr60-ue58-cigkv-slice-contract",
    base: "main",
    wave: "Onda 4 — Produto & Portabilidade",
    status: "ROADMAP_WAVE_4",
    touchedPaths: [
      "Unreal/KhaaosRun/",
      "Content/Assets/asset_manifest.json",
      "epic_integration/",
      "scripts/ue5_editor/",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Sincronização aditiva de manifestos 3D/UE5 sem remover assets ou pastas de outros Devs.",
  },
  {
    prNumber: 61,
    title: "feat(hierarchy): hierarquia do jogo end-to-end (5 eixos canônicos, escada EP555, 12 especializações GAS e UKhaaosHierarchySubsystem UE5.8)",
    branch: "feat/pr61-game-hierarchy-e2e-subsystem",
    base: "main",
    wave: "Onda 5 — Hierarquia & Governança de Batalha",
    status: "CONCLUIDO_E2E",
    touchedPaths: [
      "shared/game-hierarchy.ts",
      "Unreal/KhaaosRun/Source/KhaaosRun/Game/Hierarchy/",
      "Unreal/KhaaosRun/Source/KhaaosRun/Config/DefaultGame.ini",
      "client/src/pages/hierarquia.tsx",
      "server/routes.ts",
      "tests/official/game-hierarchy.test.ts",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "5 eixos canônicos adicionados com simulador determinístico de XP Accur/Morth; rotas /api/hierarchy/* isoladas de /api/console/v1.",
  },
  {
    prNumber: 69,
    title: "feat(characters): 16 operativos canônicos (8♂ / 8♀), avatares SVG táticos e Studio 4K",
    branch: "feat/operatives-16-ethnic-avatars-and-studio",
    base: "main",
    wave: "Onda 5 — Personagens & Identidade Étnica",
    status: "CONCLUIDO_E2E",
    touchedPaths: [
      "Content/Avatars/",
      "client/public/avatars/",
      "Content/Assets/asset_manifest.json",
      "shared/character-studio.ts",
      "client/src/components/operative-avatar-badge.tsx",
      "client/src/components/character-prompt-studio.tsx",
      "tests/official/character-studio.test.ts",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "PR #69 aberto no GitHub (Nexus-HUB57/Khaaos_Run#69); 16 avatares SVG 512x512 e Studio 4K com zero impacto em arquivos do Console.",
  },
  {
    prNumber: 63,
    title: "ci(ue5-build): verificação integral e testes portáteis UE5 CIGKV (fallback AST/parser e pipeline verify:all 100% verde)",
    branch: "feat/pr63-ue5-portable-verification-pipeline",
    base: "main",
    wave: "Onda 5 — CI/CD & Portabilidade UE5",
    status: "CONCLUIDO_E2E",
    touchedPaths: [
      "scripts/test_ue5_logic.sh",
      "scripts/test_ue5_logic_fallback.mjs",
      "game-runtime/test/real-adapters.test.js",
      "server/game/worldProgression.ts",
    ],
    protectedConsoleOverlap: false,
    safeSyncStrategy: "Scripts de build e testes independentes de compilador host (g++/clang++ ou Node.js fallback); isolamento estrito de testes Redis e DB.",
  },
];

export function matchProtectedConsoleRule(filePath: string): ProtectedConsolePathRule | undefined {
  const normalized = filePath.replace(/^\/+/, "").trim();
  return PROTECTED_CONSOLE_PATHS.find((rule) => {
    const cleanPattern = rule.pathPattern.replace(/^\/+/, "").trim();
    return normalized === cleanPattern || normalized.startsWith(`${cleanPattern}/`);
  });
}

export function validatePRPathsSafety(params: {
  modifiedFiles: string[];
  deletedFiles?: string[];
  allowConsoleTouch?: boolean;
  allowDeletions?: boolean;
}): PRPathValidationResult {
  const deletedFiles = (params.deletedFiles ?? []).map((f) => f.replace(/^\/+/, "").trim()).filter(Boolean);
  const modifiedFiles = params.modifiedFiles.map((f) => f.replace(/^\/+/, "").trim()).filter(Boolean);
  const allTouched = Array.from(new Set([...modifiedFiles, ...deletedFiles]));

  const blockedDeletions = params.allowDeletions ? [] : deletedFiles;

  const protectedConsoleTouches: PRPathValidationResult["protectedConsoleTouches"] = [];
  for (const file of allTouched) {
    const rule = matchProtectedConsoleRule(file);
    if (rule) {
      protectedConsoleTouches.push({ file, rule });
    }
  }

  const overlappingPRs: PRPathValidationResult["overlappingPRs"] = [];
  for (const pr of TRACKED_REPO_PRS) {
    const overlaps = allTouched.filter((file) =>
      pr.touchedPaths.some((prPath) => {
        const cleanPrPath = prPath.replace(/\/+$/, "");
        return file === cleanPrPath || file.startsWith(`${cleanPrPath}/`);
      }),
    );
    if (overlaps.length > 0) {
      overlappingPRs.push({
        prNumber: pr.prNumber,
        title: pr.title,
        branch: pr.branch,
        overlappingFiles: overlaps,
      });
    }
  }

  const consoleBlocked = !params.allowConsoleTouch && protectedConsoleTouches.length > 0;
  const deletionBlocked = blockedDeletions.length > 0;
  const safeToCommitAndPush = !consoleBlocked && !deletionBlocked;

  const safeModifiedList = modifiedFiles
    .filter((f) => !matchProtectedConsoleRule(f))
    .slice(0, 8)
    .map((f) => `"${f}"`)
    .join(" ");

  const safeCommands = [
    "# 1. Buscar estado mais recente do repositório remoto sem alterar sua árvore local",
    "git fetch origin --prune",
    "# 2. Verificar arquivos deletados ou que colidem com o Console antes de qualquer stage",
    "git status -sb && git diff --name-status origin/main",
    "# 3. Restaurar imediatamente qualquer arquivo do Console modificado/excluído por acidente",
    "git checkout HEAD -- server/game/marshalConsole.ts server/game/orchestration.ts client/src/pages/marshal-console.tsx client/src/lib/marshal-console-api.ts docs/API_MARECHAL_CONTROL_PANEL.md tests/official/marshal-console-client.test.ts tests/official/marshal-console-routes.test.ts 2>/dev/null || true",
    "# 4. Stage seletivo (NUNCA usar 'git add -A' para não registrar deleções acidentais de outros Devs)",
    safeModifiedList
      ? `git add -- ${safeModifiedList}`
      : "./scripts/khaaos_workflow.sh --check-overlaps --dry-run",
    "# 5. Atualizar PR com proteção anti-colisão e sem --force destrutivo",
    "./scripts/khaaos_workflow.sh -s feat -m \"update scoped files safely preserving console dev branches\" --sync-prs",
  ];

  return {
    safeToCommitAndPush,
    blockedDeletions,
    protectedConsoleTouches,
    overlappingPRs,
    safeCommands,
  };
}
