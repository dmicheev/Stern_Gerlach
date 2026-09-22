# Project Context

## Overview

Интерактивная 3D-эмуляция опыта Штерна-Герлаха и теста неравенства Белла (CHSH)
по мотивам эксперимента Хенсена (Hensen et al., Nature 526, 682 (2015)).
Учебное пособие: каждое устройство, параметр и график снабжены подсказками
с формулами (RU/EN). Два режима: «Каскад» (дерево пучков SG-анализаторов)
и «Белл CHSH» (запутанные пары, две станции, живая статистика S).

## Tech Stack

- React 18 + TypeScript + Vite (frontend/)
- three.js через React Three Fiber + drei, postprocessing (Bloom, Vignette)
- zustand — состояние (конфигурация — единый источник истины)
- react-i18next — RU/EN словари и база учебных подсказок
- Rust → WASM (physics-wasm/, wasm-bindgen) + TypeScript-резервная реализация
- Web Worker для расчётов; vitest (TS) + cargo test (Rust)

## Conventions

- Комментарии и UI-тексты на русском языке; идентификаторы — английские
- Стиль кода: без комментариев в очевидном коде; следуем существующим паттернам
- Проверки перед завершением работы: `pnpm typecheck && pnpm test`
- Правки Rust-кода требуют пересборки WASM: `./scripts/build-wasm.sh` (или `build-wasm-macos-arm64.sh` на машине автора)
  (иначе браузер продолжает считать старой физикой); проблемы сборки —
  docs/troubleshooting-wasm.md
- Спецификации ведутся в OpenSpec (openspec/), подход SDD: изменение начинается
  с proposal + spec-дельты, реализация сверяется со спекой, архивация мержит дельту

## Architecture

- frontend/src/scene/ — 3D-сцена: печь, коллиматор, магниты, экран, частицы, ψ-поле
- frontend/src/physics/ — физическое ядро (единый интерфейс движка), worker, WASM-загрузчик
- frontend/src/ui/ — панели управления, статистика, таймлайн, модалка разбора экрана
- frontend/src/state/ — zustand-стор + пресеты; frontend/src/i18n/ — словари
- physics-wasm/ — Rust-крейт sg-physics (RK4, PCG32, zero-copy протокол)
- Масштаб сцены: 1 единица = 1 мм; физика в СИ

## Development Workflow

1. Изменение начинается с OpenSpec change proposal (описание + затронутые capabilities)
2. Пишем spec-дельту (требования + сценарии WHEN/THEN) и tasks.md
3. Реализуем по задачам, сверяясь со спекой; typecheck + тесты обязательны
4. Валидируем change (`openspec_validate_change`) и архивируем — дельта мержится в specs/
5. Чистые «инструментальные» правки (форматирование, README) можно вести без change
