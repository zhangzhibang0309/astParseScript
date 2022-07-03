const fs = require("fs");
const {
  Text,
  visitAll,
  HtmlParser,
  RecursiveVisitor,
} = require("@angular/compiler");
const walkProject = require("./walk-project");

const root = "../pc-fe";
// 结果索引
let i = 1;

walkProject(
  root,
  (fileInfo) => fileInfo.ext === ".html" && !fileInfo.name.includes("index"),
  (fileInfo) => {
    let code = fs.readFileSync(fileInfo.path).toString();

    const filePath = fileInfo.path.replace(root, "");
    const visitor = new Visitor(filePath);
    const result = new HtmlParser().parse(code, "batch");

    // 将某一个html文件里面的ast rootNodes进行递归，然后去判断每个元素是否符合我们的要求，将符合要求的加入visitor对象的results里面
    visitAll(visitor, result.rootNodes);

    let res = visitor.results.map((item) => `${item}`).join("\n");
    if (res) {
      console.log(res);
    }
  }
);

class Visitor extends RecursiveVisitor {
  static ignoreTags = new Set(["tr", "td", "th", "button"]);

  results = [];

  constructor(file) {
    super();
    this.file = file;
  }

  visitElement(el) {
    el.children = this.removeEmptyText(el.children);

    if (el.children.length === 1 && !Visitor.ignoreTags.has(el.name)) {
      const parentHasStructuralDirective = this.hasStructuralDirective(el);
      const firstChild = el.children[0];

      if (
        parentHasStructuralDirective &&
        firstChild.name !== "i" &&
        this.notTextNode(firstChild) &&
        !this.hasStructuralDirective(firstChild)
      ) {
        const { name, value } = parentHasStructuralDirective;
        const {
          keySpan: { start },
        } = parentHasStructuralDirective;

        if (!this.file.includes("libs/forms") && !this.file.includes("apps/pc/src/app/qflow-forms")) {
          this.results.push(
            `${i++} ${name}="${value}" -> ${this.file}:${start.line + 1}:${start.col}`
          );
        }
      }
    }
  }

  // 删除children中的空Text节点，例如换行和锁进
  removeEmptyText(nodes) {
    return nodes.filter((node) =>
      node instanceof Text ? !!node.value.trim() : true
    );
  }

  // 筛选出*开头
  hasStructuralDirective(element) {
    return element.attrs?.find((item) => this.isStructuralDirective(item.name));
  }

  isStructuralDirective(attrName) {
    return attrName.startsWith("*");
  }

  notTextNode(element) {
    return !(element instanceof Text);
  }
}
