# 分析ast抽象语法树在一个庞大项目中找到自己需要优化的地方
。
先描述一下我这个优化具体要做什么。
```html
<ng-container *ngIf="expression">
  <p>我出现了</p>
</ng-container>>
<!-- 上面这段代码有些冗余标签，需要优化 -->
<p *ngIf="expression">我出现了</p>
```
也就是说我要把所有用到ng中结构型指令并且还是写在了多余标签上的结构型指令下移到标签。
但是在一个庞大项目中，是无法快速找到需要改动的位置的，所以在大佬的指点下，做了下面这个搜索脚本。
简单来说就是拿到所有html的ast，然后去匹配每个Element的属性名，如果有*那才有可能是我们想要的，但是这远远不能精准定位，所以还要再添加一个限制，也就是这个Element的某个元素有\*，并且这个Element只能有一个子元素，当然是在筛选掉空的Text节点之后，这样的话基本就能定位到我们想要的。
## 第一步，遍历所有文件

实现递归遍历所有文件可以用walk库，对于一些路径处理可能需要path。

```js
const path = require("path");
const walk = require("walk");
```

遍历到每个文件之后肯定是需要根据自己的需求做一系列复杂操作，所以我们直接把这块逻辑封装成一个函数。

```js
/**
 * @param {*} projectRoot 项目根路径
 * @param {*} pred 对递归到的文件进行一些筛选
 * @param {*} cb 核心处理逻辑
 */
function walkProject(projectRoot, pred, cb) {
    pred = pred || (() => true);

    /**
     * projectRoot 项目根路径
     * 第二个参数是一个对象，里面传了需要过滤的路径
     *  */
    const walker = walk.walk(projectRoot, {
        filters: ["node_modules", ".git", "scripts", "dist"],
    });

    // 调用on方法，对root进行递归
    walker.on("file", function(root, fileStats, next) {
        const name = fileStats.name;
        const ext = path.extname(name);
        const fileInfo = {
            name,
            ext,
            path: path.join(root, name),
        };

        // 筛选
        if (pred(fileInfo)) {
            // 核心处理逻辑
            cb && cb.call(null, fileInfo);
        }

        // 进行下一次的递归
        next();
    });
}
```

这里是整个程序的一个框架，当然最重要的ast解析是在上面所说的核心处理逻辑里面，当然这次主要是对html文件进行一些改动，所以也就是要得到html的ast。

## 如何得到html的ast以及通过解析ast找到自己的target
我们要在调用walkProject的时候传过来一个回调函数，在这个函数里面解析ast并筛选出我们的目标。
先来理清一下思路，在上面walkProject中执行cb也就是刚才所说的核心回调，这时候我们有的只是一个fileInfo，这里面存储着每个html文件的路径，然后就要通过这个路径，先去拿到html模版，然后将这一整页的html解析成ast抽象语法树。
就单单看这一部分，其实难度就很高的，比较纯粹的做法是自己手撕一个html转ast，不过这种轮子是很常见的，特别是在各个前端框架的compiler模块中（这个脚本的架子是我从公司架构师那里拿的，所以很多地方都写好了），这里用的是@angular/complier中的HtmlParser，用法很简单，可以将传入的html模版字符串直接解析成ast。后面的处理其实就简单多了。

但是稍微仔细想一下，我们拿到的ast是一整个文件的，也就是只有顶层元素，这时候必然要去不断的递归遍历Element和Element的children，我们应该对每一个元素判断是否是我们想要的。

所以还用到了@angular/complier中的visitAll方法，这个方法可以自动化递归ast树，然后根据传入的visitor对象中的visitElement方法不断的对Element进行筛选。
```js
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

```