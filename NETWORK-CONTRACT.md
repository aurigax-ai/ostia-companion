# Pine Companion — Network Contract (v1, contract-first)

> The desktop↔phone interface. Both the Pine desktop **control gateway** and this **mobile companion** implement to this document. Grounded in Pine's existing local control plane (a per-pane-token-authenticated `pine.sock`); the gateway re-exposes that same command layer over a network transport, plus a live PTY stream.

## 0. Decided constraints (do not violate)

- **LAN-first, bring-your-own-network for WAN.** The desktop runs a local server bound to a **user-selected interface**. For remote use, the user runs their **own Tailscale/VPN** — the same LAN server is reachable over the tailnet. **No hosted relay. No cloud rendezvous. No accounts/login.**
- **Off by default.** The gateway ships disabled; the user explicitly enables it and it shows an always-visible "remote active" indicator.
- **Pairing is a menu action + QR.** No typing credentials.
- **The desktop is the source of truth.** The phone is a remote view/controller; it holds no durable workspace state beyond its device credential + UI prefs.
- **Least privilege.** A paired phone gets a **capability subset**; terminal input and destructive actions are **off by default** and require explicit elevation/confirmation.

## 1. Architecture

```
  ┌─────────────────────────── User's machine ───────────────────────────┐
  │  Pine desktop (Electron)                                              │
  │   • control plane: per-pane tokens, capability broker, command layer  │
  │   • CONTROL GATEWAY (this contract): HTTPS + WebSocket server         │
  │        bound to a chosen interface (LAN IP, or the Tailscale addr)    │
  └───────────────▲───────────────────────────────────────────────────────┘
                  │  WSS (TLS) — same LAN, or over the user's Tailscale
                  │  (no third party in the path)
        ┌─────────┴─────────┐
        │  Pine Companion    │  (this repo — phone: PWA or Expo/RN)
        │  xterm.js + control│
        └────────────────────┘
```

There is exactly one network hop, desktop↔phone. No broker.

## 2. Transport

- **Base URL:** `https://<host>:<port>` where `<host>` is the LAN IP (or Tailscale IP/MagicDNS name) and `<port>` is the gateway port (default suggestion **`8722`**; the desktop may pick another and encodes it in the pairing payload).
- **TLS:** WSS/HTTPS. The desktop presents a self-signed cert whose **fingerprint is included in the pairing QR** (§3) — the client pins it (TOFU: trust-on-first-use, pinned at pairing). Over Tailscale the tailnet is already encrypted, but keep TLS for uniformity and to bind the fingerprint.
- **Two channels, one WebSocket** at `wss://<host>:<port>/ws`:
  - **Control**: newline-delimited **JSON-RPC 2.0** text frames (requests, responses, and server→client `event` notifications).
  - **PTY stream**: **binary** frames (see §6). Control and binary frames share the socket; they are distinguished by WebSocket frame opcode (text vs binary).
- **Origin/host checks:** the server validates the `Origin`/`Host`; the client sends its device token in the connect handshake (§4). A reachable URL alone grants nothing.

## 3. Discovery & pairing (menu → QR → device credential)

Pairing establishes a **long-lived, revocable, per-device credential**. Flow:

1. **User action (desktop):** opens **"Connect a device / Pair phone"** in a Pine menu. The desktop:
   - ensures the gateway is running on the chosen interface,
   - generates a **short-lived pairing code** (`pairCode`, ~120 s TTL, single-use),
   - renders a **QR** encoding the JSON payload below (also shown as a copyable `pine-pair://` URI).
2. **QR / pairing payload:**
   ```json
   {
     "v": 1,
     "host": "100.87.x.y",        // LAN IP or Tailscale addr/MagicDNS
     "port": 8722,
     "fingerprint": "sha256/BASE64==",  // TLS cert fingerprint to pin
     "pairCode": "8-CHAR-ONE-TIME",
     "name": "Marco's MacBook"    // desktop display name
   }
   ```
3. **Client (phone):** scans → pins `fingerprint` → generates a **device keypair** (Ed25519 or WebCrypto ECDSA P-256) → calls the pairing endpoint:
   - `POST https://<host>:<port>/pair`
     ```json
     { "v": 1, "pairCode": "8-CHAR-ONE-TIME",
       "device": { "name": "iPhone 15", "pubkey": "BASE64-SPKI" } }
     ```
4. **Desktop:** verifies `pairCode` (unexpired, unused) → registers the device (stores `pubkey`, `name`, a new `deviceId`) → returns a **device token**:
   ```json
   { "deviceId": "dev_01J...", "deviceToken": "OPAQUE-BEARER",
     "caps": ["read", "board.read", "notify"], "expiresAt": null }
   ```
   - `deviceToken` is an opaque, revocable bearer credential the phone stores in secure storage. `caps` = the phone's initial capability subset (§5).
   - The desktop shows the new device in a **"Paired devices"** list with a **revoke** button (revocation is immediate; the token stops working).
