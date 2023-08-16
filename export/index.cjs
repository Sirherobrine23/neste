const app = require("../src/application");
const { parseBody } = require("../src/middles/bodyParse");
const { staticFile } = require("../src/middles/staticFile");

function neste() { return new app.Neste(); }
function router() { return new app.Router(); }
module.exports = neste;
module.exports.router = router;
module.exports.parseBody = parseBody;
module.exports.staticFile = staticFile;