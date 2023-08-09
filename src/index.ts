export * from "./application";
import { Neste, Router as __Router } from "./application";

function neste() {
  return new Neste();
}

namespace neste {
  () => Neste;
  export function Router() { return new __Router(); }
}

module.exports = neste;
export default neste;