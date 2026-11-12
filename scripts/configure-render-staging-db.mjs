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
const keyValueId = requiredEnv("RENDER_KEYVALUE_ID");
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

const keyValueResponse = await renderRequest(
  `/key-value/${encodeURIComponent(keyValueId)}/connection-info`,
);
const keyValueInfo = await keyValueResponse.json();
const redisUrl = keyValueInfo.internalConnectionString;

if (typeof redisUrl !== "string" || !/^rediss?:\/\//i.test(redisUrl)) {
  throw new Error("Render did not return a valid internal Key Value URL.");
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
          startCommand: "npm start",
        },
        healthCheckPath: "/readyz",
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

await setEnvironmentVariable("NODE_ENV", "production");
await setEnvironmentVariable("KRC_CHECKOUT_ENABLED", "false");
await setEnvironmentVariable("REDIS_URL", redisUrl);
await setEnvironmentVariable("REDIS_REQUIRED", "true");
await setEnvironmentVariable("REDIS_NAMESPACE", "khaaos");
await setEnvironmentVariable("DATABASE_URL", databaseUrl);
await setEnvironmentVariable("RUN_DB_MIGRATIONS", "true");

console.log(
  "Configured the staging web build/start/health, private Postgres and Key Value URLs, and one-time migration gate. Check Render deploy status before starting another deploy.",
);
