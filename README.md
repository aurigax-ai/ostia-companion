# Ostia Companion — Mobile App (Expo / React Native)

The mobile companion app for **Ostia** (a desktop terminal & agent workspace). It allows you to monitor and control your Ostia terminal sessions, answer agent prompts, execute commands, and view a live terminal mirror from your phone (iOS and Android) over your local network, Tailscale, or an opt-in relay server.

---

## 🏗 System Architecture & Security (TOFU TLS Pinning)

Because the Ostia desktop gateway runs a local server with a **self-signed TLS certificate**, standard WebSockets and HTTP requests would be blocked by OS WebView engines and JavaScript engines.

To solve this securely and support **Trust-On-First-Use (TOFU) TLS certificate pinning**, we designed and implemented:
1. **Local Native Module (`modules/websocket-pinning`)**:
   - **iOS (Swift)**: Uses `URLSessionWebSocketTask` and implements `URLSessionWebSocketDelegate` to intercept TLS authentication challenges, compute the leaf certificate's SHA-256 fingerprint, and compare it against the scanned QR pin.
   - **Android (Kotlin)**: Uses OkHttp and configures a custom `X509TrustManager` with `hostnameVerifier` to validate certificate fingerprints for both Rest API (`POST /pair`) and WebSocket connections.
2. **Standard Cryptography**:
   - Uses `tweetnacl` polyfilled with `expo-crypto`'s secure native random generator to generate Ed25519 device keypairs and format them into the standard **Subject Public Key Info (SPKI)** format for the pairing payload.
3. **Terminal copy (`src/model/terminalCopy.ts`)**:
   - The phone never resizes a desktop pane (contract v1.11; it sends no `0x03` frame). `pty.attach` returns the pane's `cols` and `rows`; the phone sizes its own `@xterm/headless` emulator to that grid before the replay is applied, feeds it the binary PTY frames (`0x01`) and follows the `pty.size` event. Keystrokes go out as `0x02` frames.
   - Shell panes open in Commands: one card per command from the OSC 133 marks in the stream, with its exit code and its output joined across the emulator's wrap flags so it reflows to the phone width, colours kept. A full-screen (alternate screen) program shows as a row that opens a sideways view of the desktop grid. Terminal draws the same copy fitted to the phone width with pinch, pan and scrollback (selectable text); while it is on screen and the phone can type, it holds the pane at the phone grid (`pty.hold`, contract v1.12). Limits: the phone cannot verify OSC 133 marks (it has no nonce), so a program can print marks to fake a card; it ignores marks outside a prompt, ignores them on the alternate screen, takes the last D, and prefers the command text sent as OSC 633;E. Output beyond an 8 MiB backlog is skipped and shown as `[output skipped]`. Typing in the raw-text field is sent when committed (⏎ or leaving the field), so IME composition is not cut up.

4. **Artifacts and file viewers (`src/components/viewers`)**:
   - Each workspace has an Artifacts screen: what its agents wrote for the human, newest first, with the Scratch Pad pinned and a dot on files that changed (`artifact.changed`). The phone only reads (`fs.list` / `fs.read` with `root: "artifacts"`, contract v1.7), and reads files over 256 KiB in slices.
   - Files open by type: Markdown is rendered natively (raw HTML is shown as text and only `data:` images load), CSV/TSV is a table, SVG and Mermaid are drawn as pictures in a WebView that has no network and cannot navigate, PDFs go to another app. HTML, JSX and TSX are shown as source: the phone never runs artifact code.
   - Mermaid ships inside the app. `pnpm install` runs `tools/build-mermaid.mjs`, which copies it from `node_modules` into `src/generated/` (not committed).

5. **Phone screen (`modules/phone-control`, Android 10+)**:
   - Phone control is the agent's call: when a job needs this phone, the desktop sends `screen.requested` and the phone shows a sheet with who asks and why, the level and the time limit (5, 15 or 30 minutes) from Settings, and Deny / Allow (contract v1.8, "Phone screen"). Allow runs the fingerprint or PIN check when Settings asks for it, then Android's own capture prompt every time; the session shows a notification with Stop and keeps no screenshot.
   - Settings › Phone control holds the allow mode (Ask every time, Allow from chosen workspaces, Off), the defaults, Require fingerprint, the accessibility service and the apps the agent never opens. All of it stays on the phone.
   - A Kotlin foreground service captures the screen and holds its own pinned socket to the desktop (the screen link), so frames never cross the JavaScript bridge and the session keeps running while Ostia is in the background.
   - A store build can leave it out: add `"expo": { "autolinking": { "android": { "exclude": ["phone-control"] } } }` to `package.json`; `isSupported()` is then false and the app shows no phone entry.
   - New chat (Chats, or New session in a workspace) starts claude or codex with the human's first message in a new tab of the workspace in its header (`agent.start`, contract v1.8, needs Respond) and opens that tab; the desktop decides which messages may start an agent and the phone shows its answer. Typing `/` offers shortcuts that fill the message and never send it.
   - `pnpm mock:gateway` speaks the screen link: it asks a linked phone for a capture every 3 s and logs its size; with `MOCK_SAVE_SCREENS=1` it also keeps the latest one in `$TMPDIR/ostia-mock-screens/` until that screen closes (a developer check only: nothing on the phone or the desktop keeps a frame); `kill -USR2 <pid>` stops the phone's session from the "desktop", `kill -USR1 <pid>` revokes every phone. It also listens on `127.0.0.1:8724` (`MOCK_DRIVE_PORT`): a POST with `{ method, params }` sends that request to the linked phone and answers its reply, frames included, and `POST /requested` sends `screen.requested`. Like the saved captures, this is a developer check on loopback only; the desktop relays and keeps no frame.

