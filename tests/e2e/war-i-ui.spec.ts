import { expect, test, type Page } from "@playwright/test";

const playerId = "war-i-ui-player";
const roomId = "war-i-ui-room";
const fixedTimestamp = "2026-01-01T12:00:00.000Z";

const items = [
  { id: 101, userId: playerId, name: "Fuzil Khaaos-47", type: "ARMA", rarity: "RARO", durability: "100", maxDurability: "100", isEquipped: true, stats: { damage: 35, range: 8 }, imageUrl: null, createdAt: fixedTimestamp },
  { id: 102, userId: playerId, name: "Colete Khaaos", type: "DEFESA", rarity: "COMUM", durability: "100", maxDurability: "100", isEquipped: true, stats: { defense: 20 }, imageUrl: null, createdAt: fixedTimestamp },
  { id: 103, userId: playerId, name: "Mochila Tática", type: "UTILIDADE", rarity: "EPICO", durability: "100", maxDurability: "100", isEquipped: true, stats: { capacity: 20 }, imageUrl: null, createdAt: fixedTimestamp },
  { id: 104, userId: playerId, name: "Granada Zheers", type: "UTILIDADE", rarity: "RARO", durability: "80", maxDurability: "100", isEquipped: true, stats: { damage: 30, radius: 5 }, imageUrl: null, createdAt: fixedTimestamp },
  { id: 105, userId: playerId, name: "Bandagem de Campo", type: "CURATIVO", rarity: "COMUM", durability: "0", maxDurability: "100", isEquipped: true, stats: { heal: 25 }, imageUrl: null, createdAt: fixedTimestamp },
  { id: 106, userId: playerId, name: "Drone de Reconhecimento", type: "UTILIDADE", rarity: "EPICO", durability: "0", maxDurability: "100", isEquipped: true, stats: { vision: 80 }, imageUrl: null, createdAt: fixedTimestamp },
  { id: 107, userId: playerId, name: "Kit Médico I", type: "CURATIVO", rarity: "COMUM", durability: "65", maxDurability: "100", isEquipped: false, stats: { heal: 25 }, imageUrl: null, createdAt: fixedTimestamp },
];

const actionItems = [
  { id: 107, name: "Kit Médico I", type: "CURATIVO", rarity: "COMUM", durability: "65", maxDurability: "100", stats: { heal: 25 } },
  { id: 104, name: "Granada Zheers", type: "UTILIDADE", rarity: "RARO", durability: "80", maxDurability: "100", stats: { damage: 30, radius: 5 } },
  { id: 108, name: "Drone de Reconhecimento", type: "UTILIDADE", rarity: "EPICO", durability: "90", maxDurability: "100", stats: { vision: 80 } },
];

const zone = {
  isActive: false,
  sessionId: null,
  currentPhase: 1,
  totalPhases: 5,
  isShrinking: false,
  currentRadiusPct: 100,
  targetRadiusPct: 75,
  prevRadiusPct: 100,
  waitTimeRemaining: 30,
  shrinkTimeRemaining: 15,
  shrinkProgress: 0,
  damagePerTick: 5,
  centerX: 50,
  centerY: 50,
};

