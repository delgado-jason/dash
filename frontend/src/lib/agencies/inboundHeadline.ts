// The statusbar's identity chip: INBOUND {headline}. A percentage of three
// loads is noise, so the headline stays a FRACTION ("0 of 3") until ten
// attributed loads exist, then turns into a percent ("43%"). Reads the same
// InboundShare shape inboundShare() produces (lib/metrics/relationships).

export const INBOUND_HEADLINE_MIN = 10;

export interface InboundShareLike {
  attributed: number;
  inbound: number;
  share: number | null;
}

export const inboundHeadline = (s: InboundShareLike): string => {
  if (s.attributed < INBOUND_HEADLINE_MIN || s.share == null) return `${s.inbound} of ${s.attributed}`;
  return `${Math.round(s.share * 100)}%`;
};
