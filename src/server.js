import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import httpProxy from "http-proxy";
import * as tar from "tar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = Number.parseInt(process.env.OPENCLAW_PUBLIC_PORT ?? process.env.PORT ?? "8080", 10);
const DATA_DIR = process.env.OPENCLAW_DATA_DIR?.trim() || "/data";
const STATE_DIR = process.env.OPENCLAW_STATE_DIR?.trim() || path.join(DATA_DIR, ".openclaw");
const WORKSPACE_DIR = process.env.OPENCLAW_WORKSPACE_DIR?.trim() || path.join(DATA_DIR, "workspace");
const SETUP_PASSWORD = process.env.SETUP_PASSWORD?.trim();

// Internal gateway
const INTERNAL_GATEWAY_PORT = Number.parseInt(process.env.INTERNAL_GATEWAY_PORT ?? "18789", 10);
const GATEWAY_TARGET = `http://127.0.0.1:${INTERNAL_GATEWAY_PORT}`;

// OpenClaw CLI
const OPENCLAW_ENTRY = process.env.OPENCLAW_ENTRY?.trim() || "/openclaw/dist/entry.js";
const OPENCLAW_NODE = process.env.OPENCLAW_NODE?.trim() || "node";

// Akash ML model discovery
async function discoverAkashMLModels(baseUrl, apiKey) {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.warn(`[akashml] Failed to discover models: ${response.status}`);
      return [];
    }
    const data = await response.json();
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }
    return data.data.map((model) => {
      const id = model.id;
      const name = id.split("/").pop() || id;
      const isReasoning = id.toLowerCase().includes("r1") || id.toLowerCase().includes("reasoning");
      return {
        id,
        name,
        reasoning: isReasoning,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      };
    });
  } catch (err) {
    console.warn(`[akashml] Model discovery failed: ${err.message}`);
    return [];
  }
}

// Gateway token
const GATEWAY_TOKEN = (() => {
  const fromEnv = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const tokenPath = path.join(STATE_DIR, "gateway.token");
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch {}

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(tokenPath, generated, { encoding: "utf8", mode: 0o600 });
  } catch {}
  return generated;
})();
process.env.OPENCLAW_GATEWAY_TOKEN = GATEWAY_TOKEN;

// Session management
const sessions = new Map();
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { created: Date.now() });
  return token;
}

function validateSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.created > SESSION_MAX_AGE) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function getSessionToken(req) {
  // Check cookie first
  const cookies = req.headers.cookie?.split(";").reduce((acc, c) => {
    const [key, val] = c.trim().split("=");
    acc[key] = val;
    return acc;
  }, {}) || {};

  if (cookies.session) return cookies.session;

  // Check Authorization header (for API calls)
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }

  return null;
}

// Helpers
const configPath = () => process.env.OPENCLAW_CONFIG_PATH?.trim() || path.join(STATE_DIR, "openclaw.json");
const isConfigured = () => { try { return fs.existsSync(configPath()); } catch { return false; } };

class OpenClawCLI {
  #baseEnv = {
    ...process.env,
    HOME: path.dirname(STATE_DIR),
    OPENCLAW_STATE_DIR: STATE_DIR,
    OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
    OPENCLAW_CONFIG_PATH: configPath(),
  };

  async exec(subcommand, ...args) {
    const fullArgs = [OPENCLAW_ENTRY, subcommand, ...args];
    return this.#spawn(OPENCLAW_NODE, fullArgs);
  }

  async execBinary(binary, args = []) {
    return this.#spawn(binary, args);
  }

  async #spawn(cmd, args) {
    return new Promise((resolve) => {
      const proc = childProcess.spawn(cmd, args, { env: this.#baseEnv });
      const chunks = [];

      proc.stdout?.on("data", (chunk) => chunks.push(chunk));
      proc.stderr?.on("data", (chunk) => chunks.push(chunk));

      proc.on("error", (err) => {
        resolve({ success: false, exitCode: 127, output: Buffer.concat(chunks).toString() + `\n${err.message}` });
      });

      proc.on("close", (exitCode) => {
        resolve({ success: exitCode === 0, exitCode: exitCode ?? 0, output: Buffer.concat(chunks).toString() });
      });
    });
  }
}

