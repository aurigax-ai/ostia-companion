import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { AnimatePresence, MotiView } from 'moti';
import {
  Check,
  ChevronLeft,
  Lock,
  Shield,
  ShieldAlert,
  Unlock,
  MessageSquare,
  Keyboard,
  Paperclip,
  Mic,
  ArrowUp,
  Terminal,
} from 'lucide-react-native';
import { TerminalView, TerminalViewHandle } from '../components/TerminalView';
import { AttachResult, OstiaRpc, Role } from '../services/rpc';
import { Button, EmptyState, Pill, Screen, cn, colors } from '../components/ui';

interface TerminalScreenProps {
  paneId: string;
  paneTitle: string;
  onBack: () => void;
}

const RESIZE_DEBOUNCE_MS = 150;
const RPC_NEEDS_ELEVATION = -32003;

export function TerminalScreen({ paneId, paneTitle, onBack }: TerminalScreenProps) {
  const terminalRef = useRef<TerminalViewHandle>(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>('observer');
  const [canInput, setCanInput] = useState(OstiaRpc.hasCap('input'));
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elevationVisible, setElevationVisible] = useState(false);
  const [cmdInput, setCmdInput] = useState('');
  const roleRef = useRef<Role>('observer');
  const wantsOwner = useRef(true);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;

    const unsubscribePty = OstiaRpc.addPtyListener((base64Data) => {
      terminalRef.current?.write(base64Data);
    });

    const unsubscribeEvents = OstiaRpc.addEventListener((type, payload) => {
      if (type === 'pty.attached') applyAttach(payload);
      else if (type === 'rpc.error' && payload?.code === RPC_NEEDS_ELEVATION) setElevationVisible(true);
    });

    const unsubscribeCaps = OstiaRpc.addCapsListener((caps) => {
      const hasInput = caps.includes('input');
      setCanInput(hasInput);
      if (hasInput && wantsOwner.current && roleRef.current === 'observer') {
        setElevationVisible(false);
        attach('owner');
      }
    });

    attach(wantsOwner.current && OstiaRpc.hasCap('input') ? 'owner' : 'observer');

    return () => {
      unsubscribePty();
      unsubscribeEvents();
      unsubscribeCaps();
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      OstiaRpc.detachPty(paneId).catch((err) => console.warn('Detaching PTY error:', err));
    };
  }, [ready, paneId]);

  const applyAttach = (result: AttachResult) => {
    if (result.dropped) terminalRef.current?.reset();
    roleRef.current = result.role;
    setRole(result.role);
    if (result.role === 'owner') terminalRef.current?.followFit();
    else terminalRef.current?.setSize(result.cols, result.rows);
  };

  const attach = async (targetRole: Role) => {
    setConnecting(true);
    setError(null);
    try {
      await OstiaRpc.attachPty(paneId, targetRole);
    } catch (err: any) {
      setError(err.message || 'Failed to attach to terminal');
    } finally {
      setConnecting(false);
    }
  };

  const handleRoleToggle = () => {
    if (role === 'owner') {
      wantsOwner.current = false;
      attach('observer');
      return;
    }
    wantsOwner.current = true;
    if (canInput) attach('owner');
    else setElevationVisible(true);
  };

  const handleTerminalInput = (data: string) => {
    if (role === 'owner') OstiaRpc.sendKeystroke(data);
    else setElevationVisible(true);
  };

  const handleSendCommand = () => {
    if (!cmdInput) return;
    handleTerminalInput(cmdInput + '\r');
    setCmdInput('');
  };

  const handleTerminalResize = (cols: number, rows: number) => {
    if (roleRef.current !== 'owner') return;
    if (resizeTimer.current) clearTimeout(resizeTimer.current);
    resizeTimer.current = setTimeout(() => OstiaRpc.sendResize(paneId, cols, rows), RESIZE_DEBOUNCE_MS);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-ostia-bg"
    >
      <Screen>
        {/* CMUX Premium Navigation Header */}
        <View className="flex-row items-center justify-between px-3 py-2 bg-ostia-bg border-b border-ostia-border">
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            className="min-h-11 flex-row items-center px-1.5"
          >
            <ChevronLeft size={22} color="#a78bfa" />
            <View style={{ backgroundColor: 'rgba(167, 139, 250, 0.12)', borderColor: 'rgba(167, 139, 250, 0.3)' }} className="border w-5 h-5 rounded-full justify-center items-center ml-1">
              <Text style={{ color: '#a78bfa' }} className="text-[10px] font-extrabold">3</Text>
            </View>
          </Pressable>

          {/* Rounded title pill */}
          <View className="bg-[#111218] border border-ostia-border px-4 py-1.5 rounded-full flex-row items-center max-w-[180]">
            <Text className="text-ostia-text text-xs font-bold font-mono" numberOfLines={1}>
              {paneTitle}
            </Text>
          </View>

          {/* Right Status Actions */}
          <View className="flex-row items-center">
            <TouchableOpacity className="p-2 mr-1 relative">
              <MessageSquare size={18} color="#7f8497" />
              <View className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={handleRoleToggle}
              disabled={connecting}
              className="p-2"
            >
              <View className={`border rounded-lg p-1.5 justify-center items-center ${
                role === 'owner' ? 'bg-[#022c22] border-emerald-500' : 'bg-[#161821] border-[#1f212a]'
              }`}>
                {role === 'owner' ? (
                  <Unlock size={13} color="#10b981" />
                ) : (
                  <Lock size={13} color="#7f8497" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Terminal Area */}
        <View className="flex-1 bg-ostia-bg relative">
          {connecting ? (
            <View className="absolute inset-0 justify-center items-center bg-ostia-bg z-10">
              <ActivityIndicator size="large" color={colors.accent} />
              <Text className="text-ostia-muted text-sm mt-3">Attaching terminal stream</Text>
            </View>
          ) : null}

          {error ? (
            <View className="absolute inset-0 bg-ostia-bg z-10">
              <EmptyState
                icon={ShieldAlert}
                title="Terminal unavailable"
                body={error}
                action={<Button label="Retry Connect" onPress={() => attach(role)} />}
              />
            </View>
          ) : null}

          <TerminalView
            ref={terminalRef}
            onReady={() => setReady(true)}
            onInput={handleTerminalInput}
            onResize={handleTerminalResize}
          />
        </View>

        {/* Micro Stats Bar */}
        <View className="flex-row items-center justify-between px-4 py-2 border-t border-ostia-border bg-ostia-bg">
          <View className="flex-row items-center">
            <Text className="text-[#a78bfa] text-[10px] font-mono font-bold mr-1.5">$0.00</Text>
            <Text className="text-ostia-muted text-[10px] font-mono">|</Text>
            <Text className="text-ostia-muted text-[10px] font-mono ml-1.5">38% ctx</Text>
          </View>
          <View className="flex-row items-center">
            <Text className="text-emerald-500 text-[9px] font-mono font-bold uppercase tracking-wider">
              »» {role === 'owner' ? 'interactive mode' : 'observer mode'}
            </Text>
            <Text className="text-ostia-muted text-[10px] font-mono mx-1.5">·</Text>
            <Text className="text-ostia-muted text-[9px] font-mono font-bold uppercase tracking-wider">
              -- zsh
            </Text>
          </View>
        </View>

        {/* Horizontal Capsule KeyBar */}
        {role === 'owner' && (
          <View className="flex-row items-center px-3 py-1 bg-ostia-bg">
            <View className="flex-row flex-1 bg-[#111218] border border-ostia-border rounded-full py-1 px-3 items-center justify-between">
              <TouchableOpacity className="p-1">
                <Keyboard size={14} color="#7f8497" />
              </TouchableOpacity>
              <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 mx-2" />
              
              <TouchableOpacity onPress={() => handleTerminalInput('\x03')} className="bg-ostia-bg border border-ostia-border px-3 py-0.5 rounded-full">
                <Text className="text-ostia-text text-[10px] font-mono font-bold">Ctrl+C</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('\t')} className="bg-ostia-bg border border-ostia-border px-3 py-0.5 rounded-full">
                <Text className="text-ostia-text text-[10px] font-mono font-bold">Tab</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('\x1b')} className="bg-ostia-bg border border-ostia-border px-3 py-0.5 rounded-full">
                <Text className="text-ostia-text text-[10px] font-mono font-bold">Esc</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => handleTerminalInput('^')} className="p-1">
                <Text className="text-ostia-muted text-[10px] font-mono font-bold">^</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('⌥')} className="p-1">
                <Text className="text-ostia-muted text-[10px] font-mono font-bold">⌥</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('⌘')} className="p-1">
                <Text className="text-ostia-muted text-[10px] font-mono font-bold">⌘</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleTerminalInput('⇧')} className="p-1">
                <Text className="text-ostia-muted text-[10px] font-mono font-bold">⇧</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Message-Style Command Input Bar */}
        {role === 'owner' ? (
          <View className="flex-row items-center px-3 pb-6 pt-2 bg-ostia-bg border-t border-ostia-border">
            <TouchableOpacity className="p-2 mr-1">
              <Paperclip size={18} color="#7f8497" />
            </TouchableOpacity>
            
            <TouchableOpacity className="p-2 mr-2">
              <Mic size={18} color="#7f8497" />
            </TouchableOpacity>
            
            <View className="flex-1 flex-row items-center bg-[#111218] border border-ostia-border rounded-full px-4 h-10">
              <TextInput
                className="flex-1 text-ostia-text text-sm h-full"
                placeholder="Message"
                placeholderTextColor="#4e5165"
                value={cmdInput}
                onChangeText={setCmdInput}
                onSubmitEditing={handleSendCommand}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={handleSendCommand}
                className="w-7 h-7 rounded-full bg-ostia-accent justify-center items-center ml-2"
              >
                <ArrowUp size={14} color="#08090c" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleRoleToggle}
            className="flex-row items-center px-4 pb-6 pt-2 bg-ostia-bg border-t border-ostia-border opacity-80"
          >
            <View className="flex-1 flex-row items-center bg-[#111218] border border-ostia-border rounded-full px-4 h-10 justify-center">
              <Lock size={12} color="#ef4444" className="mr-2" />
              <Text className="text-ostia-muted text-xs font-semibold">
                {canInput ? 'Watching. Tap to type here.' : 'Watching only. Tap to see how to type here.'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Elevation Dialog */}
        <AnimatePresence>
          {elevationVisible ? (
            <View className="absolute inset-0 z-50">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss permission request"
                className="absolute inset-0 bg-black/65"
                onPress={() => setElevationVisible(false)}
              />

              <MotiView
                from={{ translateY: 320, opacity: 0 }}
                animate={{ translateY: 0, opacity: 1 }}
                exit={{ translateY: 320, opacity: 0 }}
                transition={{ type: 'spring', damping: 20 }}
                className="absolute bottom-0 left-0 right-0 px-5 pt-4 pb-6 rounded-t-2xl bg-ostia-card border-t border-ostia-border"
              >
                <View className="w-12 h-1.5 rounded-full bg-ostia-border self-center mb-5" />

                <View className="flex-row items-start">
                  <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.08)', borderColor: 'rgba(251, 191, 36, 0.25)' }} className="h-12 w-12 rounded-xl border items-center justify-center mr-3">
                    <Shield size={24} color="#fbbf24" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-ostia-text text-lg font-bold">Typing needs the Input permission</Text>
                    <Text className="text-ostia-muted text-sm leading-5 mt-1">
                      On your desktop, open Ostia Settings → Remote and turn on Input for this phone. This screen switches to typing as soon as it is on.
                    </Text>
                  </View>
                </View>

                <Button
                  label="Close"
                  icon={Check}
                  variant="secondary"
                  onPress={() => setElevationVisible(false)}
                  className="mt-5"
                />
              </MotiView>
            </View>
          ) : null}
        </AnimatePresence>
      </Screen>
    </KeyboardAvoidingView>
  );
}
