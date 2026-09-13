# dsh-column-swap

> 把 DSH 的**原生右侧栏**与**智能体对话栏**对调位置：`[左栏 | 对话栏 | 右列]` → `[左栏 | 右列 | 对话栏]`，两侧宽度各自保留；窗口右上角提供一枚总开关，随时切回原生列序。

[English](./README_EN.md) · **中文**

## 它解决什么

DSH 的 `AppFrame` 是一个三轨 grid：

```
[ DSH 左栏 | 智能体对话栏 (1fr) | 原生右列 (R px) ]
```

右列就是 DSH 的**原生右侧栏**（`@deepseek-ai/dsh-client-ui-sidebar-right`：面板、tabs、Guide、停靠与导航服务都在它里面）。而 DSH 没有提供「把右列换到左边」的开关，`ctx.layout` 的公开面也只有 `openRightbar(track, fullscreen)` / `closeRightbar`，**没有右列宽度的 setter**。于是就有了这个纯客户端布局补丁：靠语义锚点定位 + 重写帧内联的轨道尺寸 + 少量 CSS 变量，**不改任何上游文件**。

它与「谁占用右列」无关：装了 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（0.19+ 起把全部 tab 注册进 DSH 原生右列）时交换的就是它；只装 DSH 自带内容（内置 Guide 页 / 文档预览）时同样成立 —— 本插件不 require、不调用、也不检查任何第三方插件。

## 环境要求

| | |
|---|---|
| DSH | `0.1.5-rc.1+`（原生右侧栏自 `0.1.5-alpha.1` 引入，可用的 API 面在 `rc.1` 稳定；本插件实测于 `0.1.5-rc.1`） |
| Node.js | `>= 20` |
| 构建 | **无需构建**：`lib/index.js`（宿主半边）与 `lib/client.js`（浏览器半边）本身就是手写纯 JS 源码，没有 TS / 打包步骤 |

## 安装

### 方式一：插件市场 / `dsh plugin add`（推荐）

在市场里粘贴仓库地址，或：

```bash
dsh plugin --profile web add github:lakersoul/dsh-column-swap
# 然后重启 DSH
```

包内声明了 `dsh.bundle.patch`，因此 `dsh plugin add` 会把它追加进 `dsh.profile.bundles`，由 profile 在启动时装配。

### 方式二：本地检出（开发 / 改代码）

```bash
git clone https://github.com/lakersoul/dsh-column-swap
cd dsh-column-swap
node install.mjs --dry-run     # 只打印将要做的改动，不落盘
node install.mjs               # 建立 link: 依赖 + 写入 bundles + node_modules 链接
# 然后重启 DSH
```

`install.mjs` 支持两条挂载通道，且**每次都会把另一种清干净**——同一个包若从两个 Loader 源出现，`dsh-client-modules` 会直接抛错：

| | 正规 bundle 通道（默认） | 手动通道（`--manual`） |
|---|---|---|
| 装配来源 | 本包内的 `cordis.patch.yml`（`package.json` 的 `dsh.bundle.patch`），由 profile manifest 的 `dsh.profile.bundles` 在启动时装配 | profile 自己的 `cordis.patch.yml` 里一段带标记的绝对路径 `insert` |
| 改动的文件 | `<profile>/package.json`（`dependencies` 加 `link:<本包>`、`bundles` 追加本包名）+ `node_modules/dsh-column-swap` 符号链接 + 清掉手动段 | 只写 profile 的 `cordis.patch.yml` |
| market 识别 | 「已安装 / 本地开发」；`dsh plugin` 也能参与 bundles 排序与 reconcile | 仍需依赖声明才可见 |

- 默认 profile：`~/.dsh/profiles/web`；用 `--profile <目录>` 指定其它 profile。
- 幂等：重复执行只做差量改动；写入前备份为 `<文件>.bak-dsh-column-swap-<时间戳>`，并用 profile 内的 `yaml` 解析器校验 patch 结果仍是合法数组，不合法就整体中止、不写任何内容。
- 时序：`bundles` 与 profile 装配都在启动时读取 ⇒ 需要重启 DSH；而摘除手动段会被 profile patch 层的 live watcher **立即**应用。

卸载：

```bash
node install.mjs --remove      # 两条通道都清（依赖、bundles、符号链接、手动段），然后重启 DSH
```

## 效果

某次实测（视口 1854×1044、右列宽 820px）：

| 列 | grid 位置 | 实测 rect (x, y, w, h) |
|---|---|---|
| `sidebarCol`（DSH 左栏） | col 1 / row 1 | `[0, 0, 264, 1044]` |
| `rightbarCol`（原生右列） | col 2 / row 1 | `[264, 0, 820, 1044]` |
| `centerCol`（智能体对话栏） | col 3 / row 1 | `[1084, 0, 771, 1044]` |

