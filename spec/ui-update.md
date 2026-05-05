# Спецификация: исправление Add Provider proxy modal flow

## 1. Контекст задачи

В текущем UI при подключении нового провайдера через `Add Provider` proxy popup открывается поверх popup со списком провайдеров. В результате пользователь видит два modal/popup одновременно, что создаёт визуальную путаницу и риск некорректного modal state.

Также текущая proxy modal недостаточно ясно показывает, что именно выбирает пользователь. Требуется приблизить поведение выбора proxy к поведению выбора provider: клик по варианту должен сразу подтверждать выбор и продолжать flow.

## 2. Цель

Исправить только сценарий `Add Provider` так, чтобы:

1. После клика по provider popup со списком провайдеров закрывался.
2. Затем открывался отдельный proxy step.
3. Proxy step не накладывался поверх provider popup.
4. Клик по конкретному proxy сразу подтверждал выбор и продолжал подключение.
5. Подключение без proxy было доступно отдельным secondary action `Continue without proxy`.

## 3. Scope

### Входит в scope

- `Add Provider` flow.
- Обычное подключение provider.
- Invite flow внутри Add Provider.
- Provider-specific ветки внутри Add Provider:
  - обычный OAuth redirect;
  - external URL flow;
  - custom fields flow;
  - Web3 flow;
  - Chrome extension flow.
- Поведение proxy list loading/error внутри Add Provider proxy step.

### Не входит в scope

- Reconnect/refresh flow вне Add Provider.
- Analytics reconnect flow.
- Backend API proxy-list.
- Изменение порядка подключения на `Proxy → Provider`.
- Добавление кнопки Back из proxy step к списку providers.

## 4. Целевой пользовательский flow

### 4.1 Базовый flow

1. Пользователь открывает `Add Provider`.
2. Пользователь кликает нужного provider.
3. Popup со списком providers закрывается.
4. Открывается proxy modal.
5. Пока список proxy загружается, пользователь видит skeleton/loader без кликабельных proxy-вариантов.
6. После загрузки:
   - реальные proxy показываются списком карточек;
   - отдельным secondary action показывается `Continue without proxy`.
7. Пользователь кликает proxy-карточку или `Continue without proxy`.
8. Proxy modal сначала закрывается.
9. Затем запускается следующий шаг provider flow:
   - OAuth redirect;
   - URL modal;
   - Custom Variables modal;
   - Web3 modal;
   - Chrome extension notice;
   - invite-link copy.

### 4.2 Порядок шагов

Целевой порядок остаётся:

```text
Provider → Proxy → provider-specific flow/OAuth
```

Это сохраняет ранее принятую архитектуру: provider сначала определяет дальнейшую ветку flow, а выбранный proxy прокидывается в построение URL/следующего шага.

## 5. Modal orchestration

### 5.1 Provider popup → Proxy popup

При клике по provider нельзя открывать proxy modal поверх текущего provider popup.

Требуемое поведение:

- сначала закрыть текущий popup со списком providers;
- затем открыть proxy modal;
- пользователь в любой момент должен видеть только один активный popup в рамках Add Provider flow.

### 5.2 Proxy popup → следующий шаг

При выборе proxy или `Continue without proxy`:

- сначала закрыть proxy modal;
- затем открыть следующий provider-specific modal или выполнить redirect/action;
- не допускать состояния, где proxy modal остаётся под/над следующим modal.

## 6. Proxy selector UX

### 6.1 Реальные proxy

- Каждый proxy отображается отдельной кликабельной карточкой.
- Клик по карточке сразу подтверждает выбор.
- Отдельной кнопки `Continue` для выбранного proxy быть не должно.
- После клика выбранная карточка показывает loading state, пока выполняется переход к следующему шагу.
- Остальные действия в modal на время перехода должны быть заблокированы, чтобы избежать двойного запуска flow.

### 6.2 Подключение без proxy

`No Proxy` не должен выглядеть как обычная proxy-карточка.

Требуемое представление:

- отдельная secondary action;
- текст: `Continue without proxy`;
- клик сразу продолжает flow с proxy selection = `null`.

При выборе `Continue without proxy` frontend не должен отправлять query-param `proxy`.

### 6.3 Loading state

Пока proxy-list загружается:

- показать skeleton/loader;
- не показывать кликабельные proxy-варианты;
- не разрешать выбрать конкретный proxy до завершения загрузки.

### 6.4 Error state

Если proxy-list не загрузился:

- показать ошибку загрузки proxy-list;
- не показывать реальные proxy;
- разрешить пользователю продолжить без proxy через `Continue without proxy`.

Это осознанный tradeoff: для Add Provider flow ошибка списка proxy не должна полностью блокировать подключение. В отличие от прежнего fail-closed решения, здесь выбран fail-open путь только для варианта без proxy.

## 7. Back/Cancel поведение

- Кнопка Back из proxy step к списку providers не нужна.
- Если пользователь выбрал не тот provider, он может закрыть modal и начать Add Provider flow заново.
- Крестик/закрытие modal должен прекращать текущий Add Provider flow без запуска OAuth/следующего шага.

## 8. Технические требования

### 8.1 Frontend

