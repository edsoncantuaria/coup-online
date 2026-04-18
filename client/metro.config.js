const path = require("path");
const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

/**
 * Metro falha a resolver requires relativos como `./internal/errors` dentro de
 * `assert` (dependência de @ide/backoff → expo-notifications), embora os ficheiros
 * existam em `assert/build/internal/*.js`. Forçamos o caminho absoluto do ficheiro.
 */
const previousResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Metro falha a resolver `./internal/foo` → `foo.js` em alguns pacotes (ex.: `assert`).
  // Node resolve pelo diretório do módulo que pede o require — fazemos o mesmo.
  if (
    typeof moduleName === "string" &&
    moduleName.startsWith("./internal/") &&
    context.originModulePath
  ) {
    const candidate = path.resolve(
      path.dirname(context.originModulePath),
      `${moduleName}.js`
    );
    if (fs.existsSync(candidate)) {
      return { type: "sourceFile", filePath: candidate };
    }
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
