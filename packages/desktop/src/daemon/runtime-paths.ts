import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { app } from "electron";
import {
  createNodeEntrypointInvocation as createSharedNodeEntrypointInvocation,
  type NodeEntrypointArgvMode,
  type NodeEntrypointInvocation,
  type NodeEntrypointSpec,
} from "./node-entrypoint-launcher.js";
import {
  assertPathExists,
  findPackageRootFromResolvedPath,
  resolvePackagedAsarPath,
  type PackageInfo,
} from "./package-paths.js";

const SERVER_PACKAGE_NAME = "@getpaseo/server";

const esmRequire = createRequire(__filename);

function resolveServerPackageInfo(): PackageInfo {
  const serverExportPath = esmRequire.resolve(SERVER_PACKAGE_NAME);
  return findPackageRootFromResolvedPath({
    resolvedPath: serverExportPath,
    packageName: SERVER_PACKAGE_NAME,
  });
}

export function resolvePackagedNodeRuntimePath(): string | null {
  if (!app.isPackaged) return null;

  const candidate = path.join(
    process.resourcesPath,
    process.platform === "win32" ? "node.exe" : "node",
  );
  return existsSync(candidate) ? candidate : null;
}

export function resolvePackagedNodeEntrypointRoot(): string {
  if (app.isPackaged) {
    const unpackedRoot = path.join(process.resourcesPath, "app.asar.unpacked");
    if (existsSync(unpackedRoot)) return unpackedRoot;
  }

  return resolvePackagedAsarPath();
}

export function resolvePackagedNodeEntrypointRunnerPath(): string {
  const unpackedPath = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "dist",
    "daemon",
    "node-entrypoint-runner.js",
  );
  if (existsSync(unpackedPath)) return unpackedPath;

  return path.join(resolvePackagedAsarPath(), "dist", "daemon", "node-entrypoint-runner.js");
}

export function resolveDaemonRunnerEntrypoint(): NodeEntrypointSpec {
  if (app.isPackaged) {
    return {
      entryPath: assertPathExists({
        label: "Bundled daemon runner",
        filePath: path.join(
          resolvePackagedNodeEntrypointRoot(),
          "node_modules",
          "@getpaseo",
          "server",
          "dist",
          "scripts",
          "supervisor-entrypoint.js",
        ),
      }),
      execArgv: [],
    };
  }

  const serverPackage = resolveServerPackageInfo();
  const distRunner = path.join(serverPackage.root, "dist", "scripts", "supervisor-entrypoint.js");
  if (existsSync(distRunner)) {
    return {
      entryPath: distRunner,
      execArgv: [],
    };
  }

  return {
    entryPath: assertPathExists({
      label: "Daemon runner source",
      filePath: path.join(serverPackage.root, "scripts", "supervisor-entrypoint.ts"),
    }),
    execArgv: ["--import", "tsx"],
  };
}

export function resolveNodeExecPath(): string {
  const bundledNode = resolvePackagedNodeRuntimePath();
  if (bundledNode) return bundledNode;

  if (app.isPackaged && process.platform === "darwin") {
    const marker = ".app/Contents/MacOS/";
    const markerIndex = process.execPath.indexOf(marker);
    if (markerIndex !== -1) {
      const bundleRoot = process.execPath.substring(0, markerIndex + ".app".length);
      const name = path.basename(process.execPath);
      const helperPath = path.posix.join(
        bundleRoot,
        "Contents",
        "Frameworks",
        `${name} Helper.app`,
        "Contents",
        "MacOS",
        `${name} Helper`,
      );
      if (existsSync(helperPath)) {
        return helperPath;
      }
    }
  }
  return process.execPath;
}

export function createNodeEntrypointInvocation(input: {
  entrypoint: NodeEntrypointSpec;
  argvMode: NodeEntrypointArgvMode;
  args: string[];
  baseEnv: NodeJS.ProcessEnv;
}): NodeEntrypointInvocation {
  return createSharedNodeEntrypointInvocation({
    execPath: resolveNodeExecPath(),
    isPackaged: app.isPackaged,
    packagedRunnerPath: app.isPackaged
      ? assertPathExists({
          label: "Bundled node entrypoint runner",
          filePath: resolvePackagedNodeEntrypointRunnerPath(),
        })
      : null,
    entrypoint: input.entrypoint,
    argvMode: input.argvMode,
    args: input.args,
    baseEnv: input.baseEnv,
  });
}
