import { Neste, Router } from "../src/application.js";
export { parseBody } from "../src/middles/bodyParse.js";
export { staticFile } from "../src/middles/staticFile.js";

function router(): Router;
export default function neste(): Neste;
export { Neste, Router, neste, router };