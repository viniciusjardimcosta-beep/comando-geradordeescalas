# Architecture rules

- Keep structured NBI identification and structured-reference collection in the shared pure NBI utilities; all supported subjects and Commission composition reuse them to prevent divergent institutional identification.
- Validate current user-scoped military records before either NBI server entry point can allocate a number; textual-only references remain outside identity resolution to avoid heuristic matching.
- Keep Folga balance validation in its shared pure utility and call it before both NBI numbering entry points; all emissions must match effective-template text and recognized metadata, allowing only absent legacy metadata or the historical realizada base/previsao pair without rewriting documents.
- Run unit tests through the dedicated Vitest configuration without application RPC transforms so authenticated server handlers can be exercised with isolated clients and zero real numbering consumption.