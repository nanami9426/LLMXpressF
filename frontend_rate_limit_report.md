# 前端对接报告：`/v1/chat/completions` 限流改造

## 1. 后端做了哪些改动
- 新增了双维度限流（仅作用于 `POST /v1/chat/completions`）：
  - 请求级：每次请求固定消耗 `1`。
  - token 级：`cost = ceil((prompt_tokens_est + max_tokens)/K)`。
- 限流配置由 `config/app.yaml` 的 `rate_limit.*` 控制（默认可关闭）。
- 触发限流时返回：
  - HTTP 状态码：`429`
  - 业务错误码：`1006`
  - 错误类型：`rate_limit_error`
  - 维度信息：`error.details` 中包含 `dimension=request` 或 `dimension=token`
- 中间件顺序调整为：`Auth -> RateLimit -> ChatHistory -> APILogging`  
  被限流请求不会进入会话持久化和 API usage 统计。

## 2. 前端是否必须改动
结论：**建议改动，且改动很小**。

如果前端已经有“按 HTTP 429 做统一提示”的逻辑，可以不做结构性改造；  
但为了更好用户体验，建议识别 `dimension` 并做差异化提示。

## 3. 前端建议改动项

### 3.1 必做（推荐至少完成）
- 在聊天请求错误处理里识别 `HTTP 429`：
  - 给出明确提示（例如“请求过于频繁，请稍后重试”）。
  - 不要把此错误当成“网络断开/服务崩溃”。

### 3.2 强烈建议
- 读取 `error.details` 里的 `dimension`：
  - `dimension=request`：提示“请求频率过高，请稍后再发”。
  - `dimension=token`：提示“本分钟 token 配额不足，请缩短输入或降低 max_tokens”。
- 在发送按钮增加短暂防抖/节流（例如 300~800ms）降低误触发概率。
- 请求体里尽量显式传 `max_tokens`，避免全部走后端 `default_max_tokens` 兜底估算。

### 3.3 可选优化
- 发生 429 后做退避重试（例如指数退避，最多 1~2 次）。
- 对 `dimension=token` 给出可操作建议：
  - 缩短问题长度。
  - 调小 `max_tokens`。

## 4. 响应示例（前端按此解析）

### 4.1 请求级限流
```json
{
  "success": false,
  "error": {
    "message": "请求过于频繁，请稍后重试",
    "type": "rate_limit_error",
    "code": "1006",
    "details": "dimension=request"
  }
}
```

### 4.2 token 级限流
```json
{
  "success": false,
  "error": {
    "message": "请求过于频繁，请稍后重试",
    "type": "rate_limit_error",
    "code": "1006",
    "details": "dimension=token"
  }
}
```

## 5. 不需要前端改动的部分
- 接口路径不变：仍是 `POST /v1/chat/completions`。
- 正常成功响应结构不变。
- 会话字段（`conversation_id` / `new_chat`）协议不变。

## 6. 联调验收建议
- 用同一个账号在 60 秒内连续发请求，确认第 N 次出现 `429 + code=1006`。
- 验证两种维度提示是否正确：
  - 压请求频率触发 `dimension=request`
  - 提高 `max_tokens`/输入长度触发 `dimension=token`
