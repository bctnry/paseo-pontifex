---
title: 连接
description: 通过 SSH、中继或 Tailscale 把 Paseo 客户端连接到你的 daemon。
nav: 连接
---

# 连接 {#connectivity}

你的 Paseo 应用连接的是运行在你电脑或服务器上的 daemon。Paseo 桌面端和 CLI 可以通过 SSH 隧道连接。移动客户端可以通过 Paseo 中继连接，或者用 Tailscale 直接连接。

这里说的是客户端到 daemon 的传输。如果你要找的是由 GitHub、Slack 和 Discord 事件启动 Agent 的服务，那是 [Hub](/docs/hub)。

- [SSH](#ssh)
- [Paseo 中继](#paseo-relay)
- [Tailscale](#tailscale)

## SSH {#ssh}

SSH 传输通过你本地的 OpenSSH 客户端连接到一个已有的 daemon。它不会在远程主机上安装、启动或配置 Paseo。

连接之前：

1. 在远程主机上启动 Paseo daemon。
2. 确认 `ssh user@host` 可以通过密钥或 SSH agent 登录。Paseo 使用非交互式 SSH，并遵循你的 OpenSSH 配置。

CLI 接受 SSH URI 作为主机：

```bash
paseo --host ssh://user@host ls -a
```

daemon 应位于远程主机的 `127.0.0.1:6767`。SSH URL 中的端口是 SSH 服务器的端口：

```bash
paseo --host ssh://user@host:2222 ls -a
```

用 `daemonPort` 设置不同的远程 daemon 端口：

```bash
paseo --host 'ssh://user@host?daemonPort=7777' ls -a
```

请把 `--host` 放在命令之前。`paseo daemon status` 查看的是默认的本地 home；要查询远程 daemon，请使用 `paseo --host ssh://user@host daemon status`。`paseo --host ssh://user@host run --cwd /path/on/remote ...` 需要一个在远程主机上存在的工作目录。

在 Paseo 桌面端中，打开 **设置 → 添加主机 → 远程 SSH**，输入同样的 `ssh://` 目标地址；如果端口与默认值不同，请带上 `:port` 或 `?daemonPort=`。

如果远程 daemon 设置了密码，请在 **守护进程密码** 中输入；它会随主机一起保存，并在每次连接时发送，与直连的密码一样。SSH 登录本身仍然基于密钥，Paseo 从不提示输入 SSH 密码。

## Paseo 中继 {#paseo-relay}

中继无需 Tailscale、端口转发或网络配置即可工作。流量是端到端加密的。

在你启用之前，中继是关闭的。

### 在 Paseo 桌面端启用中继 {#enable-relay-from-paseo-desktop}

1. 打开 **设置 → 你的主机 → 配对设备**。
2. 选择 **启用中继**。
3. 用手机上的 Paseo 扫描二维码，或者复制配对链接并粘贴到手机应用中。

### 在 CLI 中启用中继 {#enable-relay-from-the-cli}

运行：

```bash
paseo daemon pair
```

在提示时确认。Paseo 会打印二维码和配对链接。用手机上的 Paseo 扫描二维码，或在手机应用中选择 **粘贴配对链接**。

### 使用自托管中继 {#use-a-self-hosted-relay}

中继只是传输层，不是 Paseo 账号服务。你可以让主机连接自己的中继，而不是官方中继。

运行 [getpaseo/paseo-relay](https://github.com/getpaseo/paseo-relay) 中的 relay 服务。本仓库里的 Cloudflare 适配器是旧实现，不是生产用 relay。

单节点 relay 需要一台可访问的主机，并在前面配置 TLS。在装有 Docker 和 Caddy 的 VPS 上：

```bash
git clone https://github.com/getpaseo/paseo-relay.git
cd paseo-relay
docker build -t paseo-relay .
docker run -d --name paseo-relay --restart unless-stopped \
  -p 127.0.0.1:4000:4000 \
  paseo-relay
```

把 `relay.example.com` 指向这台主机，然后用 Caddy 代理回环监听：

```caddyfile
relay.example.com {
  reverse_proxy 127.0.0.1:4000
}
```

Caddy 负责终止 TLS 并转发 WebSocket upgrade。不要把 `4000` 端口暴露到公网防火墙，只开放 `80` 和 `443`。在配置 Paseo 之前先检查 relay：

```bash
curl -fsS https://relay.example.com/health
curl -fsS https://relay.example.com/ready
```

然后配置主机：

1. 打开 **设置 → 你的主机 → 配对设备 → 中继 → 配置**。
2. 选择 **自定义中继**。
3. 填写 daemon 使用的地址和客户端使用的地址。如果 relay 与 daemon 在同一台机器上，daemon 可以使用不带 TLS 的 `127.0.0.1:4000`，客户端则使用带 TLS 的 `relay.example.com:443`。如果它们在不同机器上，两边都使用 `relay.example.com:443` 并启用 TLS。
4. 保存并启用中继，然后照常配对设备。

relay 只转发密文和元数据，不会拿到 daemon 密钥，也看不到可读的 Agent 流量。

同样的设置也存在于 `config.json`：

```json
{
  "daemon": {
    "relay": {
      "enabled": true,
      "endpoint": "relay.example.com:443",
      "publicEndpoint": "relay.example.com:443",
      "useTls": true,
      "publicUseTls": true
    }
  },
  "app": {
    "baseUrl": "https://paseo.example.com"
  }
}
```

`endpoint` 是 daemon 连接的地址，`publicEndpoint` 是写入配对信息的地址。`app.baseUrl` 是配对链接打开的 Web 应用地址，必须能从手机访问：使用你自托管的 Web UI，或使用托管静态客户端 `https://app.paseo.sh`。托管页面不代理 Agent 流量；daemon 和手机仍然在你的 relay 相遇。relay 仍然只能看到加密流量和元数据，详见[安全](/docs/security)。

切回 **Paseo 中继** 会恢复 `relay.paseo.sh:443` 和 TLS。官方中继仍然作为预设保留。

## Tailscale {#tailscale}

在 daemon 所在的机器和你的手机上安装 [Tailscale](https://tailscale.com/download)，并在两台设备上登录同一个 tailnet。

### 1. 找到 daemon 机器的 Tailscale IP {#1-find-the-daemon-machines-tailscale-ip}

在 daemon 机器上运行：

```bash
tailscale ip -4
```

复制它打印出的地址。下面的示例使用 `100.101.102.103`。

### 2. 配置 daemon {#2-configure-the-daemon}

打开 `~/.paseo/config.json`，把 `daemon.listen` 设置为 Tailscale IP：

```json
{
  "$schema": "https://paseo.sh/schemas/paseo.config.v1.json",
  "version": 1,
  "daemon": {
    "listen": "100.101.102.103:6767"
  }
}
```

保留文件中已有的其他设置。如果文件中已有 `daemon` 对象，请把 `listen` 加到该对象中。

如需用密码限制访问，请参见[密码认证](/docs/configuration#password-authentication)。

重启 daemon：

```bash
paseo daemon restart
```

如果 daemon 由 Paseo 桌面端管理，请使用 **设置 → 你的主机 → 概览 → 重启 Daemon**。

### 3. 连接手机应用 {#3-connect-the-phone-app}

1. 在手机上连接 Tailscale。
2. 打开 Paseo，进入 **设置 → 添加主机 → 直接连接**。
3. 在 **Host** 中输入 Tailscale IP。
4. 在 **端口** 中输入 `6767`。
5. 保持 **使用 SSL** 关闭，然后选择 **连接**。

如果该主机已经通过中继配对过，Paseo 会把直连添加到同一个主机上。

## 故障排查 {#troubleshooting}

- **SSH 认证失败**：在终端中运行 `ssh user@host`，在那里修复密钥、agent、主机密钥或 `~/.ssh/config` 条目。Paseo 不会提示输入 SSH 密码。
- **SSH 能连上但 Paseo 被拒绝**：在远程主机上运行 `paseo daemon status`。SSH 传输不会启动 daemon。
- **SSH 能连上但 Paseo 报告 “Password required”**：远程 daemon 受密码保护。从主机中移除这个 SSH 连接并重新添加，这次在 **守护进程密码** 中输入 daemon 密码。
- **连接超时**：检查两台设备上的 Tailscale 是否都已连接，以及你使用的是否是 daemon 机器的 Tailscale IP。
- **连接被拒绝**：运行 `paseo daemon status`，确认 daemon 正在配置的 IP 和端口上运行。
- **配置修改没有生效**：运行 `paseo reload`。`daemon.listen` 是启动时生效的设置，所以当命令提示时请重启。
