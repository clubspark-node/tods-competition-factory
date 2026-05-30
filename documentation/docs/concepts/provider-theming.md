---
title: Provider Theming
---

CourtHive ships as a single deployable bundle that can be visually re-skinned per provider at runtime. A tournament-management organization (ITA, USTA section, a school athletic conference, a private club federation, etc.) can plant its colors, fonts, logo, and — when needed — an entire stylesheet on the same `TMX` client and `courthive-public` viewer that every other provider uses, without a separate build.

This page covers the moving parts: where the configuration lives, what providers can override, how to set it, and how it flows to the running page.

## The two override surfaces

Every theming knob is one of two shapes:

```ts
interface ProviderBranding {
  // logos / app identity
  appName?: string;
  navbarLogoUrl?: string;
  navbarLogoAlt?: string;
  navbarLogoHeight?: number;
  splashLogoUrl?: string;
  accentColor?: string;

  // theming — added in May 2026
  themeTokens?: Record<string, string>;
  stylesheetUrl?: string;
}
```

### `themeTokens` — CSS custom-property overrides

A flat map keyed on CSS custom-property names. Keys must start with one of two allowed prefixes:

| Prefix   | Surface                                     | Owner                                                           |
| -------- | ------------------------------------------- | --------------------------------------------------------------- |
| `--tmx-` | TMX client                                  | `TMX/src/styles/theme.css`                                      |
| `--chc-` | `courthive-public` + `courthive-components` | `courthive-components/src/styles/theme.css` + per-app additions |

Values are CSS color / length / font strings — whatever the property accepts (`#15365d`, `1.05rem`, `'Inter', sans-serif`, etc.).

```ts
themeTokens: {
  '--tmx-accent-blue': '#15365d',
  '--tmx-fill-accent': '#15365d',
  '--tmx-status-info': '#15365d',
  '--chc-text-link': '#15365d',
}
```

At boot and on provider switch, the client writes these properties inline on `document.documentElement` and tracks which it wrote (`data-tmx-provider-tokens` / `data-chp-provider-tokens`). Switching to a provider that overrides fewer tokens removes the prior set cleanly — bundled CSS defaults reassert themselves automatically.

### `stylesheetUrl` — full-CSS escape hatch

For theming that can't be expressed by overriding existing tokens — custom fonts loaded via `@font-face`, animations, layout tweaks, decorative pseudo-elements — the provider can host a stylesheet and point at it:

```ts
stylesheetUrl: 'https://acme.example.com/courthive-theme.css';
```

The client maintains a single `<link id="tmx-provider-theme">` element appended to `<head>` and updates the `href` in place when the provider switches. Because it sits after the bundled stylesheets in the cascade, it overrides anything the bundle declares without `!important`.

This is the more powerful path and the riskier one. Provider stylesheets that target internal class names will break the next time those class names change. Prefer `themeTokens` when the goal can be expressed as a color or size.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ @courthive/provider-config (canonical types + validators)         │
│   - ProviderBranding type                                         │
│   - validateCaps / validateSettings — reject off-prefix keys      │
└──────────────────────────────────────────────────────────────────┘
                ▲                                ▲
                │ link:                          │ link:
                │                                │
┌───────────────────────────┐         ┌─────────────────────────┐
│ competition-factory-server│         │ TMX  +  courthive-public│
│                           │         │                         │
│  ProvisionerService       │         │  applyBranding()        │
│   updateProviderCaps      │         │  -> setProperty loop    │
│   (validates themeTokens) │         │  -> append/update <link>│
│                           │         │                         │
│  GET /provider/           │         │  consumes effective     │
│  by-tournament/:tid/      │ ──────► │  config + public        │
│  branding (public)        │         │  branding endpoint       │
└───────────────────────────┘         └─────────────────────────┘
                ▲
                │
