# Security Policy

## Supported versions

ContextWeft is currently pre-alpha and has no production-supported release.
Security fixes are applied to the latest development branch until the first
versioned release is published.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/vsvcode-ai/ContextWeft/security/advisories/new>

Please include:

- affected commit or version;
- reproduction steps or a proof of concept;
- expected impact and affected data boundary;
- any known mitigations.

You should receive an acknowledgement within seven days. Timelines for a fix
and coordinated disclosure depend on severity and reproducibility.

## Security boundaries

ContextWeft treats repository content, retrieved memory, terminal output, and
connector data as untrusted input. Reports involving path traversal, credential
exposure, permission bypass, prompt injection across trust boundaries, data
retention failures, or provenance forgery are especially valuable.
