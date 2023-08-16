import main from "../src/application.js";
import __body from "../src/middles/bodyParse.js";
import __static_files from "../src/middles/staticFile.js";
const { Neste, Router } = main, { LocalFile, parseBody } = __body, { staticFile } = __static_files;

export default function neste() { return new Neste(); }
function router() { return new Router() };

export { LocalFile, neste, parseBody, router, staticFile };