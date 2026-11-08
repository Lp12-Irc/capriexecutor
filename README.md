# Capri Executor

Código-fonte da interface desktop Capri. O aplicativo usa WPF e WebView2 para exibir a interface React.

## Estrutura

- `Interface/`: interface React, TypeScript e Vite.
- `Windows/`: aplicativo WPF e pacote da interface compilada.

## Compilar

1. Em `Interface/`, execute `pnpm install` e `pnpm build`.
2. Compacte o conteúdo de `Interface/dist/` como `Windows/UI.zip`.
3. Em `Windows/`, execute `dotnet publish CapriExecutor.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true`.

O aplicativo atual detecta o processo Roblox e oferece editor e prévia local de Luau. Ele ainda não executa Luau dentro do Roblox.