const cli = new OpenClawCLI();

class GatewayManager {
  #process = null;
  #state = "stopped";
  #startPromise = null;

  get isRunning() { return this.#state === "running" && this.#process !== null; }
  get state() { return this.#state; }

  async start() {
    if (!isConfigured()) return { ok: false, error: "OpenClaw not configured" };
    if (this.#state === "running") return { ok: true };
    if (this.#state === "starting") return this.#startPromise;

    this.#state = "starting";
    this.#startPromise = this.#doStart();

    try {
      await this.#startPromise;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      this.#startPromise = null;
    }
  }

  async #doStart() {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    try {
      const checkProxies = await cli.exec("config", "get", "gateway.trustedProxies");
      const hasProxies = checkProxies.success && checkProxies.output?.trim() && checkProxies.output.trim() !== "undefined";
      if (!hasProxies) {
        console.log("[gateway] Setting trustedProxies for Akash proxy support...");
        await cli.exec("config", "set", "gateway.trustedProxies", JSON.stringify(["127.0.0.1", "100.64.0.0/10", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]));
      }
      await cli.exec("config", "set", "gateway.controlUi.allowInsecureAuth", "true");
    } catch (err) {
      console.warn("[gateway] Failed to check/set trustedProxies:", err.message);
    }

    this.#process = childProcess.spawn(OPENCLAW_NODE, [
      OPENCLAW_ENTRY, "gateway", "run",
      "--bind", "loopback",
      "--port", String(INTERNAL_GATEWAY_PORT),
      "--auth", "token",
      "--token", GATEWAY_TOKEN,
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        HOME: path.dirname(STATE_DIR),
        OPENCLAW_STATE_DIR: STATE_DIR,
        OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
        OPENCLAW_CONFIG_PATH: configPath(),
      },
    });

    this.#process.on("error", (err) => {
      console.error(`[gateway] spawn error: ${err.message}`);
      this.#cleanup();
    });

    this.#process.on("exit", (code, signal) => {
      console.log(`[gateway] exited (code=${code}, signal=${signal})`);
      this.#cleanup();
    });

    const healthy = await this.#waitForHealth(60000);
    if (!healthy) {
      this.stop();
      throw new Error("Gateway failed to become healthy");
    }

    this.#state = "running";
  }

  async #waitForHealth(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${GATEWAY_TARGET}/openclaw`);
        if (res.ok || res.status < 500) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  async stop() {
    if (!this.#process) return { ok: true };

    this.#state = "stopping";
    const proc = this.#process;

    proc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));

    if (!proc.killed) {
      proc.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 200));
    }

    this.#cleanup();
    return { ok: true };
  }

  #cleanup() {
    this.#process = null;
    this.#state = "stopped";
  }

  async restart() {
    await this.stop();
    return this.start();
  }

  async ensure() {
    if (this.isRunning) return { ok: true };
    return this.start();
  }
}

const gateway = new GatewayManager();

// Express app
const app = express();
app.disable("x-powered-by");

