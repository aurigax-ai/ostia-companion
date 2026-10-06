#!/bin/bash

# 1. Locate and configure Java 17 openjdk path
if [ -d "/usr/lib/jvm/java-17-openjdk" ]; then
  export JAVA_HOME="/usr/lib/jvm/java-17-openjdk"
  export PATH="$JAVA_HOME/bin:$PATH"
else
  echo -e "\x1b[33mWarning: /usr/lib/jvm/java-17-openjdk not found.\x1b[0m"
  echo -e "\x1b[33mPlease make sure you have run: sudo pacman -S jdk17-openjdk\x1b[0m"
fi

# 2. Configure Android SDK and ADB path
export ANDROID_HOME="/home/mtchen/Android/Sdk"
if [ -d "$ANDROID_HOME" ]; then
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
else
  echo -e "\x1b[33mWarning: Android SDK not found at $ANDROID_HOME\x1b[0m"
fi

# 3. Print verification info
echo -e "\x1b[32m🌲 Ostia Companion environment populated for this session!\x1b[0m"
if command -v java >/dev/null 2>&1; then
  echo "  - Java version: $(java -version 2>&1 | head -n 1)"
else
  echo "  - Java: NOT FOUND"
fi

if command -v adb >/dev/null 2>&1; then
  echo "  - ADB: $(which adb)"
  echo "  - Connected devices:"
  adb devices | grep -v "List of" | sed 's/^/      /'
else
  echo "  - ADB: NOT FOUND"
fi
