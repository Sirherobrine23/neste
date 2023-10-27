import { constants as bufferConstants } from "buffer";
import busboy from "busboy";
import fs from "fs";
import path from "path";
import stream from "stream";
import { finished } from "stream/promises";
import { promisify } from "util";
import { RequestHandler } from "../handler.js";

export type FileStorage = {
  filePath?: string;
  size?: number;
  restore(fn: (err: any, stream?: stream.Readable) => void): void;
  delete(fn: (err?: any) => void): void;
}

export class LocalFile extends Map<string, FileStorage> {
  rootDir?: string;
  async deleteFile(file: string) {
    if (!(this.has(file))) return Promise.resolve();
    return new Promise<void>((done, reject) => this.get(file).delete(err => {
      if (err) return reject(err);
      this.delete(file);
      return done();
    }));
  }

  async getFile(file: string): Promise<void|stream.Readable> {
    if (!(this.has(file))) return Promise.resolve();
    return new Promise<stream.Readable>((done, reject) => this.get(file).restore((err, str) => {
      if (err) return reject(err);
      return done(str);
    }));
  }

  async deleteRoot() {
    if (typeof this.rootDir !== "string") return;
    await fs.promises.rm(this.rootDir, { recursive: true, force: true });
  }

  toJSON() {
    return Array.from(this.keys()).reduce<Record<string, {name: string, size?: number}>>((acc, k) => {
      acc[k] = {
        name: this.get(k).filePath || "<Remote File>",
        size: this.get(k).size,
      };
      return acc;
    }, {});
  }
}

export type ParseBodyOptions = {
  formData?: {
    /**
     * Create custom upload file
     *
     * example to Aws Bucket, Oracle buckets or same Google Driver
     *
     * if this function is present, `tmpFolder` will be ignored
     *
     * @argument fileStream - File stream
     * @argument info - File info (Not include file size!)
     * @argument fn - on complete file manipulation call callback with file info to storage in body
     */
    fileUpload?: (fileStream: stream.Readable, info: { name: string, filename: string, mimeType: string }, fn: (err: any, callbacks: FileStorage) => void) => void;

    /**
     * **Dont use this with fileUpload function**
     *
     * Storage request files localy in tmp folder
     *
     * in each request generate a folder with a random name [(at a glance how mkdtemp how works)](https://nodejs.org/api/fs.html#fsmkdtempprefix-options-callback) and save the files there
     */
    tmpFolder?: string;
  };
  formEncoded?: {
    /**
     * set body limit
     *
     * @description half of `MAX_LENGTH` from `Buffer.constants`
     */
    limit?: number;
    /**
     * if the body reaches the maximum size, it will respond to the client with a 400 error
     *
     * @default true
     */
    limitResponse?: boolean;
  }
};

export function parseBody(options?: ParseBodyOptions): RequestHandler {
  return async (req, res, next) => {
    options = (options || {});
    if (req.body !== undefined) return next();
    if (req.is("application/json") || req.is("application/x-www-form-urlencoded")) {
      const isJSON = !!req.is("application/json");
      let limit = (options.formEncoded||{}).limit;
      let limitResponse = (options.formEncoded||{}).limitResponse;
      if (limit === undefined) limit = Math.floor(bufferConstants.MAX_LENGTH / 2);
      if (limitResponse === undefined) limitResponse = true;
      let chuckBuff = Buffer.from([]);
      let callLimit = false;
      await finished(req.on("data", function concatBuff(chuck) {
        chuckBuff = Buffer.concat([chuckBuff, chuck]);
        if ((limit !== Infinity && limit > 0) && Buffer.byteLength(chuckBuff) >= limit) {
          req.removeListener("data", concatBuff);
          req.push(null);
          if (limitResponse) {
            callLimit = true;
            res.status(400).json({ message: "Body limit rate" });
            chuckBuff = null;
          }
        }
      }));
      if (callLimit) return next("router"); // end call's
      if (isJSON) req.body = JSON.parse(chuckBuff.toString("utf8"));
      else {
        const bodySearch = new URLSearchParams(chuckBuff.toString("utf8"));
        req.body = Array.from(bodySearch.keys()).reduce<Record<string, string>>((acc, keyName) => {
          acc[keyName] = decodeURIComponent(bodySearch.get(keyName));
          return acc;
        }, {});
      }
      chuckBuff = null;
      return next();
    } else if (req.is("multipart/form-data")) {
      if (!options.formData) return next();
      else if (!((typeof options.formData.tmpFolder === "string" && options.formData.tmpFolder.length > 0) || typeof options.formData.fileUpload === "function")) return next();
      const body = req.body = new LocalFile();
      if (typeof options.formData.tmpFolder === "string" && options.formData.tmpFolder.length > 0) body.rootDir = await ((fs.promises||{}).mkdtemp||promisify(fs.mkdtemp))(options.formData.tmpFolder);
      const parse = busboy({ headers: req.headers });

      let wait = 0;
      const end = (err?: any) => {
        if (err && req.readable) req.push(null);
        if (err || wait <= 0) {
          parse.removeListener("error", end);
          parse.removeListener("close", end);
          parse.removeListener("finish", end);
        }

        if (err) return next(err);
        else if (wait <= 0)  return next();
      }
      parse.on("error", end).on("close", end).on("file", (name, str, fileInfo) => {
        wait++;
        if (typeof options.formData.fileUpload === "function") {
          options.formData.fileUpload(str, { name, filename: fileInfo.filename, mimeType: fileInfo.mimeType }, (err, info) => {
            if (err) return parse.emit("error", err);
            wait--;
            body.set(fileInfo.filename||name, info);
            return end();
          })
          return;
        }
        const filePath = path.join(body.rootDir, fileInfo.filename||name);
        finished(str.pipe(fs.createWriteStream(filePath)), { error: true }).then(async () => {
          wait--;
          body.set(fileInfo.filename||name, {
            filePath: filePath,
            size: (await ((fs.promises||{}).lstat||promisify(fs.lstat))(filePath)).size,
            delete: (fn) => ((fs.promises||{}).rm||promisify(fs.rm))(filePath).then(() => fn(), err => fn(err)),
            restore: (fn) => fn(null, fs.createReadStream(filePath)),
          });
          return end();
        }, err => parse.emit("error", err));
      });
      return req.pipe(parse);
    }
    return next();
  };
}