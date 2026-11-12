import { expect, test, type Page } from "@playwright/test";
import { ARMORER_CATALOG, ARMORER_MATERIALS } from "../../shared/armorer-catalog";

type MockInventoryItem = {
  id: number;
  userId: string;
  name: string;
  type: string;
  rarity: string;
  durability: string;
  maxDurability: string;
  isEquipped: boolean;
  stats: Record<string, number>;
  imageUrl: null;
  createdAt: string;
};

const playerId = "war-i-ui-player";
const roomId = "war-i-ui-room";
const fixedTimestamp = "2026-01-01T12:00:00.000Z";

const items: MockInventoryItem[] = [
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

async function mockPlayerApis(page: Page, initialMaterialQuantity = 100) {
  const inventory = items.map((item) => ({ ...item, stats: { ...item.stats } }));
  const craftRequests: Array<{ catalogId: string | undefined; idempotencyKey: string | undefined }> = [];
  const balances = ARMORER_MATERIALS.map((material) => ({ materialId: material.id, quantity: initialMaterialQuantity }));
  const equipRequests: Array<{ itemId: number; isEquipped: boolean }> = [];
  const operativeRequests: string[] = [];
  let selectedOperativeId = "OP_MALE_VANGUARD";

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let status = 200;
    let body: unknown;

    if (pathname === "/api/player/operative" && request.method() === "POST") {
      const input = request.postDataJSON() as { operativeId?: string };
      if (typeof input.operativeId !== "string") {
        status = 400;
        body = { message: "Operativo inválido." };
      } else {
        selectedOperativeId = input.operativeId;
        operativeRequests.push(selectedOperativeId);
        body = { selectedOperativeId };
      }
    } else if (pathname === "/api/items/craft" && request.method() === "POST") {
      const input = request.postDataJSON() as { catalogId?: string };
      craftRequests.push({ catalogId: input.catalogId, idempotencyKey: request.headers()["idempotency-key"] });
      const product = ARMORER_CATALOG.find((candidate) => candidate.id === input.catalogId);
      if (!product) {
        status = 400;
        body = { message: "Produto de fixture desconhecido." };
      } else {
        for (const ingredient of product.recipe) {
          const balance = balances.find((entry) => entry.materialId === ingredient.materialId)!;
          balance.quantity -= ingredient.quantity;
        }
        const purchasedItem: MockInventoryItem = {
          id: 200 + craftRequests.length,
          userId: playerId,
          name: product.name,
          type: product.type,
          rarity: product.rarity,
          durability: String(product.maxDurability),
          maxDurability: String(product.maxDurability),
          isEquipped: false,
          stats: { ...product.stats },
          imageUrl: null,
          createdAt: fixedTimestamp,
        };
        inventory.push(purchasedItem);
        status = 201;
        body = {
          ...purchasedItem,
          operationId: `00000000-0000-4000-8000-${String(craftRequests.length).padStart(12, "0")}`,
        };
      }
    } else if (pathname === "/api/armorer/materials" && request.method() === "GET") {
      body = balances;
    } else if (pathname === "/api/items" && request.method() === "GET") {
      body = inventory;
    } else {
      const equipMatch = pathname.match(/^\/api\/items\/(\d+)\/equip$/);
      if (equipMatch && request.method() === "POST") {
        const itemId = Number(equipMatch[1]);
        const input = request.postDataJSON() as { isEquipped: boolean };
        equipRequests.push({ itemId, isEquipped: input.isEquipped });
        const item = inventory.find((candidate) => candidate.id === itemId);
        if (!item) {
          status = 404;
          body = { message: "Item não encontrado." };
        } else {
          item.isEquipped = input.isEquipped;
          body = item;
        }
      } else {
        switch (pathname) {
          case "/api/auth/user":
            body = { id: playerId, email: "war-i-ui@example.test", firstName: "Zheers", lastName: "Teste", profileImageUrl: null, createdAt: fixedTimestamp, updatedAt: fixedTimestamp };
            break;
          case "/api/auth/ws-token":
            body = { token: "playwright-war-i-ui-token", expiresAt: Date.now() + 60_000 };
            break;
          case "/api/player/me":
            body = {
              user: { id: playerId, firstName: "Zheers", lastName: "Teste" },
              stats: { id: 1, userId: playerId, rank: "ZHEERS", xp: 0, health: 82, maxHealth: 100, energy: 100, maxEnergy: 100, status: "VIVO", kills: 0, deaths: 0, rating: 1000, matchesPlayed: 0, wins: 0, top5: 0, seasonKills: 0, selectedOperativeId },
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
      }
    }

    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });

  return { craftRequests, equipRequests, operativeRequests };
}

async function mockBattleSocket(page: Page, inMatch: boolean, lobbyRoom?: Record<string, unknown>) {
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
        if (lobbyRoom) {
          socket.send(JSON.stringify({ type: "room_state", room: lobbyRoom }));
        }
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
  const apiMocks = await mockPlayerApis(page);
  await mockBattleSocket(page, inMatch);
  await page.goto(path);
  return apiMocks;
}

test("perfil salva avatar do catálogo e exibe o mesmo ID selecionado", async ({ page }) => {
  const { operativeRequests } = await openApp(page, "/profile", false);
  const talon = page.getByTestId("select-operative-avatar-OP_MALE_TALON");

  await expect(talon).toBeVisible();
  await expect(talon).toHaveAttribute("aria-pressed", "false");
  await talon.click();

  await expect(talon).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "Avatar de TALON" })).toHaveAttribute("src", "/avatars/male/op_male_talon.svg");
  expect(operativeRequests).toEqual(["OP_MALE_TALON"]);
});

