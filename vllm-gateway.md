# vLLM 网关使用说明（前端）

## 概览
- 网关服务默认地址：`http://<后端域名或IP>:5000`
- OpenAI 兼容接口统一挂在 `/v1` 下
- `/v1/chat/completions` 使用专门转发逻辑，支持 `stream` 流式返回
- 其他 `/v1/*` 路径会直接转发到上游 vLLM（如 `/v1/models`、`/v1/embeddings` 等）

## 鉴权
- `/v1/*` 全部需要鉴权
- 令牌获取：`POST /user/user_login`
- 传递方式（二选一）：
- `Authorization: Bearer <JWT>`
- `?token=<JWT>`（浏览器无法自定义 Header 的场景可用，例如 SSE/EventSource）

## 获取 token
```bash
curl -X POST http://localhost:5000/user/user_login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"your_password"}'
```

返回示例：
```json
{
  "success": true,
  "data": {
    "token": "xxxxx",
    "version": 1,
    "user_id": 123
  }
}
```

## 非流式调用示例
```bash
curl -X POST http://localhost:5000/v1/chat/completions \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model",
    "messages": [
      {"role":"system","content":"You are a helpful assistant."},
      {"role":"user","content":"你好"}
    ]
  }'
```

## 流式调用示例
```bash
curl -N -X POST http://localhost:5000/v1/chat/completions \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model",
    "messages": [{"role":"user","content":"你好"}],
    "stream": true
  }'
```

## 浏览器 fetch 示例（非流式）
```js
const base = "http://localhost:5000";

const resp = await fetch(`${base}/v1/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify({
    model: "your-model",
    messages: [{ role: "user", content: "你好" }]
  })
});

const data = await resp.json();
```

## 浏览器 fetch 示例（流式）
```js
const resp = await fetch(`${base}/v1/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify({
    model: "your-model",
    messages: [{ role: "user", content: "你好" }],
    stream: true
  })
});

const reader = resp.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // 这里按 SSE 格式解析 data: 行即可
}
```

## OpenAI SDK（可选）
```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: token,
  baseURL: "http://localhost:5000/v1",
  dangerouslyAllowBrowser: true
});

const resp = await client.chat.completions.create({
  model: "your-model",
  messages: [{ role: "user", content: "你好" }]
});
```

## 常见问题
- 401：token 缺失/无效/过期
- 502：上游 vLLM 不可用（返回 `upstream error`）
- 浏览器跨域：默认仅放行 `http://localhost:5173` 和 `http://127.0.0.1:5173`，如需改动让后端更新白名单
