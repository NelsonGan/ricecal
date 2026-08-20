import SwiftUI

/**
 The design system's colours, for a process that cannot import it.

 A hand-copied subset of `src/theme/tokens.ts` — only the roles the six widgets
 actually draw with. Copied rather than generated because a widget extension has
 no bundler and no JSON worth parsing on every timeline render, and because the
 list is short enough that a drift is visible in a screenshot.

 The values are UPPERCASE six-digit hex to match the token file literally, which
 is what makes a diff between the two readable.
 */
struct Palette {
  let canvas: Color
  let surface: Color
  let line: Color
  let track: Color
  let ink: Color
  let heading: Color
  let muted: Color
  let faint: Color

  let pandan: Color
  let pandanSlab: Color
  let pandanSoft: Color
  let pandanSoftLine: Color
  let pandanInk: Color

  let hibiscus: Color
  let hibiscusSoft: Color
  let hibiscusSoftLine: Color

  let kaya: Color
  let kayaSoft: Color
  let kayaSoftLine: Color

  let water: Color
  let waterSlab: Color
  let waterSoft: Color
  let waterSoftLine: Color
  let onWater: Color

  let teh: Color

  static let light = Palette(
    canvas: hex("F6F8F7"),
    surface: hex("FFFFFF"),
    line: hex("E4E8E5"),
    track: hex("EDF1EE"),
    ink: hex("1C2321"),
    heading: hex("1B3A2B"),
    muted: hex("6E7B74"),
    faint: hex("9AA5A0"),
    pandan: hex("2FBF71"),
    pandanSlab: hex("1B8A4E"),
    pandanSoft: hex("EAF9F0"),
    pandanSoftLine: hex("CFEBDA"),
    pandanInk: hex("1B8A4E"),
    hibiscus: hex("FF4D6D"),
    hibiscusSoft: hex("FFEEF1"),
    hibiscusSoftLine: hex("F7D2DA"),
    kaya: hex("FFC145"),
    kayaSoft: hex("FFF6E3"),
    kayaSoftLine: hex("F0DDAE"),
    water: hex("4CC9F0"),
    waterSlab: hex("1B87A8"),
    waterSoft: hex("EAF7FC"),
    waterSoftLine: hex("BEE6F5"),
    onWater: hex("FFFFFF"),
    teh: hex("C98B5E")
  )

  /**
   The dark twin, following the conversion table in the design system notes.

   The one rule that is easy to get wrong and is written out there: a filled
   button flips its label to near-black, because the accents get BRIGHTER in
   dark mode rather than darker. That is `onWater` below.
   */
  static let dark = Palette(
    canvas: hex("111716"),
    surface: hex("1A2220"),
    line: hex("2E3936"),
    track: hex("2E3936"),
    ink: hex("F2F5F3"),
    heading: hex("F2F5F3"),
    muted: hex("8B9A94"),
    faint: hex("6E7B74"),
    pandan: hex("38D07E"),
    pandanSlab: hex("1C6E44"),
    pandanSoft: hex("14291F"),
    pandanSoftLine: hex("2E4A3C"),
    pandanInk: hex("38D07E"),
    hibiscus: hex("FF6B87"),
    hibiscusSoft: hex("33161C"),
    hibiscusSoftLine: hex("5E2A35"),
    kaya: hex("FFCE5E"),
    kayaSoft: hex("3A3115"),
    kayaSoftLine: hex("6B5A2A"),
    water: hex("63D3F2"),
    waterSlab: hex("1E6E86"),
    waterSoft: hex("12262E"),
    waterSoftLine: hex("2E5A6B"),
    onWater: hex("0C1310"),
    teh: hex("D6A277")
  )

  static func hex(_ value: String) -> Color {
    var int: UInt64 = 0
    Scanner(string: value).scanHexInt64(&int)
    return Color(
      .sRGB,
      red: Double((int >> 16) & 0xFF) / 255,
      green: Double((int >> 8) & 0xFF) / 255,
      blue: Double(int & 0xFF) / 255,
      opacity: 1
    )
  }
}

/**
 The two faces, by their PostScript names.

 Baloo 2 carries numbers, headings and button labels; Nunito carries everything
 read as a sentence. The same split the app makes — see `theme/fonts.ts` — and
 the same reason the files are embedded in the extension rather than loaded: a
 widget gets no chance to load a font asynchronously.
 */
enum WidgetFont {
  /// Numbers, headings, button labels.
  static func display(_ size: CGFloat) -> Font {
    .custom("Baloo2-ExtraBold", size: size)
  }

  /// Labels and captions, at the design's 800 weight.
  static func label(_ size: CGFloat) -> Font {
    .custom("Nunito-ExtraBold", size: size)
  }

  /// Body copy, at 700.
  static func body(_ size: CGFloat) -> Font {
    .custom("Nunito-Bold", size: size)
  }
}

