import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.join(root, "game-runtime");
const checks = [
  { name: "App oficial · guarda das suítes", cwd: root, args: ["run", "guard:tests"] },
  { name: "App oficial · TypeScript", cwd: root, args: ["run", "check"] },
  { name: "App oficial · build", cwd: root, args: ["run", "build"] },
  { name: "App oficial · testes + coverage", cwd: root, args: ["run", "coverage:official"] },
  { name: "Qualidade BR · preflights Python", cwd: root, args: ["run", "test:python"] },
  { name: "UE5 · regras de loot", cwd: root, args: ["run", "test:ue5:logic"] },
  { name: "Runtime · build", cwd: runtimeRoot, args: ["run", "build"] },
  { name: "Runtime · testes + coverage", cwd: runtimeRoot, args: ["run", "coverage"] },
];

const runCheck = ({ name, cwd, args }) => new Promise((resolve) => {
  console.log(`\n▶ ${name}`);
  const child = spawn("npm", args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  child.on("error", (error) => {
    console.error(`✗ ${name}: ${error.message}`);
    resolve({ name, code: 1 });
  });
  child.on("close", (code) => {
    const result = code ?? 1;
    console.log(`${result === 0 ? "✓" : "✗"} ${name}`);
    resolve({ name, code: result });
  });
});

console.log("Instalando dependências do runtime pelo lockfile antes da verificação...");
const dependencyResult = await runCheck({
  name: "Runtime · dependências",
  cwd: runtimeRoot,
  args: ["ci", "--no-audit", "--no-fund"],
});

if (dependencyResult.code !== 0) {
  console.error("\nA instalação das dependências do runtime falhou; os gates foram interrompidos.");
  process.exitCode = 1;
} else {
  console.log("Verificando app oficial, regras UE5 portáveis e runtime do jogo em paralelo...");
  const results = await Promise.all(checks.map(runCheck));
  const allResults = [dependencyResult, ...results];
  const failures = allResults.filter(({ code }) => code !== 0);

  console.log("\nResumo:");
  for (const { name, code } of allResults) {
    console.log(`${code === 0 ? "PASSOU" : "FALHOU"} — ${name}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} verificação(ões) falharam.`);
    process.exitCode = 1;
  } else {
    console.log("\nTodas as verificações passaram.");
  }
}
