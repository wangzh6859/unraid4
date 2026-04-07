# iOS 构建失败原因分析

## 问题
GitHub Actions 的原生 Xcode 构建遇到模块依赖问题。这是因为 Expo 项目的构建需要特定的依赖顺序和配置。

## 解决方案：使用 EAS Build

EAS Build 是 Expo 官方提供的云构建服务，专门为 Expo/React Native 项目优化。

### 步骤 1: 安装 EAS CLI（已完成）
```bash
npm install -g eas-cli
```

### 步骤 2: 登录 Expo
```bash
eas login
```
如果您没有 Expo 账号，可以免费注册一个：https://expo.dev/signup

### 步骤 3: 配置项目
```bash
eas build:configure --platform ios
```

### 步骤 4: 构建 iOS 应用
```bash
# 构建模拟器版本（无需签名）
eas build --platform ios --profile development

# 或构建真机版本（需要 Apple 开发者账号）
eas build --platform ios --profile production
```

### 步骤 5: 等待构建完成并下载
构建完成后，EAS 会提供下载链接，或者您可以运行：
```bash
eas build:list
eas build:download --build-id BUILD_ID --output unraid.ipa
```

## 为什么推荐 EAS Build？

1. **自动处理依赖**：EAS 自动处理 Expo 模块的构建顺序
2. **预配置环境**：不需要配置 Xcode 版本
3. **签名支持**：自动处理 iOS 签名（如果需要）
4. **稳定性高**：Expo 官方维护，专门为 React Native 项目优化

## 替代方案：使用 GitHub Codespaces

如果您想手动构建：

1. 访问：https://github.com/wangzh6859/unraid4
2. 点击 "Code" → "Codespaces" → "New codespace"
3. 在 Codespace 中运行：
   ```bash
   npm install
   npx expo prebuild --platform ios
   cd ios
   pod install
   # 使用 Xcode 打开项目并手动构建
   ```

## 总结

对于 Expo 项目，**强烈推荐使用 EAS Build**，它是专门为这类项目设计的构建服务。
