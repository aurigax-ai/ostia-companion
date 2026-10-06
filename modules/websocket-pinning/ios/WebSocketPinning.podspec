Pod::Spec.new do |s|
  s.name           = 'WebSocketPinning'
  s.version        = '1.0.0'
  s.summary        = 'WebSocket with custom self-signed SSL/TLS certificate pinning'
  s.description    = 'Local Expo native module for WebSocket connection and cert fingerprint pinning.'
  s.homepage       = 'https://github.com/aurigax-ai/ostia-companion'
  s.license        = 'MIT'
  s.author         = 'Antigravity'
  s.platform       = :ios, '13.4'
  s.source         = { :git => '' }
  s.source_files   = '**/*.{h,m,swift}'
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILER_FLAGS' => '-no-warnings'
  }
end
