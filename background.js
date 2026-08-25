// Service worker background script for My Personal LeetHub / LeetSync

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LeetSync] Extension installed successfully.');
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

function formatLocalTimestamp(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return formatLocalTimestamp(Date.now());

  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
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

function categorizeProblem(title, slug) {
  const t = `${title || ''} ${slug || ''}`.toLowerCase();
  if (/binary-search|search-insert|find-peak/i.test(t)) return 'Binary Search';
  if (/trapping-rain-water|remove-duplicates|move-zeroes|rotate-array|squares-of-a-sorted-array|rearrange-array|next-permutation/i.test(t)) return 'Two Pointers';
  if (/subarray|stock|house-robber|climbing-stairs/i.test(t)) return 'Dynamic Programming';
  if (/range-sum|product-of-array-except-self/i.test(t)) return 'Prefix Sum';
  if (/single-number|missing-number|bit/i.test(t)) return 'Bit Manipulation';
  if (/sort-colors|merge-sorted/i.test(t)) return 'Sorting / Two Pointers';
  if (/majority-element/i.test(t)) return 'Boyer-Moore Voting';
  if (/two-sum/i.test(t)) return 'Hash Table';
  return 'Arrays & Hashing';
}

function getDiffEmoji(difficulty) {
  const d = (difficulty || '').toLowerCase();
  if (d === 'easy') return '🟢 Easy';
  if (d === 'medium') return '🟡 Medium';
  if (d === 'hard') return '🔴 Hard';
  return '⚪ Unknown';
}

function renderProgressBar(percentage) {
  const totalBars = 20;
  const filledBars = Math.round((percentage / 100) * totalBars);
  const emptyBars = totalBars - filledBars;
  return '█'.repeat(Math.max(0, filledBars)) + '░'.repeat(Math.max(0, emptyBars));
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
    console.warn('[LeetSync] File search warning:', e);
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
 * Updates `submissions.csv` ensuring local timestamps and distinct question rows.
 */
async function updateCsvMasterLog(token, owner, repo, branch, submissionData) {
  const path = 'submissions.csv';
  const header = 'Problem Number,Title,Difficulty,Language,URL,Timestamp';
  
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
    console.log('[LeetSync] Initializing submissions.csv...');
  }

  const rowsMap = new Map();

  if (existingContent && existingContent.trim()) {
    const lines = existingContent.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = parseCsvLine(line);
      if (parts.length >= 5) {
        const num = parts[0].replace(/"/g, '').trim();
        const title = parts[1].replace(/"/g, '').trim();
        const diff = parts[2].replace(/"/g, '').trim();
        const lang = parts[3].replace(/"/g, '').trim();
        const url = parts[4].replace(/"/g, '').trim();
        const ts = parts[5] ? parts[5].replace(/"/g, '').trim() : formatLocalTimestamp(Date.now());

        const key = num !== '--' && num !== '0' ? String(num) : title.toLowerCase();
        rowsMap.set(key, { num, title, diff, lang, url, ts });
      }
    }
  }

  const num = submissionData.number ? String(submissionData.number) : '--';
  const title = submissionData.title || '';
  const diff = submissionData.difficulty || 'Unknown';
  const lang = submissionData.language || 'Unknown';
  const url = submissionData.url || '';
  const ts = formatLocalTimestamp(submissionData.timestamp || Date.now());

  const key = num !== '--' ? num : title.toLowerCase();
  rowsMap.set(key, { num, title, diff, lang, url, ts });

  const sortedRows = Array.from(rowsMap.values()).sort((a, b) => {
    const numA = parseInt(a.num, 10) || 999999;
    const numB = parseInt(b.num, 10) || 999999;
    return numA - numB;
  });

  let updatedCsv = header + '\n';
  for (const r of sortedRows) {
    const titleEsc = `"${r.title.replace(/"/g, '""')}"`;
    updatedCsv += `${r.num},${titleEsc},${r.diff},${r.lang},${r.url},${r.ts}\n`;
  }

  const commitMsg = `Update submissions.csv: ${submissionData.number ? '#' + submissionData.number + ' ' : ''}${submissionData.title}`;

  await uploadFileToGitHub(token, owner, repo, branch, path, commitMsg, updatedCsv);
  return updatedCsv;
}

/**
 * Generates and auto-updates the root README.md with graphs, difficulty stats, and solved problems table.
 */
async function updateRootReadme(token, owner, repo, branch, submissionData, csvContent) {
  const path = 'README.md';

  const lines = (csvContent || '').trim().split('\n');
  const problemsMap = new Map();
  const submissionRecords = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = parseCsvLine(line);
    if (parts.length >= 5) {
      const num = parts[0].replace(/"/g, '').trim();
      const title = parts[1].replace(/"/g, '').trim();
      const diff = parts[2].replace(/"/g, '').trim();
      const lang = parts[3].replace(/"/g, '').trim();
      const url = parts[4].replace(/"/g, '').trim();
      const ts = parts[5] ? parts[5].replace(/"/g, '').trim() : formatLocalTimestamp(Date.now());

      const numPadded = isNaN(parseInt(num, 10)) ? '0000' : String(num).padStart(4, '0');
      const slug = url.match(/\/problems\/([a-z0-9-]+)/i) ? url.match(/\/problems\/([a-z0-9-]+)/i)[1] : title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const folderName = `${numPadded}-${slug}`;

      const problemObj = {
        number: numPadded,
        title: title,
        difficulty: diff,
        language: lang,
        url: url,
        folderName: folderName,
        category: categorizeProblem(title, slug),
        timestamp: ts
      };

      problemsMap.set(numPadded, problemObj);
      submissionRecords.push(problemObj);
    }
  }

  const currentNumPadded = submissionData.number ? String(submissionData.number).padStart(4, '0') : '0000';
  const currentFolderName = getFolderName(submissionData);
  const currentTs = formatLocalTimestamp(submissionData.timestamp || Date.now());
  const currentProblemObj = {
    number: currentNumPadded,
    title: submissionData.title,
    difficulty: submissionData.difficulty,
    language: submissionData.language,
    url: submissionData.url,
    folderName: currentFolderName,
    category: categorizeProblem(submissionData.title, submissionData.slug),
    timestamp: currentTs
  };
  problemsMap.set(currentNumPadded, currentProblemObj);
  submissionRecords.push(currentProblemObj);

  const allProblems = Array.from(problemsMap.values()).sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));

  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;

  allProblems.forEach(p => {
    const d = (p.difficulty || '').toLowerCase();
    if (d === 'easy') easyCount++;
    else if (d === 'medium') mediumCount++;
    else if (d === 'hard') hardCount++;
  });

  const totalCount = allProblems.length || 1;
  const easyPct = ((easyCount / totalCount) * 100).toFixed(1);
  const mediumPct = ((mediumCount / totalCount) * 100).toFixed(1);
  const hardPct = ((hardCount / totalCount) * 100).toFixed(1);

  const easyBar = renderProgressBar(easyPct);
  const mediumBar = renderProgressBar(mediumPct);
  const hardBar = renderProgressBar(hardPct);

  // Calculate Last 10 Days Daily Average (questions done per day over last 10 calendar days)
  const nowMs = submissionData.timestamp ? new Date(submissionData.timestamp).getTime() : Date.now();
  const refDate = isNaN(nowMs) ? new Date() : new Date(nowMs);
  const cutoffDate = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() - 9, 0, 0, 0, 0);

  const last10DaysSubmissions = [];
  const activeDaysSet = new Set();

  submissionRecords.forEach(p => {
    let pDate = null;
    if (p.timestamp) {
      const isoLikeStr = p.timestamp.replace(' ', 'T');
      pDate = new Date(isoLikeStr);
    }
    if (!pDate || isNaN(pDate.getTime())) {
      pDate = new Date();
    }

    if (pDate >= cutoffDate) {
      last10DaysSubmissions.push(p);
      const dateKey = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}-${String(pDate.getDate()).padStart(2, '0')}`;
      activeDaysSet.add(dateKey);
    }
  });

  const total10DaysQuestions = last10DaysSubmissions.length;
  const avgQuestionsPerDay = (total10DaysQuestions / 10).toFixed(2);
  const activeDaysCount = activeDaysSet.size;
  const activeDaysPct = (activeDaysCount / 10) * 100;
  const activeDaysBar = renderProgressBar(activeDaysPct);

  // Calculate Last 10 Submissions Statistics
  const sortedRecords = submissionRecords.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime() || 0;
    const timeB = new Date(b.timestamp).getTime() || 0;
    return timeA - timeB;
  });

  const recent10 = sortedRecords.slice(-10);
  const recentCount = recent10.length;

  let recentEasy = 0;
  let recentMedium = 0;
  let recentHard = 0;
  let weightedScoreSum = 0;

  recent10.forEach(p => {
    const d = (p.difficulty || '').toLowerCase();
    if (d === 'easy') {
      recentEasy++;
      weightedScoreSum += 1;
    } else if (d === 'medium') {
      recentMedium++;
      weightedScoreSum += 2;
    } else if (d === 'hard') {
      recentHard++;
      weightedScoreSum += 3;
    } else {
      weightedScoreSum += 1;
    }
  });

  const avgDiffScoreVal = recentCount > 0 ? (weightedScoreSum / recentCount) : 0;
  const avgDifficultyScore = avgDiffScoreVal.toFixed(2);

  let diffBadge = '🟢 Easy Focus';
  if (avgDiffScoreVal > 2.3) {
    diffBadge = '🔴 Hard Master';
  } else if (avgDiffScoreVal > 1.4) {
    diffBadge = '🟡 Medium Challenge';
  }

  const recentEasyPct = recentCount > 0 ? ((recentEasy / recentCount) * 100).toFixed(1) : '0.0';
  const recentMedPct = recentCount > 0 ? ((recentMedium / recentCount) * 100).toFixed(1) : '0.0';
  const recentHardPct = recentCount > 0 ? ((recentHard / recentCount) * 100).toFixed(1) : '0.0';

  const recentEasyBar = renderProgressBar(parseFloat(recentEasyPct));
  const recentMedBar = renderProgressBar(parseFloat(recentMedPct));
  const recentHardBar = renderProgressBar(parseFloat(recentHardPct));

  const tableRows = allProblems.map(p => {
    return `| ${p.number} | [${p.title}](${p.url}) | ${getDiffEmoji(p.difficulty)} | ${p.language} | ${p.category} | [\`${p.folderName}\`](./${p.folderName}/) |`;
  }).join('\n');

  const readmeMarkdown = `# 🧩 LeetCode Knowledge Dashboard & Solutions

<p align="center">
  <img src="https://img.shields.io/badge/LeetCode-Solutions-orange?style=for-the-badge&logo=leetcode&logoColor=white" />
  <img src="https://img.shields.io/badge/Total%20Solved-${totalCount}-brightgreen?style=for-the-badge&logo=github" />
  <img src="https://img.shields.io/badge/10--Day%20Avg-${avgQuestionsPerDay}%2Fday-blue?style=for-the-badge&logo=leetcode" />
  <img src="https://img.shields.io/badge/Sync-LeetSync-ff69b4?style=for-the-badge" />
</p>

> Personal competitive programming archive containing accepted LeetCode solutions, dynamic topic analysis, and automated metadata tracking via **[LeetSync](https://github.com/${owner}/LeetSync)**.

---

## 📊 Live Problem Solving Statistics

<div align="center">

| Difficulty | Count | Ratio | Visual Progress |
| :--- | :---: | :---: | :--- |
| 🟢 **Easy** | **${easyCount}** | ${easyPct}% | \`${easyBar}\` |
| 🟡 **Medium** | **${mediumCount}** | ${mediumPct}% | \`${mediumBar}\` |
| 🔴 **Hard** | **${hardCount}** | ${hardPct}% | \`${hardBar}\` |
| 🏆 **Total** | **${totalCount}** | 100% | \`████████████████████\` |

</div>

---

## ⚡ 10-Day Solving Performance & Daily Average

<div align="center">

| Metric | Value | Details & Breakdown |
| :--- | :---: | :--- |
| 📊 **10-Day Daily Average** | **${avgQuestionsPerDay} questions / day** | \`${total10DaysQuestions} questions solved in last 10 days\` |
| 🔥 **Active Days (Last 10)** | **${activeDaysCount} / 10 days** (${activeDaysPct.toFixed(0)}%) | \`${activeDaysBar}\` |
| 🎯 **Avg Difficulty Score** | **${avgDifficultyScore} / 3.00** | ${diffBadge} |
| 🟢 **Easy (Recent)** | **${recentEasy}** (${recentEasyPct}%) | \`${recentEasyBar}\` |
| 🟡 **Medium (Recent)** | **${recentMedium}** (${recentMedPct}%) | \`${recentMedBar}\` |
| 🔴 **Hard (Recent)** | **${recentHard}** (${recentHardPct}%) | \`${recentHardBar}\` |

</div>

---

## 📁 Solved Problems Index

| # | Problem Title | Difficulty | Language | Category | Solution Folder |
| :---: | :--- | :---: | :---: | :---: | :---: |
${tableRows}

---

## 📄 Master CSV Tracking Log

All distinct submission records are updated in real-time in the master tracking sheet: [\`submissions.csv\`](./submissions.csv).

---

*Automated with ❤️ by [LeetSync](https://github.com/${owner}/LeetSync)*
`;

  const commitMsg = `Auto-update README.md dashboard (${totalCount} distinct problems solved)`;
  return await uploadFileToGitHub(token, owner, repo, branch, path, commitMsg, readmeMarkdown);
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
    console.warn('[LeetSync] GitHub configuration incomplete. Please enter details in popup.');
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
    console.log('[LeetSync] Uploading solution:', solutionPath);
    await uploadFileToGitHub(ghToken, ghOwner, ghRepo, ghBranch, solutionPath, commitMsg, solutionCode);

    console.log('[LeetSync] Uploading problem README:', readmePath);
    await uploadFileToGitHub(ghToken, ghOwner, ghRepo, ghBranch, readmePath, `Add README for ${submissionData.title}`, readmeContent);

    console.log('[LeetSync] Deduplicating & updating submissions.csv with local timestamps...');
    const updatedCsvContent = await updateCsvMasterLog(ghToken, ghOwner, ghRepo, ghBranch, submissionData);

    console.log('[LeetSync] Updating root README.md dashboard...');
    await updateRootReadme(ghToken, ghOwner, ghRepo, ghBranch, submissionData, updatedCsvContent);

    const result = {
      success: true,
      folder: folderName,
      file: `solution.${ext}`,
      repo: `${ghOwner}/${ghRepo}`,
      timestamp: formatLocalTimestamp(Date.now())
    };

    chrome.storage.local.set({ lastSyncResult: result });
    console.log('🎉 [LeetSync] Full GitHub Sync Success:', result);

  } catch (err) {
    console.error('❌ [LeetSync] GitHub sync error:', err);
    chrome.storage.local.set({ lastSyncResult: { success: false, error: err.message, timestamp: formatLocalTimestamp(Date.now()) } });
  }
}

// Listener for runtime messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[LeetSync] Background service worker received message:', request);

  if (request.type === 'PING') {
    sendResponse({ status: 'PONG', timestamp: Date.now() });
  } else if (request.type === 'SUBMISSION_ACCEPTED') {
    console.log('🚀 [LeetSync] Processing ACCEPTED submission for GitHub sync:', request.data);

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
