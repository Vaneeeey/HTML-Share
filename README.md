# HTML Share

内部 HTML 审阅小工具：上传 HTML 或包含 `index.html` 的静态 ZIP 包，生成分享链接，访问者可直接在页面元素上添加评论。

## 本地运行

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

默认管理端密码来自 `.env` 的 `ADMIN_PASSWORD`。打开 `http://localhost:3000/dashboard` 开始上传。

## 部署

推荐让容器只监听服务器本机端口 `3001`，再由 Nginx/Caddy 按域名转发。这样不会影响 `43.99.6.173` 上已有项目。

域名 DNS：

- `review.fanlizeng.com` 添加 `A` 记录到 `43.99.6.173`

在服务器项目目录设置环境变量：

```bash
export APP_SECRET="long-random-secret"
export ADMIN_PASSWORD="strong-password"
docker compose up -d --build
```

数据会保存在项目目录下的 `data/`，其中包含 SQLite 数据库和上传文件。

Nginx 示例配置在 `deploy/nginx/review.fanlizeng.com.conf`。安装后可按服务器习惯启用：

```bash
sudo cp deploy/nginx/review.fanlizeng.com.conf /etc/nginx/sites-available/review.fanlizeng.com
sudo ln -s /etc/nginx/sites-available/review.fanlizeng.com /etc/nginx/sites-enabled/review.fanlizeng.com
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS 可用 Certbot：

```bash
sudo certbot --nginx -d review.fanlizeng.com
```

## 上传规则

- 单个 `.html` / `.htm` 文件最大 10MB。
- `.zip` 文件最大 50MB，必须包含根目录或一级目录下的 `index.html`。
- ZIP 内禁止绝对路径、父级路径和隐藏路径段。
- 上传的 HTML 会在 sandbox iframe 中运行，并注入评论桥接脚本。
