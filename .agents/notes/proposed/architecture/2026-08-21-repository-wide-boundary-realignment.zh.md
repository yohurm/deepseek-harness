# Agent Note: 全仓严格边界对齐

Status: proposed

[English](2026-08-21-repository-wide-boundary-realignment.md) | 中文

## 问题

本仓库当前在五个面上违反同一条边界不变量:门面只转发、持久化只收当前格式、视图只做展示、跨包只走公开入口、可调项只出自单一来源。

1. **读时兼容层。** 持久化协调器在每次读取时把 pre-react-loop 事件转换为当前形态:`legacyMessageId` 到四个 `migrateLegacy*` 函数运行在 `adoptStoredEvents`/`snapshotStoredEvents` 之内(`packages/session/session-persistence/src/coordinator.ts:313`)。这与「`SESSION_FORMAT_VERSION` 固定为 `0`、后端拒绝旧格式」的立场冲突,也使同一文件对 `request/header-delta` 响亮拒绝、对 `steering/message` 静默转换;`TurnEndCancelCause` 还永久保留仅由迁移写入的 `{ kind: 'legacy' }` 变体(`packages/core/session/src/types.ts:150`)。
2. **包入口夹带实现。** `packages/core/tools/src/index.ts:787` 的 `ToolRuntime` 与 `packages/extensions/cordis-host-runner/src/index.ts:124` 的 `DynamicCordisRunnerService` 把整个实现留在包入口,门面与实现同文件。
3. **职责混杂的大文件。** `packages/host/apiproxy/src/api-proxy.ts:1051`(3658 行)混合 RPC 帧编码、参数校验、会话投影与六个业务域;`packages/client/ui-trajectory/src/client/TrajectoryTable.tsx:1693`(3074 行)堆叠约 40 个子视图,并把 `Usage`、`Source` 等用户可见文案硬编码,绕过该包已注册的 `ctx.locale` 服务。
4. **跨包深路径导入。** `packages/test-support/client-runtime/src/index.ts:28` 以 `@deepseek-ai/dsh-client-ui-renderer/src/client/bind.ts` 越过公开入口;该包发布的 `exports` 又声明 `./src/*`,而 `files` 不含 `src`,打包产物无法解析该子路径。
5. **双轨 API 与散落硬编码。** `ClientTimerService`(`packages/extensions/cordis-client-runner/src/client/timer.ts:42`)为对齐 vendored Cordis 保留弃用的 `setTimeout`/`setInterval` 别名,无生产调用方;`web-fetch-http`(`packages/web/web-fetch-http/src/index.ts:25`)在 `User-Agent` 中硬编码 `0.0.1`,而包版本为 `0.1.0-rc.8`;`DSH Local Build` 在构建配置与运行时组件各留一份。

## 方案

一次决策:全仓回到上述边界不变量,分五个独立轨道落地,可各自提交。每条轨道给出设计前/后数据链路;行为差异列在验收标准中。

### 轨道 1:终止会话读时迁移

设计前:后端读取(jsonl `format.ts` 或 sqlite)→ `adoptStoredEvents`/`snapshotStoredEvents` → `migrateLegacy*` 转换 → `snapshotSessionEvent` 校验 → `Session` → `deriveMessages` → 模型请求与 UI 投影。兼容成本在第二跳,并渗入核心领域类型。

设计后:后端读取 → `assertSupportedEvents` 只校验单一当前格式,拒绝时点名事件类型与 seq → `Session` → `deriveMessages`。旧记录走两条路之一:

- **一次性迁移后拒绝。** 发布离线迁移命令,把受支持的旧记录改写为当前包络,随后拒绝全部旧形态;命令用完即删,沿用[临时夹具迁移器](../../proposed/process/2026-07-26-remove-packed-session-fixture-migrator.md)先例。
- **直接拒绝(已落地)。** 不发迁移命令,拒绝全部旧记录。代价是失去打开 pre-react-loop 日志的能力。已落地行为见[会话旧形态终止](../../implemented/architecture/2026-08-21-session-legacy-shape-termination.md)。

两条路都消除读时双轨,差别只在是否保留旧数据。

### 轨道 2:包入口只做门面

- `dsh-tools`:`ToolRuntime` 与守卫、调度、呈现管线抽到 `src/runtime.ts`,入口只留类型与转发导出。
- `dsh-cordis-host-runner`:`DynamicCordisRunnerService` 与错误格式化抽到 `src/runner.ts`,入口保留品牌 id、`Config`、类型与转发。
- `dsh-host-apiproxy`:按域拆分 `api-proxy.ts`——帧编码留在 fetch/rpc 载体层,会话历史与回扫、投影、待批准/待回答、workspaces、presets、搜索各成模块,`createApiProxy` 只做装配;入口已是门面,不改。
- `dsh-session`:`SessionStore` 与 `Session` 分文件,入口只转发。
- 门面判定可机械检查:入口不含 `class ... extends Service` 函数体、不含领域算法,只有类型声明与导出。

工具执行链路设计前/后不变:工具调用 → `tools/pre-execute`(瀑布)→ `tools/execute` → Provider → `tools/post-execute` → `tool/result`。本轨道只把 `ToolRuntime` 从入口移到 `runtime.ts`,运行时事件与注册语义不动。

### 轨道 3:客户端 UI 归位(文件、文案、token)

