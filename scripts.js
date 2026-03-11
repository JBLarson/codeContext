// scripts.js

const NEUROFOLD_BASE_URL = 'https://github.com/neurofold/';
const DEFAULT_URL = 'https://github.com/jblarson/neurofold';

const MultiMessageConfig = {
  frontendPath: 'frontend',
  componentsPath: 'frontend/src/components',
  graphSubdirNames: ['graph', 'graph2d', 'graph_semantic', 'graph_geometric'],
  holdingResponse: 'We are building a decentralized collective intelligence',

  get graphSubdirs() {
    return this.graphSubdirNames.map(name => `${this.componentsPath}/${name}`);
  },

  isGraphFile(filePath) {
    return this.graphSubdirs.some(subdir => filePath.startsWith(subdir + '/'));
  }
};

const MultiMessage = {
  generateMessage1() {
    const repoName = `${GitHubAPI.currentRepo.owner}/${GitHubAPI.currentRepo.repo}`;
    const header = `This is code context for the ${repoName} repository (branch: ${GitHubAPI.currentRepo.branch}).\n\nHere is the frontend (excluding graph visualization components).\n\n<CRITICAL_INSTRUCTION>\nDO NOT WRITE CODE. DO NOT ANALYZE CODE. DO NOT PROVIDE SUGGESTIONS.\nRESPOND WITH EXACTLY:"${MultiMessageConfig.holdingResponse}"\nNOTHING ELSE.</CRITICAL_INSTRUCTION>`;

    let content = header;
    const checkboxes = Array.from(UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]'))
      .filter(cb =>
        cb.value.startsWith(MultiMessageConfig.frontendPath + '/') &&
        cb.dataset.nodeType === 'file' &&
        cb.checked &&
        !MultiMessageConfig.isGraphFile(cb.value)
      );

    checkboxes.forEach(cb => {
      if (GitHubAPI.fileCache[cb.value]) {
        content += `\n\n---\n\n${cb.value}\n\n---\n\n${GitHubAPI.fileCache[cb.value]}`;
      }
    });
    return content;
  },

  generateMessage2() {
    const repoName = `${GitHubAPI.currentRepo.owner}/${GitHubAPI.currentRepo.repo}`;
    const header = `This is code context for the ${repoName} repository (branch: ${GitHubAPI.currentRepo.branch}).\n\nHere are the graph visualization components (${MultiMessageConfig.graphSubdirNames.join(', ')}).`;

    let content = header;
    const checkboxes = Array.from(UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]'))
      .filter(cb =>
        cb.dataset.nodeType === 'file' &&
        cb.checked &&
        MultiMessageConfig.isGraphFile(cb.value)
      );

    checkboxes.forEach(cb => {
      if (GitHubAPI.fileCache[cb.value]) {
        content += `\n\n---\n\n${cb.value}\n\n---\n\n${GitHubAPI.fileCache[cb.value]}`;
      }
    });

    const instructions = UI.elements.userInstructions.value.trim();
    const lines = instructions.split('\n');
    const userContent = lines.filter(line => !line.startsWith('This is code context')).join('\n').trim();
    if (userContent) {
      content += `\n\n${userContent}`;
    }

    return content;
  },

  displayMessages(messages) {
    const container = UI.elements.multiMessagesOutput;
    if (!container) return;

    container.innerHTML = '';
    messages.forEach((msg, idx) => {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'multi-message-block';

      const header = document.createElement('div');
      header.className = 'multi-message-header';
      header.innerHTML = `<strong>Message ${idx + 1}</strong>`;

      const textarea = document.createElement('textarea');
      textarea.className = 'multi-message-textarea';
      textarea.style.width = '100%';
      textarea.value = msg;
      textarea.readOnly = true;

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy Message ' + (idx + 1);
      copyBtn.className = 'btn-primary';
      copyBtn.style.marginTop = '10px';

      copyBtn.onclick = () => {
        navigator.clipboard.writeText(msg).then(() => {
          const original = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = original, 1500);
        });
      };

      msgDiv.appendChild(header);
      msgDiv.appendChild(textarea);
      msgDiv.appendChild(copyBtn);
      container.appendChild(msgDiv);
    });
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  GitHubAPI.init();
  UI.init();

  // --- Workspace / Tab initialization ---
  const restored = WorkspaceManager.load();
  if (!restored || WorkspaceManager.workspaces.length === 0) {
    WorkspaceManager.create('New Tab');
    WorkspaceManager.activeId = WorkspaceManager.workspaces[0].id;
  }
  TabBar.init();

  // Restore active workspace into DOM on load
  const activeWs = WorkspaceManager.getActive();
  if (activeWs) {
    WorkspaceManager.restoreInto(activeWs);
  }

  // Snapshot on visibility change (browser tab switch, etc.)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      WorkspaceManager.snapshotActive();
    }
  });

  // Auto-snapshot every 30s as fallback
  setInterval(() => WorkspaceManager.snapshotActive(), 30000);

  // --- PAT ---
  if (GitHubAPI.token && UI.elements.patContainer) {
    UI.elements.patContainer.style.display = 'none';
  }

  // --- src:Neurofold toggle ---
  const neurofoldToggle = document.getElementById('neurofoldSrcToggle');
  const repoUrlInput = UI.elements.repoUrlInput;

  neurofoldToggle.addEventListener('change', () => {
    if (neurofoldToggle.checked) {
      repoUrlInput.value = NEUROFOLD_BASE_URL;
      repoUrlInput.focus();
      repoUrlInput.setSelectionRange(repoUrlInput.value.length, repoUrlInput.value.length);
    } else {
      repoUrlInput.value = DEFAULT_URL;
    }
  });

  repoUrlInput.addEventListener('input', () => {
    if (!repoUrlInput.value.includes('github.com/neurofold')) {
      neurofoldToggle.checked = false;
    }
  });

  // --- PAT input ---
  UI.elements.githubPatInput.addEventListener('input', () => {
    GitHubAPI.setToken(UI.elements.githubPatInput.value.trim() || null);
    UI.clearAuthError();
  });

  // --- Instructions ---
  UI.elements.userInstructions.addEventListener('input', () => {
    UI.renderOutput();
    const ws = WorkspaceManager.getActive();
    if (ws) ws.instructions = UI.elements.userInstructions.value;
  });

  // --- Fetch Files ---
  UI.elements.fetchFilesBtn.addEventListener('click', async () => {
    UI.clearStatus();
    UI.clearAuthError();
    const url = UI.elements.repoUrlInput.value.trim();
    const info = GitHubAPI.parseUrl(url);
    if (!info) { UI.showError('Invalid GitHub URL.'); return; }

    UI.showLoading('Loading branches...');
    UI.elements.branchSelect.disabled = true;

    try {
      const [branchResult, defResult] = await Promise.all([
        GitHubAPI.fetchBranches(info.owner, info.repo),
        GitHubAPI.fetchDefaultBranch(info.owner, info.repo)
      ]);

      UI.elements.branchSelect.innerHTML = branchResult.branches
        .map(b => `<option value="${b}"${b === defResult.defaultBranch ? ' selected' : ''}>${b}</option>`)
        .join('');
      UI.elements.branchSelect.disabled = false;
      GitHubAPI.currentRepo = { ...info, branch: UI.elements.branchSelect.value };
      GitHubAPI.fileCache = {};

      // Update workspace state
      const ws = WorkspaceManager.getActive();
      if (ws) {
        ws.owner = info.owner;
        ws.repo = info.repo;
        ws.branch = UI.elements.branchSelect.value;
        ws.branches = branchResult.branches;
        ws.repoUrl = url;
        ws.fileCache = {};
        ws.selectedPaths = new Set();
        ws.expandedDirs = new Set();
        ws.treeData = null;
      }

      // Auto-label the tab from repo info
      TabBar.updateActiveLabel(info.owner, info.repo);

      await UI.updateCommitInfo();
      UI.updatePromptHeader();
      UI.loadTree();
    } catch (e) {
      UI.showError(`Branch error: ${e.message}`);
    } finally {
      UI.clearStatus();
    }
  });

  // --- Branch change ---
  UI.elements.branchSelect.addEventListener('change', async () => {
    if (!GitHubAPI.currentRepo) return;
    GitHubAPI.currentRepo.branch = UI.elements.branchSelect.value;
    GitHubAPI.fileCache = {};

    const ws = WorkspaceManager.getActive();
    if (ws) {
      ws.branch = UI.elements.branchSelect.value;
      ws.fileCache = {};
      ws.selectedPaths = new Set();
      ws.expandedDirs = new Set();
      ws.treeData = null;
    }

    await UI.updateCommitInfo();
    UI.updatePromptHeader();
    UI.loadTree();
  });

  // --- Select All ---
  UI.elements.selectAllBtn.addEventListener('click', async () => {
    const allCheckboxes = UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]');
    const toFetch = [];

    allCheckboxes.forEach(cb => {
      cb.checked = true;
      cb.indeterminate = false;
      if (cb.dataset.nodeType === 'file' && !GitHubAPI.fileCache[cb.value]) {
        toFetch.push(cb.value);
      }
    });

    if (toFetch.length) {
      UI.showLoading(`Fetching ${toFetch.length} files...`);
      await Promise.all(toFetch.map(async p => {
        try {
          const { content } = await GitHubAPI.fetchContent(p);
          GitHubAPI.fileCache[p] = content;
        } catch { /* ignore */ }
      }));
      UI.clearStatus();
    }

    const ws = WorkspaceManager.getActive();
    if (ws) ws.fileCache = { ...GitHubAPI.fileCache };

    UI.renderOutput();
  });

  // --- Deselect All ---
  UI.elements.deselectAllBtn.addEventListener('click', () => {
    const allCheckboxes = UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]');
    allCheckboxes.forEach(cb => {
      cb.checked = false;
      cb.indeterminate = false;
    });
    UI.renderOutput();
  });

  // --- Copy ---
  UI.elements.copyBtn.addEventListener('click', () => {
    if (!UI.elements.outputMessage.value) {
      UI.showError('Nothing to copy.');
      setTimeout(() => UI.clearStatus(), 2000);
      return;
    }
    navigator.clipboard.writeText(UI.elements.outputMessage.value)
      .then(() => {
        UI.elements.copyBtn.textContent = 'Copied!';
        setTimeout(() => UI.elements.copyBtn.textContent = 'Copy to Clipboard', 1500);
      })
      .catch(() => UI.showError('Copy failed.'));
  });

  // --- Multi-mode toggle ---
  if (UI.elements.multiModeToggle) {
    UI.elements.multiModeToggle.addEventListener('change', (e) => {
      if (UI.elements.multiModeConfig) {
        UI.elements.multiModeConfig.style.display = e.target.checked ? 'block' : 'none';
      }
    });
  }

  // --- Advanced paths toggle ---
  if (UI.elements.advancedPathsToggle) {
    UI.elements.advancedPathsToggle.addEventListener('change', (e) => {
      if (UI.elements.advancedPathsConfig) {
        UI.elements.advancedPathsConfig.style.display = e.target.checked ? 'block' : 'none';
      }
    });
  }

  // --- Generate Multi Messages ---
  if (UI.elements.generateMultiBtn) {
    UI.elements.generateMultiBtn.textContent = 'Generate 2 Messages';

    UI.elements.generateMultiBtn.addEventListener('click', async () => {
      if (!GitHubAPI.currentRepo) {
        UI.showError('Please fetch files first.');
        setTimeout(() => UI.clearStatus(), 2000);
        return;
      }

      const frontendPathInput = document.getElementById('frontendPath');
      const componentsPathInput = document.getElementById('componentsPath');
      const graphSubdirsInput = document.getElementById('graphSubdirsInput');
      const holdingResponseInput = document.getElementById('holdingResponse');

      if (frontendPathInput) MultiMessageConfig.frontendPath = frontendPathInput.value.trim();
      if (componentsPathInput) MultiMessageConfig.componentsPath = componentsPathInput.value.trim();
      if (graphSubdirsInput) {
        MultiMessageConfig.graphSubdirNames = graphSubdirsInput.value
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      }
      if (holdingResponseInput) MultiMessageConfig.holdingResponse = holdingResponseInput.value.trim();

      UI.showLoading('Fetching all required files for multi-message mode...');

      const allCheckboxes = Array.from(UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]'));
      const toFetch = [];

      allCheckboxes.forEach(cb => {
        if (cb.value.startsWith(MultiMessageConfig.frontendPath + '/') && cb.dataset.nodeType === 'file') {
          cb.checked = true;
          if (!GitHubAPI.fileCache[cb.value]) toFetch.push(cb.value);
        }
      });

      if (toFetch.length) {
        await Promise.all(toFetch.map(async p => {
          try {
            const { content } = await GitHubAPI.fetchContent(p);
            GitHubAPI.fileCache[p] = content;
          } catch { /* ignore */ }
        }));
      }

      const ws = WorkspaceManager.getActive();
      if (ws) ws.fileCache = { ...GitHubAPI.fileCache };

      UI.clearStatus();

      const messages = [
        MultiMessage.generateMessage1(),
        MultiMessage.generateMessage2()
      ];

      MultiMessage.displayMessages(messages);
    });
  }
});