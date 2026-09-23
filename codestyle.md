# PaperPulse 代码规范

## 规范来源

本规范以以下官方或业界规范为基础，并结合 PaperPulse 的 Vue 3、Node.js、Express 和 SQLite 技术栈进行裁剪：

- [Vue.js 官方风格指南](https://vuejs.org/style-guide/)
- [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)
- [Google HTML/CSS Style Guide](https://google.github.io/styleguide/htmlcssguide.html)
- [Node.js 官方错误处理建议](https://nodejs.org/en/learn/errors/exception-versus-rejections)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)

Google JavaScript 规范是本项目的主要通用参考。为与现有代码保持一致，本项目明确采用两项局部约定：使用单引号，且不书写可由 JavaScript 自动分号插入安全处理的行末分号。若自动分号插入可能改变语义，必须显式添加分号或重写表达式。

## 1. 通用原则

1. 代码首先服务于可读性和可维护性，再考虑压缩写法。
2. 一个模块只承担一个清晰职责；数据源解析、业务编排、领域清洗、持久化和界面展示分别组织。
3. 业务规则只保留一份权威实现。多个页面使用同一统计口径时，应由后端或共享函数统一提供。
4. 不提交密钥、数据库文件、缓存、日志、构建产物和本机环境配置。
5. 不编造缺失论文数据；推导字段必须保存其来源或生成方法。
6. 新功能必须处理加载、空数据、失败和边界输入，而不只实现成功路径。

## 2. 文件与目录

- 文件统一使用 UTF-8、LF 换行和文件末尾换行。
- JavaScript、Vue 和 CSS 使用 2 个空格缩进，不使用 Tab。
- Vue 组件使用 `PascalCase.vue`，例如 `PaperDetailView.vue`。
- 普通 JavaScript 模块使用 `camelCase.js`，例如 `keywordExtraction.js`。
- 测试文件使用 `<subject>.test.js`，并放置在 `server/test` 下。
- 数据库迁移使用三位递增序号，例如 `003_add_topic_index.sql`。
- 不创建含义模糊的 `utils.js`；通用逻辑应按领域命名并放在明确目录中。

## 3. JavaScript 规范

### 3.1 格式

- 使用 ES Modules，即 `import` 和 `export`。
- 字符串默认使用单引号；需要插值时使用模板字符串。
- 优先使用 `const`，确实需要重新赋值时使用 `let`，禁止使用 `var`。
- 行末通常不写分号；对象和数组的多行成员保留尾逗号时，应与所在文件保持一致。
- 一行只表达一个主要动作。复杂条件应拆成有含义的变量或函数。
- 不依赖隐式类型转换表达业务含义；数值和布尔值应显式转换。

```js
const paperCount = Number(row.paper_count)
const isEligible = paperCount > 0 && paper.data_status !== 'fetch_failed'
```

### 3.2 命名

- 变量和函数使用 `camelCase`。
- 类和 Vue 组件使用 `PascalCase`。
- 真正的模块级常量使用 `UPPER_SNAKE_CASE`。
- 布尔变量使用 `is`、`has`、`can` 或 `should` 开头。
- 事件处理函数使用动作命名，如 `loadPapers`、`confirmCandidate`、`retryImport`。
- 集合名称使用复数，ID 字段明确实体，如 `paperId`、`jobId`。
- 避免 `data`、`info`、`temp` 等缺乏上下文的名称。

### 3.3 函数与异步代码

- 函数应完成一个可描述的任务，参数超过 3 个时优先使用对象参数。
- 对外部输入在边界处校验，内部函数不重复猜测输入格式。
- 异步操作使用 `async` / `await`，并明确处理拒绝状态。
- 并发请求需要设置并发上限、超时和取消或过期响应策略。
- 不使用空的 `catch`。忽略错误时必须说明原因，并保留可观测状态。
- 资源清理放入 `finally`、关闭回调或 Vue 生命周期清理函数中。

```js
async function loadPaper(paperId) {
  loading.value = true
  errorMessage.value = ''
  try {
    paper.value = await paperApi.getPaper(paperId)
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}
```

## 4. Vue 组件规范

- 使用 Vue 3 Composition API 和 `<script setup>`。
- 组件名使用多个单词，避免与原生 HTML 元素冲突。
- `props` 必须声明类型和默认值；数组、对象默认值使用工厂函数。
- 派生状态使用 `computed`，不要通过 `watch` 维护可计算出来的重复状态。
- `watch` 只用于副作用，例如请求、路由同步或计时器控制。
- 组件卸载时清除计时器、事件监听器和未完成请求的响应权限。
- 列表渲染必须提供稳定的 `:key`，禁止以数组下标替代实体 ID。
- 表单操作使用真实的 `button`、`input`、`label`，并提供可访问名称。
- 页面必须具有加载、空数据、错误和重试状态。
- 可复用组件不直接依赖具体路由数据，业务页面负责组织 API 和路由状态。

单文件组件顺序统一为：

```text
<script setup>
<template>
<style scoped>
```

## 5. HTML 与 CSS 规范

- 优先使用语义化元素，如 `main`、`nav`、`section`、`header`、`table`。
- 纯图标按钮必须提供 `aria-label` 或可见文本。
- 表单错误使用可读文本表达，不能只依赖颜色。
- 类名使用小写 kebab-case，例如 `.paper-card`。
- 颜色、字体和常用间距优先复用 CSS 自定义属性。
- 页面布局必须考虑窄屏，固定宽度元素应提供 `min-width`、`max-width` 或媒体查询。
- 避免使用 `!important`；若确实需要，必须说明覆盖来源。
- 动画不得隐藏真实数据含义；缺失值和零值应在视觉上可区分。

## 6. Express API 规范

- 路由层负责 HTTP 参数读取和响应，Service 负责业务流程，Repository 负责数据库访问。
- API 路径使用复数资源名，例如 `/api/papers`、`/api/imports`。
- 查询参数必须校验类型、取值范围和重复参数。
- 客户端输入不得直接拼接到 SQL、文件路径或外部命令中。
- 成功创建返回 201；无内容删除返回 204；参数错误返回 400；不存在返回 404；重复冲突返回 409。
- 错误响应保持统一结构，不把内部堆栈或数据库细节返回给客户端。
- 列表接口必须设置合理上限，并返回完整分页信息。
- 会产生外部请求或长时间运行的操作应提供进度、失败原因和重试语义。

## 7. SQLite 与数据规范

- 所有 SQL 参数使用占位符绑定，禁止字符串拼接用户输入。
- 动态排序和字段名只能从固定白名单映射。
- 表和字段使用 `snake_case`；主键包含实体名称，如 `paper_id`。
- 枚举值通过 `CHECK` 约束；外键明确设置删除行为。
- 用于去重、筛选和关联的字段建立索引。
- 数据库结构只通过版本化迁移修改；迁移必须可重复检测且不得静默删除用户数据。
- JSON 字段写入前进行结构校验，查询时对无效 JSON 使用安全空值。
- SQLite 文件及其 `-wal`、`-shm` 文件不得提交到 Git。

## 8. 错误、日志与安全

- 使用具名错误类型区分验证失败、不存在、冲突和外部来源失败。
- 日志使用结构化字段，记录事件名、实体 ID、状态和耗时。
- 日志不得记录密钥、Cookie、完整响应正文或不必要的个人信息。
- 外部请求必须设置 User-Agent、超时、并发限制、速率限制和有限重试。
- 只对 429、5xx 和网络瞬时错误重试；确定性的 4xx 或解析错误不盲目重试。
- 遵守公开来源的 `robots.txt`，不绕过登录、验证码或访问控制。
- 所有凭据仅通过环境变量或部署平台的密钥管理能力提供。

## 9. 测试规范

- 测试名称描述可观察行为，而不是函数内部实现。
- 每个功能至少覆盖正常路径、空数据、无效输入和关键边界。
- 数据库测试使用临时数据库，测试后关闭连接并清理资源。
- 数据源解析使用固定夹具，自动测试不得依赖实时网站可用性。
- 排序、统计和去重逻辑必须测试确定性及并列情况。
- 修复缺陷时先增加能够复现问题的测试，再提交修复。
- 提交前至少执行：

```powershell
npm test
npm run build
```

## 10. Git 提交规范

提交信息采用 Conventional Commits：

```text
<type>(optional-scope): <description>
```

常用类型：

- `feat`：新增功能。
- `fix`：修复缺陷。
- `test`：新增或修改测试。
- `docs`：只修改文档。
- `refactor`：不改变外部行为的重构。
- `chore`：构建、依赖或维护工作。

每次提交只包含一个可以清楚说明的改动，禁止为了增加提交次数拆分无意义提交。功能在 `dev` 或功能分支开发，经测试和审查后合并到 `main`；发布版本使用语义化版本号标签，例如 `v1.0.0`。

## 11. 代码审查清单

- [ ] 功能行为与需求一致，没有使用模拟数据代替真实接口。
- [ ] 输入已校验，查询使用参数绑定。
- [ ] 加载、空数据、错误和重试状态完整。
- [ ] 缺失值、零值和失败状态没有混淆。
- [ ] 新增业务规则具有针对性测试。
- [ ] 定时器、连接和监听器能够正确释放。
- [ ] 未提交密钥、数据库、缓存或构建产物。
- [ ] `npm test` 与 `npm run build` 均通过。

