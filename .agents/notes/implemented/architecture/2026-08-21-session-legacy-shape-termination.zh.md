# Agent Note: 会话旧形态导入在持久化边界终止

Status: implemented

[English](2026-08-21-session-legacy-shape-termination.md) | 中文

## 问题

持久化协调器在每次读取时转换受支持的 pre-react-loop 与 pre-identity 会话记录：无标识消息获得确定性 id，`steering/message` 变为 `user/message`，`turn/start` 移除 `trigger`，已废弃的 `turn/end` 原因被重映射。两条导入例外存在的原因是：早期会话在标识机制引入前持久化了消息，react-loop 改名移除了 steering；两种形态都已被当前包络取代。转换与「`SESSION_FORMAT_VERSION` 为 0、不提供升级路径」的承诺冲突，让同一边界一边响亮拒绝某些旧形态、一边静默转换另一些旧形态，还让 `TurnEndCancelCause` 保留了仅由迁移写入的 `legacy` 变体。

## 决策

共享追加边界与所有加载路径现在拒绝每一种已废弃的 v0 形态：`steering/message`、pre-identity 的 `user/message`、`assistant/message` 与 `tool/result` 事件、带 `trigger` 的 `turn/start`，以及已废弃的 `turn/end` 原因（`disposed`、无原因的 `aborted`、无结构化失败的 `error`）。`assertSupportedEvents` 会点名事件类型与 seq，同一遍校验当前格式 `turn/end` 的包络与原因。转换函数、`legacyMessageId`、消息 id 继承映射与 `TurnEndCancelCause` 的 `legacy` 变体均已删除。存储保持仅追加；不提供任何 v0 升级路径。

## 替代方案考虑

### 保留读时转换
- 优点：旧日志无需迁移动作即可继续打开。
- 缺点：永久双轨，与「不提供升级路径」的承诺冲突，拒绝与转换并存，并污染核心 turn-end 类型。已否决。

### 一次性离线迁移后再拒绝
- 优点：保留 pre-react-loop 日志。
- 缺点：在到达同一终态之前引入过渡机制，而 format-0 承诺本就声明不提供升级路径。已否决。

### 直接拒绝（已选择）
- 优点：每个边界只有一种行为，无过渡命令，废弃形态无法再通过公开 API 进入持久存储。
- 缺点：pre-react-loop 与 pre-identity 日志无法再打开。

## 后果

- pre-react-loop 与 pre-identity 日志拒绝打开；错误会点名形态与 seq。
- 追加边界会拒绝仍在持久化废弃形态的旧 JavaScript 插件。
- 当前格式 `turn/end` 的形态校验位于持久化边界，而非转换步骤内部。
- coordinator-contract 与 resume 夹具由「转换」翻转为「拒绝」。
- [边界对齐提案](../../proposed/architecture/2026-08-21-repository-wide-boundary-realignment.md)拥有全仓计划；本注记拥有已落地的会话部分。
