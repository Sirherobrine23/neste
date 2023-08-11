import { Neste, Router } from "../src/application.js";
export { Neste, Router } from "../src/application.js";
export { LocalFile, parseBody } from "../src/middles/bodyParse.js";
export { staticFile } from "../src/middles/staticFile.js";

export default function neste() { return new Neste(); }
function router() { return new Router() };
export { neste, router };