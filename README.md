# FlowPilot

Личный планировщик дел для macOS: открыл приложение и видишь, что делать сейчас, сегодня и позже.

## Запуск

Требуются Node.js 22 и npm.

```sh
npm ci
npm start
```

## Основной сценарий В1

«Сегодня» и «Сейчас» показывают сохранённые задачи. «Сегодня» отмечает перенос
незавершённых карточек без записи нового дня в хранилище; быстрый ввод сохраняет
задачу в «Сделать» на сегодня, а «Взять в работу» сохраняет её переход в «Делаю».
Требования и правила переноса/риска описаны в
[спецификации экранов](docs/spec/12-screen-map.md) и
[спецификации задач](docs/spec/02-calendar-spec.md).

## Проверки

```sh
npm run check
npm run test:electron-abi
npm run e2e
```

`npm run check` выполняет typecheck, проверку Prettier, ESLint, Stylelint, dependency-cruiser и Vitest по порядку. `npm run format` форматирует файлы; `npm run format:check` проверяет форматирование без изменений. GitHub Actions запускает обновлённый `check`; Playwright `e2e` остаётся отдельной CI-задачей. `npm run e2e` запускает Electron acceptance-тесты Playwright.

Playwright скрывает полосы прокрутки Chromium через `--hide-scrollbars`, чтобы снимки не зависели от настройки macOS «Показывать полосы прокрутки». Это влияет только на тестовый процесс: системные настройки менять не нужно, полосы прокрутки приложения не меняются.

`better-sqlite3` — нативный модуль: Vitest использует ABI Node.js, а Electron — собственный ABI. `npm run test` пересобирает модуль для Node.js через `pretest`. `npm run test:electron-abi` пересобирает `better-sqlite3` для Electron через `electron-rebuild`, затем запускает Electron в режиме Node.js, чтобы применить схему хранилища и выполнить round-trip задачи без открытия окна. Запускайте каждую команду через npm и не используйте модуль, собранный для другой среды.

Vite внедряет CSP в renderer HTML отдельно для разработки и сборки. В разработке разрешены Vite localhost и WebSocket; `unsafe-inline` для стилей нужен Vite HMR, который внедряет стили в `<style>`. В упакованном приложении localhost, WebSocket и `unsafe-inline` не разрешены.

## Упаковка

`npm run package` собирает приложение для macOS arm64; `npm run make` создаёт артефакт выпуска.

Проверка macOS arm64: `npm run make` завершился успешно; запуск `out/flowpilot-darwin-arm64/flowpilot.app` создал main- и renderer-процессы. CSP в упакованном HTML не содержит `localhost`, `ws:` или `unsafe-inline`.

Документация: [спецификация](docs/spec/01-vision.md), [дизайн](docs/design/d-screens/index.html), [ADR стека](docs/adr/0001-stack.md), [правила для агентов](AGENTS.md), [процесс](docs/process/pipeline.md).
