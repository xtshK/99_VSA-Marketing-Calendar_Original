# SharePoint Host — 暫時性共享方案設計

**日期:** 2026-06-17
**狀態:** 設計待實作
**作者:** selena.ky.kuo + Claude

## 問題背景

行事曆 UI 目前以 Claude Artifact 形式跑在每個人的 Claude Desktop 裡。Artifact
環境彼此隔離(`window.storage` 各人獨立),所以 **A 上傳的 brief,B 看不到** ——
無法跨人同步。

正式方案(`app/`,Express + Omnis,資料存單一機器)仍會做,但需要一台 VM。
在 VM 架好之前,需要一個**暫時性方案**,讓團隊現在就能共享資料。

## 目標

- 多人共用同一份行事曆資料,**不需要中央 VM / 伺服器**。
- 使用者透過 Claude(Cowork / Claude Code)在自己電腦上臨時啟動 host。
- 保留 Upload(Omnis 自動解析)與 Add(手動新增)功能。
- 用 SharePoint 共享資料夾 + OneDrive 同步當共享儲存層。
- 個人資料夾解決權限與寫入衝突。

## 非目標 / 不在範圍

- **不動既有的 `app/` 專案**(這是獨立新專案)。
- 不做即時同步(OneDrive 為最終一致,有秒~分鐘延遲)。
- 不做帳號登入(權限交給 SharePoint 資料夾本身)。
- 不支援多人同時編輯「同一筆」項目(靠個人資料夾天然避開)。

## 架構

### 專案位置

新專案 `sharepoint-host/`,與 `app/` 並列於同一個 repo,從 `app/` 複製後修改。

### SharePoint 資料夾結構

```
TESTSiteIT - <user>/            (OneDrive-SharedLibraries 同步資料夾)
├── _calendar_json/
│   ├── selena.ky.kuo/calendar.json     ← 每人一個檔,各寫各的
│   ├── mark.chen/calendar.json
│   └── ...
└── _upload_briefs/
    ├── selena.ky.kuo/                   ← 上傳的原始 brief 存檔
    └── ...
```

### 運作流程

```
使用者在 Claude(Cowork/Code)說「幫我開行事曆」
        ↓
Claude 偵測 SharePoint 路徑 → 設好 .env → npm install → npm run serve
        ↓
瀏覽器開 localhost:3000(host 自己服務的頁面)
        ↓
讀取:host 掃描所有 _calendar_json/*/calendar.json → 合併 → 顯示
寫入:Upload / Add / Edit / Delete → 只寫「我自己的」calendar.json
        ↓
OneDrive 同步 → 其他人下次讀取就看到(最終一致)
```

## 多人資料模型

### 寫入隔離

每個 host 實例綁定一個 `USER_ID`,**只寫入** `_calendar_json/<USER_ID>/calendar.json`。
因為各人寫各人的檔,OneDrive 不會產生衝突複本。

### 讀取合併

`GET /api/data` 掃描 `_calendar_json/` 下所有子資料夾的 `calendar.json`,
合併成單一陣列回傳。每筆項目加上 `_owner` 欄位(= 來源資料夾名),供前端判斷可否編輯。

### 擁有權與唯讀

- 合併視圖顯示**所有人**的項目。
- 前端依 `_owner === USER_ID` 判斷:**只有自己的項目可編輯/刪除**;別人的顯示唯讀。
- `POST /api/data` 收到合併後的完整陣列時,**只保留 `_owner === USER_ID` 或無 owner(=新增)的項目**,去掉 `_owner` 後寫入自己的檔。

## Host 變更(相對於 `app/`)

| 部位 | `app/` | `sharepoint-host/` |
|------|--------|--------------------|
| `GET /api/data` | 讀單一 `data/calendar.json` | 掃描合併所有個人檔,標 `_owner` |
| `POST /api/data` | 覆寫單一檔 | 過濾出自己的項目,寫 `_calendar_json/<USER_ID>/calendar.json` |
| `POST /api/extract` | 同左 | 同左 + 把原始 brief 存到 `_upload_briefs/<USER_ID>/` |
| 前端編輯/刪除 | 任何項目 | 別人的項目唯讀(依 `_owner`) |
| `.env` | `OMNIS_URL`, `OMNIS_API_KEY` | 加 `USER_ID`, `SHAREPOINT_DIR` |

Omnis 解析、行事曆 UI、各視圖元件沿用不變。

### 原始 brief 存檔

Upload 時,前端把原始檔(連同解析請求)送到 host;host 在呼叫 Omnis 解析的同時,
把原始檔位元組存一份到 `_upload_briefs/<USER_ID>/<原檔名>`。失敗不影響解析主流程。

## 設定(.env)

```
OMNIS_URL=https://omnis.viewsonic.com:8007/ask
OMNIS_API_KEY=sk-VSglobal2026
USER_ID=selena.ky.kuo
SHAREPOINT_DIR=/Users/<user>/Library/CloudStorage/OneDrive-SharedLibraries-ViewSonicCorporation/TESTSiteIT - <user>
PORT=3000
```

## Claude 啟動 UX(Cowork / Claude Code)

提供:
1. **`setup` 腳本**(Node):偵測 `~/Library/CloudStorage/OneDrive-SharedLibraries-*/TESTSiteIT*`
   路徑;若多個或找不到則詢問;設定 `USER_ID`(預設用路徑中的使用者名);寫出 `.env`;
   建立 `_calendar_json/<USER_ID>/` 與 `_upload_briefs/<USER_ID>/`。
2. **給 Claude 的說明**(README 或簡短 skill):讓使用者在 Cowork/Code 說「幫我開行事曆」時,
   Claude 依序跑 setup → `npm install` → `npm run serve` → 開瀏覽器。

## 限制與已知取捨

- **同步延遲:** OneDrive 為最終一致(秒~分鐘),非即時。
- **平台:** setup 路徑偵測先針對 macOS;Windows 路徑不同,之後再補。
- **同筆編輯:** 別人的項目唯讀,不支援跨人協作編輯同一筆(刻意,避免衝突)。
- **金鑰:** Omnis key 存在每台本機 `.env`(已 gitignore);屬內部共用金鑰。

## 之後可做(不在第一版)

- Windows 路徑偵測。
- 合併視圖的衝突/重複偵測(同名 campaign 跨人)。
- 把原始 brief 與其解析結果關聯起來。