5. **Later connections** use `deviceToken` (§4). Re-pairing is only needed if revoked/expired.

> **Optional hardening (recommended, can be phase-2):** step-up biometric (Face ID/passkey) on the phone before enabling *input* (owner) mode or destructive actions.

## 4. Connection & auth

- Client opens `wss://<host>:<port>/ws`, pinning the paired `fingerprint`.
- **First control frame MUST be `hello`:**
  ```json
  { "jsonrpc": "2.0", "id": 1, "method": "hello",
    "params": { "deviceToken": "OPAQUE-BEARER", "client": "pine-companion/1.0" } }
  ```
  - Success → `{ "result": { "deviceId": "dev_...", "caps": ["read","board.read","notify"], "desktop": { "name": "...", "version": "..." } } }`.
  - Any method before a successful `hello` → error `-32001 unauthenticated`, connection closed.
- The connection's capability set is derived from the device's grants (server-side). The client must treat `caps` as authoritative and hide/disable UI it lacks caps for.

## 5. Capability model

Mirrors the desktop's pane-scoped-trust broker, but a **phone gets a strict subset, read-only by default**:

| cap | grants |
|---|---|
| `read` | list sessions/panes, `pane.info`, `cwd.get`, **read-only** pty stream (observer) |
| `board.read` | read the Kanban/status board |
| `notify` | receive push/notification events |
| `command` | run **non-destructive** commands (`command.exec` for commands whose descriptor caps ⊆ granted) |
| `input` | send keystrokes to a pty (owner mode) — **elevated**, off by default |
| `board.write` | create/move/edit board cards — elevated |
| `destructive` | commands flagged destructive — elevated, **always** requires an on-device confirm |

- Elevated caps are granted by an explicit desktop action (per device) or a phone-initiated request the desktop approves. A command the device lacks caps for returns `-32003 needs-elevation` with `data: { cap }` — the client should surface a "request access" affordance, never silently no-op.

## 6. PTY streaming (the terminal mirror)

Reuses the desktop's multi-subscriber pty model (a sequence-numbered ring buffer + cursor replay + observer/owner roles already exist in the control plane).

### 6.1 Attach / detach (control JSON-RPC)
```json
{ "method": "pty.attach", "params": {
    "paneId": "<externalId>",     // from pane.list (§7)
    "role": "observer",            // "observer" (read-only, default) | "owner" (needs `input` cap)
    "sinceCursor": 0               // resume point; 0 = full retained history
} }
→ result: { "cursor": 12345, "dropped": false, "cols": 80, "rows": 24 }
```
- `dropped:true` ⇒ `sinceCursor` predated retained history; treat the following stream as a fresh full replay (clear the local xterm first).
- `pty.detach { paneId }` to stop the stream.

### 6.2 Binary frame format (server→client and client→server input)
Every **binary** WS frame is: **`[1-byte type][payload]`**.

| type byte | direction | payload |
|---|---|---|
| `0x00` | server→client | **control JSON** (UTF-8): `{ "paneId", "kind": "resize"|"cursor"|"meta", ... }` — e.g. server tells the client the pty resized. |
| `0x01` | server→client | **raw pty output bytes** for the most-recently-attached pane on this socket (if multiplexing multiple panes, prefix a paneId — see note). |
| `0x02` | client→server | **raw input bytes** (keystrokes) — only honored if the client attached as `owner` with `input` cap; otherwise dropped + a `-32003` event. |
| `0x03` | client→server | **resize**: control JSON `{ "paneId", "cols", "rows" }` → server calls `pty.resize` (→ SIGWINCH). |

> **Multiplexing note:** for v1, keep it simple — one attached pane's stream per WS is acceptable, OR prefix output/input frames with a 1-byte-length paneId. Decide with the desktop side; the contract's open question O3 tracks this. The client MUST strip the type byte (and paneId prefix if used) before writing to xterm, or metadata renders as visible garbage.

### 6.3 Resize, reconnect, heartbeat
- **Resize:** on the phone, `FitAddon.fit()` → send a `0x03` resize frame (**debounce** ~150 ms; the on-screen keyboard + `ResizeObserver` fire bursts).
- **Heartbeat:** server sends WS ping every ~15 s; client replies pong. If no traffic for ~30 s, treat as dead and reconnect.
- **Reconnect:** on drop, reconnect with **exponential backoff** (e.g. 0.5→8 s), re-`hello`, then `pty.attach` with the **last `cursor`** you received as `sinceCursor` to resume without gaps. Keep a local scrollback so a `dropped:true` full-replay is seamless.

## 7. Control API (JSON-RPC 2.0 over the text channel)

All require a prior successful `hello`. Capability-gated as noted.

