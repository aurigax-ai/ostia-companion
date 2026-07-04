# Pine Companion

The mobile companion for **Pine** (a desktop terminal/agent workspace). It lets you monitor and drive your Pine workspace — watch agents, answer their prompts, run commands/skills, and mirror a live terminal — **from your phone**, on your own network.

## Status: contract-first (build against `NETWORK-CONTRACT.md`)

The Pine **desktop** side of this (its LAN "control gateway", Phase C) is being built in parallel. **`NETWORK-CONTRACT.md` is the agreed interface** — the source of truth both sides implement to. Build the mobile client against it; if the desktop implementation diverges, the contract is what we reconcile to.

You do **not** need access to the Pine desktop repo to build this. Everything the client needs is in `NETWORK-CONTRACT.md`.

## What this app is (and isn't)

- **Is:** a thin, presence-aware **remote client** of Pine's command layer + a live terminal mirror.
- **Isn't:** a cloud service. There is **no hosted relay and no login/accounts** (decided). Reach is **LAN by default**; for off-network use the user brings their **own Tailscale** (the desktop's LAN server is simply reachable over the tailnet). Pairing is a **QR scan from a menu** in the desktop app.

## Recommended stack

- **PWA (React + xterm.js)** for the MVP — installable, no app-store friction, works over LAN/Tailscale. OR **Expo / React Native** if you want native push notifications + a nicer native shell (it can share the same TypeScript protocol types).
- Terminal rendering: **xterm.js** + `@xterm/addon-fit` + a touch key-bar (Esc/Tab/Ctrl/arrows).
- Transport: **WebSocket** (control + pty stream) to the desktop's LAN gateway.

## Start here

1. Read `NETWORK-CONTRACT.md` end to end.
2. Implement: pairing → authenticated WS connect → the control JSON-RPC calls → the pty binary stream → reconnection.
3. The contract lists **open questions** at the end — flag any that block you.