async function mockPlayerApis(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let status = 200;
    let body: unknown;

    switch (pathname) {
      case "/api/auth/user":
        body = { id: playerId, email: "war-i-ui@example.test", firstName: "Zheers", lastName: "Teste", profileImageUrl: null, createdAt: fixedTimestamp, updatedAt: fixedTimestamp };
        break;
      case "/api/auth/ws-token":
        body = { token: "playwright-war-i-ui-token", expiresAt: Date.now() + 60_000 };
        break;
      case "/api/items":
        body = items;
        break;
      case "/api/player/me":
        body = {
          user: { id: playerId, firstName: "Zheers", lastName: "Teste" },
          stats: { id: 1, userId: playerId, rank: "ZHEERS", xp: 0, health: 82, maxHealth: 100, energy: 100, maxEnergy: 100, status: "VIVO", kills: 0, deaths: 0, rating: 1000, matchesPlayed: 0, wins: 0, top5: 0, seasonKills: 0 },
        };
        break;
      case "/api/zone/status":
        body = zone;
        break;
      case "/api/zone/permissions":
        body = { canManageZone: false };
        break;
      default:
        status = 404;
        body = { message: "API isolada pelo teste Playwright." };
    }

    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function mockBattleSocket(page: Page, inMatch: boolean) {
  await page.routeWebSocket("**/ws", (socket) => {
    socket.onMessage((rawMessage) => {
      let message: { type?: string; itemId?: number };
      try {
        message = JSON.parse(String(rawMessage));
      } catch {
        return;
      }

      if (message.type === "join" || message.type === "resume") {
        socket.send(JSON.stringify({ type: "welcome", userId: playerId, roomId }));
        if (!inMatch) return;

        const player = {
          userId: playerId,
          displayName: "Zheers Teste",
          posX: 50,
          posY: 50,
          carryCapacity: 70,
          carriedWeight: 0,
          health: 82,
          maxHealth: 100,
          status: "VIVO",
          kills: 0,
          isConnected: true,
          isHost: true,
        };
        socket.send(JSON.stringify({
          type: "room_state",
          room: { id: roomId, status: "IN_PROGRESS", maxPlayers: 16, playerCount: 1, players: [player], zone, loot: [], winnerId: null },
        }));
        socket.send(JSON.stringify({ type: "packback_ready", items: actionItems }));
      }

      if (message.type === "use_packback_item" && typeof message.itemId === "number") {
        const item = actionItems.find((candidate) => candidate.id === message.itemId);
        if (!item) return;
        setTimeout(() => {
          socket.send(JSON.stringify({
            type: "packback_item_used",
            itemId: item.id,
            name: item.name,
            durability: item.id === 104 ? "70" : String(Number(item.durability) - 10),
            message: `${item.name}: ação de teste confirmada.`,
          }));
        }, 700);
      }
    });
  });
}

async function openApp(page: Page, path: string, inMatch: boolean) {
  await mockPlayerApis(page);
  await mockBattleSocket(page, inMatch);
  await page.goto(path);
}

test("War’I mostra compartimentos, prontidão e itens quebrados no loadout", async ({ page }) => {
  await openApp(page, "/inventory", false);
  await expect(page.getByRole("heading", { name: "WAR’I" })).toBeVisible();
  await expect(page.getByText("4/6")).toBeVisible();
  await expect(page.getByText(/2 item\(ns\) equipado\(s\) sem durabilidade válida/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Compartimentos do WarBag" })).toBeVisible();
  await expect(page.getByRole("button", { name: /ARSENAL/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /ARMAMENTO/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /DEFESA/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /BAG/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /PACKBACK/ })).toBeVisible();
  await expect(page).toHaveScreenshot("wari-arsenal-desktop.png", { fullPage: true });

  await page.getByRole("button", { name: /REVISAR LOADOUT/ }).click();
  await expect(page.getByTestId("card-item-101")).toBeVisible();
  await expect(page.getByTestId("card-item-107")).not.toBeVisible();
  await page.getByLabel("Buscar itens no War’I").fill("granada");
  await expect(page.getByTestId("card-item-104")).toBeVisible();
  await expect(page.getByTestId("card-item-101")).not.toBeVisible();
});

test("Zona exibe a PackBack no celular, evita toque duplicado e confirma durabilidade", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/zona", true);
  await expect(page.getByRole("heading", { name: "ZONA SEGURA" })).toBeVisible();
  await expect(page.getByTestId("ws-connection-state")).toContainText("SINCRONIZADO");
  await expect(page.getByTestId("panel-packback-actions")).toBeVisible();
  const grenadeButton = page.getByTestId("button-use-packback-104");
  const healButton = page.getByTestId("button-use-packback-107");
  await expect(grenadeButton).toBeVisible();
  await expect(healButton).toBeVisible();
  await expect(page).toHaveScreenshot("packback-zone-mobile.png", {
    fullPage: true,
    mask: [page.locator("canvas")],
    maskColor: "#100f14",
  });

  await grenadeButton.click();
  await expect(page.getByText("CONFIRMANDO AÇÃO NO SERVIDOR… aguarde antes de usar outro item.")).toBeVisible();
  await expect(grenadeButton).toBeDisabled();
  await expect(grenadeButton).toContainText("CONFIRMANDO");
  await expect(healButton).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "ação de teste confirmada" })).toBeVisible();
  await expect(grenadeButton).toContainText("70/100");
  await expect(healButton).toBeEnabled();
});
