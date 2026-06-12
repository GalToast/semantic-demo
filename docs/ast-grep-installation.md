# ast-grep Installation

## Why as a devDependency?

ast-grep (`sg`) is a code search/replace tool used throughout this repo. Shipping it as a `devDependency` means contributors get it automatically after `npm install` — no separate global install needed.

## How to install

```bash
npm install
```

This installs `@ast-grep/cli` into `node_modules/.bin/sg`.

## How to invoke

```bash
# Via npx (preferred — no path concerns)
npx sg --version
npx sg -p 'console.log($MSG)' --lang javascript

# Direct binary path
./node_modules/.bin/sg --version

# Via npm script shortcut
npm run sg -- --version
npm run sg -- -p 'fetchMetrics($ARGS)' --lang typescript
```

## Global install (optional)

If you prefer a global `sg` binary for use outside this repo:

```bash
npm install -g @ast-grep/cli
```

This is not required — the project-local install covers all in-repo usage.
