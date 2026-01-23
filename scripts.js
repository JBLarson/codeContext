// scripts.js
const MultiMessageConfig = {
  backendPath: 'backend',
  frontendPath: 'frontend',
  componentsPath: 'frontend/src/components',
  graphSubdirs: [
    'frontend/src/components/graph',
    'frontend/src/components/graph2d',
    'frontend/src/components/graph_semantic',
    'frontend/src/components/graph_geometric',
    'frontend/src/components/graph_universe'
  ],
  holdingResponse: 'We are building a decentralized collective intelligence'
};

const MultiMessage = {
  generateMessage1() {
    const repoName = `${GitHubAPI.currentRepo.owner}/${GitHubAPI.currentRepo.repo}`;
    const header = `This is code context for the ${repoName} repository (branch: ${GitHubAPI.currentRepo.branch}).\n\nHere's the backend for ${repoName}.\n\n<CRITICAL_INSTRUCTION>\nDO NOT WRITE CODE. DO NOT ANALYZE CODE. DO NOT PROVIDE SUGGESTIONS.\nRESPOND WITH EXACTLY:"${MultiMessageConfig.holdingResponse}"\nNOTHING ELSE.</CRITICAL_INSTRUCTION>`;
    
    let content = header;
    const backendCheckboxes = Array.from(UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]'))
      .filter(cb => cb.value.startsWith(MultiMessageConfig.backendPath + '/') && cb.dataset.nodeType === 'file' && cb.checked);
    
    backendCheckboxes.forEach(cb => {
      if (GitHubAPI.fileCache[cb.value]) {
        content += `\n\n---\n\n${cb.value}\n\n---\n\n${GitHubAPI.fileCache[cb.value]}`;
      }
    });
    return content;
  },

  generateMessage2() {
    const repoName = `${GitHubAPI.currentRepo.owner}/${GitHubAPI.currentRepo.repo}`;
    const header = `This is code context for the ${repoName} repository (branch: ${GitHubAPI.currentRepo.branch}).\n\nHere's the frontend without the components dir.\n\n<CRITICAL_INSTRUCTION>\nDO NOT WRITE CODE. DO NOT ANALYZE CODE. DO NOT PROVIDE SUGGESTIONS.\nRESPOND WITH EXACTLY:"${MultiMessageConfig.holdingResponse}"\nNOTHING ELSE.</CRITICAL_INSTRUCTION>`;
    
    let content = header;
    const frontendCheckboxes = Array.from(UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]'))
      .filter(cb => cb.value.startsWith(MultiMessageConfig.frontendPath + '/') && 
                    !cb.value.startsWith(MultiMessageConfig.componentsPath + '/') &&
                    cb.dataset.nodeType === 'file' && cb.checked);
    
    frontendCheckboxes.forEach(cb => {
      if (GitHubAPI.fileCache[cb.value]) {
        content += `\n\n---\n\n${cb.value}\n\n---\n\n${GitHubAPI.fileCache[cb.value]}`;
      }
    });
    return content;
  },

  generateMessage3() {
    const repoName = `${GitHubAPI.currentRepo.owner}/${GitHubAPI.currentRepo.repo}`;
    const header = `This is code context for the ${repoName} repository (branch: ${GitHubAPI.currentRepo.branch}).\n\nHere are the graph visualization components (graph, graph2d, graph_semantic, graph_geometric).\n\n<CRITICAL_INSTRUCTION>\nDO NOT WRITE CODE. DO NOT ANALYZE CODE. DO NOT PROVIDE SUGGESTIONS.\nRESPOND WITH EXACTLY:"${MultiMessageConfig.holdingResponse}"\nNOTHING ELSE.</CRITICAL_INSTRUCTION>`;
    
    let content = header;
    const graphCheckboxes = Array.from(UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]'))
      .filter(cb => MultiMessageConfig.graphSubdirs.some(subdir => 
        cb.value.startsWith(subdir + '/') && cb.dataset.nodeType === 'file' && cb.checked
      ));
    
    graphCheckboxes.forEach(cb => {
      if (GitHubAPI.fileCache[cb.value]) {
        content += `\n\n---\n\n${cb.value}\n\n---\n\n${GitHubAPI.fileCache[cb.value]}`;
      }
    });
    return content;
  },

  generateMessage4() {
    const repoName = `${GitHubAPI.currentRepo.owner}/${GitHubAPI.currentRepo.repo}`;
    const header = `This is code context for the ${repoName} repository (branch: ${GitHubAPI.currentRepo.branch}).\n\nHere's the rest of the frontend components directory (excluding graph subdirectories).`;
    
    let content = header;
    const componentCheckboxes = Array.from(UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]'))
      .filter(cb => {
        if (!cb.value.startsWith(MultiMessageConfig.componentsPath + '/') || 
            cb.dataset.nodeType !== 'file' || !cb.checked) return false;
        return !MultiMessageConfig.graphSubdirs.some(subdir => cb.value.startsWith(subdir + '/'));
      });
    
    componentCheckboxes.forEach(cb => {
      if (GitHubAPI.fileCache[cb.value]) {
        content += `\n\n---\n\n${cb.value}\n\n---\n\n${GitHubAPI.fileCache[cb.value]}`;
      }
    });
    
    const instructions = UI.elements.userInstructions.value.trim();
    const lines = instructions.split('\n');
    const userContent = lines.filter(line => !line.startsWith('This is code context')).join('\n').trim();
    
    if (userContent && userContent !== '') {
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
  
  if (GitHubAPI.token && UI.elements.patContainer) {
    UI.elements.patContainer.style.display = 'none';
  }
  
  UI.elements.githubPatInput.addEventListener('input', () => {
    GitHubAPI.setToken(UI.elements.githubPatInput.value.trim() || null);
    UI.clearAuthError();
  });

  UI.elements.userInstructions.addEventListener('input', () => UI.renderOutput());

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
      
      await UI.updateCommitInfo();
      UI.updatePromptHeader();
      UI.loadTree();
    } catch (e) {
      UI.showError(`Branch error: ${e.message}`);
    } finally {
      UI.clearStatus();
    }
  });

  UI.elements.branchSelect.addEventListener('change', async () => {
    if (!GitHubAPI.currentRepo) return;
    GitHubAPI.currentRepo.branch = UI.elements.branchSelect.value;
    GitHubAPI.fileCache = {};
    await UI.updateCommitInfo();
    UI.updatePromptHeader();
    UI.loadTree();
  });

  // --- Select / Deselect Logic ---
  
  // Select All
  UI.elements.selectAllBtn.addEventListener('click', async () => {
    const allCheckboxes = UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]');
    const toFetch = [];

    // 1. Mark all as checked immediately
    allCheckboxes.forEach(cb => {
        cb.checked = true;
        cb.indeterminate = false;
        // If file & not cached, queue for fetch
        if (cb.dataset.nodeType === 'file' && !GitHubAPI.fileCache[cb.value]) {
            toFetch.push(cb.value);
        }
    });

    // 2. Fetch if needed
    if (toFetch.length) {
      UI.showLoading(`Fetching ${toFetch.length} files...`);
      // Optional: Batch this if it's huge, but Promise.all is okay for moderate sizes
      await Promise.all(toFetch.map(async p => {
        try {
          const { content } = await GitHubAPI.fetchContent(p);
          GitHubAPI.fileCache[p] = content;
        } catch { /* ignore individual fail */ }
      }));
      UI.clearStatus();
    }

    UI.renderOutput();
  });

  // Deselect All
  UI.elements.deselectAllBtn.addEventListener('click', () => {
    const allCheckboxes = UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]');
    allCheckboxes.forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
    });
    UI.renderOutput();
  });

  // --- End Select Logic ---

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

  if (UI.elements.multiModeToggle) {
    UI.elements.multiModeToggle.addEventListener('change', (e) => {
      if (UI.elements.multiModeConfig) {
        UI.elements.multiModeConfig.style.display = e.target.checked ? 'block' : 'none';
      }
    });
  }

  if (UI.elements.advancedPathsToggle) {
    UI.elements.advancedPathsToggle.addEventListener('change', (e) => {
      if (UI.elements.advancedPathsConfig) {
        UI.elements.advancedPathsConfig.style.display = e.target.checked ? 'block' : 'none';
      }
    });
  }

  if (UI.elements.generateMultiBtn) {
    UI.elements.generateMultiBtn.textContent = 'Generate 4 Messages';
    
    UI.elements.generateMultiBtn.addEventListener('click', async () => {
      if (!GitHubAPI.currentRepo) {
        UI.showError('Please fetch files first.');
        setTimeout(() => UI.clearStatus(), 2000);
        return;
      }

      const backendPathInput = document.getElementById('backendPath');
      const frontendPathInput = document.getElementById('frontendPath');
      const componentsPathInput = document.getElementById('componentsPath');
      const holdingResponseInput = document.getElementById('holdingResponse');

      if (backendPathInput) MultiMessageConfig.backendPath = backendPathInput.value.trim();
      if (frontendPathInput) MultiMessageConfig.frontendPath = frontendPathInput.value.trim();
      if (componentsPathInput) MultiMessageConfig.componentsPath = componentsPathInput.value.trim();
      if (holdingResponseInput) MultiMessageConfig.holdingResponse = holdingResponseInput.value.trim();

      UI.showLoading('Fetching all required files for multi-message mode...');
      
      const allCheckboxes = Array.from(UI.elements.fileListContainer.querySelectorAll('input[type="checkbox"]'));
      const toFetch = [];
      
      // Auto-check backend
      allCheckboxes.forEach(cb => {
        if (cb.value.startsWith(MultiMessageConfig.backendPath + '/') && cb.dataset.nodeType === 'file') {
          cb.checked = true;
          if (!GitHubAPI.fileCache[cb.value]) toFetch.push(cb.value);
        }
      });
      
      // Auto-check frontend
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
      
      UI.clearStatus();

      const messages = [
        MultiMessage.generateMessage1(),
        MultiMessage.generateMessage2(),
        MultiMessage.generateMessage3(),
        MultiMessage.generateMessage4()
      ];

      MultiMessage.displayMessages(messages);
    });
  }
});