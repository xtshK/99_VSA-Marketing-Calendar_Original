# VSA Marketing Calendar — IT Deployment Brief
**For:** IT / SharePoint Developer  
**From:** Kenneth Mau, Product & Marketing, ViewSonic Americas  
**Date:** June 2026  

---

## What This Is

A React-based marketing calendar tool built for the ViewSonic Americas marketing team. Vertical Marketing Managers (VMMs) upload campaign briefs (PDF, Word, PowerPoint) and the tool automatically parses them into a visual quarterly calendar with a leadership dashboard. It uses the Anthropic Claude API to extract deliverables from briefs.

The goal is to embed this as a SharePoint page that internal marketing team members can access using their existing ViewSonic M365 credentials — no new accounts or logins needed.

---

## Preferred Hosting Approach

**SharePoint Online — Embedded via SPFx Web Part or Script Editor**

There are two paths depending on your SharePoint setup and available dev resources:

---

### Path A — SPFx Web Part (Recommended for production)

This is the proper SharePoint-native approach. It gives the cleanest integration with M365 permissions and the SharePoint intranet.

**What's needed:**
- Node.js (v18 LTS recommended)
- Yeoman SharePoint generator (`@microsoft/generator-sharepoint`)
- SharePoint App Catalog access (tenant or site-level)
- The app's source code (React/TypeScript — see attached TSX file)

**Steps:**

1. **Scaffold a new SPFx project**
   ```
   yo @microsoft/sharepoint
   ```
   Select: SharePoint Online only, React framework, Web Part component type.

2. **Replace the default component** with the contents of `VSA_Marketing_Calendar.tsx` provided. The app uses:
   - `mammoth` (for Word doc parsing) — add via `npm install mammoth`
   - The Anthropic Claude API (`https://api.anthropic.com/v1/messages`) — requires an API key (see API Key section below)
   - `window.storage` — this is Claude artifact storage and **will not work in SPFx**. Replace with SharePoint List storage (see Storage section below).

3. **Build and package**
   ```
   gulp bundle --ship
   gulp package-solution --ship
   ```

4. **Deploy to App Catalog** and add the web part to a SharePoint page.

5. **Set page permissions** to restrict access to the marketing team SharePoint group.

---

### Path B — Embed via SharePoint Embed Web Part (Quickest path, limited)

If SPFx development resources are not available, a faster option is:

1. Deploy the compiled app to **Azure Static Web Apps** (free tier) — this just hosts the files, no Azure AD auth needed if the URL is kept internal/unlisted
2. On a SharePoint page, add an **Embed web part**
3. Paste the Azure Static Web App URL into the embed field
4. Restrict the SharePoint page to the marketing team group

This avoids SPFx development entirely. The tradeoff is the app lives outside SharePoint proper — it's embedded as an iframe. Functionality is identical.

**Recommended if:** SPFx dev resources are unavailable or timelines are tight. Can always migrate to Path A later.

---

## API Key — Anthropic Claude

The tool calls the Anthropic Claude API to parse uploaded briefs. This requires an API key.

**What to do:**
1. Log into [console.anthropic.com](https://console.anthropic.com) using the ViewSonic Anthropic account (contact Kenneth Mau for credentials)
2. Generate an API key under **API Keys**
3. In the SPFx web part, store the key as a **SharePoint tenant property** or **environment variable** — do NOT hardcode it in the source file
4. Pass the key into the fetch call headers:
   ```
   headers: {
     "Content-Type": "application/json",
     "x-api-key": "[YOUR_API_KEY]",
     "anthropic-version": "2023-06-01"
   }
   ```

**Cost:** Anthropic charges per API call. Each brief upload = 1 API call. At current pricing (Claude Sonnet 4), estimated cost is under $0.01 per brief upload. For a team of 5 VMMs uploading ~10 briefs per quarter, total cost is negligible (under $1/quarter).

---

## Storage — Replacing Claude Artifact Storage

The current app uses `window.storage` which is specific to the Claude artifact environment and **will not work outside of it**. This must be replaced with a real data store before deployment.

**Recommended: SharePoint List**

This is the simplest option for an M365 environment — no additional infrastructure needed.

1. Create a SharePoint List called `MarketingCalendarData` with a single column:
   - `JsonData` (Multi-line text) — stores the full JSON array of calendar items

2. Replace the `loadData()` and `saveData()` functions in the source code with SharePoint REST API calls:

```javascript
// Load
async function loadData() {
  const res = await fetch(
    "[YOUR_SHAREPOINT_SITE]/_api/lists/getbytitle('MarketingCalendarData')/items",
    { headers: { Accept: "application/json;odata=nometadata" } }
  );
  const data = await res.json();
  return data.value.length ? JSON.parse(data.value[0].JsonData) : [];
}

// Save
async function saveData(items) {
  // Use SharePoint REST API to update the list item
  // Implementation depends on whether item exists (POST vs PATCH)
}
```

3. Set SharePoint List permissions to match the SharePoint page permissions (marketing team only).

**Alternative options if SharePoint List feels limiting:**
- **Azure Cosmos DB** — better for scale, requires Azure setup
- **Azure SQL** — if a relational structure is preferred later

---

## File Provided

- `VSA_Marketing_Calendar.tsx` — full React/TypeScript source code of the application

**Dependencies to install:**
```
npm install mammoth
npm install @types/react @types/react-dom
```

All other dependencies (React, TypeScript) are included in the standard SPFx scaffold.

---

## Access Control

Once deployed to SharePoint:
- The SharePoint page should be shared only with the **VSA Marketing team group**
- VMMs (Serena — Education, Mina — Enterprise, Chris — Government) should have **edit access**
- Sales leadership and C-suite should have **read access** (dashboard view)
- Kenneth Mau should have **owner/admin access**

---

## Questions

Contact Kenneth Mau for:
- Anthropic API credentials
- Confirmation of SharePoint site URL to deploy to
- Any questions about the tool's functionality

---

*This tool was built and designed by Kenneth Mau using Claude (Anthropic). The source code is proprietary to ViewSonic Americas.*
