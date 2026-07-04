# Monica's Money 🧾

为 Monica 一人定制的记账 PWA。移动端优先，Vercel 部署 + Supabase 存储，支持 iPhone 快捷指令一键记账。

核心口径（详见 `docs/` 与 PRD）：

- **记账快**：打开即记，金额 + 点大类即保存，长按大类选小类
- **口径清**：统计页一键切换「含充值卡 / 不含充值卡」；划卡消费只做卡扣减，折合金额永不计入现金支出
- **不添负担**：AA 只记自己那份、信用卡按消费日记、还款不记、退款原记录冲销

## 本地开发

```bash
npm install
npm run dev
```

不配置任何环境变量时，应用以**纯本地模式**运行（数据存 localStorage，无需登录），方便先试用。

## 部署上线（一次性，约 15 分钟）

### 1. Supabase

1. 在 [supabase.com](https://supabase.com) 新建项目（免费档即可）
2. SQL Editor → 整段执行 `supabase/schema.sql`
3. Authentication → Sign In / Up：关闭 **Confirm email**（单人使用，免验证邮件）
4. Authentication → Users → **Add user**：创建你的邮箱+密码（这就是唯一账号）
5. 记下 Project Settings → API 里的 **Project URL** 和 **anon public key**

### 2. Vercel

1. 将本仓库导入 Vercel（Framework 选 Vite，默认 build 即可）
2. 环境变量里添加：
   - `VITE_SUPABASE_URL` = 第 1 步的 Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
3. 部署完成后拿到域名，如 `https://xxx.vercel.app`

### 3. iPhone 添加到主屏幕

Safari 打开部署域名 → 登录 → 分享按钮 → **添加到主屏幕**。之后从主屏幕图标进入即是全屏 App，会话长期保持。

### 4. 快捷指令（截屏识别金额一键记账）

按 `docs/shortcut.md` 的步骤在 iPhone 上搭建，绑定到操作按钮：长按 → 截屏 OCR → 选金额 → 直达记账页，点个分类就好。

## URL 协议

```
https://<域名>/#amount=45.5[&type=expense|income][&cat=大类key][&note=备注][&save=1]
```

- 带 `amount`：打开直达记账页，金额已填，顶部提示「选个分类就好」
- `save=1`：跳过确认直接入账（默认归「其他」）
- 处理完立即清除 hash，刷新不会重复记账；未登录会先登录、登录后继续本次记账

大类 key：`food` 吃喝 / `transport` 交通 / `shopping` 购物 / `cat` 猫咪 / `beauty` 美容放松 / `cards` 充值卡 / `social` 人情往来 / `living` 生活固定 / `fun` 娱乐 / `medical` 医疗 / `other` 其他

## 离线容错

每笔记账先落 localStorage，同时进同步队列推 Supabase；断网时照常记账，恢复网络自动补同步，不会丢账。

## 技术栈

Vite + React 18 + TypeScript，无 UI 框架（手写 CSS，自然简约风），Supabase JS v2。`npm run build` 前会跑 `tsc --noEmit` 类型检查。
