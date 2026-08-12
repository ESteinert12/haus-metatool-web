# How to Add "Recover Lot" Button to HAUS Workspace App

## Overview
Add a dashboard button that scans the current lot against its shipping folder and shows a recovery report.

## Files to Modify

### 1. `index.html` - Add Button to Dashboard

**Location:** `HAUS Workspace.app/Contents/Resources/haus-workspace/index.html`

Find the dashboard section (search for "Dashboard" or "loadDashboard"). Add this button:

```html
<!-- Lot Recovery Button -->
<button id="btn-recover-lot" class="btn btn-secondary" style="margin-left: 10px;">
  🔧 Recover Lot
</button>
```

Place it near other action buttons on the dashboard.

### 2. `index.html` - Add Click Handler

Find the section with other button event listeners (search for `btn-` handlers). Add:

```javascript
document.getElementById('btn-recover-lot').addEventListener('click', async () => {
  if (!window.currentLotId) {
    alert('Please select a lot first')
    return
  }
  
  // Spawn recovery scan in subprocess
  const { spawn } = require('child_process')
  const lotId = window.currentLotId
  
  const scan = spawn('node', [
    '/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/lot-recovery-skill.js',
    lotId.toString()
  ])
  
  let output = ''
  scan.stdout.on('data', (data) => {
    output += data.toString()
  })
  
  scan.on('close', (code) => {
    // Show report in modal or console
    console.log(output)
    // Or display in a modal:
    showRecoveryReport(output)
  })
})

function showRecoveryReport(report) {
  const modal = document.createElement('div')
  modal.className = 'modal'
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Lot Recovery Report</h3>
      <pre style="max-height: 500px; overflow-y: auto; background: #f5f5f5; padding: 10px;">${report}</pre>
      <button onclick="this.parentElement.parentElement.remove()">Close</button>
    </div>
  `
  document.body.appendChild(modal)
}
```

### 3. Store Current Lot ID

Ensure `window.currentLotId` is set when user selects a lot:

```javascript
// When lot is loaded/selected
window.currentLotId = lotId
```

## Alternative: Use as External Tool

Instead of modifying the app, create a command-line tool:

```bash
# In ~/.zshrc or ~/.bash_profile, add alias:
alias lot-recovery='node /Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/lot-recovery-skill.js'

# Then use from terminal:
lot-recovery 7610
```

## Testing

1. Open HAUS Workspace app
2. Select a lot from the dashboard
3. Click "Recover Lot" button
4. Wait for scan to complete
5. Review report showing any issues

## Troubleshooting

**"lot_id not found"** - Make sure you've selected a lot before clicking the button

**"DATABASE_URL not set"** - The script uses the hardcoded Neon connection string, should work automatically

**"Shipping folder not found"** - Make sure Dropbox is synced and the folder path is correct

## Future Enhancements

- Add auto-fix button: "Fix Issues" that auto-assigns orphaned songs
- Add checkboxes to select which songs to fix
- Email report of issues
- Schedule weekly scan
- Integrate with audit log