/**
 The icons the widgets draw, copied out of `assets/icons` by the config plugin.

 A helper rather than `Image("wg-camera")` at the call sites, because a missing
 file is otherwise an invisible blank: `Image(_:)` with an unknown name renders
 nothing at all and reports nothing. This falls back to the nearest SF Symbol,
 so a plugin that stopped copying shows up as the wrong drawing rather than as
 empty space.
 */
struct WidgetIcon: View {
  let name: String
  let fallback: String
  var size: CGFloat

  var body: some View {
    if let image = UIImage(named: name) {
      Image(uiImage: image)
        .resizable()
        .scaledToFit()
        .frame(width: size, height: size)
    } else {
      Image(systemName: fallback)
        .font(.system(size: size * 0.8, weight: .bold))
        .frame(width: size, height: size)
    }
  }

  static func camera(_ size: CGFloat) -> WidgetIcon {
    WidgetIcon(name: "wg-camera", fallback: "camera.fill", size: size)
  }

  static func search(_ size: CGFloat) -> WidgetIcon {
    WidgetIcon(name: "wg-search", fallback: "magnifyingglass", size: size)
  }

  static func barcode(_ size: CGFloat) -> WidgetIcon {
    WidgetIcon(name: "wg-barcode", fallback: "barcode.viewfinder", size: size)
  }

  static func recipe(_ size: CGFloat) -> WidgetIcon {
    WidgetIcon(name: "wg-recipe", fallback: "fork.knife", size: size)
  }
}

/**
 Where a tap goes.

 Every widget link crosses `ricecal://widget/...`, and nothing else in the app
 does — which is the point. That one route is where a widget tap is counted,
 and a link straight to `/log?panel=camera` would open the right screen and be
 invisible to the adoption report. See `app/widget/[action].tsx`.
 */
enum WidgetLink {
  static func open(_ kind: RiceCalWidgetKind, target: String) -> URL {
    // `ricecal://` is the store build's scheme; a dev client registers
    // `ricecal-dev://`. The plugin writes whichever one this build resolved
    // into the extension's Info.plist, because two apps claiming one scheme is
    // undefined behaviour and a widget tap would open the other build.
    let scheme =
      (Bundle.main.object(forInfoDictionaryKey: "RiceCalScheme") as? String) ?? "ricecal"
    var components = URLComponents()
    components.scheme = scheme
    components.host = "widget"
    components.path = "/\(target)"
    components.queryItems = [URLQueryItem(name: "w", value: kind.reported)]
    return components.url ?? URL(string: "\(scheme)://widget/open")!
  }
}

/**
 The widget's own background, on both sides of iOS 17.

 `containerBackground` is how a widget paints itself from iOS 17 on, and it is
 required there: a widget that does not adopt it is drawn with a system default
 and, in StandBy and on the Lock Screen, no background at all. It does not exist
 on 16.4, which is this app's floor, so the older path fills the frame itself.
 */
extension View {
  @ViewBuilder
  func widgetSurface(_ palette: Palette) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(palette.surface, for: .widget)
    } else {
      background(palette.surface)
    }
  }
}

/**
 The card's inset, which is the SYSTEM's from iOS 17 and ours before it.

 THE DEFECT THIS FIXES WAS DOUBLE PADDING. WidgetKit applies content margins of
 its own from iOS 17 — about 11pt on a small widget — and a `.padding(16)` on
 top of them measured 27pt against a design that asks for 16. It read as a card
 whose content had shrunk away from its own edges, and it was wrong on all six.

 Deferring to the system rather than turning its margins off with
 `contentMarginsDisabled()`, which is the other way to fix it: that modifier is
 iOS 17 only and returns a different `WidgetConfiguration` type, so branching on
 availability around it cannot be written behind one opaque return type. This
 branch is on a `View`, where `@ViewBuilder` makes it ordinary — and the margin
 it lands on is the platform's own, which is what makes a widget sit like the
 others on a home screen.
 */
extension View {
  @ViewBuilder
  func widgetInset() -> some View {
    if #available(iOS 17.0, *) {
      self
    } else {
      padding(16)
    }
  }
}

/**
 Which palette to draw in.

 The app's own preference wins over the phone's, because a user who has chosen
 Dark in RiceCal has chosen it for RiceCal — and a widget is the app's surface
 even though the system is what renders it. `system` is the ordinary case and
 falls through to the environment.

 A free function rather than a computed property on `WidgetSnapshot`, because
 the snapshot can be absent and the placeholder still needs a palette.
 */
func widgetPalette(for snapshot: WidgetSnapshot?, system: ColorScheme) -> Palette {
  let isDark = snapshot?.prefersDark(system: system == .dark) ?? (system == .dark)
  return isDark ? .dark : .light
}
