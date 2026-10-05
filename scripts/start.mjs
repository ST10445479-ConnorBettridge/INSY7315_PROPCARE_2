import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, ".local/settings.json");
if (!existsSync(configPath) && !process.env.ConnectionStrings__PropCare) {
  console.error(
    "Configure .local/settings.json or ConnectionStrings__PropCare and Jwt__Key. See README.md.",
  );
  process.exit(1);
}
const pg = resolve(root, ".local/postgresql/pgsql/bin/pg_ctl.exe");
if (
  process.platform === "win32" &&
  existsSync(pg) &&
  existsSync(resolve(root, ".local/pgdata/PG_VERSION"))
) {
  const status = spawnSync(
    pg,
    ["-D", resolve(root, ".local/pgdata"), "status"],
    { stdio: "ignore" },
  );
  if (status.status !== 0) {
    const result = spawnSync(
      pg,
      [
        "-D",
        resolve(root, ".local/pgdata"),
        "-l",
        resolve(root, ".local/postgres.log"),
        "-w",
        "start",
      ],
      { stdio: "inherit", windowsHide: true },
    );
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
if (!existsSync(resolve(root, "backend/PropCare.Api/wwwroot/index.html"))) {
  console.error("Build the React app first: npm run build --prefix frontend");
  process.exit(1);
}
const child = spawn(
  "dotnet",
  [
    "run",
    "--project",
    "backend/PropCare.Api",
    "--no-launch-profile",
    "--urls",
    "http://127.0.0.1:5124",
  ],
  {
    cwd: root,
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: "Development" },
    stdio: "inherit",
    windowsHide: true,
  },
);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code || 0));
