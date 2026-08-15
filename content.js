// Content script injected into LeetCode pages for My Personal LeetHub
console.log('[My Personal LeetHub] Content script loaded on:', window.location.href);

let isSubmitting = false;
let lastDetectedSubmissionKey = null;
let currentUrl = window.location.href;

/**
 * Extracts source code from Monaco Editor line elements.
 */
function extractCodeFromEditor() {
  const lines = document.querySelectorAll('.monaco-editor .view-line');
  if (lines && lines.length > 0) {
    const codeLines = Array.from(lines).map(line => {
      return line.textContent.replace(/\u00a0/g, ' ');
    });
    return codeLines.join('\n');
  }

  const textarea = document.querySelector('textarea.inputarea, .CodeMirror');
  if (textarea && textarea.value) {
    return textarea.value;
  }

  return '';
}

/**
 * Extracts programming language from LeetCode DOM or code snippet fallback.
 */
function extractLanguage() {
  const knownLanguages = [
    'C++', 'Java', 'Python3', 'Python', 'C#', 'JavaScript', 
    'TypeScript', 'C', 'Go', 'Ruby', 'Swift', 'Rust', 'Scala', 
    'Kotlin', 'PHP', 'SQL', 'MySQL', 'MS SQL Server', 'Oracle', 
    'PostgreSQL', 'Dart', 'Elixir', 'Erlang', 'Racket'
  ];

  const langSelectors = [
    'button[id^="headlessui-listbox-button"]',
    'div[class*="editor"] button',
    'div[class*="language-select"]',
    'button[class*="bg-fill"]',
    '[data-cy="lang-select"]',
    'button[aria-haspopup="listbox"]',
    'button[aria-haspopup="dialog"]'
  ];

  for (const selector of langSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (el && el.textContent) {
        const text = el.textContent.trim();
        for (const lang of knownLanguages) {
          if (text.toLowerCase() === lang.toLowerCase()) {
            return lang;
          }
        }
      }
    }
  }

  const allButtons = document.querySelectorAll('button, div[class*="cursor-pointer"], span[class*="text-"]');
  for (const el of allButtons) {
    const text = el.textContent ? el.textContent.trim() : '';
    if (text.length <= 12) {
      for (const lang of knownLanguages) {
        if (text.toLowerCase() === lang.toLowerCase()) {
          return lang;
        }
      }
    }
  }

  const codeContainer = document.querySelector('.monaco-editor, .CodeMirror, textarea');
  if (codeContainer) {
    const codeText = codeContainer.textContent || '';
    if (/#include|std::|vector<|public:/i.test(codeText)) return 'C++';
    if (/public\s+class|public\s+static|public\s+int|public\s+void/i.test(codeText)) return 'Java';
    if (/def\s+\w+\(self/i.test(codeText)) return 'Python3';
    if (/function\s+\w+|const\s+\w+\s*=/i.test(codeText)) return 'JavaScript';
    if (/impl\s+Solution/i.test(codeText)) return 'Rust';
    if (/func\s+\w+\(/i.test(codeText)) return 'Go';
  }

  return 'Unknown';
}

/**
 * Extracts problem metadata from the current LeetCode page.
 */
function extractProblemMetadata() {
  const url = window.location.href;
  const match = url.match(/\/problems\/([a-z0-9-]+)/i);
  
  if (!match) {
    return { isProblemPage: false };
  }

  const slug = match[1];

  let rawTitle = '';
  let problemNumber = null;
  let title = '';

  const titleSelectors = [
    '.text-title-large',
    'div[data-cy="question-title"]',
    'a[href^="/problems/' + slug + '"]',
    'h4',
    '.css-v3d350'
  ];

  for (const selector of titleSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      rawTitle = el.textContent.trim();
      break;
    }
  }

  if (!rawTitle) {
    rawTitle = document.title.replace(/\s*-\s*LeetCode\s*/i, '').trim();
  }

  const numMatch = rawTitle.match(/^(\d+)\.\s*(.+)/);
  if (numMatch) {
    problemNumber = parseInt(numMatch[1], 10);
    title = numMatch[2].trim();
  } else {
    title = rawTitle || slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  let difficulty = 'Unknown';
  const difficultySelectors = [
    '[class*="text-difficulty-"]',
    '[class*="text-sd-"]',
    'div.text-sd-easy, div.text-sd-medium, div.text-sd-hard',
    '[data-degree]'
  ];

  for (const selector of difficultySelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      const text = el.textContent.trim();
      if (/easy/i.test(text)) { difficulty = 'Easy'; break; }
      if (/medium/i.test(text)) { difficulty = 'Medium'; break; }
      if (/hard/i.test(text)) { difficulty = 'Hard'; break; }
    }
  }

  if (difficulty === 'Unknown') {
    const pageText = document.body.innerText || '';
    if (/\bEasy\b/i.test(pageText)) difficulty = 'Easy';
    else if (/\bMedium\b/i.test(pageText)) difficulty = 'Medium';
    else if (/\bHard\b/i.test(pageText)) difficulty = 'Hard';
  }

  const language = extractLanguage();
  const code = extractCodeFromEditor();

  return {
    isProblemPage: true,
    slug: slug,
    title: title,
    number: problemNumber,
    difficulty: difficulty,
    language: language,
    code: code,
    url: `https://leetcode.com/problems/${slug}/`
  };
}

/**
 * Listens for click events on the "Submit" button to track resubmissions.
 */
function attachSubmitButtonListeners() {
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;

    const btn = target.closest('button[data-e2e-locator="console-submit-button"], button[class*="submit"], button');
    if (btn && btn.textContent && /submit/i.test(btn.textContent)) {
      console.log('⚡ [My Personal LeetHub] Submit button clicked! Ready to catch submission result...');
      isSubmitting = true;
    }
  }, true);
}