帧的**计算值**是 `264px 820px 770.545px`，而**内联值**仍是 React 原本的 `264px minmax(0px, 1fr) 820px` —— 说明轨道确实被重写、宽度没有跟着轨道跑。右手柄 `left` = 1084 = 264 + 820，正好落在右列与对话栏的新边界上。

## 工作原理（六个要点，每一个都对应一个踩过的坑）

1. **锚点定位**：右列 = `[data-rightbar-col]`；帧 = 它向上最近的 `display:grid` 祖先；三列 = 各自锚点**向上走到帧的直接子元素**（跨任意层 slot 包裹）。对话列有四级兜底（`main` → `main.conversation` → `conversation` 的 slot 宿主 → 「帧的在流子元素里排除左右两列后仅剩的那一个」）；左栏找不到也不阻塞（此时只显式放置右列与对话栏，左栏自动占第 1 轨）。

2. **轨道重写**：读帧的**内联** `grid-template-columns`（React 的真相源；读计算值会读到自己写出去的结果而自激），用注入的 `!important` 规则覆盖成 `左栏px 右列px minmax(0,1fr)`。纯字符串演算，热路径无强制重排。

3. **`grid-row: 1`（必需）**：只给「确定列、自动行」的 grid item 时，稀疏自动放置的游标会在**列号回退**时把行 +1 —— 布局里文档顺序是 左栏(col1) → 对话栏(col3) → 右列(col2)，于是右列被判给**隐式第 2 行**；而 `grid-template-rows: 100%` 只定义第 1 行，隐式行高为 auto ⇒ 高度 0，整列被挤到视口下方（现象：列「换对了」却什么都看不见）。三列都写死 `grid-row: 1` 即可。

4. **分割线**：原生那条「对话栏 | 右列」分界线其实是**面板自己的** `border-left`（`.panel{border-left:.5px solid var(--dsw-alias-border-l4)}`）—— 面板原本 `right:0` 锚在右列右缘，其左缘正好落在边界上。交换后右列跑到中间，面板左缘变成与左栏 `border-right` 重叠，而新边界上什么都没有 ⇒ 表现为「少了分割线」。修法：交换态去掉面板的 `border-left`，改在**右列右缘**画等宽同色线（列宽为 0 时不画）。

5. **拖动方向**：原生手柄的 `onDrag` 是 `setRightbar(base - dx)` —— 这是**右侧停靠**语义（手柄在面板左缘，向左拖 = 面板变宽）。交换后右列变成「左缘钉在左栏」的左停靠，同一个公式就反了。因为没有宽度 API，只能在事件层纠正：在帧上以捕获阶段拦住右手柄的指针事件，把 `clientX` **关于 0 镜像**后重新派发 —— `DragHandle` 只用 `clientX` 的差值（`origin` / `latest`），绝对量从不参与，因此镜像等价于 `dx → -dx`。**开关关闭时直接放行**，让原生布局保住它本来正确的方向。

6. **总开关**：所有布局规则都挂在 `[data-dsh-swap-on]` 门下；开关只加/去这一个属性，CSS 变量与列标记都保留着，所以切换即时生效、无需重算。按钮注册进 `conversation.session.header.utilities`（**list** 槽，纯追加、右对齐）—— 单个 `conversation.session.header.corner` 归 DSH 原生右侧栏包所有，不能抢；而交换态下对话栏就是最右列，这一行正好是窗口右上角，紧贴原生的右侧栏展开按钮。按钮样式只用产品已有的 token，文案跟随 `navigator.language`。

另外两处手感细节：面板宽度在交换态改由轨道推出（`width:100%`，取列的 padding box），与栏宽恒等，拖动时不会出现「面板已变、轨道未变」的逐帧错位；帧 `style` 的重算走**同步微任务**（MutationObserver 回调），与 React 的同一次提交落在同一帧，而流式输出那条子树观察器仍留在 rAF 防抖上。

## 验证

1. 浏览器控制台出现一行：`[dsh-column-swap] column swap active — rail/sidebar = <px> / <px>`。
2. 三列 rect 应为 `左栏[0..S]`、右列`[S..S+R]`、对话栏`[S+R..]`，且三者 `grid-row` 均为 `1 / auto`。
3. 拖「右列 ↔ 对话栏」之间的分割线：向右拖右列变宽、向左拖变窄，跟指针走，且列内宽度逐帧跟随。
4. 点右上角按钮：列序回到原生，且**此时分割线拖动方向也是原生的正确方向**；再点切回。

## 依赖的宿主接口（DSH 升级后若失效，从这里查）

