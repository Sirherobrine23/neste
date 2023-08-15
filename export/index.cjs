const app = require("../src/application");
const { parseBody } = require("../src/middles/bodyParse");
const { staticFile } = require("../src/middles/staticFile");

function neste() { return new app.Neste(); }
neste.router = () => new app.Router();
neste.bodyParse = parseBody;
neste.staticFile = staticFile;
exports = module.exports = neste;