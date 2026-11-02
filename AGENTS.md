# Architecture rules

- Keep structured NBI identification and structured-reference collection in the shared pure NBI utilities; all supported subjects and Commission composition reuse them to prevent divergent institutional identification.
- Validate current user-scoped military records before either NBI server entry point can allocate a number; textual-only references remain outside identity resolution to avoid heuristic matching.
- Keep Folga balance validation in its shared pure utility and call it before both NBI numbering entry points; explicit balance emissions must match their effective template and recomposed text, while legacy documents are never rewritten.
- Run unit tests through the dedicated Vitest configuration without application RPC transforms so authenticated server handlers can be exercised with isolated clients and zero real numbering consumption.