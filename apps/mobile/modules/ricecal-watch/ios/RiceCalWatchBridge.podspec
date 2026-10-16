Pod::Spec.new do |s|
  s.name           = 'RiceCalWatchBridge'
  s.version        = '1.0.0'
  s.summary        = 'The app end of the RiceCal Apple Watch app.'
  s.description    = 'Sends the running workout to the watch over WatchConnectivity and keeps what the watch sends back.'
  s.author         = 'RiceCal'
  s.homepage       = 'https://ricecal.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WatchConnectivity', 'HealthKit'

  # NOT named RiceCalWatch, which is the WATCH APP's target name: two products
  # called the same thing land on each other in BUILT_PRODUCTS_DIR, as the
  # widget bridge's podspec explains.
  s.source_files = "**/*.{h,m,swift}"

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
