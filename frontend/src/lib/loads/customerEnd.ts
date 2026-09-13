// Whose customer is a load (decision 5A, migration 074).
//
// Every footprint path used to read a load's ORIGIN as the agent's market.
// That is right for the normal case — the agent's shipper hands you freight —
// and wrong the moment the agent's customer is on the RECEIVING end: load
// 2543056 was picked up at a tradeshow marshalling yard in Atlanta and
// delivered to C R Onsrud in Troutman, NC, the shipper on five of Mike
// Sorrentino's other loads. Reading the origin put Atlanta in his footprint
// and left Troutman out.
//
// One mark per load says which end the agent's customer sits on, and every
// footprint reader follows it:
//   shipper   the ORIGIN is the market (the default — nothing changes)
//   receiver  the DESTINATION is; the shipper was a one-time place
//   neither   the load says nothing about where the agent's freight lives
//
// dash SUGGESTS the mark and never writes it — `suggestCustomerEnd` returns a
// sentence for a human to accept or ignore. Pure; no I/O, no clock.
export type CustomerEnd = "shipper" | "receiver" | "neither";

export const CUSTOMER_ENDS = ["shipper", "receiver", "neither"] as const;

// The minimum a load has to carry for any of this. Everything is optional so
// fixtures and partial rows read as the default (shipper / origin) instead of
// throwing — the column is NOT NULL DEFAULT 'shipper' in the database, so a
// real row always carries one.
export interface CustomerEndLoadLike {
  load_id?: string | null;
  agent_id?: string | null;
  agent?: string | null; // the agent's display name — "Mike Sorrentino"
  customer_end?: CustomerEnd | null;
  origin_city?: string | null;
  origin_state?: string | null;
  destination_city?: string | null;
  destination_state?: string | null;
  shipper_name?: string | null;
  receiver_name?: string | null;
}

export interface FootprintPlace {
  city: string;
  state: string;
}

// A missing / unknown value reads as 'shipper', so an un-marked row behaves
// exactly as it did before 074.
export const customerEndOf = (load: CustomerEndLoadLike): CustomerEnd =>
  load.customer_end === "receiver" || load.customer_end === "neither"
    ? load.customer_end
    : "shipper";

// The one point this load puts on the agent's footprint — null when the load
// says nothing ('neither'), or when the end it points at has no city/state.
export const footprintPoint = (load: CustomerEndLoadLike): FootprintPlace | null => {
  const end = customerEndOf(load);
  if (end === "neither") return null;
  const city = String((end === "shipper" ? load.origin_city : load.destination_city) ?? "").trim();
  const state = String((end === "shipper" ? load.origin_state : load.destination_state) ?? "").trim();
  if (!city || !state) return null;
  return { city, state };
};

const partyName = (load: CustomerEndLoadLike, end: CustomerEnd): string | null => {
  const raw = end === "shipper" ? load.shipper_name : load.receiver_name;
  return String(raw ?? "").trim() || null;
};

const placeWord = (load: CustomerEndLoadLike, end: CustomerEnd): string | null => {
  const city = String((end === "shipper" ? load.origin_city : load.destination_city) ?? "").trim();
  const state = String((end === "shipper" ? load.origin_state : load.destination_state) ?? "").trim();
  if (!city) return null;
  return state ? `${city}, ${state}` : city;
};

// What the three-option control reads on THIS load: "Shipper · Marshalling
// Yard" / "Receiver · C R Onsrud" / "Neither". With no party name on file the
// city stands in for it ("Shipper · Atlanta, GA"); with neither, the bare word.
export const partyLabel = (load: CustomerEndLoadLike, end: CustomerEnd): string => {
  if (end === "neither") return "Neither";
  const head = end === "shipper" ? "Shipper" : "Receiver";
  const who = partyName(load, end) ?? placeWord(load, end);
  return who ? `${head} · ${who}` : head;
};

// ---- the suggestion ----
// Names are typed by hand, load after load, so they are compared loosely:
// lowercased, punctuation dropped, runs of whitespace collapsed.
const normName = (raw?: string | null): string =>
  String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Recurrence {
  loads: number; // OTHER loads of this agent carrying the name at either end
  asShipper: number; // ... of those, how many had it as the shipper
}