┌───────────────────────────┐
│ admin-client              │
│   Provisioner caps editor │
│   themeTokens key-value   │
│   editor + presets        │
└───────────────────────────┘
```

The validator allowlist (`--tmx-` / `--chc-` only) lives in `provider-config` and runs on every write. CFS, the admin-client UI, and any future ingestion path all consult the same source of truth.

## Setting branding on a provider

### Via the admin-client UI

Open the provisioner workspace, locate the provider in the providers panel, hit **Edit Caps**. The modal has:

- **Branding** section — `appName`, logo URLs, `accentColor`, `stylesheetUrl`.
- **Theme tokens** section — a key-value editor where each row is `<token>: <css-value>`. A "Preset" dropdown surfaces the 16 most commonly overridden tokens by friendly name so admins can fill the form without memorising the surface. Token names validate inline (red border + tooltip) when they fall outside the allowed prefix set; a final server-side validation also runs and `CAPS_INVALID` issues surface in place.

### Via API

`PUT /provisioner/providers/:providerId/caps` with the full caps payload:

```jsonc
{
  "branding": {
    "appName": "ITA",
    "navbarLogoUrl": "https://wearecollegetennis.com/.../ITA-logo-header.png",
    "accentColor": "#15365d",
    "themeTokens": {
      "--tmx-accent-blue": "#15365d",
      "--tmx-fill-accent": "#15365d",
      "--chc-text-link": "#15365d",
    },
    "stylesheetUrl": "https://wearecollegetennis.com/courthive-theme.css",
  },
  "permissions": {
    /* … */
  },
}
```

A malformed payload returns `{ code: 'CAPS_INVALID', issues: [...] }` with one `ValidationIssue` per offending field. Examples of issues raised by the validator:

- `{ code: 'unknownField', path: 'branding.themeTokens.--malicious-var' }` — prefix outside the allowlist.
- `{ code: 'wrongType', path: 'branding.themeTokens.--tmx-accent-blue' }` — value not a string.
- `{ code: 'wrongType', path: 'branding.stylesheetUrl' }` — value not a string.

### Via dev script (local seeding)

`competition-factory-server/src/scripts/create-ita-provider.mjs` is the reference example — an idempotent Node script that creates or updates a provider with a fully-formed branding caps block. Copy and adapt for any provider you want to seed locally.

## How it reaches the running page

### TMX

The provider's effective config (caps ∩ settings) is delivered with the login response and on every provider switch via `GET /provider/:providerId/effective-config`. TMX's `providerConfig.set(effectiveConfig)` calls `applyBranding(effectiveConfig.branding)`, which:

1. Sets `document.title` from `appName`.
2. Writes `accentColor` to `--tmx-accent-blue`.
3. Iterates `themeTokens` and writes each pair via `documentElement.style.setProperty()`, tracking the applied keys on `data-tmx-provider-tokens` so a subsequent provider switch clears them cleanly.
4. Manages a single `<link id="tmx-provider-theme">` for `stylesheetUrl` — appends, updates `href` in place, or removes it depending on the new value.
5. Updates the navbar logo (`<img>` swap if `navbarLogoUrl`, text fallback to `appName` otherwise).

DOM behavior is validated end-to-end via Playwright; the in-memory store contract is unit-tested.

### courthive-public

The public viewer is unauthenticated and unaware of which provider owns the tournament a visitor opens, so it asks at tournament load time:

```
GET /provider/by-tournament/:tournamentId/branding
```

This is a public endpoint that returns **only the branding slice** of the owning provider's effective config — never permissions, never policies, never participant privacy settings. The resolution path:

```
tournamentId
  → tournament_provisioner.provider_id
    → providers.providerConfigCaps.branding
```

If the tournament has no provider mapping or the provider was deleted, the response is `{ branding: undefined }` and the viewer gracefully falls back to the bundled defaults.

`renderTournament()` fires the fetch as fire-and-forget alongside the tournament-info call and applies branding via the courthive-public `applyProviderBranding()` mirror of the TMX pattern. A failed lookup never blocks page render.

## Validation guarantees

- `--tmx-` and `--chc-` are the only allowed token prefixes. The check sits in `validateBranding` inside `@courthive/provider-config` so client + server enforce identically.
- Token values must be strings. Numbers, objects, and `null` are rejected.
- `stylesheetUrl` must be a string. (URL well-formedness is not validated at the schema layer — bad URLs simply 404 at fetch time and the viewer falls back to bundled defaults.)
- The whole branding shape is caps-owned (`ProviderConfigCaps.branding`), not settings-owned. White-labeling is fundamentally a provisioner concern; a provider-admin cannot rebrand against the provisioner's intent.

## Cross-references

- `@courthive/provider-config` — canonical types and validators.
- `TMX/src/config/providerConfig.ts` — the apply-on-switch implementation in the TMX client.
- `courthive-public/src/services/providerBranding.ts` — the courthive-public mirror.
- `competition-factory-server/src/modules/providers/providers.controller.ts` — public branding-by-tournament endpoint.
- `competition-factory-server/admin-client/src/components/providerConfig/openCapsEditor.ts` — the admin-side editor.
