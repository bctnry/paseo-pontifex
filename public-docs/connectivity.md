---
title: Connectivity
description: Connect a Paseo client to your daemon through SSH, the relay, or Tailscale.
nav: Connectivity
order: 4
category: Getting started
---

# Connectivity

Your Paseo app connects to the daemon running on your computer or server. Paseo Desktop and the CLI can tunnel through SSH. Mobile clients can connect through the Paseo relay or directly with Tailscale.

This is client-to-daemon transport. If you are looking for the service that starts agents from GitHub, Slack, and Discord events, that is [Hub](/docs/hub).

- [SSH](#ssh)
- [Paseo relay](#paseo-relay)
- [Tailscale](#tailscale)

## SSH

SSH transport connects to an existing daemon through your local OpenSSH client. It does not install, start, or configure Paseo on the remote host.

Before connecting:

1. Start the Paseo daemon on the remote host.
2. Confirm `ssh user@host` works with a key or SSH agent. Paseo uses non-interactive SSH and follows your OpenSSH config.

The CLI accepts an SSH URI as its host:

```bash
paseo --host ssh://user@host ls -a
```

The daemon is expected at `127.0.0.1:6767` on the remote host. The port in the SSH URL is the SSH server port:

```bash
paseo --host ssh://user@host:2222 ls -a
```

Set a different remote daemon port with `daemonPort`:

```bash
paseo --host 'ssh://user@host?daemonPort=7777' ls -a
```

Put `--host` before the command. `paseo daemon status` observes the default local home; use `paseo --host ssh://user@host daemon status` to query a remote daemon. `paseo --host ssh://user@host run --cwd /path/on/remote ...` requires a working directory that exists on the remote host.

In Paseo Desktop, open **Settings → Add host → Remote SSH** and enter the same `ssh://` destination, including `:port` or `?daemonPort=` when those differ from the defaults.

If the remote daemon has a password, enter it in **Daemon password**; it is stored with the host and sent on every connection, the same as a direct connection's password. SSH login itself stays key-based — Paseo never prompts for an SSH password.

## Paseo relay

The relay works without Tailscale, port forwarding, or network configuration. Traffic is end-to-end encrypted.

Relay is disabled until you enable it.

### Enable relay from Paseo Desktop

1. Open **Settings → your host → Pair a device**.
2. Select **Enable relay**.
3. Scan the QR code with Paseo on your phone, or copy the pairing link and paste it into the phone app.

### Enable relay from the CLI

Run:

```bash
paseo daemon pair
```

Confirm when prompted. Paseo prints a QR code and pairing link. Scan the QR code with Paseo on your phone, or choose **Paste pairing link** in the phone app.

### Use a self-hosted relay

The relay is a transport, not a Paseo account service. You can point a host at your own relay instead of the official one.

Run the relay service from [getpaseo/paseo-relay](https://github.com/getpaseo/paseo-relay). The Cloudflare adapter in this repository is legacy and is not the production relay.

A single-node relay needs a reachable host and TLS in front of it. On a VPS with Docker and Caddy:

```bash
git clone https://github.com/getpaseo/paseo-relay.git
cd paseo-relay
docker build -t paseo-relay .
docker run -d --name paseo-relay --restart unless-stopped \
  -p 127.0.0.1:4000:4000 \
  paseo-relay
```

Point `relay.example.com` at the host, then put Caddy in front of the loopback listener:

```caddyfile
relay.example.com {
  reverse_proxy 127.0.0.1:4000
}
```

Caddy terminates TLS and forwards the WebSocket upgrade. Keep port `4000` off the public firewall; expose only `80` and `443`. Check the relay before touching Paseo:

```bash
curl -fsS https://relay.example.com/health
curl -fsS https://relay.example.com/ready
```

Then configure the host:

1. Open **Settings → your host → Pair devices → Relay → Configure**.
2. Select **Custom relay**.
3. Enter the address the daemon uses and the address clients use. If the relay and daemon are on the same machine, the daemon can use `127.0.0.1:4000` without TLS while clients use `relay.example.com:443` with TLS. If they are on different machines, use `relay.example.com:443` for both and enable TLS.
4. Save, enable the relay, then pair the device as usual.

The relay only routes ciphertext and metadata. It does not receive the daemon key or readable agent traffic.

The same settings live in `config.json`:

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

`endpoint` is the address the daemon connects to. `publicEndpoint` is the address written into the pairing offer. `app.baseUrl` is the web app a pairing link opens. It must be reachable from the phone: use your self-hosted web UI, or `https://app.paseo.sh` for the hosted static client. The hosted page does not proxy agent traffic; the daemon and phone still meet at your relay. The relay still sees only encrypted traffic and metadata, as described in [Security](/docs/security).

Switching back to **Paseo relay** restores `relay.paseo.sh:443` and TLS. The official relay remains available as a preset.

## Tailscale

Install [Tailscale](https://tailscale.com/download) on the daemon machine and your phone. Sign in to the same tailnet on both devices.

### 1. Find the daemon machine's Tailscale IP

Run this on the daemon machine:

```bash
tailscale ip -4
```

Copy the address it prints. The example below uses `100.101.102.103`.

### 2. Configure the daemon

Open `~/.paseo/config.json` and set `daemon.listen` to the Tailscale IP:

```json
{
  "$schema": "https://paseo.sh/schemas/paseo.config.v1.json",
  "version": 1,
  "daemon": {
    "listen": "100.101.102.103:6767"
  }
}
```

Keep the other settings already in the file. If it has a `daemon` object, add `listen` inside that object.

To restrict access with a password, see [Password authentication](/docs/configuration#password-authentication).

Restart the daemon:

```bash
paseo daemon restart
```

If Paseo Desktop manages the daemon, use **Settings → your host → Overview → Restart daemon**.

### 3. Connect the phone app

1. Connect Tailscale on your phone.
2. Open Paseo and go to **Settings → Add host → Direct connection**.
3. Enter the Tailscale IP in **Host**.
4. Enter `6767` in **Port**.
5. Leave **Use SSL** off and select **Connect**.

If the host was already paired through the relay, Paseo adds the direct connection to the same host.

## Troubleshooting

- **SSH authentication failed:** Run `ssh user@host` in a terminal and fix the key, agent, host key, or `~/.ssh/config` entry there. Paseo does not prompt for SSH passwords.
- **SSH connects but Paseo is refused:** Run `paseo daemon status` on the remote host. SSH transport does not start the daemon.
- **SSH connects but Paseo reports "Password required":** The remote daemon is password-protected. Remove the SSH connection from the host and add it again, this time entering the daemon password in **Daemon password**.
- **Connection timed out:** Check that Tailscale is connected on both devices and that you used the daemon machine's Tailscale IP.
- **Connection refused:** Run `paseo daemon status` and confirm the daemon is running on the configured IP and port.
- **Config change has no effect:** Run `paseo reload`. `daemon.listen` is a startup setting, so restart when the command reports it.
