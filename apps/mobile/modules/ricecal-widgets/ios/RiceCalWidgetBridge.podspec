Pod::Spec.new do |s|
  s.name           = 'RiceCalWidgetBridge'
  s.version        = '1.0.0'
  s.summary        = 'The app end of the RiceCal home screen widgets.'
  s.description    = 'Publishes the widget snapshot into the App Group and drains what the widgets logged.'
  s.author         = 'RiceCal'
  s.homepage       = 'https://ricecal.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # NOT named RiceCalWidgets, which is the WIDGET EXTENSION's target name. Two
  # products called the same thing land on each other in BUILT_PRODUCTS_DIR: the
  # pod's static library and the extension's .appex. The JS name is unaffected —
  # `requireNativeModule` keys on the `Name()` in the module definition, not on
  # the pod.
  #
  # RiceCalWidgetStore.swift is compiled in here AND into the widget extension,
  # which `plugins/withWidgets.js` copies it into. One source file, two binaries.
  s.source_files = "**/*.{h,m,swift}"

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