- 把 `TrajectoryTable.tsx` 拆为主表(虚拟化、选中、详情状态)与 `panels/`(Usage/Token、系统提示 diff、工具目录、消息来源、记录呈现);图标与常量各归 `icons.tsx`、`constants.ts`。
- 全部用户可见字符串经 `ctx.locale.bind(NS)`,补全中英成对词典;删除组件内硬编码英文。
- 视觉常量归位:滚动/虚拟化阈值是逻辑,留在模块常量;列宽与面板尺寸进 `TrajectoryTable.module.css` 或 `ui-theme` 设计 token,不进组件代码。

设计前:会话事件 → 会话投影/快照 → `TrajectoryTable` 本地状态 → 虚拟行分组 → React 渲染,文案与尺寸内联在组件。

设计后:同一链路,状态与虚拟化留在主表,面板只按 props 渲染,文案经 `ctx.locale`,尺寸经 CSS 变量。行为不变,只移动文件位置与文案来源。

### 轨道 4:跨包只走公开入口

- 从 `dsh-client-ui-renderer` 的公开 `client` 入口补导出 `bindSnapshotSelector` 与 `createSlotRenderer`;`test-support/client-runtime` 改为从 `@deepseek-ai/dsh-client-ui-renderer/client` 导入。
- 从发布 `exports` 删除 `./src/*`;该子路径指向 `files` 未发布的 `src`,打包产物无法解析。
- 落地前 `rg 'dsh-client-ui-renderer/src'` 必须只出现上述两行导入(当前即是)。

### 轨道 5:去双轨与收拢硬编码

- 删除 `ClientTimerService.setTimeout`/`setInterval` 与对应 mixin 项;消费方统一 `ctx.timeout()`/`ctx.interval()`。
- `User-Agent` 版本号取自包 `version`;删除 `0.0.1` 字面量。
- `DSH Local Build` 单一来源:构建时注入 `process.env.DSH_CLIENT_TITLE`,`DocumentTitle` 不再自带第二份字面量。
- 复制反馈的 `1000` ms 字面量收敛为 `ui-primitives` 单一常量。

## 不做什么

- 不改 [docs/architecture.md](../../../../docs/architecture.md) 声明的 `agent-loop` 事件流与扩展点;这是结构归位,不是新能力。
- 不引入新状态库、新表格/虚拟化库或新 schema 库,不新建包,不把 Cordis/接缝词汇换成 MVVM、L0–L5 等其它栈层名。
- 不为任何旧格式留读时双轨或永久适配器;一次性迁移命令用完即删。
- 不重排无关模块、不顺手改行为;行为差异只出现在验收标准中。

## 替代方案考虑

### 会话装载:保留读时转换(现状)
- 优点:旧日志继续可打开,无迁移动作。
- 缺点:永久双轨,与拒绝旧格式冲突,同文件拒绝/转换并存,`legacy` 变体污染领域类型。

### 会话装载:直接拒绝、不发迁移命令
- 优点:删除量最大、实现最简单。
- 缺点:pre-release 开发期会话与 YoDsh 等下游已有旧日志无法打开。作为候选保留,若下游确认无旧数据则优先。

### 包入口:每个接缝角色各成一包
- 优点:接缝角色在包层面完全分离。
- 缺点:与「一个包可组合角色」的已声明架构冲突,改动面远大于收益。

### Trajectory:只拆组件、不做 i18n
- 优点:diff 更小。
- 缺点:硬编码文案照旧,与包内既有的 `ctx.locale` 机制脱节。

### Trajectory:换表格/虚拟化依赖重写
- 优点:可能删除部分自研虚拟化代码。
- 缺点:行为与依赖变化,超出结构归位范围。

## 验收标准

- 会话装载:生产代码无 `migrateLegacy*`、`legacyMessageId`、`needsLegacyPrefix`;`TurnEndCancelCause` 无 `legacy` 变体;旧记录要么被迁移命令改写、要么被 `assertSupportedEvents` 点名事件类型与 seq 拒绝;旧夹具与快照按测试政策重录,并补拒绝反例。
- 门面:各包入口仅含类型声明与导出语句;`api-proxy.ts` 按域文件拆分且 `createApiProxy` 只装配。
- UI:文件拆分落地;`KIND_LABEL`、页签与面板文案全部出自 locale 词典;视觉尺寸出自 CSS;现有客户端测试断言不改,只改挂载路径。
- 公开入口:`rg 'dsh-client-ui-renderer/src'` 为空;发布 `exports` 无 `./src/*`;`verify-node-next-types` 与打包产物冒烟通过。
- 双轨与硬编码:`ClientTimerService` 无 `setTimeout`/`setInterval` 方法;`0.0.1` 与重复标题字面量消失。
- 门禁:`pnpm run test`、`test:coverage`、`typecheck`、`lint`、`build`、`hygiene`、`doc-sync` 全绿;每个落地改动更新本注记或其后继注记。

## 风险

- 轨道 1 是行为变化:一次性迁移需在发布窗口前执行,拒绝报错必须点名格式与方向;直接拒绝会放弃旧数据。
- 轨道 3 会产生大 diff,虚拟化与拖拽调宽交互易回归;拆成无行为差异的提交,靠现有客户端测试收敛。
- 词典补全改变用户可见文案,属行为变化,按测试政策补快照验证。
- 删除 `./src/*` 导出若漏掉其它深导入者会破坏构建;以全仓 grep 兜底。
- 删除 `setTimeout`/`setInterval` 别名是公共 API 变化,预发布立场允许;下游 YoDsh 若有调用需同步跟进。
