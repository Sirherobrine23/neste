import fs from "fs";
import path from "path";
import { pipeline } from "stream";
import { RequestHandler } from "../layer";

export function staticFile(folderPath: string): RequestHandler {
  folderPath = path.resolve(process.cwd(), folderPath);
  if (!(fs.existsSync(folderPath))) throw new Error("Set valid foldwr");
  return (req, res, next) => {
    const localFile = path.join(folderPath, req.path.substring(1));
    if (!(localFile.startsWith(folderPath))) return res.status(400).json({ error: "Invalid request file" });
    if (!(fs.existsSync(localFile))) return next();
    fs.lstat(localFile, (err, stats) => {
      if (err) return next(err);
      if (stats.isDirectory()) {
        fs.readdir(localFile, (err, files) => {
          if (err) return next(err);
          res.json(files);
        });
      } else {
        let fileSendSize = req.range(stats.size);
        if (Array.isArray(fileSendSize)) {
          const { start, end } = fileSendSize.at(0);
          res.set("Content-Length", String(stats.size - (start + end)));
          pipeline(fs.createReadStream(localFile, { start, end }), res.status(200), (err) => err ? next(err) : null);
          return;
        }
        res.set("Content-Length", String(stats.size));
        pipeline(fs.createReadStream(localFile), res.status(200), (err) => err ? next(err) : null);
      }
    });
  };
}