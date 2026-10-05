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

`npm run check` выполняет typecheck, проверку Prettier, ESLint, Stylelint, dependency-cruiser и Vitest по порядку. `npm run format` форматирует файлы; `npm run format:check` проверяет форматирование без изменений. GitHub Actions запускает обновлённый `check`; Playwright `e2e` остаётся отдельной CI-задачей. `npm run e2e` запускает Electron acceptance-тесты Playwright.

Vite внедряет CSP в renderer HTML отдельно для разработки и сборки. В разработке разрешены Vite localhost и WebSocket; `unsafe-inline` для стилей нужен Vite HMR, который внедряет стили в `<style>`. В упакованном приложении localhost, WebSocket и `unsafe-inline` не разрешены.

## Упаковка

`npm run package` собирает приложение для macOS arm64; `npm run make` создаёт артефакт выпуска.

Проверка macOS arm64: `npm run make` завершился успешно; запуск `out/flowpilot-darwin-arm64/flowpilot.app` создал main- и renderer-процессы. CSP в упакованном HTML не содержит `localhost`, `ws:` или `unsafe-inline`.

Документация: [спецификация](docs/spec/01-vision.md), [дизайн](docs/design/d-screens/index.html), [ADR стека](docs/adr/0001-stack.md), [правила для агентов](AGENTS.md), [процесс](docs/process/pipeline.md).
