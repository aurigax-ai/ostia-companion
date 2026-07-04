import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export interface TerminalViewHandle {
  write: (data: string) => void;
  clear: () => void;
  fit: () => void;
}

interface TerminalViewProps {
  onReady?: () => void;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #08090c;
      overflow: hidden;
    }
    #terminal {
      width: 100%;
      height: 100%;
    }
    /* Customize scrollbar */
    .xterm-viewport::-webkit-scrollbar {
      width: 6px;
    }
    .xterm-viewport::-webkit-scrollbar-track {
      background: #08090c;
    }
    .xterm-viewport::-webkit-scrollbar-thumb {
      background: #1f212a;
      border-radius: 3px;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
</head>
<body>
  <div id="terminal"></div>
  <script>
    let term;
    let fitAddon;

    try {
      term = new Terminal({
        theme: {
          background: '#08090c',
          foreground: '#e2e4e9',
          cursor: '#a78bfa',
          cursorAccent: '#08090c',
          black: '#16161a',
          red: '#ff6c6b',
          green: '#98be65',
          yellow: '#ecbe7b',
          blue: '#51afef',
          magenta: '#c678dd',
          cyan: '#46d9ff',
          white: '#bbc2cf',
        },
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        convertEol: true,
        scrollback: 10000,
      });
      
      fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      term.open(document.getElementById('terminal'));
      
      // Initial fit after load
      setTimeout(() => {
        fitAddon.fit();
        sendResizeEvent();
      }, 300);

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));

      term.onData((data) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'input',
          data: data
        }));
      });

      window.addEventListener('resize', () => {
        fitAddon.fit();
        sendResizeEvent();
      });
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', data: e.message }));
    }

    function sendResizeEvent() {
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'resize',
          cols: dims.cols,
          rows: dims.rows
        }));
      }
    }

    window.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'write') {
          const raw = atob(msg.data);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            bytes[i] = raw.charCodeAt(i);
          }
          term.write(bytes);
        } else if (msg.type === 'clear') {
          term.clear();
        } else if (msg.type === 'fit') {
          fitAddon.fit();
          sendResizeEvent();
        }
      } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', data: 'PostMessage failed: ' + err.message }));
      }
    });
  </script>
</body>
</html>
`;

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(
  ({ onReady, onInput, onResize }, ref) => {
    const webViewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        webViewRef.current?.postMessage(
          JSON.stringify({ type: 'write', data })
        );
      },
      clear: () => {
        webViewRef.current?.postMessage(
          JSON.stringify({ type: 'clear' })
        );
      },
      fit: () => {
        webViewRef.current?.postMessage(
          JSON.stringify({ type: 'fit' })
        );
      },
    }));

    const handleMessage = (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        switch (message.type) {
          case 'ready':
            onReady?.();
            break;
          case 'input':
            onInput?.(message.data);
            break;
          case 'resize':
            onResize?.(message.cols, message.rows);
            break;
          case 'error':
            console.warn('WebView Terminal Error:', message.data);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error('Failed to parse WebView message:', e);
      }
    };

    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          onMessage={handleMessage}
          style={[styles.webview, { backgroundColor: '#08090c' }]}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#a78bfa" />
            </View>
          )}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08090c',
  },
  webview: {
    flex: 1,
    backgroundColor: '#08090c',
  },
  loader: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#08090c',
  },
});
