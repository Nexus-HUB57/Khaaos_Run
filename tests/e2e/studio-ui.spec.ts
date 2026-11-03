import { expect, test, type Page } from "@playwright/test";

/**
 * E2E — Estúdio de Personagens (/studio) com o roster completo.
 *
 * Task 42: contrato de browser para o gap fechado no Task 40 — o estúdio deve
 * listar os 32 arquétipos (16 militares canônicos + 16 não-militares do
 * Lote 4: milícias MIL-01..08 e gangues GNG-01..08), com o filtro de facção
 * funcional (16/8/8), interseção com o filtro de sexo, seleção carregando o
 * dossiê do operante e busca por codinome.
 *
 * Escola da casa (war-i-ui.spec.ts): todas as rotas /api/** são mockadas e o
 * WebSocket é segurado — o teste roda isolado de backend contra o dev-server
 * do Vite (playwright.config.ts webServer porta 4173).
 */

const playerId = "studio-ui-player";
const fixedTimestamp = "2026-01-01T12:00:00.000Z";

async function mockStudioApis(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    let status = 200;
    let body: unknown = {};

    switch (pathname) {
      case "/api/auth/user":
        body = {
          id: playerId,
          email: "studio-ui@example.test",
          firstName: "Zheers",
          lastName: "Teste",
          profileImageUrl: null,
          createdAt: fixedTimestamp,
          updatedAt: fixedTimestamp,
        };
        break;
      case "/api/auth/ws-token":
        body = { token: "playwright-studio-ui-token", expiresAt: Date.now() + 60_000 };
        break;
      case "/api/player/me":
        body = {
          user: { id: playerId, firstName: "Zheers", lastName: "Teste" },
          stats: {
            id: 1,
            userId: playerId,
            rank: "ZHEERS",
            xp: 0,
            health: 100,
            maxHealth: 100,
            energy: 100,
            maxEnergy: 100,
            status: "VIVO",
            kills: 0,
            deaths: 0,
            rating: 1000,
            matchesPlayed: 0,
            wins: 0,
            top5: 0,
            seasonKills: 0,
            selectedOperativeId: "OP_MALE_VANGUARD",
          },
        };
        break;
      default:
        // O estúdio é 100% client-side (catálogo via @shared); qualquer outra
        // chamada (ex.: /api/marshal para o shell) é isolada com 403.
        status = 403;
        body = { message: "API isolada pelo teste Playwright." };
    }

    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.routeWebSocket("**/ws", (socket) => {
    socket.onMessage((rawMessage) => {
      let message: { type?: string };
      try {
        message = JSON.parse(String(rawMessage));
      } catch {
        return;
      }
      if (message.type === "join" || message.type === "resume") {
        socket.send(JSON.stringify({ type: "welcome", userId: playerId, roomId: "studio-ui-room" }));
      }
    });
  });
}

const operativeCards = (page: Page) => page.locator('[data-testid^="select-operative-"]');

test.beforeEach(async ({ page }) => {
  await mockStudioApis(page);
  await page.goto("/studio");
});

test("studio: roster completo — 32 arquétipos com militares e não-militares visíveis", async ({ page }) => {
  await expect(operativeCards(page)).toHaveCount(32);
  await expect(page.locator('[data-testid="select-operative-OP_MALE_VANGUARD"]')).toBeVisible();
  await expect(page.locator('[data-testid="select-operative-OP_FEMALE_SNIPER"]')).toBeVisible();
  // Lote 4 — milícias e gangues urbanas.
  await expect(page.locator('[data-testid="select-operative-OP_MIL_MALE_VULTO"]')).toBeVisible();
  await expect(page.locator('[data-testid="select-operative-OP_GNG_FEMALE_PIXEL"]')).toBeVisible();
});

test("studio: filtro de facção recorta 16 militares, 8 milícias e 8 gangues", async ({ page }) => {
  await page.locator('[data-testid="filter-faction-militar"]').click();
  await expect(operativeCards(page)).toHaveCount(16);

  await page.locator('[data-testid="filter-faction-milicia"]').click();
  await expect(operativeCards(page)).toHaveCount(8);
  await expect(page.locator('[data-testid="select-operative-OP_MIL_MALE_VULTO"]')).toBeVisible();
  await expect(page.locator('[data-testid="select-operative-OP_MALE_VANGUARD"]')).toHaveCount(0);

  await page.locator('[data-testid="filter-faction-gangue"]').click();
  await expect(operativeCards(page)).toHaveCount(8);
  await expect(page.locator('[data-testid="select-operative-OP_GNG_FEMALE_PIXEL"]')).toBeVisible();
  await expect(page.locator('[data-testid="select-operative-OP_MIL_MALE_VULTO"]')).toHaveCount(0);

  await page.locator('[data-testid="filter-faction-all"]').click();
  await expect(operativeCards(page)).toHaveCount(32);
});

test("studio: interseção sexo × facção — ♀ na MILÍCIA mostra só as 4 operadoras", async ({ page }) => {
  await page.locator('[data-testid="filter-gender-female"]').click();
  await page.locator('[data-testid="filter-faction-milicia"]').click();
  await expect(operativeCards(page)).toHaveCount(4);
  for (const id of ["OP_MIL_FEMALE_NOTA", "OP_MIL_FEMALE_SIRENE", "OP_MIL_FEMALE_SORO", "OP_MIL_FEMALE_CORUJA"]) {
    await expect(page.locator(`[data-testid="select-operative-${id}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-testid="select-operative-OP_MIL_MALE_VULTO"]')).toHaveCount(0);
});

test("studio: seleção de miliciano carrega o dossiê (VULTO)", async ({ page }) => {
  await page.locator('[data-testid="select-operative-OP_MIL_MALE_VULTO"]').click();
  const dossierTitle = page.getByText(/AVATAR & IDENTIDADE ÉTNICA · VULTO/);
  await expect(dossierTitle).toBeVisible();
  // O filtro de facção do card selecionado reflete a MILÍCIA.
  await expect(page.locator('[data-testid="select-operative-OP_MIL_MALE_VULTO"]')).toContainText("MILÍCIA");
});

test("studio: busca por codinome isola a operante (PIXEL)", async ({ page }) => {
  await page.getByPlaceholder("Buscar por etnia, codinome...").fill("PIXEL");
  await expect(operativeCards(page)).toHaveCount(1);
  await expect(page.locator('[data-testid="select-operative-OP_GNG_FEMALE_PIXEL"]')).toBeVisible();
  await expect(page.locator('[data-testid="select-operative-OP_MALE_VANGUARD"]')).toHaveCount(0);
});
