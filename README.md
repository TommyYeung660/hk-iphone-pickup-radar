# HK iPhone Pickup Radar

一个适合手机查看的香港 Apple Store 到店取货库存监控页。目前监控：

- iPhone 18 Pro Max 1TB 冰川色（`MJY14ZA/A`）
- iPhone 18 Pro Max 1TB 布根地红色（`MJY04ZA/A`）
- 香港全部 6 家 Apple Store

网页不会读取或保存 Apple ID、密码、验证码或付款资料；下单前会跳转至 Apple 香港官方结账页，由用户本人确认并付款。

## 本地运行

Windows 上运行 `start-monitor.ps1`，然后打开 `http://localhost:3000`。详细步骤见 `使用说明.md`。

## 云端运行

仓库包含 `Dockerfile`，可部署到支持常驻 Docker 容器的平台。容器公开 `$PORT`，内部同时运行网页、库存 API 和 Playwright Chromium。

建议至少提供 1 GB 内存。库存以 Apple 官方结账页最终结果为准，Apple 也可能随时调整其非公开接口。