const recurrenceOf = (name: string, others: CustomerEndLoadLike[]): Recurrence => {
  let loads = 0;
  let asShipper = 0;
  if (!name) return { loads, asShipper };
  for (const o of others) {
    const isShipper = normName(o.shipper_name) === name;
    const isReceiver = normName(o.receiver_name) === name;
    if (!isShipper && !isReceiver) continue;
    loads += 1;
    if (isShipper) asShipper += 1;
  }
  return { loads, asShipper };
};

const firstNameOf = (agent?: string | null): string =>
  String(agent ?? "").trim().split(/\s+/)[0] || "this agent";

export interface CustomerEndSuggestion {
  end: CustomerEnd;
  why: string; // the sentence the Well shows, verbatim
}

// dash's read on whose customer this load is — a SUGGESTION, never a write.
//
// A party that keeps turning up across an agent's loads is that agent's
// customer; a party seen once is a place the freight happened to touch. So:
// this load's receiver recurs on their other loads and its shipper does not →
// the receiver is the customer. The mirror case suggests the shipper. Both
// recur, or neither does → no suggestion, because the evidence is a wash and
// a coin-flip in dash's voice is worse than silence.
//
// Returns null when the suggestion is already the saved mark — there is
// nothing to offer a person who has answered.
export const suggestCustomerEnd = (
  load: CustomerEndLoadLike,
  agentLoads: CustomerEndLoadLike[],
): CustomerEndSuggestion | null => {
  // "Every load but this one." By id when both rows actually carry one; by
  // IDENTITY otherwise. Comparing two absent ids (`undefined !== undefined`)
  // is false, so a set of partial rows — a fixture, a projection that drops
  // load_id — used to exclude ITSELF and every sibling at once, leaving no
  // candidates and no suggestion.
  const isThisLoad = (o: CustomerEndLoadLike): boolean =>
    typeof load.load_id === "string" && typeof o.load_id === "string"
      ? o.load_id === load.load_id
      : o === load;
  const others = agentLoads.filter(
    (o) =>
      !isThisLoad(o) &&
      (load.agent_id == null || o.agent_id == null || o.agent_id === load.agent_id),
  );
  if (others.length === 0) return null;

  const receiverKey = normName(load.receiver_name);
  const shipperKey = normName(load.shipper_name);
  const receiverHits = recurrenceOf(receiverKey, others);
  const shipperHits = recurrenceOf(shipperKey, others);
  // The same name on both ends of this load proves nothing about either.
  const receiverRecurs = receiverKey !== "" && receiverKey !== shipperKey && receiverHits.loads > 0;
  const shipperRecurs = shipperKey !== "" && shipperKey !== receiverKey && shipperHits.loads > 0;
  if (receiverRecurs === shipperRecurs) return null; // both, or neither

  const end: CustomerEnd = receiverRecurs ? "receiver" : "shipper";
  if (end === customerEndOf(load)) return null; // already marked that way

  const hits = receiverRecurs ? receiverHits : shipperHits;
  const name = partyName(load, end) ?? (receiverRecurs ? "The receiver" : "The shipper");
  // The role and its OWN count, or the sentence lies. C R Onsrud is the
  // receiver on 4 of Mike's loads and the shipper on 1: "the shipper on 5
  // other loads" (the old line — a majority role with the total beside it) is
  // two wrong facts in one breath. Majority role wins, ties to shipper, and
  // the number counts only the loads that back the word.
  const asReceiver = hits.loads - hits.asShipper;
  const shipperSide = hits.asShipper >= asReceiver;
  const role = shipperSide ? "shipper" : "receiver";
  const n = shipperSide ? hits.asShipper : asReceiver;
  const count = `${n} other load${n === 1 ? "" : "s"}`;
  const first = firstNameOf(load.agent);
  const tail =
    end === "receiver"
      ? "this one is theirs coming home."
      : "the origin is their market.";
  // What the tap actually does, in the same breath as the reason — the mock's
  // second sentence. Nobody should have to guess which city the footprint
  // gains and which it loses before pressing the button.
  const keep = placeWord(load, end);
  const drop = placeWord(load, end === "receiver" ? "shipper" : "receiver");
  const marked = end === "receiver" ? "Receiver" : "Shipper";
  const consequence = keep
    ? drop
      ? ` Marked ${marked}; ${first}'s footprint keeps ${keep} and drops ${drop}.`
      : ` Marked ${marked}; ${first}'s footprint keeps ${keep}.`
    : "";
  return {
    end,
    why: `${name} is the ${role} on ${count} with ${first} — ${tail}${consequence}`,
  };
};
