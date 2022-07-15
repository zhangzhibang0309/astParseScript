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

/**
 * 这个是一个遍历项目目录的一个函数，大概就是能够遍历到所有文件，然后拿到文件的文件名 扩展名 路径信息等
 * 然后里面有两个回调
 * 第一个回调 return为true则调用第二个回调
 * 第二个回调 就是对每个文件进行处理 核心逻辑都在下面
 */
walkProject(
  root,
  (fileInfo) => fileInfo.ext === ".html" && !fileInfo.name.includes("index"),
  (fileInfo) => {
    /**
     * 就是这个 比如这里是把文件里的code拿到 解析成了ast 然后使用访问者模式去遍历这个ast
     */
    let code = fs.readFileSync(fileInfo.path).toString();

    const filePath = fileInfo.path.replace(root, "");
    const visitor = new Visitor(filePath);
    const result = new HtmlParser().parse(code, "batch");

    /**
     * 这个就是我说的访问者 @angular/compiler实现了一个父类 可以访问所有的element 访问所有的属性attribute等等还有好多
     * 功能就是可以很方便的递归遍历所有的ast节点的某个属性 或者每个元素
     */
    visitAll(visitor, result.rootNodes);

    // 业务逻辑 忽略
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

  /**
   * 这个就是访问拿到的ast的所有元素 因为是html 就是html的所有元素 里面包括很多信息 包括属性
   * @param {*} el el就是每个元素的ast 因为父类都写好了 这里直接用
   * 但是ast 是一层一层的 有children 所以你本身是要递归调用的 但是这个访问者就很爽 帮你实现了 你只需要在调用一次 super.visitElement(el) 就可以不断递归完所有
   */
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

    super.visitElement(el);
  }

  // 下面的函数都可以不看 因为是我这个任务的具体逻辑
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
