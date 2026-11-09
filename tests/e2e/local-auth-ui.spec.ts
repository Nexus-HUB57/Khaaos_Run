import { expect, test, type Page } from "@playwright/test";

const testPassword = "senha segura de teste 2026";
const publicUser = {
  id: "local-auth-player",
  email: "player@example.test",
  firstName: "Player",
  lastName: "WarI",
};

async function mockSignedOut(page: Page) {
  await page.route("**/api/auth/user", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Not authenticated" }),
    });
  });
}

test("auth UI: cadastro envia nome, email, senha e confirmação e exibe resposta neutra", async ({ page }) => {
  await mockSignedOut(page);
  let registration: Record<string, string> | undefined;
  await page.route("**/api/auth/register", async (route) => {
    registration = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ message: "Se o cadastro puder ser iniciado, enviaremos as instruções de confirmação ao email informado." }),
    });
  });

  await page.goto("/auth?mode=register");
  await page.getByLabel("NOME").fill("Player WarI");
  await page.getByLabel("EMAIL").fill("player@example.test");
  await page.getByLabel("SENHA", { exact: true }).fill(testPassword);
  await page.getByLabel("CONFIRMAR SENHA").fill(testPassword);
  await page.getByRole("button", { name: "CRIAR CONTA" }).click();

  await expect(page.getByRole("status")).toContainText("instruções de confirmação");
  await expect(page.getByRole("heading", { name: "Acesse sua conta" })).toBeVisible();
  expect(registration).toEqual({
    name: "Player WarI",
    email: "player@example.test",
    password: testPassword,
    confirmPassword: testPassword,
  });
});

test("auth UI: link de confirmação envia o token uma vez e limpa o fragmento da URL", async ({ page }) => {
  await mockSignedOut(page);
  const submittedTokens: string[] = [];
  await page.route("**/api/auth/verify-email", async (route) => {
    submittedTokens.push((route.request().postDataJSON() as { token: string }).token);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Email confirmado. Você já pode entrar." }),
    });
  });

  await page.goto("/auth#verify=abcdef0123456789");
  await expect(page.getByRole("status")).toHaveText("Email confirmado. Você já pode entrar.");
  await expect(page).toHaveURL(/\/auth$/);
  expect(submittedTokens).toEqual(["abcdef0123456789"]);
});

test("auth UI: login envia credenciais e redireciona após resposta autenticada", async ({ page }) => {
  let authenticated = false;
  await page.route("**/api/auth/user", async (route) => {
    await route.fulfill({
      status: authenticated ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(authenticated ? publicUser : { message: "Not authenticated" }),
    });
  });

  let login: Record<string, string> | undefined;
  await page.route("**/api/auth/login", async (route) => {
    login = route.request().postDataJSON() as Record<string, string>;
    authenticated = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: publicUser }),
    });
  });

  await page.goto("/auth");
  await page.getByLabel("EMAIL").fill(publicUser.email);
  await page.getByLabel("SENHA").fill(testPassword);
  await page.getByRole("button", { name: "ENTRAR" }).click();

  await page.waitForURL((url) => url.pathname === "/");
  expect(login).toEqual({ email: publicUser.email, password: testPassword });
  await expect(page.getByRole("heading", { name: "Acesse sua conta" })).toHaveCount(0);
});

test("auth UI: login inválido mantém a página e mostra a mensagem genérica do servidor", async ({ page }) => {
  await mockSignedOut(page);
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Email, senha ou confirmação inválidos." }),
    });
  });

  await page.goto("/auth");
  await page.getByLabel("EMAIL").fill("player@example.test");
  await page.getByLabel("SENHA").fill("senha errada de teste 2026");
  await page.getByRole("button", { name: "ENTRAR" }).click();

  await expect(page.getByRole("status")).toHaveText("Email, senha ou confirmação inválidos.");
  await expect(page).toHaveURL(/\/auth$/);
});
