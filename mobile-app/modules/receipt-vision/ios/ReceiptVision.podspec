Pod::Spec.new do |s|
  s.name           = 'ReceiptVision'
  s.version        = '1.0.0'
  s.summary        = 'Receipt text recognition with line positions'
  s.license        = 'MIT'
  s.author         = 'Remi'
  s.homepage       = 'https://github.com/RemiProject/Remi'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,swift}"
end
