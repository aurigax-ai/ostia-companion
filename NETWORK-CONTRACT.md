# Pine Companion — Network Contract (v1.2, contract-first)

> **v1.2 (2026-09-28)** removes the board: `board.get`, `board.update`, the `board.read`/`board.write` caps and the reserved `board.changed` event are gone (the desktop dropped its kanban; boards now live in Trellis). See §11.

> **v1.1 (2026-09-28)** is wire-compatible with v1: the pairing payload is still `"v": 1`. It adds desktop-side capability grants, live cap changes (`caps.changed` event, close code `4004`), `device.caps`, the effective `role` in `pty.attach`, stricter `0x02`/`0x03` gating, and the event→cap mapping. See §11 for the full changelog.

> The desktop↔phone interface. Both the Pine desktop **control gateway** and this **mobile companion** implement to this document. Grounded in Pine's existing local control plane (a per-pane-token-authenticated `pine.sock`); the gateway re-exposes that same command layer over a network transport, plus a live PTY stream.

## 0. Decided constraints (do not violate)

- **LAN-first, bring-your-own-network for WAN.** The desktop runs a local server bound to a **user-selected interface**. For remote use, the user runs their **own Tailscale/VPN** — the same LAN server is reachable over the tailnet. **No hosted relay. No cloud rendezvous. No accounts/login.**
- **Off by default.** The gateway ships disabled; the user explicitly enables it and it shows an always-visible "remote active" indicator.
- **Pairing is a menu action + QR.** No typing credentials.
- **The desktop is the source of truth.** The phone is a remote view/controller; it holds no durable workspace state beyond its device credential + UI prefs.
- **Least privilege.** A paired phone gets a **capability subset**; terminal input and destructive actions are **off by default** and require explicit elevation/confirmation.

## 0.1 The gateway is an ADAPTER (not a passthrough)

This phone-facing protocol is intentionally **different** from Pine's internal *local* control socket (a Unix socket with `{token}→{externalId}` auth and different method shapes). The desktop **gateway translates** between this contract and the internal control plane, and **adds the PTY stream** (which internally exists as renderer IPC + a `PtySession` observer-role + cursor-replay ring buffer, not yet as a socket method). The **capability names here are phone-facing** and map to internal desktop capabilities. So: **this document is the stable target the desktop gateway (Phase C) implements to** — do not expect the internal socket to already match it verbatim.

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
     "caps": ["read", "notify"], "expiresAt": null }
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
  - Success → `{ "result": { "deviceId": "dev_...", "caps": ["read","notify"], "desktop": { "name": "...", "version": "..." } } }`.
  - Any method before a successful `hello` → error `-32001 unauthenticated`, connection closed.
- The connection's capability set is derived from the device's grants (server-side). The client must treat `caps` as authoritative and hide/disable UI it lacks caps for.

## 5. Capability model

Mirrors the desktop's pane-scoped-trust broker, but a **phone gets a strict subset, read-only by default**:

| cap | grants |
|---|---|
| `read` | list sessions/panes, `pane.info`, `cwd.get`, **read-only** pty stream (observer) |
| `notify` | receive push/notification events |
| `command` | run **non-destructive** commands (`command.exec` for commands whose descriptor caps ⊆ granted) |
| `input` | send keystrokes to a pty (owner mode) — **elevated**, off by default |
| `destructive` | commands flagged destructive — elevated, **always** requires an on-device confirm |

- Elevated caps are granted by an explicit desktop action (per device) or a phone-initiated request the desktop approves. A command the device lacks caps for returns `-32003 needs-elevation` with `data: { cap }` — the client should surface a "request access" affordance, never silently no-op.

### 5.1 How grants work (desktop, v1.2)

- **Only a human at the desktop grants.** Settings → Remote lists paired devices with a switch per grantable cap: `command`, `input`, `destructive`. There is no network, CLI, or agent-facing method that changes a device's caps, and there is **no phone-initiated elevation request** yet. "Request access" on the phone should tell the user to open Settings → Remote on the desktop.
- **Base caps are fixed:** `read`, `notify` are always present and can't be removed (revoke the device instead).
- **`destructive` requires `command`.** The desktop refuses `destructive` without `command`, drops `destructive` when `command` is removed, and asks the desktop user to confirm before granting it. The phone must still confirm destructive commands on-device (§8).
- **`input` never implies `command`** (and vice versa). `input` only gates `pty.attach` owner role and `0x02`/`0x03` frames; `command.exec` always needs `command`.
- Caps are always returned in the canonical order `read, notify, command, input, destructive` (subset). A device paired before v1.2 has `board.read`/`board.write` silently dropped from its caps.
- **Live changes:**
  - **Caps added** → every live socket of that device receives `event` `caps.changed` with `payload: { caps: [...] }`. New caps are effective on the next frame; no reconnect needed. An existing `observer` attachment does **not** become `owner` — re-send `pty.attach` with `role: "owner"`.
  - **Any cap removed** → every live socket of that device is **closed with code `4004` (`caps-changed`)** and its pty attachment dropped. Reconnect normally (backoff, `hello`, re-attach with your last cursor); `hello` returns the reduced caps.
  - The desktop re-reads the device's caps on **every** frame, so a stale client-side cap list can never grant more than the desktop currently allows.

