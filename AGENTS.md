# dsh-column-swap — 会话交接（给新会话 / 智能体）

DSH Web 客户端插件：把 DSH 原生「右列」与智能体对话栏**交换位置**（宽度保持不变），
右上角按钮是本插件的**总开关**（默认不交换，状态有意不持久化）。

## 快速事实

| 项 | 值 |
|---|---|
| 包 / 版本 | `dsh-column-swap`，见 `package.json`（当前 `1.1.7`） |
| 形态 | **无构建**：`lib/client.js`（浏览器半边，手写 JS + `window.__ModuleLoader__` 工厂）、`lib/index.js`（宿主半边，空壳） |
| 安装渠道 | bundle patch（`cordis.patch.yml`）+ profile 的 `link:` 依赖 + `dsh.profile.bundles`；`install.mjs` 是双渠道安装器 |
| 远端仓库 | `ssh://git@ssh.github.com:443/lakersoul/dsh-column-swap.git`（`main`） |
| 已实测 DSH | `0.1.5-rc.1` / `0.1.7-rc.2` / `0.2.0-rc.2` / `0.2.2-rc.5` |
| 本机安装态 | `~/.dsh/profiles/web/package.json` 的 `link:` 指向本目录；`node_modules/dsh-column-swap` 是指向本目录的**符号链接**（没有代码副本） |

## 接手时先读

1. `README.md` —— 设计取舍、**依赖的宿主接口（锚点表）**、验证步骤、已知限制（中英两份）
2. `lib/client.js` 顶部注释 —— 每条 `!important` 规则都写明了原因
3. `git log --oneline` —— 版本演进与每次适配的动机

## 改动 → 验证 → 发布

1. `npm run check`（= 三个 `node --check`）
2. **生效方式**：本地 `link:` 安装 ⇒ 改 `lib/` 后让用户**刷新页面**；改 `cordis.patch.yml` 会被 profile 的 `patchReload: live` 热应用（改 `dsh.profile.bundles` 则要重启进程）
3. **自检**：用户点按钮时控制台打印
   `[dsh-column-swap] swapped | rail … | sidebar … | conversation … | gap 0px | template …`
   `gap 0px` 且 `template` 非 `none` 即健康；异常时自动展开 `lines L=… R=… (expect 1 / 1)` 与边界明细，把那段贴回来即可定位
4. **推送**：`git add -A` → conventional commit → `git push` → 用 `api.github.com` 的 `/git/trees/main?recursive=1` 与 `git ls-tree -r HEAD` 做**字节级复核**

## 推送凭据不在本目录

仓库已设 `core.sshCommand`，硬编码 `/home/slzca/deepseekwork/open/.ssh/id_ed25519`（工作区根下，**本目录之外**）。

- `github.com` 在本机不可达，必须走 `ssh.github.com:443`（仓库 URL 已如此配置）
- 报 `Permission denied (publickey)` = 私钥不存在：重新 `ssh-keygen` 并把公钥贴到 <https://github.com/settings/keys>（用 `ssh-keygen -l -f <key>.pub` 的指纹核对是否贴对）
- 若把本目录整体搬走：改 `core.sshCommand` 指向新路径，或在目录内建 `.devssh/` 并**务必**加进 `.gitignore`

## DSH 升级后的适配流程

1. 读 `<DSH 安装目录>/docs/upgrade-guide/README.md`，只挑影响「Client 槽位 / 包导出 / 插件配置 / 服务 / cordis.yml 键」的条目
2. 按 README 锚点表逐项 grep 宿主源码：
   `@deepseek-ai/dsh-client-ui-layout` 的 `data-rightbar-col`、`gridTemplateColumns`、手柄 `left`、`data-rightbar-collapsed`；
   `@deepseek-ai/dsh-client-ui-sidebar-right` 的面板属性与宽度写法
3. 实况核对槽位：`cordis_inspect_query`（client / `Slots` / `listSubTree`，`root: conversation.session.header.utilities`）
4. 模板写法若变：改 `lib/client.js` 的 `splitTracks()`（只认三轨；形状不认识就整体不动作，不要加探测）
5. 更新 README/E 的「已实测版本」，提交并推送

## 不要做

- 不要在本 profile 里再装一份 GitHub 副本（与 `link:` 双源会让 `dsh-client-modules` 启动失败）
- 不要给视觉问题加「自动探测 / 自动修复」：`v1.1.2` 曾用探测判断"宿主画不画线"，结果把分隔线误删
- 不要动 `patches/` 下其它插件的文件，也不要把私钥或 token 写进仓库
- profile 与 DSH 安装目录都在工作区之外：写入会触发审批，属正常流程
