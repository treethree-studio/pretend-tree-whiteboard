# 假装一棵树｜软件架构

## 技术方向

Windows 桌面应用。

当前采用 Electron 架构：

- 主进程：窗口、文件、系统能力
- Renderer：首页与白板编辑器
- Preload：安全通信层

## 目录规划

```text
app/
├── main.js
├── preload.js
├── renderer/
│   ├── home.html
│   └── editor.html
└── assets/

installer/

docs/

prototype/
```

## 文件模型

`.treeboard` 为专属白板项目文件。

第一版采用本地单文件保存：

- 白板对象
- 摄像机状态
- 图片资源引用
- 缩略图信息

均由项目文件管理。

## 开发原则

- 优先稳定
- 优先本地
- 保持极简
- 避免过早引入服务端