### 5.2 WebSocket close codes

| code | reason | client action |
|---|---|---|
| `4001` | `unauthenticated` / `hello timeout` (no valid `hello` within 10 s) | re-pair if the token is rejected; otherwise send `hello` first |
| `4003` | `revoked` — the device was removed on the desktop | wipe the token, go back to pairing |
| `4004` | `caps-changed` — a cap was removed | reconnect; `hello` returns the new caps |

## 6. PTY streaming (the terminal mirror)

Reuses the desktop's multi-subscriber pty model (a sequence-numbered ring buffer + cursor replay + observer/owner roles already exist in the control plane).

### 6.1 Attach / detach (control JSON-RPC)
```json
{ "method": "pty.attach", "params": {
    "paneId": "<externalId>",     // from pane.list (§7)
    "role": "observer",            // "observer" (read-only, default) | "owner" (needs `input` cap)
    "sinceCursor": 0               // resume point; 0 = full retained history
} }
→ result: { "cursor": 12345, "dropped": false, "cols": 80, "rows": 24, "role": "observer" }
```
- `role` in the result is the **effective** role. Asking for `owner` without the `input` cap is not an error: you get `"role": "observer"`. Only show the keyboard/input UI when the result says `owner`.
- One pane per socket: attaching another pane detaches the previous one (O3 resolved, see §10).
- `dropped:true` ⇒ `sinceCursor` predated retained history; treat the following stream as a fresh full replay (clear the local xterm first).
- `pty.detach { paneId }` to stop the stream.

### 6.2 Binary frame format (server→client and client→server input)
Every **binary** WS frame is: **`[1-byte type][payload]`**.

| type byte | direction | payload |
|---|---|---|
| `0x00` | server→client | **control JSON** (UTF-8): `{ "paneId", "kind": "resize"|"cursor"|"meta", ... }` — reserved; the v1.1 desktop does not send it yet. |
| `0x01` | server→client | **raw pty output bytes** (UTF-8) for the pane attached on this socket. No paneId prefix. |
| `0x02` | client→server | **raw input bytes** (UTF-8 keystrokes, e.g. `"ls\r"`, `"\x03"` for Ctrl-C) written to the pty verbatim. |
| `0x03` | client→server | **resize**: UTF-8 JSON `{ "paneId"?, "cols", "rows" }` → server calls `pty.resize` (→ SIGWINCH). |

**Gating for `0x02` and `0x03` (v1.1):** both require (a) a current `owner` attachment on this socket and (b) `input` in the device's **current** caps. Otherwise the frame is dropped and the server sends a JSON-RPC error with `id: null`: `{ "jsonrpc":"2.0", "id": null, "error": { "code": -32003, "message": "needs-elevation", "data": { "cap": "input" } } }`. Observers never resize: resizing SIGWINCHes the desktop's shell and reflows the desktop user's terminal, so it counts as a write. An observer renders at the `cols`/`rows` from `pty.attach`.

**Resize validation:** `cols` and `rows` must be integers in `1..1000`; invalid frames are silently ignored. `paneId` is optional; if present it must be the attached pane's `externalId`, otherwise the frame is ignored.

> **Multiplexing (decided, v1.1):** one attached pane per WebSocket, no paneId prefix on binary frames. To watch two panes, open two sockets. The client MUST strip the type byte before writing to xterm.

