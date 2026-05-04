# Решение: скрытие неиспользуемых frontend-функций

Источник: [`spec/specification.md`](../../spec/specification.md), задача [`tasks/hide-unused-func.md`](../../tasks/hide-unused-func.md)

## Статус

Принято на стадии Specification для задачи скрытия неиспользуемых функций Postiz.

## Цель

Скрыть неиспользуемые frontend-функции Postiz без удаления кода. Изменения должны быть быстрыми, обратимыми и понятными для восстановления.

## Scope

- Менять только frontend и документацию восстановления `hided/README.md`.
- Не менять backend, orchestrator, API и DB.
- Не удалять скрываемые функции, модалки, API-вызовы и backend-логику, если они не входят в отображение скрываемого UI.

## Ключевые решения

### Sidebar и страницы

- В sidebar скрыть пункты для всех ролей:
  - Agent: `/agents`
  - Analytics: `/analytics`
  - Plugs: `/plugs`
  - Integrations: `/third-party`
- Sidebar должен схлопываться без placeholders и визуальных пустот.
- Прямые URL скрытых страниц должны возвращать настоящий 404 через Next.js `notFound()`:
  - `/agents`
  - `/agents/[id]`
  - `/analytics`
  - `/plugs`
  - `/third-party`
- Важно: маршруты `/integrations/social/...` скрывать нельзя, потому что они используются для OAuth и подключения каналов.

### Providers в Add Channel

- В основном Add Channel показывать только providers:
  - `tiktok`
  - `instagram-standalone`
- Это ограничение не распространяется на onboarding, mobile, invite и reconnect flows.
- Уже подключённые integrations других providers должны оставаться видимыми.

### Calendar analytics/statistics

- В `CalendarItem` скрыть кнопку/иконку Statistics/analytics для всех карточек и всех calendar view.
- `StatisticsModal`, backend/API и графики не удалять.

## Подход к реализации и восстановлению

- Использовать короткие комментарии `HIDDEN` рядом с явным отключением/комментированием скрытых участков.
- Подробные инструкции по восстановлению хранить в `hided/README.md`.
- Пользователь выбрал комментирование и явное отключение вместо feature flag.

## Риски и компромиссы

- Комментирование менее гибкое, чем feature flag, но быстрее и проще для обратимого скрытия.
- 404 через `notFound()` требует аккуратного восстановления route-файлов при возврате функций.
- Ограничение providers только в основном Add Channel снижает риск поломки onboarding/mobile/invite/reconnect.
- Сохранение существующих подключённых integrations других providers предотвращает потерю видимости уже настроенных каналов.

## Планируемые области изменений

- `apps/frontend/src/components/layout/top.menu.tsx` — скрытие пунктов sidebar.
- `apps/frontend/src/components/launches/add.provider.component.tsx` — ограничение providers в основном Add Channel.
- `apps/frontend/src/components/launches/calendar.tsx` — скрытие Statistics/analytics action в `CalendarItem`.
- Route pages under `apps/frontend/src/app/(app)/(site)/...` — настоящий 404 через `notFound()` для скрытых страниц.
- `hided/README.md` — подробная документация восстановления скрытых функций.

## Защищаемые ограничения

- Не удалять код скрытых функций без отдельного решения.
- Не переносить ограничение providers на onboarding/mobile/invite/reconnect.
- Не скрывать `/integrations/social/...`.
- Не менять backend/orchestrator/API/DB в рамках этой задачи.

## Связанные записи

- [Архитектурные решения](index.md)
- [Корень базы знаний](../root.md)
