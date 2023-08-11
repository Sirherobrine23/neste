const app = require("../src/application");
const bodyParse = require("../src/middles/bodyParse");
const staticFile = require("../src/middles/staticFile");

exports = module.exports = neste;
function neste() { return new app.Neste(); }
neste.router = () => new app.Router();
neste.bodyParse = bodyParse.parseBody;
neste.staticFile = staticFile.staticFile;