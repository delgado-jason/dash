// The owner's own test signups. Jason tests the Logbook form with plus-addressing
// (jason+logbook-test@...), and those rows are real rows in site_subscribers —
// but they are not readers, so the Website page's Subscribers figure must not
// count them. The rule: the tag `+logbook-test` (optionally followed by more
// tag text, e.g. `+logbook-test2`) in the part BEFORE the @, case-insensitive.
// The rows themselves stay (the Latest list still shows them); only the
// counts skip them.
//
// One rule, two spellings: the JS test below and the Postgres `~*` pattern
// the count query uses. testSubscriber.test.js holds them to the same cases.
export const TEST_ADDRESS_RE = /\+logbook-test[^@]*@/i;

export const TEST_ADDRESS_SQL_PATTERN = "\\+logbook-test[^@]*@";

export const isTestSubscriberAddress = (email) =>
  typeof email === "string" && TEST_ADDRESS_RE.test(email);
