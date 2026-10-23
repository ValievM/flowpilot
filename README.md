# FlowPilot

Личный планировщик дел для macOS: открыл приложение и видишь, что делать сейчас, сегодня и позже.

## Запуск

Требуются Node.js 22 и npm.

```sh
npm ci
npm start
```

Демо-профиль с вымышленными данными для приёмки: `npm run seed:demo` создаёт
временный профиль (не трогает настоящие данные) и печатает команду запуска.
Чек-лист приёмки: [docs/process/release-1-checklist.md](docs/process/release-1-checklist.md).
Чек-лист выпуска 2 (AI, правила, расписание): [docs/process/release-2-checklist.md](docs/process/release-2-checklist.md); демо-профиль уже содержит правила, типы, расписание и фейковый AI.

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

`npm run smoke:packaged` собирает приложение и запускает **упакованную** сборку (`out/flowpilot-darwin-arm64/flowpilot.app`) с чистым профилем (`--user-data-dir`): окно открывается, нативное хранилище работает, задача переживает перезапуск, переменные `FLOWPILOT_TEST*` в упакованной сборке игнорируются, CSP без `localhost`, `ws:` и `unsafe-inline`/`unsafe-eval` для скриптов. Во время прогона на секунду появляются окна приложения, поэтому в обычный `npm run e2e` этот набор не входит.

Forge Vite plugin кладёт в сборку только `.vite`; модули, которые main-бандл подключает во время работы (`better-sqlite3`, `@flowpilot/openat`, `ajv` и их зависимости), перечисляет `forge.runtime-modules.ts`, а `.node`-файлы распаковываются из asar. Если добавить в main новый внешний модуль, дополните `RUNTIME_ROOTS` и прогоните `npm run smoke:packaged`: без этого упакованное приложение не стартует (до #65 именно так и было).

Подпись и нотаризация не делаются: нужны реквизиты владельца.

Документация: [спецификация](docs/spec/01-vision.md), [дизайн](docs/design/d-screens/index.html), [ADR стека](docs/adr/0001-stack.md), [правила для агентов](AGENTS.md), [процесс](docs/process/pipeline.md).
