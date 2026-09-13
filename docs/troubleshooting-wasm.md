# Troubleshooting: сборка WASM-движка на этой машине

Симптом: правка физики в `physics-wasm/src/lib.rs` не появляется в браузере —
`pnpm build:wasm` падает, а в приложении продолжает работать старый
скомпилированный `frontend/src/physics/wasm-pkg/sg_physics_bg.wasm`
(закоммичен в репозиторий, браузер предпочитает WASM JS-фоллбэку).

**Главное правило: любое изменение Rust-кода требует пересборки WASM
(`./scripts/build-wasm.sh`) и коммита бинарника. Иначе в браузере остаётся
старая физика, даже если TS-тесты зелёные.**

## Корневые причины (порядок обнаружения)

1. **Два конкурирующих rustc.** В PATH по умолчанию — Homebrew rust
   (`/opt/homebrew/bin/rustc`, «(Homebrew)» в `--version`). У Homebrew-сборки
   НЕТ стандартной библиотеки для `wasm32-unknown-unknown` (wasm-pack честно
   пишет «non-rustup setups need the target installed manually»). Нужен
   rustup-тулчейн: `$HOME/.rustup/toolchains/stable-aarch64-apple-darwin`.
2. **Сломанный rust-lld в rustup-тулчейне.** Его `rust-lld` динамически
   слинкован и требует `@rpath/libLLVM.dylib`, которой рядом нет → SIGABRT
   («Library not loaded: libLLVM.dylib»). `rustup toolchain install stable
   --force` НЕ помогает — ставит «unchanged»; полный uninstall/install
   восстанавливает тот же бинарник из кэша.
3. **Подстановка чужого libLLVM ломается.** В системе есть
   `/opt/homebrew/Cellar/llvm@22/.../libLLVM.dylib`, но:
   - `DYLD_LIBRARY_PATH` глобально → падает сам `rustc` (SIGSEGV при
     запросе sysroot в wasm-pack);
   - `DYLD_LIBRARY_PATH` только в wrapper-скрипте линкера → rust-lld
     запускается (`--version` ок), но реальная линковка падает SIGSEGV —
     ABI-несовместимость с libLLVM чужой версии.
4. **Решение.** Отдельный пакет `brew install lld` (23.1.1, согласован со
   своим llvm) даёт `/opt/homebrew/bin/wasm-ld`. Cargo умеет подменять
   линкер: `CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER=/opt/homebrew/bin/wasm-ld`.

## Рабочая команда

```bash
./scripts/build-wasm.sh        # оболочка над wasm-pack со всеми env
```

Эквивалент вручную:

```bash
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
export CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER=/opt/homebrew/bin/wasm-ld
wasm-pack build --release --target web physics-wasm --out-dir ../frontend/src/physics/wasm-pkg
```

## Грабли, на которые наступили (не повторять)

- `pnpm build:wasm` как есть — НЕ работает на этой машине (берёт Homebrew rustc).
- После `rustup toolchain uninstall/install` слетает компонент
  `rust-std-wasm32-unknown-unknown` → «can't find crate for core»;
  лечится `rustup target add wasm32-unknown-unknown`.
- wasm-pack пишет в out-dir `.gitignore` с `*` — новые файлы пакета не
  попадут в `git status`, но уже отслеживаемые (`sg_physics.js`, `*.d.ts`,
  `sg_physics_bg.wasm`) продолжают отслеживаться. Проверяй после сборки:
  `git status frontend/src/physics/wasm-pkg/` — бинарник должен быть `M`.
- README исторически указывал путь WASM как `frontend/public/wasm` —
  устарело, актуальный путь `frontend/src/physics/wasm-pkg`.

## Проверка после сборки

1. `git status` показывает `M frontend/src/physics/wasm-pkg/sg_physics_bg.wasm`.
2. В браузере: бейдж движка `Rust·WASM`, поведение соответствует исходнику
   (быстрая проверка — юнит-сценарий из спеки).