- Изменения выполняются в существующей frontend архитектуре `apps/frontend`.
- Для загрузки proxy-list сохраняется подход с SWR и `useFetch`.
- SWR hook должен оставаться отдельным hook и не нарушать `react-hooks/rules-of-hooks`.
- Нельзя добавлять `eslint-disable-next-line` для обхода правил hooks.
- Нельзя устанавливать дополнительные frontend компоненты из npm.
- Использовать существующие UI primitives и стили проекта.
- Не использовать deprecated CSS variables `--color-custom*`.

### 8.2 Query params

- Если выбран конкретный proxy, frontend передаёт `proxy=<id>` в `buildIntegrationSocialUrl`.
- Если выбран `Continue without proxy`, frontend передаёт `null`, а `buildIntegrationSocialUrl` не должен добавлять query-param `proxy`.
- Sentinel-значения вроде `no-proxy`, `null`, пустой строки запрещены.

### 8.3 Race condition защита

Реализация должна исключать:

- двойной клик по provider с открытием нескольких proxy modal;
- двойной клик по proxy-карточке с запуском flow несколько раз;
- одновременное существование provider popup и proxy popup;
- одновременное существование proxy popup и следующего provider-specific popup.

## 9. Риски и компромиссы

### 9.1 Fail-open при ошибке proxy-list

Решение разрешить `Continue without proxy` при ошибке загрузки proxy-list улучшает доступность подключения, но может позволить пользователю обойти proxy, если proxy должен быть обязателен в некотором будущем сценарии.

Текущая спецификация принимает этот компромисс для `Add Provider`.

### 9.2 Scope только Add Provider

Reconnect и analytics flows могут сохранить старое поведение proxy selector с кнопкой `Continue`, если они используют общий компонент без адаптации. При реализации нужно либо:

- изменить общий `IntegrationProxySelector` так, чтобы новые props позволяли сохранить старое поведение вне Add Provider;
- либо убедиться, что изменение общего компонента не нарушает reconnect/analytics, несмотря на то что они не входят в scope.

Предпочтительно сделать поведение configurable, чтобы не менять UX вне Add Provider неявно.

### 9.3 Modal API

Если текущий modal API не гарантирует порядок `close → open`, возможны визуальные мерцания или наложения. Реализация должна явно обеспечить последовательность закрытия текущего modal перед открытием следующего.

## 10. Acceptance criteria

- При клике provider в Add Provider не остаётся popup со списком providers под proxy modal.
- В любой момент Add Provider flow виден максимум один popup.
- Proxy-list loading показывает skeleton/loader без кликабельного выбора.
- Клик по proxy-карточке сразу продолжает flow.
- Выбранная proxy-карточка показывает loading state после клика.
- Нет отдельной кнопки `Continue` для выбора конкретного proxy в Add Provider.
- `Continue without proxy` отображается как secondary action.
- При ошибке загрузки proxy-list доступен `Continue without proxy`.
- При выборе без proxy query-param `proxy` не отправляется.
- Invite flow продолжает проходить через proxy-step.
- Reconnect/analytics не меняются намеренно в рамках задачи.

## 11. Планируемые изменения по файлам и модулям

Ожидаемо будут затронуты:

- `apps/frontend/src/components/launches/add.provider.component.tsx`
  - изменить orchestration между provider popup и proxy popup;
  - закрывать provider popup перед открытием proxy modal;
  - закрывать proxy modal перед запуском следующего provider-specific шага;
  - сохранить передачу выбранного proxy во все существующие ветки flow, включая invite.

- `apps/frontend/src/components/launches/helpers/use.integration.proxies.tsx`
  - адаптировать `IntegrationProxySelector` под click-to-continue behavior;
  - добавить loading state для выбранной proxy-карточки;
  - заменить обычный `No Proxy` вариант на secondary action `Continue without proxy` для Add Provider;
  - обработать error state с разрешением продолжить без proxy;
  - при необходимости добавить props, чтобы не менять поведение reconnect/analytics вне scope.

- Возможные modal/helper компоненты рядом с `apps/frontend/src/components/layout/new-modal`
  - только если потребуется безопасная последовательность `close current → open next` без наложения popup.

- Локализационные ключи через существующий `useT`
  - `continue_without_proxy` / `Continue without proxy`;
  - при необходимости тексты loading/error, если существующих ключей недостаточно.

## 12. Уточнения Research

По итогам исследования текущей frontend-реализации и уточнения спорных границ приняты следующие решения:

1. Новый порядок `close provider popup → open proxy step` применяется только к standalone `Add Provider` popup, открываемому через `useAddProvider`. Embedded-использования `AddProviderComponent` внутри onboarding/mobile integration не должны автоматически менять modal behavior в рамках этой задачи.
2. Если после выбора proxy proxy modal уже закрыт, а следующий provider-specific шаг падает до открытия следующего modal или redirect, frontend показывает существующий toast/error и завершает текущий flow. Proxy step не переоткрывается автоматически.
3. В рамках задачи разрешены точечные safety/UX fixes в provider-specific ветках, входящих в scope:
   - корректный close handler для external URL modal;
   - безопасная проверка Chrome extension global без риска `ReferenceError`.

## 13. Проверки

После реализации рекомендуется выполнить проверки из root проекта через `pnpm`, в соответствии с правилами monorepo.
