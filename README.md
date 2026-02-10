# Working Capital Loan Tracker

A browser-based working capital tracker with a premium fintech dashboard, built with only HTML, CSS, and vanilla JavaScript.

## Run the App
1. Clone/download this repository.
2. Open `index.html` directly in your browser.
3. Start managing customers, facilities, and risk alerts.

No backend or external API is used.

## What’s New

### 1) Customer Information Panel
A fixed customer information panel is shown at the top of:
- Dashboard
- Borrower Detail

It displays:
- Customer Name
- GST Number
- Bank Name
- Industry
- Contact Number
- Loan Account Number

The panel remains visible while switching dashboard product tabs.

### 2) Dashboard Split: Fund Based vs Non-Fund Based
The dashboard now has two product tabs:
- **Fund Based**: CC, OD, Term Loan
- **Non-Fund Based**: LC, BG, LCBN

Behavior:
- Only availed facilities are shown.
- Multiple facilities of the same type are listed individually.
- Empty-state message appears when no facility exists in a tab.
- Switching tabs updates KPIs, facility table, alerts, and chart context.

### 3) Enhanced KPIs (Per Product Tab)
For the selected customer + selected tab, dashboard cards show:
- Total Exposure
- Amount Utilized
- Rate of Interest (weighted by exposure)
- Collateral Attached (SORP / SOCP / Current Assets)
- Total Interest Paid (till date)
- Interest Payable (outstanding)

### 4) CC Utilization Analytics
Cash Credit facilities include a month-wise utilization chart on the dashboard.
- Uses deterministic dummy/derived values from the facility utilization.
- No external charting or APIs.

## Existing Capabilities Retained
- Borrower CRUD
- Facility CRUD (multiple per borrower)
- Auto-calculations:
  - Utilization %
  - Available limit
  - Days until renewal
  - Facility risk flag
- Alerts:
  - Utilization > 90%
  - Renewal due within 30 days
  - Available limit ≈ 0
- Borrower filters:
  - Risk
  - Relationship Manager
  - Renewal range
- LocalStorage persistence

## Data Persistence
All data is stored in browser `localStorage`.
- Persists across refresh/reopen on same browser/profile.
- No server-side storage.
