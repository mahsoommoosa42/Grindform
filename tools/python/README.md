# tools/python

uv-managed Python toolchain for the Grindform monorepo. The repo itself is
TypeScript; this toolchain exists solely to run **ruff** (lint + format) and
**pre-commit** (file-hygiene hooks) with versions pinned in `pyproject.toml`.

## One-time setup

```bash
cd tools/python
uv sync
uv run pre-commit install   # from repo root the hooks then run on commit
```

## Common commands (run from repo root via bun scripts)

```bash
bun run py:lint          # ruff check
bun run py:format:check  # ruff format --check
bun run py:precommit     # run all pre-commit hooks against every file
```
