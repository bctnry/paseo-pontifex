const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Electron's embedded Node lags the Node release line. The daemon and CLI run
// as external Node processes, so ship a patched Node binary next to the app
// instead of inheriting Electron's runtime. Keep this version aligned with
// .tool-versions; the security release that bumped it is
// https://nodejs.org/en/blog/vulnerability/october-2026-security-releases.
const NODE_VERSION = "24.22.1";

const TARGETS = {
  "linux-x64": {
    archive: "tar.xz",
    sha256: "6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6",
  },
  "linux-arm64": {
    archive: "tar.xz",
    sha256: "dbabf7a1cbf947e6059ffad2c27b80041db97dea1e553b62afdee7f13fca336e",
  },
  "darwin-x64": {
    archive: "tar.xz",
    sha256: "65e450f90a6eaacd5000f611861c4ce65fadc87f813795dc4ed0c0e5f2fca2d4",
  },
  "darwin-arm64": {
    archive: "tar.xz",
    sha256: "654ba79de6155647e22321932b45f2a1ccb705976cc337c9b8e278beb085a628",
  },
  "win32-x64": {
    archive: "zip",
    sha256: "d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5",
  },
  "win32-arm64": {
    archive: "zip",
    sha256: "a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171",
  },
};

function nodeBinaryName(platform) {
  return platform === "win32" ? "node.exe" : "node";
}

function archiveName(platform, arch) {
  return `node-v${NODE_VERSION}-${platform}-${arch}.${TARGETS[`${platform}-${arch}`].archive}`;
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, bytes);
}

function verifySha256(filePath, expected) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  if (actual !== expected) {
    throw new Error(`Node runtime checksum mismatch: expected ${expected}, got ${actual}`);
  }
}

function extractArchive(archivePath, destination, platform) {
  const result = spawnSync("tar", ["-xf", archivePath, "-C", destination], {
    stdio: "inherit",
  });
  if (result.status === 0) return;

  if (platform === "win32") {
    const fallback = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destination}' -Force`,
      ],
      { stdio: "inherit" },
    );
    if (fallback.status === 0) return;
  }

  throw new Error(`Failed to extract ${archivePath}`);
}

async function installNodeRuntime({ platform, arch, resourcesDir }) {
  const target = TARGETS[`${platform}-${arch}`];
  const destination = path.join(resourcesDir, nodeBinaryName(platform));

  if (!target) {
    console.warn(
      `Bundled Node runtime is not available for ${platform}-${arch}; using Electron's Node.`,
    );
    return;
  }

  if (process.env.PASEO_NODE_RUNTIME && platform === process.platform && arch === process.arch) {
    fs.copyFileSync(process.env.PASEO_NODE_RUNTIME, destination);
    fs.chmodSync(destination, 0o755);
    console.log(`Bundled Node runtime from PASEO_NODE_RUNTIME (${platform}-${arch})`);
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-node-runtime-"));
  const archivePath = path.join(tempDir, archiveName(platform, arch));
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${path.basename(archivePath)}`;

  try {
    console.log(`Downloading Node ${NODE_VERSION} for ${platform}-${arch}`);
    await download(url, archivePath);
    verifySha256(archivePath, target.sha256);
    extractArchive(archivePath, tempDir, platform);

    const extractedRoot = path.join(tempDir, `node-v${NODE_VERSION}-${platform}-${arch}`);
    const source = path.join(extractedRoot, platform === "win32" ? "node.exe" : "bin/node");
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, 0o755);
    console.log(`Bundled Node ${NODE_VERSION} for ${platform}-${arch}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  NODE_VERSION,
  installNodeRuntime,
};
