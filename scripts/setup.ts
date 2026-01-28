/**
 * Setup script for tanstack-convex-starter
 *
 * Sets up Convex (cloud or local) and configures environment variables.
 *
 * Usage:
 *   bun run setup          # interactive setup (cloud or local)
 *   bun run setup --local  # use local Convex backend
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const ENV_FILE = ".env.local";

function readEnvFile(): Map<string, string> {
  const env = new Map<string, string>();
  if (!existsSync(ENV_FILE)) {
    return env;
  }

  const content = readFileSync(ENV_FILE, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    env.set(key, value);
  }
  return env;
}

function writeEnvFile(env: Map<string, string>): void {
  const lines: Array<string> = [];
  for (const [key, value] of env) {
    lines.push(`${key}=${value}`);
  }
  writeFileSync(ENV_FILE, lines.join("\n") + "\n");
}

function getProjectName(deployment: string): string | null {
  // Format: "dev:project-name" or "dev:project-name # team: x, project: y"
  // Strip any trailing comment
  const cleanDeployment = deployment.split("#")[0].trim();
  const parts = cleanDeployment.split(":");
  return parts.length === 2 ? parts[1] : null;
}

function generateSecret(): string {
  return randomBytes(32).toString("base64");
}

function convexEnvSet(name: string, value: string): void {
  execSync(`bunx convex env set ${name} "${value}"`, { stdio: "inherit" });
}

async function main() {
  const args = process.argv.slice(2);
  const useLocal = args.includes("--local");

  console.log("🚀 Setting up tanstack-convex-starter\n");

  // Step 1: Run convex dev --once to create/connect project
  console.log("📦 Configuring Convex...\n");

  const convexArgs = ["convex", "dev", "--once"];
  if (useLocal) {
    convexArgs.push("--local");
    console.log("   Using local Convex backend\n");
  }

  const result = spawnSync("bunx", convexArgs, {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    console.error("\n❌ Convex setup failed");
    process.exit(1);
  }

  // Step 2: Read the generated .env.local
  const env = readEnvFile();

  const deployment = env.get("CONVEX_DEPLOYMENT");
  if (!deployment) {
    console.error("\n❌ CONVEX_DEPLOYMENT not found in .env.local");
    console.error("   Something went wrong with Convex setup.");
    process.exit(1);
  }

  const projectName = getProjectName(deployment);
  if (!projectName) {
    console.error("\n❌ Invalid CONVEX_DEPLOYMENT format:", deployment);
    process.exit(1);
  }

  console.log(`\n✅ Connected to project: ${projectName}`);

  // Step 3: Set VITE_CONVEX_SITE_URL in .env.local if not present
  if (!env.has("VITE_CONVEX_SITE_URL")) {
    const siteUrl = `https://${projectName}.convex.site`;
    env.set("VITE_CONVEX_SITE_URL", siteUrl);
    writeEnvFile(env);
    console.log(`✅ Added VITE_CONVEX_SITE_URL to ${ENV_FILE}`);
  }

  // Step 4: Set Convex environment variables using the CLI
  console.log("\n🔐 Setting Convex environment variables...\n");

  const siteUrl = "http://localhost:3000";
  const secret = generateSecret();

  convexEnvSet("SITE_URL", siteUrl);
  convexEnvSet("BETTER_AUTH_SECRET", secret);

  console.log("\n" + "=".repeat(50));
  console.log("✨ Setup complete!");
  console.log("=".repeat(50));
  console.log("\nNext steps:");
  if (useLocal) {
    console.log("  1. Run `bunx convex dev --local` in one terminal");
    console.log("  2. Run `bun run dev` in another terminal");
  } else {
    console.log("  Run `bun run dev` to start the app");
  }
  console.log("");
}

main().catch(console.error);
