# Unify Dash Brand Tokens with DTS's Brand Kit

## Status

Accepted - June 2026

## Context

Delgado Trucking Services (DTS) brand kit was drifting between two sites (Dash and DTS site) and it is unclear which one is authoritative.

Because the two share the same domain, if someone visiting the site after visiting Dash, they would notice a brand shift because of the drift.

Also, the color system has two chart systems (shadcn and custom created). One is all that is needed.

Finally the brand names are not all being referenced by their name. `Chrome/Silver` is `--color-light`/ `--color-muted-text`.

## Decision

- Refactored Dash's brand kit to use dts-site's brand kit
- Dropped the custom chart system and decided to use shadcn's chart system in place
- Kept the two name reference and documented it in `docs/brand/color-tokens.md`

## Rationale

- It made sense to use the dts-site brand colors because they were the brand colors true to the brand kit. By Dash adopting those colors, everything will be unified.
- The custom chart system was chosen to be replaced with shadcn's chart system because the color choices are semantic colors not part of DTS's brand kit, and it saves on production time
- Chose to keep the two-name color references so that we wouldn't have to go through each component/file and update every reference to the colors

## Alternatives Considered

- Considered making dash's tokens canonical and updating dts-site instead — rejected because dts-site already matches the brand kit.
- Considered keeping both chart systems — rejected as redundant.
- Considered renaming --color-light/--color-muted-text to chrome/silver — rejected to avoid editing every component that references them.

## Consequences

Dropping the custom color system locks me in with the color system that is being used by shadcn.

Keeping the two-name color references convolutes the brand names a bit
