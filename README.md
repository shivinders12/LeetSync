# ⚡ My Personal LeetHub

> A private, zero-hosting-cost Chrome Extension (Manifest V3) that automatically detects accepted LeetCode solutions and commits them directly to your personal GitHub repository — featuring per-problem solution folders, auto-generated `README.md` files, and a master `submissions.csv` log!

---

## 🌟 Key Features

* 🚀 **Zero Backend & Zero Hosting Cost**: Operates entirely inside your Chrome browser. Your GitHub token and data never leave your machine.
* 🎯 **Automatic Problem & Submission Detection**: Real-time DOM observers detect when a LeetCode submission achieves **Accepted** status.
* 💻 **Monaco Editor Source Code Extraction**: Extracts complete, formatted solution source code line-by-line in C++, Java, Python, JavaScript, TypeScript, Go, Rust, and more.
* 📁 **Structured Repository Formatting**: Automatically organizes code into clean problem directories (`0704-binary-search/solution.cpp`).
* 📊 **Master CSV Tracker (`submissions.csv`)**: Appends a row for every solved problem into a central `submissions.csv` file in your repository root.
* 🔄 **Re-submission & Multi-Language Support**: Solved a question in C++ and now doing it in Python? Re-submitting an optimized solution? LeetHub detects updates and updates your repository cleanly.
* 🎨 **Modern Dark-Mode UI**: Sleek glassmorphism UI with live connection test and real-time sync status badges.

---

## 📁 Repository Structure Created on GitHub

When you submit accepted solutions on LeetCode, your GitHub repository will be automatically structured like this:

```text
LeetCode/
├── 0001-two-sum/
│   ├── README.md
│   └── solution.cpp
├── 0704-binary-search/
│   ├── README.md
│   └── solution.cpp
├── 0009-palindrome-number/
│   ├── README.md
│   └── solution.java
└── submissions.csv
```

### Sample `submissions.csv` Output
| Problem Number | Title | Difficulty | Language | URL | Timestamp |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 704 | "Binary Search" | Easy | C++ | https://leetcode.com/problems/binary-search/ | 2026-08-15 18:34:00 |
| 1 | "Two Sum" | Easy | Python3 | https://leetcode.com/problems/two-sum/ | 2026-08-15 18:40:12 |

---

## 🛠️ Architecture & Tech Stack

```text
[ LeetCode Page ] ──► [ content.js ] ──► (MutationObserver & Monaco Code Extraction)
                               │
                        (chrome.runtime)
                               ▼
[ Chrome Extension Popup ] ◄──► [ background.js ] ──► [ GitHub REST API ] ──► [ Your Repository ]
```

* **Extension Architecture**: Manifest V3 Service Worker & Content Script.
* **UI Stack**: HTML5, Vanilla CSS3 (Glassmorphism & CSS Variables), JavaScript (ES6+).
* **API Integration**: GitHub REST API (`/repos/{owner}/{repo}/contents/{path}`).

---

## 📥 Installation Guide

Follow these steps to install **My Personal LeetHub** in Google Chrome:

1. **Download / Clone this repository**:
   ```bash
   git clone https://github.com/shivinders12/My-Personal-LeetHub.git
   ```
2. Open **Google Chrome**.
3. Type `chrome://extensions` in the address bar and press **Enter**.
4. In the top-right corner, turn **ON** the **Developer mode** toggle switch.
5. In the top-left corner, click **Load unpacked**.
6. Select the `My-Personal-LeetHub` folder.
7. Click **Select Folder**. The extension is now installed!

---

## 🔑 Setting Up GitHub Personal Access Token (PAT)

1. Log in to [GitHub.com](https://github.com).
2. Create a dedicated repository named `LeetCode` (or any name you prefer).
3. Go to **Settings** ➔ **Developer Settings** ➔ **Personal Access Tokens** ➔ **Fine-grained tokens**.
4. Click **Generate new token**.
5. Set Token Name: `LeetHub-Sync`.
6. Under **Repository Access**, select **Only select repositories** and pick your `LeetCode` repository.
7. Under **Permissions ➔ Repository permissions**, change **Contents** to **Read and write**.
8. Click **Generate token** and copy the token string (`github_pat_...`).
9. Click the **LeetHub** icon in your Chrome toolbar, paste your token, username, and repository name, and click **Test Connection**!

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