6. **Three tabs (`src/screens/MainTabs.tsx`)**:
   - Chats ("Now": what needs you, what works, what finished today, the rest as one quiet line), Workspaces (the desktop's sidebar groups as folding sections, Sleeping last, one search for workspaces and sessions) and Settings. The bars are the systems' own through React Navigation's native bottom tabs (`@react-navigation/bottom-tabs/unstable` on react-native-screens `Tabs`): Android's bottom navigation, iOS 26's Liquid Glass bar. Android's icons are lucide PNGs in `assets/tabs/`, iOS uses SF Symbols.
   - The desktop sends no times yet, so the phone notes when it saw a pane change (`seen`) for "Done today", "Sleeping" and the times on rows.
   - An agent (claude or codex) opens as a chat (`ConversationScreen`), drawn from the desktop's `agent.stream.open` events (contract v1.12): narration as plain text, one quiet line per tool call (tap for its input and output), edits as a diff, the plan as a short list, the reply streaming in, and a `Working` line while a turn runs. A permission prompt rises as a compact sheet with the exact command. The stream closes when you leave the screen or the app goes to the background. Messages go through `agent.prompt`; the `Chat · Terminal` switch in the header opens the terminal, and an agent whose hooks are off (`not-an-agent`) opens the terminal straight away. Shells always open the terminal.
   - Typing `/` in a composer lists Ostia's shortcuts, then the human's own snippets from `snippet.list`; a pick only fills the message.
   - When the desktop has a Phone workspace (`hello`'s `phoneWorkspace`), New chat talks to the Phone agent there and Chats pins it first.
   - No list, scroll view, web view or terminal draws a scroll bar (`NO_SCROLL_BARS`). Run the mock gateway with `MOCK_PHONE_WORKSPACE=s-dot` to try the Phone workspace.

---

## 📂 Project Structure

```
├── App.tsx                    # Main App entry and route controller
├── app.json                   # Expo configuration (configured for Dark-Mode)
├── package.json               # Dependencies and scripts
├── modules/
│   └── websocket-pinning/     # Local native module for SSL/TLS pinning
│       ├── ios/               # Swift implementation (URLSessionWebSocketTask)
│       ├── android/           # Kotlin implementation (OkHttp)
│       └── index.ts           # JS/TS interface wrapper (PinnedWebSocket & pinnedPost)
└── src/
    ├── components/
    │   └── ui.tsx             # Shared UI primitives
    ├── screens/
    │   ├── PairingScreen.tsx  # QR scanner and manual backup pairing link
    │   ├── DashboardScreen.tsx# Workspaces and panes with live state
    │   └── TerminalScreen.tsx # Live terminal, keyboard interaction, & elevation flow
    └── services/
        ├── crypto.ts          # Key generation and SPKI formatting
        ├── storage.ts         # Secure credentials storage (iOS Keychain, Android KeyStore)
        ├── network.ts         # Pinned pair request handler
        └── rpc.ts             # JSON-RPC 2.0 client, authentication, and auto-reconnect
```

---

## 🚀 How to Run Locally

### 1. Preflight System Setup
You need Node.js (18+) and `pnpm` installed. You can verify your environment by running:
```bash
pnpm install
```

### 2. Start the Metro Bundler
Start the local Expo development packager:
```bash
pnpm start
```
This will launch the Metro bundler server on port `8081`.

### 3. Running on Devices

#### A. Standard Expo Go (Quick Prototype)
You can scan the terminal QR code using the **Expo Go** app on your phone.
* *Note*: The custom certificate pinning module requires native code. In standard Expo Go, connections to self-signed TLS servers might fail. To test the full contract, you should run a Development Build.

#### B. Development Build (Full Native Support)
To compile the Swift and Kotlin certificate-pinning libraries, generate the native folders and build the app:

* **For Android (on Linux)**:
  Ensure you have `ANDROID_HOME` (Android SDK) and Java JDK configured, then run:
  ```bash
  pnpm expo run:android
  ```
  This compiles the Kotlin code, builds a custom developer APK, installs it on your connected device/emulator, and pairs it with the Metro packager.

* **For iOS / Cloud Builds (EAS)**:
  If you do not have a macOS machine locally, you can use Expo's cloud build service (EAS) to compile the IPA/APK with the custom native module:
  ```bash
  pnpm dlx eas-cli build --profile development
  ```

---

### Push (FCM)
Android push needs the Firebase `google-services.json`, which is never committed. Set `GOOGLE_SERVICES_JSON` to the file's path before `expo prebuild` or `expo run:android`; CI writes it from the `GOOGLE_SERVICES_JSON_BASE64` secret. Without it the app builds with push off (Settings shows "Unavailable (build)").

---

## 🧪 Compilation Verification
To check TypeScript compilation and make sure there are no type-safety errors:
```bash
pnpm tsc --noEmit
```
This should compile with **zero errors**.

---

## 📦 Releasing
CI (`.github/workflows/build.yml`) runs the tests and builds `ostia.apk` and `ostia-unsigned.ipa` on every push to `master` and every pull request. The files are attached to each run as artifacts.

To release, set `expo.version` in `app.json`, commit, and push a matching tag:
```bash
git tag v0.0.1 && git push origin v0.0.1
```
CI fails if the tag doesn't match `app.json`. The build number (`versionCode` / `CFBundleVersion`) is the CI run number. The APK is signed with the release key, and both files are published to a GitHub Release with generated notes.

- **Android:** builds from a tag are signed with the release key, so each release installs over the previous one. Builds from branches use Expo's debug keystore and can't update a release install.
- **iOS:** there's no Apple signing in CI. Re-sign the `.ipa` with your Apple ID (AltStore or Sideloadly) to install it.

Release signing reads four repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Keep a backup of the keystore. Without it, a new release can't update installed apps.
