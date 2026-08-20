import SwiftUI
import WidgetKit

/**
 MEDIUM · QUICK LOG — four taps to the four ways of logging.

 The one widget that draws nothing off the diary except the figure in its
 corner, so it is the one that still works on an account with no budget: the
 four doors are there whether or not a target has been computed.

 The four match the log sheet's own row, in the same order and the same colours,
 because they are the same four things — see `QuickAction` in
 `features/logging`. Scan is a tab inside the camera rather than a fifth panel,
 which is why its link carries `panel=barcode`.
 */
struct QuickLogWidgetView: View {
  let entry: RiceCalEntry
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let palette = widgetPalette(for: entry.snapshot, system: colorScheme)

    if let snapshot = entry.snapshot {
      VStack(alignment: .leading, spacing: 11) {
        HStack {
          Text("Log something")
            .font(WidgetFont.display(16))
            .foregroundStyle(palette.heading)
          Spacer(minLength: 6)
          if snapshot.hasBudget {
            Text(
              snapshot.kcal.over
                ? "\(snapshot.kcal.left) kcal over" : "\(snapshot.kcal.left) kcal left"
            )
            .font(WidgetFont.label(11))
            .foregroundStyle(palette.muted)
            .lineLimit(1)
          }
        }

        HStack(spacing: 10) {
          tile(
            .camera(26), "Snap", "camera", palette.pandanSoft, palette.pandanSoftLine,
            palette: palette)
          tile(
            .barcode(26), "Scan", "barcode", palette.kayaSoft, palette.kayaSoftLine,
            palette: palette)
          tile(
            .search(26), "Search", "search", palette.hibiscusSoft, palette.hibiscusSoftLine,
            palette: palette)
          tile(
            .recipe(26), "Recipe", "recipes", palette.waterSoft, palette.waterSoftLine,
            palette: palette)
        }
      }
      .widgetInset()
      .widgetSurface(palette)
    } else {
      WidgetPlaceholder(palette: palette, kind: .quickLog)
    }
  }

  private func tile(
    _ icon: WidgetIcon,
    _ title: String,
    _ target: String,
    _ fill: Color,
    _ line: Color,
    palette: Palette
  ) -> some View {
    Link(destination: WidgetLink.open(.quickLog, target: target)) {
      WidgetActionTile(icon: icon, title: title, fill: fill, line: line, ink: palette.ink)
    }
  }
}

struct QuickLogWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: RiceCalWidgetKind.quickLog.rawValue, provider: RiceCalProvider()) {
      entry in
      QuickLogWidgetView(entry: entry)
    }
    .configurationDisplayName("Quick log")
    .description("Snap, scan, search or a recipe, one tap each.")
    .supportedFamilies([.systemMedium])
  }
}
