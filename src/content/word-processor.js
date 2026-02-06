// Word normalization, tokenization, and stop word filtering
class WordProcessor {
  /**
   * Normalize a raw word: lowercase, strip surrounding punctuation.
   * Unicode-aware to handle accented characters (á, é, ñ, etc.)
   */
  normalize(rawWord) {
    let word = rawWord.toLowerCase();

    // Strip leading non-letter/non-number characters
    word = word.replace(/^[^\p{L}\p{N}]+/u, '');
    // Strip trailing non-letter/non-number characters
    word = word.replace(/[^\p{L}\p{N}]+$/u, '');

    return word;
  }

  /**
   * Split text into normalized word tokens.
   */
  tokenize(text) {
    return text
      .split(/\s+/)
      .map(w => this.normalize(w))
      .filter(w => w.length > 0);
  }

  /**
   * Check if a word is a Spanish stop word.
   */
  isStopWord(word) {
    return STOP_WORDS_ES.has(word);
  }
}
