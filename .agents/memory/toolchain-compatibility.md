---
name: Toolchain compatibility
description: Package firewall and current-version compatibility notes for this Next/Prisma application.
---

The Replit package firewall may block older pinned releases; prefer current safe releases first, then pin a compatible stable line when a framework major changes its configuration model. This project uses the standard Prisma schema URL format, so Prisma 6 is the compatible line; Prisma 7+ requires a different config/client setup. Tailwind 3 is used with the classic PostCSS plugin, while Tailwind 4 requires a separate PostCSS package.

**Why:** The initial latest installs introduced Prisma 7 datasource changes and Tailwind 4 PostCSS incompatibilities, while older versions were blocked by the package firewall.

**How to apply:** Keep Prisma and Tailwind aligned with the existing schema and PostCSS setup unless intentionally migrating both code and configuration together.

Replit preview HMR requires the development hostname in Next.js `allowedDevOrigins`; otherwise the app can render while the browser reports blocked HMR WebSocket requests.

**Why:** The proxied `.replit.dev` preview origin is different from `127.0.0.1`, and Next.js blocks that cross-origin dev resource by default.

**How to apply:** Include `REPLIT_DEV_DOMAIN` and the local preview host in `next.config.mjs` for development.