import { Neste, Router } from "../src/application.js";
import { parseBody } from "../src/middles/bodyParse.js";
import { staticFile } from "../src/middles/staticFile.js";

declare module "neste" {
  function neste(): Neste;
  export function router(): Router;
  export { parseBody, staticFile };
  export default neste;
  export = neste;
}