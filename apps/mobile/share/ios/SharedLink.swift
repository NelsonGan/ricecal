import Foundation

/// Finding the post's link in whatever the sharing app handed over, and turning
/// it into the app's import route. Kept apart from the view controller so it is
/// plain Foundation with no UIKit in it.
///
/// The Android half is `modules/ricecal-share/.../ShareLink.kt` and has to give
/// the same answers: the two are the same rules written twice.
enum SharedLink {
  /// The characters a URL may hold, rather than "anything up to a space".
  /// Rednote shares `…http://xhslink.com/a/AbC，复制本条信息…`, with a fullwidth
  /// comma and Chinese straight after the link, and a match that runs to the
  /// next space imports a link that does not exist.
  private static let pattern = try! NSRegularExpression(
    pattern: "https?://[A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=%]+",
    options: [.caseInsensitive]
  )

  /// The first http(s) link in `text`, without the punctuation of the sentence
  /// around it ("Check this https://… !").
  static func firstWebURL(in text: String) -> URL? {
    let range = NSRange(text.startIndex..., in: text)
    for match in pattern.matches(in: text, range: range) {
      guard let found = Range(match.range, in: text) else { continue }
      var candidate = String(text[found])
      while let last = candidate.last, ".,;:!?'\"])".contains(last) {
        // A closing bracket the link opened is part of it.
        if last == ")" && candidate.contains("(") { break }
        candidate.removeLast()
      }
      if let url = webURL(candidate) { return url }
    }
    return nil
  }

  /// `url` if it is a web page, which a shared file or a `mailto:` is not.
  static func webURL(_ text: String) -> URL? {
    guard let url = URL(string: text),
      let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
      let host = url.host, !host.isEmpty
    else { return nil }
    return url
  }

  /// `ricecal:///recipe/import?url=<link>`. Encoded down to the unreserved
  /// characters, so the link's own `?` and `&` stay inside the one parameter.
  static func importURL(for link: URL, scheme: String) -> URL? {
    let unreserved = CharacterSet(
      charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
    guard let encoded = link.absoluteString.addingPercentEncoding(withAllowedCharacters: unreserved)
    else { return nil }
    return URL(string: "\(scheme):///recipe/import?url=\(encoded)")
  }
}
