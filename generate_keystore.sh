#!/bin/bash
# 自动生成随机密码和安卓签名文件的脚本

# 1. 生成 16 位随机密码
RANDOM_PASS=$(openssl rand -base64 12)
ALIAS_NAME="unraid_alias"

echo "正在生成签名文件 (release.keystore)..."

# 2. 使用 keytool 生成 keystore 文件 (静默生成，无需手动输入)
# 注意：如果提示找不到 keytool 命令，请先运行 sudo apt-get install default-jdk -y
keytool -genkey -v -keystore release.keystore -alias $ALIAS_NAME -keyalg RSA -keysize 2048 -validity 10000 -storepass "$RANDOM_PASS" -keypass "$RANDOM_PASS" -dname "CN=UnraidManager, OU=Dev, O=Personal, L=Unknown, S=Unknown, C=US"

# 3. 将 keystore 转换为 Base64 格式，以便存入 GitHub Secrets
BASE64_KEYSTORE=$(base64 -w 0 release.keystore)

# 4. 将 Base64 字符串保存到文本文件中，方便复制
echo "$BASE64_KEYSTORE" > keystore_base64.txt

echo "======================================================"
echo "🎉 签名文件生成成功！"
echo "为了保证未来的覆盖安装，请务必将以下信息配置到 GitHub Secrets 中："
echo "======================================================"
echo "➡️ Secret 1 名称: ANDROID_KEYSTORE_PASSWORD"
echo "   Secret 1 内容: $RANDOM_PASS"
echo "------------------------------------------------------"
echo "➡️ Secret 2 名称: ANDROID_KEY_PASSWORD"
echo "   Secret 2 内容: $RANDOM_PASS"
echo "------------------------------------------------------"
echo "➡️ Secret 3 名称: ANDROID_ALIAS"
echo "   Secret 3 内容: $ALIAS_NAME"
echo "------------------------------------------------------"
echo "➡️ Secret 4 名称: ANDROID_SIGNING_KEY"
echo "   Secret 4 内容: 请在左侧文件树中找到并打开 keystore_base64.txt 文件，全选并复制里面的所有内容。"
echo "======================================================"
echo "⚠️ 重要提示：配置好 GitHub Secrets 后，你可以安全地删除 release.keystore 和 keystore_base64.txt 文件，以免泄露。"