| 用途 | 依赖 | 归属包 |
|---|---|---|
| 右列 | `[data-rightbar-col]` | `dsh-client-ui-layout`（AppFrame `RightbarColumn`） |
| 帧 / 轨道 | 右列向上最近的 `display:grid` 祖先；帧**内联** `style.gridTemplateColumns`（须为三段、首末为 `px`） | `dsh-client-ui-layout` |
| 右手柄 | `[data-side="rightbar"]`（内联 `left`） | `dsh-client-ui-layout`（`DragHandle`） |
| 对话列 | `[data-slot="main"]` → `[data-slot="main.conversation"]` → `[data-slot="conversation"]` → 在流子元素排除法 | `dsh-client-ui-conversation` |
| 左栏 | `[data-slot="sidebar"]` | `dsh-client-ui-sidebar` |
| 面板 | `[data-sidebar-right-panel]` / `[data-sidebar-right-open]` / `[data-sidebar-right-panel="fullscreen"]` | `dsh-client-ui-sidebar-right` |
| 按钮座位 | `conversation.session.header.utilities`（list 槽） | `dsh-client-ui-conversation` |
| 颜色 token | `--dsw-alias-border-l4`、`--dsw-alias-label-secondary`、`--dsw-alias-interactive-bg-hover` | `dsh-client-ui-theme` |

**没有任何一条锚点属于第三方插件。** 设计原则：锚点对不上时整体不动作 —— 宁可没有效果，也不写坏布局。所以「升级后失效」的表现会是「没反应」，而不是版面崩坏；此时只需按上表重新对齐 `lib/client.js` 里的 `resolve()`。

## 与 dsh-better-sidebar 的关系

**代码层零关联**（`grep -n "betterSidebar\|better-sidebar" lib/*.js` 可自证：只出现在注释与说明文字里）。不 require 它、不调用 `ctx.betterSidebar`、不引用它的任何 DOM 标记（它给对话列打的 `data-dsh-center-col` 特意未使用）、也不检查它是否安装。

- **换掉占位者照样成立**：卸载 better-sidebar 后，同一列变成 DSH 自带内容（内置 Guide 页、`dsh-client-ui-sidebar-documentpreview` 的文档预览），交换照常工作，只是列里的东西换了。
- **右列没有轨道**（未打开 / 窄窗悬浮模式）时，插件视觉上等于什么都不做（右上角按钮仍在，随时可切）。
- **一处真实交互（不是依赖）**：better-sidebar 的底部工作台按「对话栏」那一列的矩形定位，所以列一换，它跟着对话栏一起跑到右侧；若它不在，就没有这个连带效果。

## 已知取舍

- **底部工作台跟着对话栏跑到右侧**（仅在装了 better-sidebar 时可见）：它的底栏绑定在对话栏那一列上（按该列 rect 定位），列一换自然跟着走，宽度与对话栏一致。若希望底栏留在左侧，那是另一份改动。
- **右列 `overflow:hidden`**：开合右侧栏时轨道宽度是动画变化的，而面板固定为轨道宽、`right:0` 锚定 —— 不裁剪的话面板会先整块盖住左栏再滑回去。裁剪后是一次干净的擦除。代价：把 tab 拖出列外的拖拽浮层会被裁掉（原生菜单与悬浮层是 portal 到 `document.body` 的，不受影响）。
- **窄窗 / 悬浮模式**（右列轨道为 0）：面板被钉回视口右缘，保持原生「悬在对话区之上」的表现。
- **镜像只在交换态生效**：开关关闭时事件原样放行。
- 面板在交换态被去掉 `border-left`、宽度改由轨道推出，与栏宽恒等。

## 上游升级后怎么办

- **占位插件（如 better-sidebar）升级**：本插件不碰它的任何文件，通常无需处理；若它改了面板的 DOM 结构，按上表核对 `[data-sidebar-right-panel]` / `[data-sidebar-right-open]` 等锚点。
- **DSH 升级**：若 `AppFrame` 的列结构 / 属性名变了，失效表现是「没反应」，按上表重新对齐 `resolve()` 即可。
- **只想临时恢复原生**：点右上角按钮（不改文件、不重启）。
- **想彻底移除**：`node install.mjs --remove` 后重启；或用市场 UI 卸载。

## 开发说明

- **无需构建**：`lib/*.js` 即源码。`npm run check` 只做语法校验（`node --check`）。
- 改代码时建议先用 Cordis 动态插件（`cordis_define` / `cordis_run`）在**不重启**的前提下灰度验证，确认手感后再落回 `lib/`。
- 早期实现方式：动态插件把实测 DOM 事实（三列 rect、内联与计算轨道值、分割线宽度、手柄位置）写回文件逐项核对 —— 这个插件里几个关键坑（隐式第 2 行、错位的分割线、反向拖拽、逐帧错位）都是靠这种方式定位的。

## License

MIT © 2026 lakersoul
