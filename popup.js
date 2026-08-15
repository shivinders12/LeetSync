document.addEventListener('DOMContentLoaded', () => {
  console.log('[My Personal LeetHub] Popup loaded.');

  const problemTitleEl = document.getElementById('problemTitle');
  const problemNumEl = document.getElementById('problemNum');
  const problemLangEl = document.getElementById('problemLang');
  const problemDiffEl = document.getElementById('problemDiff');

  const subStatusBadge = document.getElementById('subStatusBadge');
  const subProblemTitle = document.getElementById('subProblemTitle');
  const subTime = document.getElementById('subTime');
  const subCodeLen = document.getElementById('subCodeLen');

  const syncStatusBadge = document.getElementById('syncStatusBadge');
  const syncPath = document.getElementById('syncPath');

  // GitHub Settings DOM elements
  const ghTokenInput = document.getElementById('ghToken');
  const ghOwnerInput = document.getElementById('ghOwner');
  const ghRepoInput = document.getElementById('ghRepo');
  const ghBranchInput = document.getElementById('ghBranch');
  const toggleTokenBtn = document.getElementById('toggleTokenBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const testConnBtn = document.getElementById('testConnBtn');
  const ghStatusMsg = document.getElementById('ghStatusMsg');

  // Load saved settings
  chrome.storage.local.get(['ghToken', 'ghOwner', 'ghRepo', 'ghBranch'], (res) => {
    if (res.ghToken) ghTokenInput.value = res.ghToken;
    if (res.ghOwner) ghOwnerInput.value = res.ghOwner;
    if (res.ghRepo) ghRepoInput.value = res.ghRepo;
    if (res.ghBranch) ghBranchInput.value = res.ghBranch;
  });

  // Toggle Password Visibility
  if (toggleTokenBtn && ghTokenInput) {
    toggleTokenBtn.addEventListener('click', () => {
      const type = ghTokenInput.getAttribute('type') === 'password' ? 'text' : 'password';
      ghTokenInput.setAttribute('type', type);
      toggleTokenBtn.textContent = type === 'password' ? '👁️' : '🙈';
    });
  }

  function showStatus(text, type) {
    ghStatusMsg.textContent = text;
    ghStatusMsg.className = `status-alert ${type}`;
  }

  function saveSettings(silent = false) {
    const ghToken = ghTokenInput.value.trim();
    const ghOwner = ghOwnerInput.value.trim();
    const ghRepo = ghRepoInput.value.trim();
    const ghBranch = ghBranchInput.value.trim() || 'main';

    chrome.storage.local.set({ ghToken, ghOwner, ghRepo, ghBranch }, () => {
      if (!silent) {
        showStatus('Settings saved successfully!', 'success');
        setTimeout(() => { ghStatusMsg.className = 'status-alert hidden'; }, 3000);
      }
    });
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => saveSettings(false));
  }

  // Test GitHub Connection
  if (testConnBtn) {
    testConnBtn.addEventListener('click', async () => {
      saveSettings(true);

      const token = ghTokenInput.value.trim();
      const owner = ghOwnerInput.value.trim();
      const repo = ghRepoInput.value.trim();
      const branch = ghBranchInput.value.trim() || 'main';

      if (!token || !owner || !repo) {
        showStatus('Please fill in Token, Username, and Repository.', 'error');
        return;
      }

      showStatus('Testing GitHub API connection...', 'info');

      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });

        if (response.ok) {
          const data = await response.json();
          showStatus(`✅ Connected! Repository: ${data.full_name} (${branch})`, 'success');
        } else if (response.status === 401) {
          showStatus('❌ Authentication failed: Invalid Personal Access Token.', 'error');
        } else if (response.status === 404) {
          showStatus(`❌ Repository "${owner}/${repo}" not found or token lacks access.`, 'error');
        } else {
          const errorData = await response.json();
          showStatus(`❌ GitHub Error (${response.status}): ${errorData.message || 'Connection failed'}`, 'error');
        }
      } catch (err) {
        console.error('[My Personal LeetHub] Connection error:', err);
        showStatus(`❌ Network error: ${err.message}`, 'error');
      }
    });
  }

  function updateProblemUI(data) {
    if (!data || !data.isProblemPage) {
      problemTitleEl.textContent = 'Not on a LeetCode problem page';
      problemNumEl.textContent = '#--';
      problemLangEl.textContent = 'Lang: --';
      problemDiffEl.textContent = 'N/A';
      problemDiffEl.className = 'diff-badge diff-unknown';
      return;
    }

    problemTitleEl.textContent = data.title || data.slug;
    problemNumEl.textContent = data.number ? `#${data.number}` : `#${data.slug}`;
    problemLangEl.textContent = `Lang: ${data.language || 'Unknown'}`;

    const diff = (data.difficulty || 'unknown').toLowerCase();
    problemDiffEl.textContent = data.difficulty || 'Unknown';
    if (diff === 'easy') {
      problemDiffEl.className = 'diff-badge diff-easy';
    } else if (diff === 'medium') {
      problemDiffEl.className = 'diff-badge diff-medium';
    } else if (diff === 'hard') {
      problemDiffEl.className = 'diff-badge diff-hard';
    } else {
      problemDiffEl.className = 'diff-badge diff-unknown';
    }
  }

  function loadLastSubmissionAndSync() {
    chrome.storage.local.get(['lastSubmission', 'lastSyncResult'], (res) => {
      if (res && res.lastSubmission) {
        const sub = res.lastSubmission;
        subStatusBadge.textContent = sub.status || 'Accepted';
        subStatusBadge.className = 'status-pill status-accepted';
        subProblemTitle.textContent = sub.title || sub.slug;
        const timeStr = sub.timestamp ? new Date(sub.timestamp).toLocaleTimeString() : '--';
        subTime.textContent = `Time: ${timeStr}`;
        const charCount = sub.code ? sub.code.length : 0;
        subCodeLen.textContent = `Code: ${charCount} chars`;
      } else {
        subStatusBadge.textContent = 'None';
        subStatusBadge.className = 'status-pill status-none';
        subProblemTitle.textContent = 'No accepted submission yet';
        subTime.textContent = 'Time: --';
        subCodeLen.textContent = 'Code: 0 chars';
      }

      if (res && res.lastSyncResult) {
        const sync = res.lastSyncResult;
        if (sync.success) {
          syncStatusBadge.textContent = 'Synced';
          syncStatusBadge.className = 'status-pill status-accepted';
          syncPath.textContent = `${sync.folder}/${sync.file}`;
        } else {
          syncStatusBadge.textContent = 'Error';
          syncStatusBadge.className = 'status-pill diff-hard';
          syncPath.textContent = sync.error || 'Sync failed';
        }
      } else {
        syncStatusBadge.textContent = 'Pending';
        syncStatusBadge.className = 'status-pill status-none';
        syncPath.textContent = 'No GitHub sync performed yet';
      }
    });
  }

  function fetchActiveProblemData() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const activeTab = tabs[0];

      if (!activeTab.url || !activeTab.url.includes('leetcode.com')) {
        updateProblemUI(null);
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PROBLEM_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[My Personal LeetHub] Could not communicate with content script:', chrome.runtime.lastError.message);
          updateProblemUI({ isProblemPage: true, title: 'LeetCode Tab Detected (Reload page if metadata fails)', slug: 'leetcode', difficulty: 'Unknown', language: 'Unknown' });
        } else if (response && response.success) {
          updateProblemUI(response.data);
        }
      });
    });
  }

  // Initial fetch
  fetchActiveProblemData();
  loadLastSubmissionAndSync();
});