### 6.3 Resize, reconnect, heartbeat
- **Resize:** only when attached as `owner`: on the phone, `FitAddon.fit()` → send a `0x03` resize frame (**debounce** ~150 ms; the on-screen keyboard + `ResizeObserver` fire bursts). Note that this resizes the desktop's pane too. As an observer, keep the attach-time `cols`/`rows`.
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
| `pty.attach` / `pty.detach` | `read` (owner role needs `input`, else downgraded) | §6.1 |
| `device.caps` | — | `{}` → `{ caps: [...] }` (the device's current caps; implemented v1.1) |
| `whoami` | — | `{}` → `{ deviceId, caps }` |

### Server→client events (JSON-RPC notifications, no `id`)
```json
{ "jsonrpc":"2.0", "method":"event", "params": {
    "type": "pane.state" | "session.state" | "agent.needs-input" | "agent.done" | "caps.changed" | "notify",
    "payload": { ... } } }
```
- `agent.needs-input` / `agent.done` drive push notifications (a session in state `waiting`/`done`).
- `caps.changed` ⇒ re-render gated UI (the payload already has the caps; `device.caps` also works).
- `pane.state` carries the same shape as `pane.info` so the client can live-update without polling.

**Event payloads and required caps (as implemented, v1.2).** A device only receives events its caps allow:

| type | cap | payload | fires when |
|---|---|---|---|
| `agent.needs-input` | `notify` | `{ sessionId }` | a session enters `waiting` (an agent needs the user) |
| `agent.done` | `notify` | `{ sessionId }` | a session enters `done` |
| `notify` | `notify` | `{ title, body?, from }` — `from` is the sending pane's `externalId`, or `null` | an agent runs `pine notify` |
| `session.state` | `read` | `{ sessionId, state: "idle"\|"working"\|"waiting"\|"done"\|"error" }` | any session state change (also sent alongside `agent.*`) |
| `pane.state` | `read` | `{ paneId, generation, cwd?, running, blockCount, lastExitCode? }` | a terminal pane's cwd/running/blocks/exit code changes |
| `caps.changed` | — (own device only) | `{ caps }` | the desktop user granted a cap (§5.1) |

`sessionId` matches `session.list`'s ids; `paneId`/`from` match `pane.list`'s `externalId`s. Events are not replayed: after a reconnect, re-fetch `session.list`/`pane.list` for current state.

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
6. Elevation flow (`input`, `destructive`) + on-device confirm.

## 10. Open questions (flag if these block you)

- **O1 — Pairing endpoint auth over self-signed TLS:** confirm TOFU fingerprint-pinning is acceptable for v1 vs. a bundled CA. (Leaning: TOFU pin from the QR.)
- **O2 — PWA secure storage** for `deviceToken` on iOS Safari (no Keychain) — acceptable for LAN MVP? Or push toward Expo for secure storage sooner.
- **O3 — PTY multiplexing:** ~~open~~ **resolved v1.1:** one pane per WS, no prefix (§6.2).
- **O4 — Board (Kanban) schema:** ~~open~~ **withdrawn v1.2:** there is no board API.
- **O5 — mDNS discovery:** optional convenience (auto-find the desktop on LAN) vs. QR-only. QR is the baseline; mDNS is additive.

---

*This is v1.2. The desktop gateway (Pine Phase C) is being implemented to this contract; changes will be versioned (`v` field in payloads). Raise mismatches against this file.*

## 11. Changelog

### v1.2 — 2026-09-28 (board removed)

The desktop removed its built-in kanban (and wiki); boards and cards live in Trellis now, outside Pine.

- **Removed methods:** `board.get` and `board.update` now return `-32601 method not found`.
- **Removed caps:** `board.read` (was a base cap) and `board.write` (was grantable). Base caps are `read`, `notify`; grantable caps are `command`, `input`, `destructive`. Existing device records keep working: the desktop drops unknown caps when it loads them, so `hello`/`device.caps` just return the smaller set.
- **Removed event:** `board.changed` (was reserved, never emitted).
- **Client:** hide any board/Kanban view and the `board.write` grant; nothing else changes. Pairing payload stays `"v": 1`.

### v1.1 — 2026-09-28 (desktop Phase 7 "Remote")

Wire-compatible with v1; pairing payload stays `"v": 1`.

- **Grants (§5.1):** the desktop user can grant `command`, `input`, `board.write`, `destructive` per device in Settings → Remote. Only the desktop UI can do it. `destructive` requires `command`. No phone-initiated elevation request yet.
- **Live caps:** added caps arrive as `event` `caps.changed { caps }`; a removed cap closes the socket with **`4004 caps-changed`** (§5.2). The desktop re-checks caps on every frame.
- **`device.caps`** is implemented.
- **`pty.attach`** result now includes the effective `role`; `owner` without `input` is downgraded to `observer`, not rejected.
- **`0x02` input and `0x03` resize** need an owner attachment + `input`; a denial is an `id: null` `-32003 {cap:"input"}` error. Resize is validated (`1..1000`, optional `paneId` must match). Observers can no longer resize.
- **Events:** `agent.needs-input`/`agent.done` now need `notify` (were `read`); `notify.from` is a pane `externalId` or `null`. Full table in §7.
- **O3 resolved:** one pane per socket.
- **Remote beyond LAN:** the desktop picks a bind address from loopback, LAN interfaces, or a detected Tailscale address (`tailscale ip -4`, else a `100.64.0.0/10` interface). Still no relay; the pairing QR carries whichever host was chosen.
