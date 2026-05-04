# Hidden frontend features

These features are intentionally hidden on the frontend only. Business logic, API contracts, provider identifiers, backend/orchestrator code, database data, and existing integrations were not removed.

## Hidden items

- Sidebar/menu entries: Agent (`/agents`), Analytics (`/analytics`), Plugs (`/plugs`), Integrations (`/third-party`).
- Direct frontend pages for `/agents`, `/agents/[id]`, `/analytics`, `/plugs`, and `/third-party` now return frontend 404 via `notFound()`.
- Default/internal analytics redirects now land on `/launches` instead of `/analytics`.
- Main Add Channel modal shows only `tiktok` and `instagram-standalone` providers.
- Calendar card hover action for Statistics / missing release is hidden in all calendar views.

## Files and components

- `apps/frontend/src/components/layout/top.menu.tsx` — filters hidden sidebar items before they reach `all`, `firstMenu`, or rendering.
- `apps/frontend/src/app/(app)/(site)/analytics/page.tsx` — hidden route returns `notFound()`.
- `apps/frontend/src/app/(app)/(site)/plugs/page.tsx` — hidden route returns `notFound()`.
- `apps/frontend/src/app/(app)/(site)/third-party/page.tsx` — hidden route returns `notFound()`.
- `apps/frontend/src/app/(app)/(site)/agents/page.tsx` — hidden route returns `notFound()`.
- `apps/frontend/src/app/(app)/(site)/agents/[id]/page.tsx` — hidden route returns `notFound()`.
- `apps/frontend/src/app/(app)/(site)/agents/layout.tsx` — hidden route layout returns `notFound()` so the Agent shell is not rendered.
- `apps/frontend/src/proxy.ts` — root landing redirect points to `/launches`.
- `apps/frontend/src/components/layout/layout.context.tsx` — onboarding redirect points to `/launches?onboarding=true`.
- `apps/frontend/src/components/launches/add.provider.component.tsx` — restricts only the main Add Channel flow to TikTok and Instagram Standalone.
- `apps/frontend/src/components/launches/calendar.tsx` — hides the calendar card Statistics / missing-release hover action.

## Reason

These product areas are currently unused and should not be visible to users, while remaining recoverable without backend, DB, or provider-contract changes.

## Restore checklist

1. Remove the `HIDDEN` filters/comments from `top.menu.tsx` and return hidden paths to the visible menu arrays.
2. Restore the original route components for Analytics, Plugs, Third Party Integrations, and Agents instead of `notFound()`.
3. Restore `/analytics` redirects in `proxy.ts` and `layout.context.tsx` if analytics should again be the default target.
4. Remove `restrictMainAddChannelProviders` usage/filtering from the main Add Channel flow to show all providers again.
5. Restore the `CalendarItem` Statistics / missing-release hover action and related callbacks/imports in `calendar.tsx`.
6. Run frontend lint/type/build checks from the repository root.

## Important OAuth warning

`/integrations/social/...` OAuth/callback routes are not part of hidden `/third-party`. They are required for connecting allowed providers and must not be disabled when hiding the Third Party Integrations page.
