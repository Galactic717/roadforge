# Security

RoadForge is a local simulation app, not a hardened public service. The server binds to `127.0.0.1` by default. Do not expose it directly to untrusted networks; the API has no authentication.

The server limits JSON body size, bounds world and training parameters, and serves only an explicit allowlist of static files. Imported worlds should still be treated as untrusted data. Laya runs locally when separately installed; installing its package or checkpoint is the user's choice.

To report a security issue, use GitHub's private vulnerability reporting for this repository if available, or contact the maintainer through the GitHub profile. Avoid posting exploit details in a public issue before a fix is available.