| method | cap | params → result |
|---|---|---|
| `hello` | — | see §4 |
| `session.list` | `read` | `{}` → `{ sessions: [{ id, name, kind, workDir, state }] }` |
| `pane.list` | `read` | `{ sessionId? }` → `{ panes: [{ paneId, sessionId, kind, title, cwd?, running, blockCount, lastExitCode? }] }` |
| `pane.info` | `read` | `{ paneId }` → `{ paneId, generation, cwd?, running, blockCount, lastExitCode? }` |
| `cwd.get` | `read` | `{ paneId }` → `{ cwd: string \| null }` |
| `command.list` | `read` | `{}` → `{ commands: [ CommandDescriptor ] }` (id, title, argsSchema, capabilities, target) |
| `command.exec` | `command` (+ the command's own caps) | `{ id, args?, target? }` → `CommandResult` = `{ ok:true, result } \| { ok:false, error:{ code, message } }` |
| `pty.attach` / `pty.detach` | `read` / `input` for owner | §6.1 |
| `board.get` | `board.read` | `{ scope? }` → `{ columns: [...], cards: [ Card ] }` (Kanban — desktop Phase B; may be stubbed until then) |
| `board.update` | `board.write` | `{ cardId, patch }` → `{ ok }` |
| `device.caps` | — | `{}` → `{ caps: [...] }` (refresh after an elevation grant) |

### Server→client events (JSON-RPC notifications, no `id`)
```json
{ "jsonrpc":"2.0", "method":"event", "params": {
    "type": "pane.state" | "session.state" | "agent.needs-input" | "agent.done" | "board.changed" | "caps.changed" | "notify",
    "payload": { ... } } }
```
- `agent.needs-input` / `agent.done` drive push notifications (a session in state `waiting`/`done`).
- `caps.changed` ⇒ re-fetch `device.caps` and re-render gated UI.
- `pane.state` carries the same shape as `pane.info` so the client can live-update without polling.

### `CommandDescriptor` (for `command.list`, verbatim from the desktop contract)
```ts
interface CommandDescriptor {
  id: string            // e.g. "pane.splitRight", "session.new"
  title: string
  category?: string
  hidden: boolean
  argsSchema: object | null   // JSON Schema for args (drive dynamic forms)
  resultSchema: object | null
  capabilities: string[]      // caps the CALLER must hold
  target: "active" | "explicit" | "none"
}
```

## 8. Security summary (what the client must uphold)

1. **Pin the paired TLS fingerprint;** refuse a changed cert (warn + require re-pair).
2. **Store `deviceToken` in secure storage** (Keychain/Keystore/`localStorage` only for PWA-over-LAN MVP with a clear caveat).
3. **Never send input** unless attached as `owner` with `input` cap; gate the input UI behind that cap.
4. **Confirm destructive commands on-device** (the desktop also gates them, but confirm in the UI).
5. **Handle `-32003 needs-elevation`** as a "request access" flow, not a silent failure.
6. Assume the transport may be a shared LAN — the token + TLS pin are the security, not the URL's secrecy.

## 9. Suggested build order (mobile client)

1. Pairing screen: scan QR → pin fingerprint → `POST /pair` → store token.
2. Connect + `hello`; render `session.list` / `pane.list`; subscribe to events.
3. Read-only terminal mirror: `pty.attach` (observer) + xterm.js render of `0x01` frames + resize (`0x03`) + reconnect/heartbeat + cursor-resume.
4. Command palette from `command.list`; `command.exec` for non-destructive (respect caps).
5. Notifications (`agent.needs-input`/`agent.done`).
6. Elevation flow (`input`, `board.write`, `destructive`) + on-device confirm.
7. Kanban view (`board.get`/`board.changed`) — may lag until desktop Phase B ships.

## 10. Open questions (flag if these block you)

- **O1 — Pairing endpoint auth over self-signed TLS:** confirm TOFU fingerprint-pinning is acceptable for v1 vs. a bundled CA. (Leaning: TOFU pin from the QR.)
- **O2 — PWA secure storage** for `deviceToken` on iOS Safari (no Keychain) — acceptable for LAN MVP? Or push toward Expo for secure storage sooner.
- **O3 — PTY multiplexing:** one pane per WS (simple) vs. paneId-prefixed frames (multi-pane on one socket). Contract allows either; pick with the desktop side.
- **O4 — Board (Kanban) schema:** finalize `Card`/`columns` shape when desktop Phase B lands; treat `board.*` as provisional until then.
- **O5 — mDNS discovery:** optional convenience (auto-find the desktop on LAN) vs. QR-only. QR is the baseline; mDNS is additive.

---

*This is v1. The desktop gateway (Pine Phase C) is being implemented to this contract; changes will be versioned (`v` field in payloads). Raise mismatches against this file.*