/**
 * Checks DOM for "Accepted" submission result state.
 */
function checkForAcceptedSubmission() {
  const resultSelectors = [
    '[data-e2e-locator="submission-result"]',
    'span[class*="text-green"]',
    'div[class*="result"]',
    'div[class*="success"]',
    '[data-cy="submission-result"]'
  ];

  let acceptedElement = null;

  for (const selector of resultSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (el && el.textContent && el.textContent.trim().toLowerCase() === 'accepted') {
        acceptedElement = el;
        break;
      }
    }
    if (acceptedElement) break;
  }

  if (!acceptedElement) {
    const resultContainer = document.querySelector('div[class*="submission-result"], div[class*="result-container"]');
    if (resultContainer && /accepted/i.test(resultContainer.textContent)) {
      acceptedElement = resultContainer;
    }
  }

  if (acceptedElement) {
    const currentMetadata = extractProblemMetadata();
    if (!currentMetadata.isProblemPage) return;

    const codeSnippet = currentMetadata.code ? currentMetadata.code.slice(0, 30) : '';
    const submissionKey = `${currentMetadata.slug}-${currentMetadata.language}-${codeSnippet}`;

    if (!isSubmitting && lastDetectedSubmissionKey === submissionKey) {
      return;
    }

    lastDetectedSubmissionKey = submissionKey;
    isSubmitting = false;

    console.log('🎉 [My Personal LeetHub] Solution ACCEPTED detected for:', currentMetadata.title);
    console.log('📝 [My Personal LeetHub] Code extracted length:', currentMetadata.code ? currentMetadata.code.length : 0);

    const submissionData = {
      ...currentMetadata,
      status: 'Accepted',
      timestamp: new Date().toISOString()
    };

    chrome.storage.local.set({ lastSubmission: submissionData }, () => {
      console.log('[My Personal LeetHub] Saved last submission to chrome.storage.local');
    });

    chrome.runtime.sendMessage({
      type: 'SUBMISSION_ACCEPTED',
      data: submissionData
    });
  }
}

/**
 * Monitors URL changes for SPA navigation between different questions.
 */
function observeUrlChanges() {
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      console.log('[My Personal LeetHub] Navigated to new URL:', currentUrl);
      isSubmitting = false;
      lastDetectedSubmissionKey = null;
    }
  }, 1000);
}

/**
 * Sets up a MutationObserver to observe DOM changes after user submits solution.
 */
function observeSubmissionResults() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0 || mutation.type === 'characterData') {
        checkForAcceptedSubmission();
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  console.log('[My Personal LeetHub] Submission observer attached to document.body');
}

// Initialize observer, button listener, and URL tracking
setTimeout(() => {
  attachSubmitButtonListeners();
  observeSubmissionResults();
  observeUrlChanges();
}, 1000);

// Listen for popup request for problem data
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PROBLEM_DATA') {
    const metadata = extractProblemMetadata();
    sendResponse({ success: true, data: metadata });
  }
  return true;
});
