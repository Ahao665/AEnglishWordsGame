# ✨ 魔法拼写 · Gesture Spelling Game

用**手势识别**玩英语拼写：摄像头 + MediaPipe 手部追踪，捏合拖拽字母、确认拼写、下一题，支持英语四级词汇随机出题与读音。

![React](https://img.shields.io/badge/React-18-61dafb?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands-4285f4?logo=google)

---

## 📖 玩法说明

1. **选择模式**：单手 / 双手
2. **举起手**：摄像头识别到手掌后自动开始一题
3. **拼写**：捏合手指“抓住”字母块，拖到上方槽位；松手放入
4. **取回**：拼错或想重排时，在已放字母的槽上**捏合**可取出该字母
5. **确认**：槽位都填满后，**捏合**（不抓字母）即确认拼写
6. **下一题**：答对后捏合或点击「下一题」；答错时正确槽位会锁绿，错误字母弹回
7. **提示**：右下角「💡 翻译」「🔊 读音」支持**手势捏合**或**鼠标点击**

---

## 兼容性说明

- **电脑**：建议用 **Chrome** 或 **Edge** 最新版；需允许摄像头权限。脚本与模型均从本站加载，**无需 VPN**；若仍提示「MediaPipe 未加载」请刷新或检查浏览器控制台。
- **手机/平板**：建议用 **Chrome** 或 **Safari** 最新版；需 **HTTPS** 和摄像头权限。部分旧系统或浏览器可能因 WebAssembly 不支持而无法运行，可尝试换浏览器或更新系统。
- **本地运行**：用 `npm run dev` 打开；在线访问需通过 HTTPS（如 GitHub Pages）。
