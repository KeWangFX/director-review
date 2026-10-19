# 导演审核台固定分享入口

这是无构建、无第三方脚本的静态分享入口。`entry-state` 分支的 `current.json` 仅记录已核验的公开审核台地址，不含凭据或项目素材。`main` 只发布页面代码，状态更新不触发 Pages 重建。

发布仓库：`KeWangFX/director-review`，分支 `main`，Pages 使用根目录。

固定分享地址：<https://kewangfx.github.io/director-review/>。
检查模式：<https://kewangfx.github.io/director-review/?stay=1>。

## 边界

- 固定的是分享入口；审核台仍运行在当前 HTTPS Quick Tunnel 域名，浏览器跳转后的 origin 不固定。
- 不在此页输入／收集／保存账号、密码、Cookie、Token 或项目素材。
- 当前地址由受控发布器写入公开 `current.json`。发布器必须先验证实际审核台身份、认证门槛和服务状态；此页只验证发布记录的结构与目标白名单。
- `READY` 与发布日期**不宣称此刻仍在线**。主机睡眠、断网或服务故障仍可能使当前地址暂不可用。
- 用户登录与项目权限在原审核台完成，本页不改变授权。

## 配置契约

发布器提供 JSON 对象，包含以下字段（此处仅定义契约，不提供真实 URL）：

- `schemaVersion`: 数字 `1`
- `status`: 字符串 `READY`；任何其他状态不跳转
- `service`: 字符串 `fireworks-team-gateway`
- `url`: `https://<当前有效随机域名>.trycloudflare.com/team/projects`
- `publishedAt`: 可解析的 ISO 日期字符串，表示发布地址的更新时间，而非浏览器实时健康检查
- 其他字段允许存在，但不会成为链接、HTML 或权限来源

URL 严格禁止用户名、密码、非默认端口、查询参数、片段、反斜线及其他路径／域名。目标不从查询参数或本地存储获得。

## 获取与失败策略

1. 使用 `cache: no-store` 与时间／随机 cache-bust 获取 `https://raw.githubusercontent.com/KeWangFX/director-review/entry-state/current.json`。
2. 仅网络、HTTP 或 JSON 读取失败时，最多在当前页面生命周期内调用一次 GitHub Contents API 备用路径。
3. 已读取的 `NOT_READY`／无效配置不尝试寻找旧 READY 记录；直接停止跳转。
4. raw 配置最大 16 KiB；API 响应最大 64 KiB，解码后配置仍最大 16 KiB；单次请求超时 10 秒。
5. 成功后用 `location.replace` 自动前往登录中心。`?stay=1` 显示当前发布地址／状态，不自动跳转。
6. 失败显示重试按钮，不硬编码旧域名，不轮询，不写本地缓存。手动重试重新读取 raw，但同一次页面访问不会重复调用 API。

仅依赖浏览器原生 Fetch、URL、TextDecoder、Intl 和 ES Modules；无 npm 安装、CDN JavaScript、分析统计或付费服务。

## 视觉与安全

沿用导演审核台的深色／金色风格；语义化按钮和链接、动态状态 live region、键盘焦点、窄屏换行、减少动态效果设置。CSP 限制脚本／样式到本站，配置连接仅 raw.githubusercontent.com 与 api.github.com，禁止表单提交。所有发布内容通过 textContent 输出；只允许已校验 URL 进入链接。

本地验证不等于浏览器或公网验收。发布后应由主流程检查 `?stay=1`、自动跳转、真实登录及项目切换，并给出最终可用分享地址。
