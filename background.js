// Service worker background script for My Personal LeetHub

chrome.runtime.onInstalled.addListener(() => {
  console.log('[My Personal LeetHub] Extension installed successfully.');
});

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(str) {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch (e) {
    return atob(str);
  }
}

function getFileExtension(language) {
  const langMap = {
    'c++': 'cpp',
    'cpp': 'cpp',
    'java': 'java',
    'python': 'py',
    'python3': 'py',
    'c#': 'cs',
    'csharp': 'cs',
    'javascript': 'js',
    'typescript': 'ts',
    'c': 'c',
    'go': 'go',
    'ruby': 'rb',
    'swift': 'swift',
    'rust': 'rs',
    'scala': 'scala',
    'kotlin': 'kt',
    'php': 'php',
    'sql': 'sql',
    'mysql': 'sql',
    'postgresql': 'sql'
  };
  const key = (language || '').toLowerCase().trim();
  return langMap[key] || 'txt';
}

function getFolderName(data) {
  const numStr = data.number ? String(data.number).padStart(4, '0') : '0000';
  const slug = (data.slug || 'problem').toLowerCase();
  return `${numStr}-${slug}`;
}

/**
 * Uploads or updates a file in GitHub repository via REST API.
 */
async function uploadFileToGitHub(token, owner, repo, branch, path, commitMessage, content) {
  const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  let existingSha = null;

  try {
    const getRes = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (getRes.ok) {
      const getJson = await getRes.json();
      existingSha = getJson.sha;
    }
  } catch (e) {
    console.warn('[My Personal LeetHub] File search warning:', e);
  }

  const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const bodyData = {
    message: commitMessage,
    content: utf8ToBase64(content),
    branch: branch
  };

  if (existingSha) {
    bodyData.sha = existingSha;
  }

  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(bodyData)
  });

  if (!putRes.ok) {
    const errJson = await putRes.json();
    throw new Error(errJson.message || `GitHub API error ${putRes.status}`);
  }

  return await putRes.json();
}

/**
 * Appends solution metadata to the master `submissions.csv` file in repository root.
 */
async function updateCsvMasterLog(token, owner, repo, branch, submissionData) {
  const path = 'submissions.csv';
  const header = 'Problem Number,Title,Difficulty,Language,URL,Timestamp\n';
  
  let existingContent = '';
  const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  try {
    const getRes = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (getRes.ok) {
      const getJson = await getRes.json();
      if (getJson.content) {
        const cleanContent = getJson.content.replace(/\s/g, '');
        existingContent = base64ToUtf8(cleanContent);
      }
    }
  } catch (e) {
    console.log('[My Personal LeetHub] Initializing submissions.csv...');
  }

  if (!existingContent || !existingContent.trim()) {
    existingContent = header;
  } else if (!existingContent.endsWith('\n')) {
    existingContent += '\n';
  }

  const num = submissionData.number || '--';
  const titleEsc = `"${(submissionData.title || '').replace(/"/g, '""')}"`;
  const diff = submissionData.difficulty || 'Unknown';
  const lang = submissionData.language || 'Unknown';
  const url = submissionData.url || '';
  const timestamp = new Date(submissionData.timestamp || Date.now()).toISOString().replace('T', ' ').slice(0, 19);

  const newRow = `${num},${titleEsc},${diff},${lang},${url},${timestamp}\n`;
  const updatedContent = existingContent + newRow;
  const commitMsg = `Update submissions.csv: ${submissionData.number ? '#' + submissionData.number + ' ' : ''}${submissionData.title}`;

  return await uploadFileToGitHub(token, owner, repo, branch, path, commitMsg, updatedContent);
}

/**
 * Orchestrates full solution upload to GitHub.
 */
async function syncSolutionToGitHub(submissionData) {
  const config = await new Promise(resolve => {
    chrome.storage.local.get(['ghToken', 'ghOwner', 'ghRepo', 'ghBranch'], resolve);
  });

  const { ghToken, ghOwner, ghRepo, ghBranch = 'main' } = config;

  if (!ghToken || !ghOwner || !ghRepo) {
    console.warn('[My Personal LeetHub] GitHub configuration incomplete. Please enter details in popup.');
    chrome.storage.local.set({ lastSyncResult: { success: false, error: 'GitHub configuration incomplete in extension popup.' } });
    return;
  }

  const folderName = getFolderName(submissionData);
  const ext = getFileExtension(submissionData.language);
  const solutionPath = `${folderName}/solution.${ext}`;
  const readmePath = `${folderName}/README.md`;

  const solutionCode = submissionData.code || '// Solution code';
  const readmeContent = `# ${submissionData.number ? submissionData.number + '. ' : ''}${submissionData.title}\n\n` +
    `**Difficulty**: ${submissionData.difficulty}\n\n` +
    `**Language**: ${submissionData.language}\n\n` +
    `**LeetCode Link**: [${submissionData.title}](${submissionData.url})\n`;

  const commitMsg = `Add solution for ${submissionData.number ? '#' + submissionData.number + ' ' : ''}${submissionData.title} (${submissionData.language})`;

  try {
    console.log('[My Personal LeetHub] Uploading solution:', solutionPath);
    await uploadFileToGitHub(ghToken, ghOwner, ghRepo, ghBranch, solutionPath, commitMsg, solutionCode);

    console.log('[My Personal LeetHub] Uploading README:', readmePath);
    await uploadFileToGitHub(ghToken, ghOwner, ghRepo, ghBranch, readmePath, `Add README for ${submissionData.title}`, readmeContent);

    console.log('[My Personal LeetHub] Appending to submissions.csv...');
    await updateCsvMasterLog(ghToken, ghOwner, ghRepo, ghBranch, submissionData);

    const result = {
      success: true,
      folder: folderName,
      file: `solution.${ext}`,
      repo: `${ghOwner}/${ghRepo}`,
      timestamp: new Date().toISOString()
    };

    chrome.storage.local.set({ lastSyncResult: result });
    console.log('🎉 [My Personal LeetHub] Full GitHub Sync Success:', result);

  } catch (err) {
    console.error('❌ [My Personal LeetHub] GitHub sync error:', err);
    chrome.storage.local.set({ lastSyncResult: { success: false, error: err.message, timestamp: new Date().toISOString() } });
  }
}

// Listener for runtime messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[My Personal LeetHub] Background service worker received message:', request);

  if (request.type === 'PING') {
    sendResponse({ status: 'PONG', timestamp: Date.now() });
  } else if (request.type === 'SUBMISSION_ACCEPTED') {
    console.log('🚀 [My Personal LeetHub] Processing ACCEPTED submission for GitHub sync:', request.data);

    chrome.action.setBadgeText({ text: 'SYNC' });
    chrome.action.setBadgeBackgroundColor({ color: '#ffa116' });

    syncSolutionToGitHub(request.data).then(() => {
      chrome.action.setBadgeText({ text: 'OK' });
      chrome.action.setBadgeBackgroundColor({ color: '#2cbb5d' });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 5000);
    });

    sendResponse({ status: 'PROCESSING', success: true });
  }
  return true;
});
