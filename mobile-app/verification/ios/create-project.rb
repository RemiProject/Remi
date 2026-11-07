require 'xcodeproj'
root = File.expand_path(__dir__)
project = Xcodeproj::Project.new(File.join(root, 'CookbookUITests.xcodeproj'))
target = project.new_target(:ui_test_bundle, 'CookbookUITests', :ios, '16.4')
target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.remi.cookbook.verification'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  config.build_settings['SWIFT_VERSION'] = '6.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4'
end
file = project.main_group.new_file('CookbookUITests.swift')
target.source_build_phase.add_file_reference(file)
credentials = project.main_group.new_file('credentials.json')
target.resources_build_phase.add_file_reference(credentials)
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.test_action.build_configuration = 'Debug'
scheme.save_as(project.path, 'CookbookUITests', true)
