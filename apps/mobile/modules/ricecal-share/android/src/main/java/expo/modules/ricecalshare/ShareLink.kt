package expo.modules.ricecalshare

/**
 * Finding the post's link in shared text, and the app's import route for it.
 * Plain Kotlin with no Android in it.
 *
 * The iOS half is `share/ios/SharedLink.swift` and has to give the same
 * answers: the two are the same rules written twice.
 */
object ShareLink {
  /**
   * The characters a URL may hold, rather than "anything up to a space".
   * Rednote shares `…http://xhslink.com/a/AbC，复制本条信息…`, with a fullwidth
   * comma and Chinese straight after the link, and a match that runs to the
   * next space imports a link that does not exist.
   */
  private val pattern = Regex("""https?://[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+""", RegexOption.IGNORE_CASE)

  private const val TRAILING = ".,;:!?'\"])"

  private const val UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

  /** The first http(s) link in [text], without the sentence's punctuation around it. */
  fun firstWebUrl(text: String): String? {
    for (match in pattern.findAll(text)) {
      var candidate = match.value
      while (candidate.isNotEmpty() && candidate.last() in TRAILING) {
        // A closing bracket the link opened is part of it.
        if (candidate.last() == ')' && '(' in candidate) break
        candidate = candidate.dropLast(1)
      }
      val host = candidate.substringAfter("://").substringBefore('/').substringBefore('?').substringBefore('#')
      if (host.isNotEmpty()) return candidate
    }
    return null
  }

  /**
   * `ricecal:///recipe/import?url=<link>`. Encoded down to the unreserved
   * characters, so the link's own `?` and `&` stay inside the one parameter.
   */
  fun importUrl(scheme: String, link: String): String {
    val encoded = buildString {
      for (byte in link.toByteArray(Charsets.UTF_8)) {
        val char = byte.toInt().toChar()
        if (byte >= 0 && char in UNRESERVED) append(char) else append("%%%02X".format(byte.toInt() and 0xFF))
      }
    }
    return "$scheme:///recipe/import?url=$encoded"
  }
}
