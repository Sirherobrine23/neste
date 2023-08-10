export * from "./application";
export * from "./middles/staticFile";
import { staticFile as __staticFile } from "./middles/staticFile";
import { Neste, Router as __Router } from "./application";

function neste() {
  return new Neste();
}

namespace neste {
  () => Neste;
  export function Router() { return new __Router(); }
  export const staticFile = __staticFile;
}

module.exports = neste;
export default neste;