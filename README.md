# progress-band

在 Claude Code 輸入框上方顯示一列即時進度：目前正在執行的工具與參數摘要、任務清單（TaskCreate / TaskUpdate / TodoWrite）完成數與百分比、進度條、已用時間，以及依「已完成項目平均耗時 × 剩餘項目數」估算的剩餘時間。子代理的工具呼叫會加上 [子代理] 標記。按「隱藏」可收起，按「顯示進度」可再打開。

## 安裝

在 Claude Code 終端機的提示列輸入：

```
/plugin install progress-band --marketplace wyc915/claudemod-progress
```

在 shell 中：

```bash
claude plugin install progress-band --marketplace wyc915/claudemod-progress
```

桌面版（不支援 `/plugin`）：點提示框旁的 **+** → **Plugins** → **Add marketplace** 輸入 `wyc915/claudemod-progress` → **Add plugin**。

> 若 repo 為 private，安裝者需有該 repo 的讀取權限，且本機已設定 github.com 的 git 憑證（SSH key 或 `gh auth login` + `gh auth setup-git`）。

## 開發

```bash
claude plugin validate .
claude plugin test .
```
