# Mermaid sem ELK

O layout ELK não entra no bundle (`mermaidSemElk` em `vite.config.ts`). Os dois primeiros diagramas pedem ELK e devem renderizar com dagre, sem bloco de erro e sem requisição a `elk`.

## flowchart-elk

```mermaid
flowchart-elk TD
  A[Início] --> B{Decide}
  B -->|sim| C[Faz]
  B -->|não| D[Pula]
```

## layout: elk no frontmatter

```mermaid
---
config:
  layout: elk
---
flowchart LR
  A --> B --> C
  A --> C
```

## Flowchart normal

```mermaid
flowchart TD
  X[Um] --> Y[Dois] --> Z[Três]
```

## Mindmap

```mermaid
mindmap
  root((Leve))
    Markdown
      GFM
    Diagramas
      Mermaid
```

## architecture-beta

```mermaid
architecture-beta
  group api(cloud)[API]
  service db(database)[Banco] in api
  service server(server)[Servidor] in api
  db:L -- R:server
```
