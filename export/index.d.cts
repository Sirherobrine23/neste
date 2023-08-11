import { Neste, Router } from "../src/application.js";
import { parseBody, LocalFile } from "../src/middles/bodyParse.js";
import { staticFile } from "../src/middles/staticFile.js";

function neste(): Neste;
namespace neste {
  export function router(): Router;
  export { LocalFile, parseBody, staticFile };
}

export = neste;