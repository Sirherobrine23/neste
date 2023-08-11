export * from "./application";
export * from "./middles/staticFile";
export * from "./middles/bodyParse";
import { staticFile as __staticFile } from "./middles/staticFile";
import { parseBody as __parseBody } from "./middles/bodyParse";
import { Neste, Router as __Router } from "./application";

function neste() {
  return new Neste();
}

namespace neste {
  () => Neste;
  export function Router() { return new __Router(); }
  export const staticFile = __staticFile;
  export const parseBody = __parseBody;
}

module.exports = neste;
export default neste;