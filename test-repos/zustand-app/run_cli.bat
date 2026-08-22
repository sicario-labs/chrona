cd c:\chrona\test-repos\zustand-app
set CHRONA_USE_MOCK_REGISTRY=1
npx @chrona-engine/cli ws --task "Replace direct store subscription with a selector-based pattern" --json > packet3.json
