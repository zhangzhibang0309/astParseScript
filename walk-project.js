const path = require("path");
const walk = require("walk");
/**
 * 
 * @param {*} projectRoot
 * @param {*} pred 
 * @param {*} cb 
 */
function walkProject(projectRoot, pred, cb) {
  pred = pred || (() => true);

  const walker = walk.walk(projectRoot, {
    filters: ["node_modules", ".git", "scripts", "dist"],
  });

  walker.on("file", function (root, fileStats, next) {
    const name = fileStats.name;
    const ext = path.extname(name);
    const fileInfo = {
      name,
      ext,
      path: path.join(root, name),
    };

    if (pred(fileInfo)) {
      cb && cb.call(null, fileInfo);
    }

    next();
  });
}

module.exports = walkProject;
