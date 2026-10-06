# Ostia Companion — Mobile App (Expo / React Native)

The mobile companion app for **Ostia** (a desktop terminal & agent workspace). It allows you to monitor and control your Ostia terminal sessions, answer agent prompts, execute commands, and view a live terminal mirror from your phone (iOS and Android) over your local network or Tailscale.

---

## 🏗 System Architecture & Security (TOFU TLS Pinning)

Because the Ostia desktop gateway runs a local server with a **self-signed TLS certificate**, standard WebSockets and HTTP requests would be blocked by OS WebView engines and JavaScript engines.

To solve this securely and support **Trust-On-First-Use (TOFU) TLS certificate pinning**, we designed and implemented:
1. **Local Native Module (`modules/websocket-pinning`)**:
   - **iOS (Swift)**: Uses `URLSessionWebSocketTask` and implements `URLSessionWebSocketDelegate` to intercept TLS authentication challenges, compute the leaf certificate's SHA-256 fingerprint, and compare it against the scanned QR pin.
   - **Android (Kotlin)**: Uses OkHttp and configures a custom `X509TrustManager` with `hostnameVerifier` to validate certificate fingerprints for both Rest API (`POST /pair`) and WebSocket connections.
2. **Standard Cryptography**:
   - Uses `tweetnacl` polyfilled with `expo-crypto`'s secure native random generator to generate Ed25519 device keypairs and format them into the standard **Subject Public Key Info (SPKI)** format for the pairing payload.
3. **High-Performance Terminal Rendering**:
   - Embeds `xterm.js` and `@xterm/addon-fit` inside a `react-native-webview`. 
   - Binary PTY frames (`0x01`) are captured by the native socket, their header bytes stripped, and forwarded as Base64 to the WebView. The WebView decodes the Base64 directly into a binary `Uint8Array`, feeding `xterm.js` without any string-encoding overhead.

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
    │   ├── TerminalView.tsx   # WebView wrapper for xterm.js terminal
    │   └── KeyBar.tsx         # Touch control keys helper (ESC, TAB, Ctrl, Arrows)
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

## 🧪 Compilation Verification
To check TypeScript compilation and make sure there are no type-safety errors:
```bash
pnpm tsc --noEmit
```
This should compile with **zero errors**.
