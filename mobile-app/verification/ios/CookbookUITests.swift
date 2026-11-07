import XCTest

final class CookbookUITests: XCTestCase {
  @MainActor
  func testEverydayKitchenFlows() throws {
    continueAfterFailure = false
    addUIInterruptionMonitor(withDescription: "System prompts") { alert in
      if alert.buttons["Not Now"].exists { alert.buttons["Not Now"].tap(); return true }; return false
    }
    let app = XCUIApplication(bundleIdentifier: "com.remi.cookbook.independent")
    app.launchArguments = ["-RCT_jsLocation", "localhost:8091"]
    app.launch()
    XCTAssertTrue(app.staticTexts["Remi"].waitForExistence(timeout: 30))
    attach(app, "01-home")
    if app.buttons["Sign in to your kitchen"].exists {
      guard let url = Bundle(for: Self.self).url(forResource: "credentials", withExtension: "json"),
            let values = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String:String],
            let identifier = values["identifier"], let password = values["password"] else {
        XCTFail("Run setup-fixture.mjs before the signed-in test."); return
      }
      app.buttons["Sign in to your kitchen"].tap()
      let email = app.textFields["Email or username"]
      XCTAssertTrue(email.waitForExistence(timeout: 10))
      email.tap(); enter(identifier, into: email)
      let secret = app.secureTextFields["Password"]
      secret.tap(); enter(password, into: secret)
      tap(app, "Log in")
      XCTAssertTrue(app.staticTexts["Profile"].waitForExistence(timeout: 15))
      attach(app, "02-profile-signed-in")
      tap(app, "Back to More")
    }
    tap(app, "Home", exact: true)
    XCTAssertTrue(app.staticTexts["Tonight, sorted."].waitForExistence(timeout: 15))
    attach(app, "03-home-signed-in")
    tap(app, "Kitchen", exact: true)
    XCTAssertTrue(app.staticTexts["My kitchen"].waitForExistence(timeout: 15))
    attach(app, "04-kitchen")
    let search = app.textFields.matching(NSPredicate(format: "label CONTAINS[c] %@", "Search")).firstMatch
    if search.exists { search.tap(); search.typeText("tomato"); attach(app, "05-kitchen-search"); search.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue,count:6)); app.swipeUp() }
    tap(app, "Plan", exact: true)
    XCTAssertTrue(app.staticTexts["Your meal plan"].waitForExistence(timeout: 10))
    attach(app, "06-plan")
    tap(app, "More", exact: true)
    attach(app, "07-more")
    tap(app, "The cookbook")
    XCTAssertTrue(app.staticTexts["The cookbook"].waitForExistence(timeout: 10))
    tap(app, "Browse all recipes")
    let recipeSearch = app.textFields["Find a recipe"]
    XCTAssertTrue(recipeSearch.waitForExistence(timeout: 10))
    recipeSearch.tap(); enter("Roasted tomato pasta", into: recipeSearch)
    app.swipeUp()
    let recipe = app.buttons["Roasted tomato pasta"]
    XCTAssertTrue(recipe.waitForExistence(timeout: 15))
    attach(app, "08-recipes")
    recipe.tap()
    XCTAssertTrue(app.buttons["Start cooking"].waitForExistence(timeout: 10))
    attach(app, "09-recipe")
    tap(app, "+")
    tap(app, "Start cooking")
    XCTAssertTrue(app.staticTexts["Cooking"].waitForExistence(timeout: 10))
    attach(app, "10-cooking")
    for _ in 0..<3 { tap(app, "Complete step & next") }
    tap(app, "Complete final step")
    tap(app, "Yes", exact: false)
    let servingsField = app.textFields["How many servings did you make?"]
    XCTAssertTrue(servingsField.waitForExistence(timeout: 10))
    XCTAssertEqual(servingsField.value as? String, "3")
    attach(app, "11-confirmation-servings")
    tap(app, "Cancel")
  }
  @MainActor
  func testThemeAndLanguage() throws {
    let app = XCUIApplication(bundleIdentifier: "com.remi.cookbook.independent")
    app.launchArguments = ["-RCT_jsLocation", "localhost:8091"]
    app.launch()
    XCTAssertTrue(app.staticTexts["Remi"].waitForExistence(timeout: 30))
    tap(app, "More", exact: true)
    tap(app, "Settings")
    tap(app, "Dark")
    attach(app, "12-settings-dark")
    tap(app, "العربية")
    XCTAssertTrue(app.staticTexts["الإعدادات"].waitForExistence(timeout: 10))
    attach(app, "13-settings-arabic-dark")
    tap(app, "فاتح")
    attach(app, "14-settings-arabic-light")
    tap(app, "English")
    tap(app, "Back to More")
    tap(app, "Home", exact: true)
    attach(app, "15-home-final")
  }
  @MainActor
  func enter(_ text: String, into field: XCUIElement) {
    for character in text { field.typeText(String(character)); Thread.sleep(forTimeInterval: 0.04) }
  }
  @MainActor
  func tap(_ app: XCUIApplication, _ label: String, exact: Bool = false) {
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    if springboard.buttons["Not Now"].exists { springboard.buttons["Not Now"].tap() }
    if app.buttons["Not Now"].exists { app.buttons["Not Now"].tap() }
    let element = exact ? app.otherElements[label] : app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
    for _ in 0..<5 {
      if element.exists && element.isHittable { element.tap(); return }
      app.swipeUp()
    }
    XCTFail("Could not tap \(label). Tree: \(app.debugDescription)")
  }
  @MainActor
  func attach(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    let tree = XCTAttachment(string: app.debugDescription); tree.name = "\(name)-accessibility"; tree.lifetime = .keepAlways; add(tree)
  }
}
