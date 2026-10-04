# FlowPilot

Личный планировщик дел для macOS: открыл приложение и видишь, что делать сейчас, сегодня и позже.

## Запуск

Требуются Node.js 22 и npm.

```sh
npm ci
npm start
```

## Проверки

```sh
npm run check
npm run e2e
```

`npm run check` выполняет typecheck, ESLint, Stylelint, dependency-cruiser и Vitest по порядку. `npm run e2e` запускает Electron acceptance-тесты Playwright.

## Упаковка

`npm run package` собирает приложение для macOS arm64; `npm run make` создаёт артефакт выпуска.

Документация: [спецификация](docs/spec/01-vision.md), [дизайн](docs/design/d-screens/index.html), [ADR стека](docs/adr/0001-stack.md), [правила для агентов](AGENTS.md), [процесс](docs/process/pipeline.md).
