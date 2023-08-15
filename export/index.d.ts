import { Neste, Router } from "../src/application.js";
import { parseBody } from "../src/middles/bodyParse.js";
import { staticFile } from "../src/middles/staticFile.js";

declare module "neste" {
  export default neste;
  export = neste;

  function neste(): Neste;
  namespace neste {
    export function router(): Router;
    export { parseBody, staticFile };
  }

}