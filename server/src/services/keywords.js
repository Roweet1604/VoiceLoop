// Repeated words and two-word phrases across a set of texts. Deterministic
// counting, not AI: lowercase, drop punctuation and common English words,
// then count. Each text counts a term at most once, so one long complaint
// repeating a word can't make it look like a recurring problem.

export const KEYWORD_MIN_COUNT = 3;
export const KEYWORD_LIMIT = 10;

// Common English words that carry no topic on their own. Apostrophes are
// removed before matching, so contractions appear without them.
const STOPWORDS = new Set(
  `a about above after again against all also am an and any are arent as at be because been before being below
  between both but by can cant could couldnt did didnt do does doesnt doing dont down during each even ever every
  few for from further get gets got had hadnt has hasnt have havent having he hed hell hes her here heres hers
  herself him himself his how hows however i id ill im ive if in into is isnt it its itself just lets like me
  more most much must mustnt my myself no nor not now of off on once one only or other ought our ours ourselves
  out over own quite really same she shed shell shes should shouldnt so some such than that thats the their
  theirs them themselves then there theres these they theyd theyll theyre theyve this those through to too under
  until up us very was wasnt we wed well were weve werent what whats when whens where wheres which while who whos
  whom why whys will with wont would wouldnt yet you youd youll youre youve your yours yourself yourselves`.split(/\s+/)
);

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// A token worth counting: not a stopword, not a single character, not a bare number.
const meaningful = (token) => token.length > 1 && !STOPWORDS.has(token) && !/^\p{N}+$/u.test(token);

/**
 * Returns up to `limit` terms that appear in at least `minCount` texts, as
 * [{ term, count }], most frequent first. At equal counts a phrase comes
 * before a single word (it's more specific), then alphabetical order.
 * Phrases are two adjacent meaningful words; a stopword between them breaks
 * the phrase ("food was cold" gives "food" and "cold", not "food cold").
 */
export function keywordCounts(texts, { minCount = KEYWORD_MIN_COUNT, limit = KEYWORD_LIMIT } = {}) {
  const counts = new Map();
  for (const text of texts) {
    const terms = new Set();
    let previous = null;
    for (const token of tokenize(text)) {
      if (!meaningful(token)) {
        previous = null;
        continue;
      }
      terms.add(token);
      if (previous && previous !== token) terms.add(`${previous} ${token}`);
      previous = token;
    }
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  }

  const isPhrase = (term) => term.includes(" ");
  return [...counts]
    .filter(([, count]) => count >= minCount)
    .sort(([a, countA], [b, countB]) => countB - countA || isPhrase(b) - isPhrase(a) || a.localeCompare(b))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}
