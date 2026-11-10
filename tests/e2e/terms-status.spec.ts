import { expect, test } from "@playwright/test";

async function mockSignedOut(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/user", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
}

test("página pública de Termos informa revisão e não registra aceite", async ({ page }) => {
  await mockSignedOut(page);
  await page.goto("/termos");

  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();
  await expect(page.getByText("DOCUMENTO EM REVISÃO")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Este aviso não é um contrato nem um aceite" })).toBeVisible();
  await expect(page.getByText(/não coleta aceite ou consentimento/i)).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /aceito|concordo/i })).toHaveCount(0);

  await page.getByRole("link", { name: "ABRIR PORTAL DO JOGADOR" }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("heading", { name: "Acesse sua conta" })).toBeVisible();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Aliste-se na plataforma" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Consulte o aviso de status" })).toHaveAttribute("href", "/termos");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("landing apresenta o prêmio apenas como possibilidade futura e linka o aviso de Termos", async ({ page }) => {
  await mockSignedOut(page);
  await page.goto("/");

  await expect(page.getByText(/Possibilidade futura de recompensa de referência de até US\$ 1\.000\.000/i)).toBeVisible();
  await expect(page.getByText(/Não é oferta atual, promessa ou garantia/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Termos de Uso — aviso provisório" })).toHaveAttribute("href", "/termos");
  await expect(page.getByText(/Economia virtual KRC para uso interno no jogo, sem saque ou conversão externa/i)).toBeVisible();
});
