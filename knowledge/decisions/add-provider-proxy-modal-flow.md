# Решение: исправление Add Provider proxy modal flow

Источник: [`spec/ui-update.md`](../../spec/ui-update.md)

## Статус

Принято для текущей UI-итерации Add Provider.

## Контекст

В Add Provider при клике на provider proxy popup открывался поверх popup со списком providers. Это приводило к двум одновременно видимым popup и риску некорректного modal state.

Дополнительный факт реализации: `apps/frontend/src/components/layout/new-modal/new-modal.tsx` хранит открытые modal как массив, а `openModal` добавляет новый modal в массив. Поэтому без явного закрытия текущего popup возникает stacking, а не замена одного modal другим.

Целевой порядок подключения сохраняется прежним:

```text
Provider → Proxy → provider-specific flow/OAuth
```

Proxy по-прежнему выбирается после provider, потому что выбранный provider определяет дальнейшую ветку flow.

## Scope

- Новый порядок `close provider popup → open proxy step` входит только в standalone `Add Provider` popup, который запускается через `useAddProvider`, включая invite flow внутри этого standalone сценария.
- `AddProviderComponent` также используется embedded в onboarding/mobile, поэтому standalone-поведение нельзя применять глобально ко всем использованиям компонента.
- `IntegrationProxySelector` используется не только в Add Provider, но и в reconnect (`apps/frontend/src/components/launches/launches.component.tsx`) и analytics refresh (`apps/frontend/src/components/platform-analytics/render.analytics.tsx`), поэтому новое поведение должно быть configurable/default-preserving.
- Reconnect/refresh, analytics refresh и onboarding/mobile embedded flow не должны неявно менять UX.
- Backend API proxy-list не входит в scope этой UI-итерации.

## Ключевые решения

- При клике по provider нужно сначала закрыть popup со списком providers, затем открыть proxy modal.
- Пользователь в рамках Add Provider должен видеть максимум один активный popup.
- При выборе proxy нужно сначала закрыть proxy modal, затем запускать следующий provider-specific шаг или OAuth redirect.
- Текущее поведение `IntegrationProxySelector` закрывает proxy modal после `onContinue`; это может открыть следующий provider-specific modal поверх proxy. Для standalone Add Provider нужен порядок `close proxy modal → continue next step`.
- Если после закрытия proxy modal следующий шаг падает до открытия следующего modal или redirect, нужно показать toast/error и завершить flow; proxy step не переоткрывается.
- Invite flow также проходит через proxy-step перед своим следующим действием.
- Back из proxy step к списку providers не нужен: если выбран не тот provider, пользователь закрывает modal и начинает Add Provider заново.

## Proxy selector UX для Add Provider

- В Add Provider proxy selector работает в режиме `click-to-continue`.
- Клик по proxy-карточке сразу подтверждает выбор и продолжает flow.
- Отдельной кнопки `Continue` для выбранного proxy в Add Provider быть не должно.
- После клика выбранная proxy-карточка должна показывать loading state, остальные действия нужно заблокировать от повторного запуска.
- `No Proxy` не оформляется как обычная proxy-карточка.
- Подключение без proxy показывается отдельным secondary action с текстом `Continue without proxy`.
- При выборе `Continue without proxy` frontend не должен отправлять query-param `proxy`.

## Loading и error состояния

- Пока proxy-list загружается, нужно показывать skeleton/loader без кликабельных proxy-вариантов.
- До завершения загрузки нельзя выбирать конкретный proxy.
- Если proxy-list не загрузился, нужно показать ошибку и разрешить `Continue without proxy`.
- Разрешение продолжить без proxy при ошибке proxy-list — осознанный fail-open tradeoff только для Add Provider.

## Технические ограничения

- Для загрузки proxy-list сохраняется SWR и `useFetch`.
- SWR должен оставаться отдельным hook и не нарушать `react-hooks/rules-of-hooks`; нельзя добавлять `eslint-disable-next-line` для обхода hooks.
- Нельзя устанавливать дополнительные frontend-компоненты из npm.
- Нужно использовать существующие UI primitives и стили проекта, без deprecated CSS variables `--color-custom*`.
- Если выбран конкретный proxy, frontend передаёт `proxy=<id>` в `buildIntegrationSocialUrl`.
- Если выбран `Continue without proxy`, frontend передаёт `null`, а `buildIntegrationSocialUrl` не добавляет query-param `proxy`.
- `buildIntegrationSocialUrl` сериализует query params только для non-empty string; `proxy: null` и `proxy: undefined` не попадают в URL.
- Sentinel query-param для No Proxy запрещён: нельзя отправлять `no-proxy`, `null` или пустую строку.
- В рамках текущего scope разрешены точечные fixes: close handler для external URL modal и безопасная проверка Chrome extension global.

## Риски и защита решений

- Главный риск — modal stacking и race conditions: двойной клик по provider/proxy не должен открывать несколько modal или запускать flow несколько раз.
- Нужно явно обеспечить последовательность `close current → open next`, если текущий modal API не гарантирует порядок сам.
- Изменение общего `IntegrationProxySelector` рискованно: reconnect/analytics не входят в scope, поэтому новое поведение должно быть configurable или изолировано для Add Provider.
- Fail-open при ошибке proxy-list может позволить подключиться без proxy, если в будущем proxy станет обязательным; это решение принято только для Add Provider и не должно автоматически переноситься на другие flows.

## Ожидаемые области изменений

- `apps/frontend/src/components/launches/add.provider.component.tsx` — orchestration между provider popup, proxy modal и следующими provider-specific шагами.
- `apps/frontend/src/components/launches/helpers/use.integration.proxies.tsx` — адаптация proxy selector под click-to-continue, loading выбранной карточки, secondary action `Continue without proxy`, error state.
- Возможные modal/helper компоненты рядом с `apps/frontend/src/components/layout/new-modal`, если потребуется безопасная последовательность закрытия и открытия popup.
- Локализационные ключи через существующий `useT`, включая `continue_without_proxy` / `Continue without proxy`.

## Связанные записи

- [Архитектурные решения](index.md)
- [Proxy в Integration и flow подключения соцсети](integration-proxy-flow.md)
- [Корень базы знаний](../root.md)
