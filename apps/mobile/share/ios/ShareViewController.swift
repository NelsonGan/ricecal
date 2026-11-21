import UIKit
import UniformTypeIdentifiers

/// RiceCal's entry in the share sheet. It draws nothing: it finds the shared
/// post's link, opens the app at `/recipe/import` with it and goes away. The
/// import itself, and everything the user sees of it, is in the app.
///
/// A plain view controller rather than `SLComposeServiceViewController`, whose
/// compose sheet would ask for a comment nobody has to write.
final class ShareViewController: UIViewController {
  private var started = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
  }

  // Not `viewDidLoad`: opening the app walks the responder chain up to the
  // UIApplication, and the chain only reaches it once the view is on screen.
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !started else { return }
    started = true

    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    Self.findLink(in: items) { [weak self] link in
      DispatchQueue.main.async { self?.finish(with: link) }
    }
  }

  private func finish(with link: URL?) {
    let scheme = Bundle.main.object(forInfoDictionaryKey: "RiceCalScheme") as? String ?? "ricecal"
    guard let link, let target = SharedLink.importURL(for: link, scheme: scheme) else {
      showNoLink()
      return
    }
    openContainingApp(target) { [weak self] _ in
      self?.extensionContext?.completeRequest(returningItems: nil)
    }
  }

  /// A share extension has no `UIApplication.shared` and no API to open its
  /// own app (`NSExtensionContext.open` works only for widgets). The process
  /// does have a UIApplication, at the top of the responder chain, and since
  /// iOS 18 its `open(_:options:)` is the call that works; the older
  /// `perform(openURL:)` trick stopped doing anything there.
  private func openContainingApp(_ url: URL, completion: @escaping (Bool) -> Void) {
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        application.open(url, options: [:], completionHandler: completion)
        return
      }
      responder = current.next
    }
    completion(false)
  }

  private func showNoLink() {
    let words = NoLinkWords.current
    let alert = UIAlertController(title: words.title, message: nil, preferredStyle: .alert)
    alert.addAction(
      UIAlertAction(title: words.ok, style: .default) { [weak self] _ in
        self?.extensionContext?.completeRequest(returningItems: nil)
      })
    present(alert, animated: true)
  }

  /// Every candidate the share carried, in the order they are trusted: a URL
  /// attachment first (Safari, Instagram), then shared text (TikTok and
  /// Rednote put the link inside a sentence), then the item's own text.
  private static func findLink(in items: [NSExtensionItem], completion: @escaping (URL?) -> Void) {
    let group = DispatchGroup()
    let lock = NSLock()
    var candidates: [(rank: Int, order: Int, text: String)] = []
    var order = 0

    func add(_ rank: Int, _ text: String?) {
      guard let text, !text.isEmpty else { return }
      lock.lock()
      candidates.append((rank, order, text))
      order += 1
      lock.unlock()
    }

    for item in items {
      for provider in item.attachments ?? [] {
        for (rank, type) in [(0, UTType.url), (1, UTType.plainText)]
        where provider.hasItemConformingToTypeIdentifier(type.identifier) {
          group.enter()
          provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { value, _ in
            add(rank, text(of: value))
            group.leave()
          }
        }
      }
      add(2, item.attributedContentText?.string)
    }

    group.notify(queue: .global()) {
      let link = candidates
        .sorted { ($0.rank, $0.order) < ($1.rank, $1.order) }
        .lazy
        .compactMap { SharedLink.webURL($0.text) ?? SharedLink.firstWebURL(in: $0.text) }
        .first
      completion(link)
    }
  }

  private static func text(of value: NSSecureCoding?) -> String? {
    switch value {
    case let url as URL: return url.absoluteString
    case let string as String: return string
    case let data as Data: return String(data: data, encoding: .utf8)
    default: return nil
    }
  }
}

/// The one message this extension shows, in the app's thirteen languages. The
/// extension cannot read the app's language setting, so it follows the phone's.
private struct NoLinkWords {
  let title: String
  let ok: String

  static var current: NoLinkWords {
    for language in Locale.preferredLanguages {
      if let words = table[key(for: language)] { return words }
    }
    return table["en"]!
  }

  private static func key(for language: String) -> String {
    let lower = language.lowercased()
    if lower.hasPrefix("zh") {
      let traditional = ["hant", "-tw", "-hk", "-mo"].contains { lower.contains($0) }
      return traditional ? "zh-Hant" : "zh-Hans"
    }
    if lower.hasPrefix("tl") { return "fil" }
    return String(lower.split(separator: "-").first ?? "")
  }

  private static let table: [String: NoLinkWords] = [
    "en": NoLinkWords(title: "No link to import", ok: "OK"),
    "zh-Hans": NoLinkWords(title: "没有可导入的链接", ok: "好"),
    "zh-Hant": NoLinkWords(title: "沒有可匯入的連結", ok: "好"),
    "ms": NoLinkWords(title: "Tiada pautan untuk diimport", ok: "OK"),
    "id": NoLinkWords(title: "Tidak ada tautan untuk diimpor", ok: "OK"),
    "th": NoLinkWords(title: "ไม่มีลิงก์ให้นำเข้า", ok: "ตกลง"),
    "vi": NoLinkWords(title: "Không có liên kết để nhập", ok: "OK"),
    "fil": NoLinkWords(title: "Walang link na mai-import", ok: "OK"),
    "ja": NoLinkWords(title: "読み込めるリンクがありません", ok: "OK"),
    "ko": NoLinkWords(title: "가져올 링크가 없습니다", ok: "확인"),
    "hi": NoLinkWords(title: "आयात करने के लिए कोई लिंक नहीं है", ok: "ठीक है"),
    "ta": NoLinkWords(title: "இறக்குமதி செய்ய இணைப்பு இல்லை", ok: "சரி"),
    "bn": NoLinkWords(title: "ইমপোর্ট করার মতো কোনো লিংক নেই", ok: "ঠিক আছে"),
  ]
}