// Redirect HTTP to HTTPS in production (when behind a proxy)
app.use((req, res, next) => {
  if (req.headers["x-forwarded-proto"] === "http") {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use("/get-started/import", express.raw({ type: "application/gzip", limit: "100mb" }));

// Auth middleware
function requireAuth(req, res, next) {
  if (!SETUP_PASSWORD) {
    return res.status(500).json({ error: "SETUP_PASSWORD not set in deploy.yaml" });
  }

  const token = getSessionToken(req);
  if (validateSession(token)) {
    return next();
  }

  return res.status(401).json({ error: "Not authenticated" });
}

// Login endpoint
app.post("/get-started/api/login", (req, res) => {
  if (!SETUP_PASSWORD) {
    return res.status(500).json({ error: "SETUP_PASSWORD not set in deploy.yaml" });
  }

  const { password } = req.body || {};
  if (password !== SETUP_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = createSession();
  res.cookie("session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE,
  });
  res.json({ ok: true, token });
});

// Logout endpoint
app.post("/get-started/api/logout", (req, res) => {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
  res.clearCookie("session");
  res.json({ ok: true });
});

// Check auth status
app.get("/get-started/api/auth", (req, res) => {
  const token = getSessionToken(req);
  const authenticated = validateSession(token);
  res.json({ authenticated, needsPassword: !!SETUP_PASSWORD });
});

// Setup API
app.get("/get-started/api/status", requireAuth, async (_, res) => {
  const versionResult = await cli.exec("--version");
  res.json({
    configured: isConfigured(),
    gatewayState: gateway.state,
    openclawVersion: versionResult.output.trim(),
    gatewayToken: isConfigured() ? GATEWAY_TOKEN : null,
  });
});

app.post("/get-started/api/run", requireAuth, async (req, res) => {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const { authChoice, authSecret, customBaseUrl, customModel, telegramToken, discordToken, slackBotToken, slackAppToken } = req.body || {};

    // Akash ML uses skip auth (we configure it manually after onboard)
    // Other custom endpoints use openai-api-key
    const isAkashML = authChoice === "akashml-api";
    const isCustomEndpoint = authChoice === "custom-openai";
    const effectiveAuthChoice = isAkashML ? "skip" : (isCustomEndpoint ? "openai-api-key" : authChoice);

    let output = "";
    const alreadyConfigured = isConfigured();

    // Skip onboard if config already exists (e.g. retry after partial failure)
    if (!alreadyConfigured) {
      const onboardArgs = [
        "--non-interactive", "--accept-risk", "--json",
        "--no-install-daemon", "--skip-health",
        "--workspace", WORKSPACE_DIR,
        "--gateway-bind", "loopback",
        "--gateway-port", String(INTERNAL_GATEWAY_PORT),
        "--gateway-auth", "token",
        "--gateway-token", GATEWAY_TOKEN,
        "--flow", "quickstart",
      ];

      if (effectiveAuthChoice) {
        onboardArgs.push("--auth-choice", effectiveAuthChoice);

        const apiKeyFlags = {
          "openai-api-key": "--openai-api-key",
          "apiKey": "--anthropic-api-key",
          "openrouter-api-key": "--openrouter-api-key",
          "moonshot-api-key": "--moonshot-api-key",
          "gemini-api-key": "--gemini-api-key",
        };

        if (apiKeyFlags[effectiveAuthChoice] && authSecret?.trim()) {
          onboardArgs.push(apiKeyFlags[effectiveAuthChoice], authSecret.trim());
        } else if (isCustomEndpoint) {
          // Custom endpoint might not need an API key, use a placeholder
          onboardArgs.push("--openai-api-key", authSecret?.trim() || "sk-no-key-required");
        }
      }

      const result = await cli.exec("onboard", ...onboardArgs);
      output = result.output;

      if (!result.success || !isConfigured()) {
        res.json({ ok: false, output });
        return;
      }
    } else {
      output += "Config exists, re-applying provider and channel settings...\n";
    }

    {
      // Configure gateway settings
      await cli.exec("config", "set", "gateway.auth.mode", "token");
      await cli.exec("config", "set", "gateway.auth.token", GATEWAY_TOKEN);
      await cli.exec("config", "set", "gateway.bind", "loopback");
      await cli.exec("config", "set", "gateway.port", String(INTERNAL_GATEWAY_PORT));

      // Trust Akash's internal proxies (loopback, CGNAT range, and private networks).
      // This allows the gateway to properly detect browser connections as local clients behind the proxy.
      await cli.exec("config", "set", "gateway.trustedProxies", JSON.stringify(["127.0.0.1", "100.64.0.0/10", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]));
      // Allow insecure auth for Control UI behind Akash's HTTPS proxy.
      await cli.exec("config", "set", "gateway.controlUi.allowInsecureAuth", "true");

      // Configure browser tool to use local Chromium (installed in the Docker image)
      await cli.exec("config", "set", "--json", "browser", JSON.stringify({
        enabled: true,
        headless: true,
        noSandbox: true,
        executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
      }));

      // Configure Akash ML as a custom provider
      if (authChoice === "akashml-api" && customBaseUrl?.trim()) {
        const akashBaseUrl = customBaseUrl.trim();
        const akashApiKey = authSecret?.trim() || "";

        // Auto-discover models from Akash ML API
        let models = await discoverAkashMLModels(akashBaseUrl, akashApiKey);

        // If discovery fails and user provided a model, use that as fallback
        if (models.length === 0 && customModel?.trim()) {
          models = [{
            id: customModel.trim(),
            name: customModel.trim().split("/").pop() || customModel.trim(),
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          }];
        }

        if (models.length === 0) {
          output += "\n[akashml] Warning: No models discovered and none specified\n";
        } else {
          const providerConfig = {
            baseUrl: akashBaseUrl,
            apiKey: akashApiKey,
            api: "openai-completions",
            models,
          };
          await cli.exec("config", "set", "--json", "models.providers.akashml", JSON.stringify(providerConfig));

          // Use specified model, or prefer DeepSeek-V3.1 if available, otherwise first discovered
          let primaryModelId = customModel?.trim();
          if (!primaryModelId) {
            const preferredModel = models.find(m => m.id.includes("DeepSeek-V3.1"));
            primaryModelId = preferredModel?.id || models[0].id;
          }
          const modelKey = `akashml/${primaryModelId}`;
          await cli.exec("config", "set", "agents.defaults.model.primary", modelKey);

          // Add all discovered models to the catalog
          const modelsConfig = {};
          for (const model of models) {
            modelsConfig[`akashml/${model.id}`] = {};
          }
          await cli.exec("config", "set", "--json", "agents.defaults.models", JSON.stringify(modelsConfig));

          output += `\n[akashml] ${akashBaseUrl}\n`;
          output += `[akashml] Discovered ${models.length} model(s): ${models.map(m => m.name).join(", ")}\n`;
          output += `[akashml] Primary model: ${primaryModelId}\n`;

          // Write auth profile for the akashml provider
          const authProfileDir = path.join(STATE_DIR, "agents", "main", "agent");
          const authProfilePath = path.join(authProfileDir, "auth-profiles.json");
          fs.mkdirSync(authProfileDir, { recursive: true });

          let authStore = { version: 1, profiles: {} };
          try {
            const existing = fs.readFileSync(authProfilePath, "utf8");
            authStore = JSON.parse(existing);
          } catch {}

          authStore.profiles["akashml:default"] = {
            type: "api_key",
            provider: "akashml",
            key: akashApiKey,
          };
          // Set akashml as the preferred auth order
          authStore.order = authStore.order || {};
          authStore.order.akashml = ["akashml:default"];
          fs.writeFileSync(authProfilePath, JSON.stringify(authStore, null, 2), { encoding: "utf8", mode: 0o600 });
        }
      }
      // Configure other custom OpenAI-compatible endpoints
      else if (authChoice === "custom-openai" && customBaseUrl?.trim()) {
        await cli.exec("config", "set", "llm.openai.baseUrl", customBaseUrl.trim());
        output += `\n[custom endpoint] ${customBaseUrl.trim()}\n`;

        if (customModel?.trim()) {
          await cli.exec("config", "set", "llm.openai.model", customModel.trim());
          await cli.exec("config", "set", "llm.defaultModel", `openai/${customModel.trim()}`);
          output += `[custom model] ${customModel.trim()} (set as default)\n`;
        }
      }

      // Configure messaging channels if provided
      // Note: both channels.<name> AND plugins.entries.<name>.enabled must be set,
      // because OpenClaw's plugin auto-discovery registers channels with enabled:false
      // and then skips auto-enabling anything explicitly set to false.
      if (telegramToken?.trim()) {
        const cfg = JSON.stringify({ enabled: true, dmPolicy: "pairing", botToken: telegramToken.trim(), groupPolicy: "allowlist" });
        await cli.exec("config", "set", "--json", "channels.telegram", cfg);
        await cli.exec("config", "set", "--json", "plugins.entries.telegram", JSON.stringify({ enabled: true }));
        output += "\n[telegram] configured\n";
      }

      if (discordToken?.trim()) {
        const cfg = JSON.stringify({ enabled: true, token: discordToken.trim(), groupPolicy: "allowlist", dm: { policy: "pairing" } });
        await cli.exec("config", "set", "--json", "channels.discord", cfg);
        await cli.exec("config", "set", "--json", "plugins.entries.discord", JSON.stringify({ enabled: true }));
        output += "\n[discord] configured\n";
      }

      if (slackBotToken?.trim() || slackAppToken?.trim()) {
        const cfg = JSON.stringify({ enabled: true, botToken: slackBotToken?.trim(), appToken: slackAppToken?.trim() });
        await cli.exec("config", "set", "--json", "channels.slack", cfg);
        await cli.exec("config", "set", "--json", "plugins.entries.slack", JSON.stringify({ enabled: true }));
        output += "\n[slack] configured\n";
      }

      await gateway.restart();
    }

    res.json({ ok: true, output });
  } catch (err) {
    res.status(500).json({ ok: false, output: String(err) });
  }
});

app.post("/get-started/api/reset", requireAuth, async (_, res) => {
  try {
    fs.rmSync(configPath(), { force: true });
    res.json({ ok: true, message: "Config deleted. You can run setup again." });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Config read/write endpoints
app.get("/get-started/api/config", requireAuth, async (_, res) => {
  try {
    if (!isConfigured()) {
      return res.status(404).json({ ok: false, error: "Not configured" });
    }
    const raw = fs.readFileSync(configPath(), "utf8");
    const config = JSON.parse(raw);
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/get-started/api/config", requireAuth, async (req, res) => {
  try {
    const { config, restartGateway } = req.body || {};
    if (!config || typeof config !== "object") {
      return res.status(400).json({ ok: false, error: "Config must be a non-null object" });
    }
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf8");
    let gatewayRestarted = false;
    if (restartGateway && gateway.isRunning) {
      await gateway.restart();
      gatewayRestarted = true;
    }
    res.json({ ok: true, gatewayRestarted });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/get-started/api/pairing/approve", requireAuth, async (req, res) => {
  const { channel, code } = req.body || {};
  if (!channel || !code) return res.status(400).json({ ok: false, error: "Missing channel or code" });
  const result = await cli.exec("pairing", "approve", channel, code);
  res.json({ ok: result.success, output: result.output });
});

app.post("/get-started/api/discover-models", requireAuth, async (req, res) => {
  const { baseUrl, apiKey } = req.body || {};
  if (!baseUrl?.trim()) {
    return res.status(400).json({ ok: false, error: "Base URL is required" });
  }
  const models = await discoverAkashMLModels(baseUrl.trim(), apiKey?.trim() || "");
  res.json({ ok: true, models });
});

// Skills management via clawhub CLI
// Skills are installed to STATE_DIR/skills using --workdir
const SKILLS_WORKDIR = STATE_DIR;

async function runClawhub(args) {
  const fullArgs = [...args, "--workdir", SKILLS_WORKDIR, "--no-input"];
  return cli.execBinary("clawhub", fullArgs);
}

// Console command registry with categories
const consoleCommands = {
  // Gateway lifecycle
  "gw:start": {
    label: "Start Gateway",
    category: "gateway",
    run: async () => {
      const result = await gateway.start();
      return { ok: result.ok, output: result.ok ? `Gateway started (state: ${gateway.state})\n` : `Failed: ${result.error}\n` };
    },
  },
  "gw:stop": {
    label: "Stop Gateway",
    category: "gateway",
    run: async () => {
      await gateway.stop();
      return { ok: true, output: `Gateway stopped (state: ${gateway.state})\n` };
    },
  },
  "gw:restart": {
    label: "Restart Gateway",
    category: "gateway",
    run: async () => {
      const result = await gateway.restart();
      return { ok: result.ok, output: result.ok ? `Gateway restarted (state: ${gateway.state})\n` : `Failed: ${result.error}\n` };
    },
  },

  // OpenClaw diagnostics
  "diag:status": {
    label: "Status",
    category: "diagnostics",
    run: async () => {
      const result = await cli.exec("status");
      return { ok: result.success, output: result.output };
    },
  },
  "diag:doctor": {
    label: "Doctor",
    category: "diagnostics",
    run: async () => {
      const result = await cli.exec("doctor");
      return { ok: result.success, output: result.output };
    },
  },
  // System info
  "sys:brew": {
    label: "Homebrew Version",
    category: "system",
    run: async () => {
      const result = await cli.execBinary("brew", ["--version"]);
      return { ok: result.success, output: result.output };
    },
  },
  "sys:node": {
    label: "Node Version",
    category: "system",
    run: async () => {
      const result = await cli.execBinary("node", ["--version"]);
      return { ok: result.success, output: `Node.js ${result.output}` };
    },
  },
  "sys:disk-usage": {
    label: "Disk Usage",
    category: "system",
    run: async () => {
      const result = await cli.execBinary("du", ["-sh", DATA_DIR]);
      return { ok: result.success, output: result.output };
    },
  },
};

app.get("/get-started/api/console/commands", requireAuth, (_, res) => {
  const commands = Object.entries(consoleCommands).map(([id, cmd]) => ({
    id,
    label: cmd.label,
    category: cmd.category,
    needsArg: cmd.needsArg || null,
  }));
  res.json({ commands });
});

app.post("/get-started/api/console", requireAuth, async (req, res) => {
  const { cmd, arg } = req.body || {};

  const command = consoleCommands[cmd];
  if (!command) {
    return res.status(400).json({ ok: false, error: `Unknown command: ${cmd}` });
  }

  try {
    const result = await command.run(arg);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, output: `Error: ${err.message}` });
  }
});

// Skills API endpoints
app.get("/get-started/api/skills", requireAuth, async (_, res) => {
  const result = await runClawhub(["list"]);
  res.json({ ok: result.success, output: result.output });
});

app.post("/get-started/api/skills/search", requireAuth, async (req, res) => {
  const { query } = req.body || {};
  const args = ["search"];
  if (query?.trim()) args.push(query.trim());
  const result = await runClawhub(args);
  res.json({ ok: result.success, output: result.output });
});

app.post("/get-started/api/skills/install", requireAuth, async (req, res) => {
  const { slug } = req.body || {};
  if (!slug?.trim()) {
    return res.status(400).json({ ok: false, error: "Skill slug is required" });
  }
  const result = await runClawhub(["install", slug.trim()]);
  res.json({ ok: result.success, output: result.output });
});

app.post("/get-started/api/skills/update", requireAuth, async (req, res) => {
  const { slug } = req.body || {};
  const args = ["update"];
  if (slug?.trim()) {
    args.push(slug.trim());
  } else {
    args.push("--all");
  }
  const result = await runClawhub(args);
  res.json({ ok: result.success, output: result.output });
});

// Backup export
app.get("/get-started/export", requireAuth, async (_, res) => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  res.setHeader("content-type", "application/gzip");
  res.setHeader("content-disposition", `attachment; filename="openclaw-backup-${Date.now()}.tar.gz"`);

  const stream = tar.c({ gzip: true, cwd: DATA_DIR }, [
    path.relative(DATA_DIR, STATE_DIR),
    path.relative(DATA_DIR, WORKSPACE_DIR),
  ]);
  stream.on("error", err => { if (!res.headersSent) res.status(500); res.end(String(err)); });
  stream.pipe(res);
});

// Backup import
app.post("/get-started/import", requireAuth, async (req, res) => {
  try {
    if (!STATE_DIR.startsWith(DATA_DIR) || !WORKSPACE_DIR.startsWith(DATA_DIR)) {
      return res.status(400).json({ ok: false, error: "Import only works when data dirs are under /data" });
    }

    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buf || !buf.length) return res.status(400).json({ ok: false, error: "Empty or invalid file" });

    // Stop gateway before importing
    await gateway.stop();

    const tmpPath = path.join(os.tmpdir(), `import-${Date.now()}.tar.gz`);
    fs.writeFileSync(tmpPath, buf);
    await tar.x({ file: tmpPath, cwd: DATA_DIR, gzip: true });
    fs.rmSync(tmpPath, { force: true });

    // Re-apply current gateway token to imported config (so UI token matches)
    if (isConfigured()) {
      await cli.exec("config", "set", "gateway.auth.token", GATEWAY_TOKEN);
      // Also update the token file
      fs.writeFileSync(path.join(STATE_DIR, "gateway.token"), GATEWAY_TOKEN, { mode: 0o600 });
      await gateway.start();
    }
    res.json({ ok: true, message: "Backup imported successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Serve setup UI static files
const uiDistPath = path.join(__dirname, "..", "ui", "dist");
app.use("/get-started", express.static(uiDistPath));
app.get("/get-started", (_, res) => {
  res.sendFile(path.join(uiDistPath, "index.html"));
});

// Proxy to gateway
const proxy = httpProxy.createProxyServer({ target: GATEWAY_TARGET, ws: true, xfwd: true });
proxy.on("error", err => console.error("[proxy]", err));

// Public paths that don't require session auth (webhooks use their own signature validation)
const PUBLIC_PATHS = [
  "/slack/events",      // Slack webhook - uses Slack signing secret
  "/line/webhook",      // Line webhook - uses Line signature validation
  "/avatar/",           // Public avatar images
  "/__openclaw__/a2ui/", // Canvas UI static files
];

function isPublicPath(path) {
  return PUBLIC_PATHS.some(p => path.startsWith(p));
}

app.use(async (req, res) => {
  // Redirect to setup if not configured
  if (!isConfigured() && !req.path.startsWith("/get-started")) {
    return res.redirect("/get-started");
  }

  // Require session auth for proxied requests (except public paths)
  if (!req.path.startsWith("/get-started") && !isPublicPath(req.path)) {
    const token = getSessionToken(req);
    if (!validateSession(token)) {
      return res.redirect("/get-started");
    }
  }

  // Ensure gateway is running before proxying
  if (isConfigured()) {
    const result = await gateway.ensure();
    if (!result.ok) {
      return res.status(503).send(`Gateway not ready: ${result.error}`);
    }
  }

  proxy.web(req, res);
});

// Start server
const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[openclaw-akash] Port: ${PORT}`);
  console.log(`[openclaw-akash] Data: ${DATA_DIR}`);
  console.log(`[openclaw-akash] State: ${STATE_DIR}`);
  console.log(`[openclaw-akash] Workspace: ${WORKSPACE_DIR}`);
  if (!SETUP_PASSWORD) console.warn("[openclaw-akash] WARNING: SETUP_PASSWORD not set");

  // Auto-start gateway if already configured
  if (isConfigured()) {
    console.log("[openclaw-akash] Config found, starting gateway...");
    const result = await gateway.start();
    if (result.ok) {
      console.log("[openclaw-akash] Gateway started successfully");
    } else {
      console.error("[openclaw-akash] Gateway failed to start:", result.error);
    }
  }
});

server.on("upgrade", async (req, socket, head) => {
  // Require session auth for WebSocket
  const token = getSessionToken(req);
  if (!validateSession(token)) return socket.destroy();

  if (!isConfigured()) return socket.destroy();

  const result = await gateway.ensure();
  if (!result.ok) return socket.destroy();

  proxy.ws(req, socket, head);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[openclaw-akash] Shutting down...");
  await gateway.stop();
  process.exit(0);
});