test("lobby carrega retrato realista do operativo e mantém texto de identidade", async ({ page }) => {
  await mockPlayerApis(page);
  const operative = {
    id: "OP_GNG_FEMALE_PIXEL",
    codename: "PIXEL",
    fullName: "Pixel",
    gender: "FEMININO",
    rank: "ZHEERS",
    ueAssetId: null,
    skeleton: "SK_Gwen",
    avatarPath: "/avatars/female/op_gng_female_pixel.svg",
    realisticAvatarPath: "/avatars/realistic/op_gng_female_pixel.webp",
    canonical: true,
    branch: "GANGUE_URBANA",
  };
  const player = {
    userId: playerId,
    displayName: "Zheers Teste",
    selectedOperativeId: operative.id,
    avatar: operative,
    posX: 0,
    posY: 0,
    health: 100,
    maxHealth: 100,
    status: "VIVO",
    kills: 0,
    isConnected: true,
    isReady: false,
    isHost: true,
    rating: 1000,
  };
  await mockBattleSocket(page, false, {
    id: roomId,
    status: "LOBBY",
    maxPlayers: 16,
    minPlayersToStart: 2,
    playerCount: 1,
    readyCount: 0,
    players: [player],
    zone: null,
    loot: [],
    hostId: playerId,
    isPrivate: false,
    inviteCode: "PIXEL01",
  });

  await page.goto("/lobby");
  const portrait = page.getByRole("img", { name: "Avatar PIXEL" });
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute("src", "/avatars/realistic/op_gng_female_pixel.webp");
  await expect(page.getByText("PIXEL · ELO 1000")).toBeVisible();
  await expect.poll(() => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test("War’I mostra compartimentos, prontidão e itens quebrados no loadout", async ({ page }) => {
  test.setTimeout(60_000);
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

test("receitas da Forja consomem materiais, cobram serviço e sincronizam produtos com War’I/PackBack", async ({ page }) => {
  test.setTimeout(60_000);
  const { craftRequests, equipRequests } = await mockPlayerApis(page);
  await mockBattleSocket(page, false);
  await page.goto("/market");

  for (const [index, product] of ARMORER_CATALOG.entries()) {
    const offer = page.getByTestId(`card-market-item-${index}`);
    await expect(offer).toContainText(product.name);
    await expect(offer).toContainText(`${product.armorerFeeKrc} KRC`);
    await expect(offer).toContainText("TRABALHO DO ARMEIRO");
    await expect(offer).toContainText(product.rarity);
    await expect(offer).toContainText(product.type);
    await expect(offer).toContainText(product.description);
    const craftButton = page.getByTestId(`button-craft-${index}`);
    for (const ingredient of product.recipe) {
      const material = ARMORER_MATERIALS.find((entry) => entry.id === ingredient.materialId)!;
      await expect(offer.getByTestId(`ingredient-${product.id}-${material.id}`)).toContainText(material.name);
      await expect(offer.getByTestId(`ingredient-${product.id}-${material.id}`)).toContainText(new RegExp(`\\d+/${ingredient.quantity}$`));
    }
    await craftButton.click();
    await expect.poll(() => craftRequests.length).toBe(index + 1);
    await expect(craftButton).toBeEnabled();
    expect(craftRequests[index].catalogId).toBe(product.id);
    expect(craftRequests[index].idempotencyKey).toBeTruthy();
  }

  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "WAR’I" })).toBeVisible();
  for (const [index, product] of ARMORER_CATALOG.entries()) {
    const itemId = 201 + index;
    const itemCard = page.getByTestId(`card-item-${itemId}`);
    await expect(itemCard).toBeVisible();
    await itemCard.click();
    const details = page.getByRole("dialog");
    const category = product.type === "ARMA" ? "ARMAMENTO" : product.type === "DEFESA" ? "DEFESA" : "BAG";
    await expect(details).toContainText(product.name);
    await expect(details).toContainText(`${product.rarity} | ${category} / ${product.type} | DUR: ${product.maxDurability}/${product.maxDurability}`);
    for (const [stat, value] of Object.entries(product.stats)) {
      await expect(details.getByText(stat.toUpperCase())).toBeVisible();
      await expect(details.getByText(String(value), { exact: true })).toBeVisible();
    }

    if (product.id === "granada-de-fragmentacao") {
      const equipButton = page.getByTestId(`button-packback-${itemId}`);
      await equipButton.click();
      await expect(equipButton).toContainText("NA PACKBACK — REMOVER");
      await expect.poll(() => equipRequests.length).toBe(1);
      expect(equipRequests[0]).toEqual({ itemId, isEquipped: true });
    }

    await page.getByRole("button", { name: "FECHAR" }).click();
    if (product.id === "granada-de-fragmentacao") await expect(itemCard).toContainText("PACKBACK");
  }
});

test("Forja informa ingrediente ausente e impede fabricação sem estoque suficiente", async ({ page }) => {
  const { craftRequests } = await mockPlayerApis(page, 0);
  await mockBattleSocket(page, false);
  await page.goto("/market");
  const offer = page.getByTestId("card-market-item-0");
  const craftButton = page.getByTestId("button-craft-0");
  await expect(offer.getByTestId("ingredient-lamina-nano-metal")).toContainText("0/3");
  await expect(craftButton).toContainText("FALTAM MATERIAIS");
  await expect(craftButton).toBeDisabled();
  await expect.poll(() => craftRequests.length).toBe(0);
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
