# Security policy

## Scope

`opencode-archivist` is designed to archive OpenCode conversation text to the
local filesystem. It does not intentionally upload conversations or require
an API key.

Please remember that an archive may contain private prompts, answers, file
paths, and project details. Do not commit an archive to a public repository
unless you have reviewed and redacted it.

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability.
Use GitHub's private security advisory flow for this repository when it is
available. If that channel is unavailable, contact the maintainer privately
using the address listed in `package.json`.

Include:

- affected version or commit;
- reproduction steps or a minimal proof of concept;
- expected and observed behavior;
- any suggested mitigation.

We will acknowledge reports as soon as practical and coordinate disclosure
after a fix is available.
