# Dash Color Tokens

Dash's color tokens are split up into two groups: **Brand Tokens** and **Semantic Tokens**.

The brand tokens are **_sacred_**. While the semantic tokens are **_free to evolve_**.

Shadcn's base and chart tokens are documented by shadcn; this reference covers only DTS-specific tokens

## Colors

### Brand Tokens (sacred)

| Color        | Hex Code  | Description/Usage                                    |
| ------------ | --------- | ---------------------------------------------------- |
| Steel        | `#0d1117` | Primary background, document backgrounds             |
| Iron         | `#1c2333` | Cards, panels, secondary surfaces                    |
| Plate        | `#2a3347` | Borders, dividers, rules. Never as primary fill      |
| Amber        | `#e8940a` | The signal color, logo bar, accents, calls to action |
| Chrome/Light | `#ebedf5` | Primary 'readable' text on dark backgrounds          |
| Silver/Muted | `#9daabb` | Secondary text, meta data, supporting labels         |
| Amber Dark   | `#b5700a` | Gradients, depth, secondary amber use                |
| Amber Light  | `#f5b03a` | Gradient highlight, hover states. Never standalone   |

### Semantic Tokens (free to evolve / status)

Status color values are provisional — they'll be finalized once dark-mode unification lands, since they need to be chosen against the real dark surfaces.

#### Status Colors

| Color               | Hex Code                  | Description/Usage                      |
| ------------------- | ------------------------- | -------------------------------------- |
| Positive Background | `#1a3a2a`                 | Background color for a positive status |
| Positive Text       | `#4ade80`                 | Text color for a positive status       |
| Negative Background | `#3a1a1a`                 | Background color for a negative status |
| Negative Text       | `#f87171`                 | Text color for a negative status       |
| Aware Background    | `#3a2a0a`                 | Background color for an aware status   |
| Aware Text          | `var(--color-amber)`      | Text color for an aware status         |
| Neutral Background  | `#2d333b`                 | Background color for a neutral status  |
| Neutral Text        | `var(--color-muted-text)` | Text color for a neutral status        |

### Color Hierarchy

**Steel Dominates.** 60-70% of any composition is **_Steel_** or **_Iron_**. These are the "dark foundation colors" -- the weight of the brand.

**Amber Accents.** Never more than 15-20% of any composition. The less it is used, the harder it hits.

**Chrome and Silver**. Carry all readable text. They never compete with **_Amber_**.
