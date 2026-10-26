const apiBase = "https://api.render.com/v1";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Required environment setting ${name} is missing.`);
  }
  return value;
}

const apiKey = requiredEnv("RENDER_API_KEY");
const serviceId = requiredEnv("RENDER_SERVICE_ID");
const postgresId = requiredEnv("RENDER_POSTGRES_ID");
const headers = {
  Accept: "application/json",
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

async function renderRequest(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Render API request failed with HTTP ${response.status}.`);
  }

  return response;
}

const connectionResponse = await renderRequest(
  `/postgres/${encodeURIComponent(postgresId)}/connection-info`,
);
const connectionInfo = await connectionResponse.json();
const databaseUrl = connectionInfo.internalConnectionString;

if (
  typeof databaseUrl !== "string" ||
  !/^postgres(?:ql)?:\/\//i.test(databaseUrl)
) {
  throw new Error("Render did not return a valid internal Postgres URL.");
}

const serviceConfigResponse = await renderRequest(
  `/services/${encodeURIComponent(serviceId)}`,
  {
    method: "PATCH",
    body: JSON.stringify({
      serviceDetails: {
        envSpecificDetails: {
          buildCommand:
            "npm ci --include=dev --no-audit --no-fund && npm run build && node scripts/write-render-health.mjs",
        },
        healthCheckPath: "/healthz.json",
      },
    }),
  },
);
await serviceConfigResponse.arrayBuffer();

async function setEnvironmentVariable(key, value) {
  const response = await renderRequest(
    `/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      body: JSON.stringify({ value }),
    },
  );
  await response.arrayBuffer();
}

await setEnvironmentVariable("DATABASE_URL", databaseUrl);
await setEnvironmentVariable("RUN_DB_MIGRATIONS", "true");

console.log(
  "Configured the staging build, health check, private DATABASE_URL, and one-time migration gate. Check Render deploy status before starting another deploy.",
);
